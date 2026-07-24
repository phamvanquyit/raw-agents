/**
 * agentRunner.ts (server-side)
 *
 * Core AI engine — runs entirely on server.
 * - generateAgent(): non-streaming, returns text (for call_agent, task runner)
 * - streamAgent(): streaming via AsyncIterable of AgentStreamEvent
 *
 * LangGraph JS version — uses createAgent from langchain
 *
 * Tool resolution:
 *   1. agent_tool_assignments (builtin:*, mcp:*, or custom tool UUID)
 *   2. agent.callableAgentIds → system prompt + one call_agent__* tool each
 *   3. Always-on: manage_memory
 */

import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { eq } from "drizzle-orm";
import { createAgent } from "langchain";
import { getChatModel } from "../../../../common/ai/getChatModel.js";
import { agents, getDb } from "../../../../common/db/client.js";
import {
  type ContextUsageEstimate,
  type MessageLike,
  type ProviderUsageMessage,
  estimateContextUsage,
  extractProviderUsage,
  providerUsageDedupeKey,
} from "../../../usage/estimate-context-usage.js";
import { type AssignmentWithTool, listAssignments } from "../../agents.service.js";
import { isCallAgentToolName, parseCallAgentToolTargetId } from "../llm-tools/call-agent.tool.js";
import { resolveSystemPrompt } from "./buildSystemPrompt.js";
import { appendToolsCatalog, buildLazyToolsBundle } from "./lazy-tools.middleware.js";
import { getToolLabel, resolveAgentTools } from "./resolveTools.js";

const MODEL_NODE = "model_request";
const NOSTREAM_TAG = "langsmith:nostream";

function isParentModelStreamChunk(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) return true;
  const node = metadata.langgraph_node;
  if (typeof node === "string" && node !== MODEL_NODE) return false;
  const ns = (metadata.langgraph_checkpoint_ns ?? metadata.checkpoint_ns) as string | undefined;
  if (typeof ns === "string" && ns.includes("|")) return false;
  return true;
}

// ─── Event types for streaming ────────────────────────────────────────────────

export type TokenUsageEvent = ContextUsageEstimate & {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  providerId: string | null;
  model: string | null;
};

export type AgentStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "thinking-delta"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; toolLabel: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: unknown }
  | ({ type: "context-usage" } & ContextUsageEstimate)
  | ({ type: "token-usage" } & TokenUsageEvent)
  | { type: "done"; text: string }
  | { type: "error"; error: string };

/** Best-effort JSON parse of streamed tool-call arg fragments (often empty/partial). */
function tryParseToolArgs(argsStr: string): unknown {
  if (!argsStr) return {};
  try {
    return JSON.parse(argsStr);
  } catch {
    return {};
  }
}

function toolResultToString(result: unknown): string {
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

/** Convert LangChain messages into MessageLike rows for context estimation. */
function baseMessagesToMessageLikes(msgs: BaseMessage[]): MessageLike[] {
  const out: MessageLike[] = [];
  for (const msg of msgs) {
    const type = msg._getType();
    if (type === "human") {
      out.push({ role: "user", content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) });
      continue;
    }
    if (type === "ai") {
      const ai = msg as AIMessage;
      let content = "";
      let thinking = "";
      if (typeof ai.content === "string") {
        content = ai.content;
      } else if (Array.isArray(ai.content)) {
        for (const block of ai.content as Record<string, unknown>[]) {
          if (block?.type === "text" && typeof block.text === "string") content += block.text;
          else if (block?.type === "output_text" && typeof block.text === "string") content += block.text;
          else if (block?.type === "thinking" && typeof block.thinking === "string") thinking += block.thinking;
          else if (block?.type === "reasoning") {
            if (typeof block.reasoning === "string") thinking += block.reasoning;
            else if (typeof block.text === "string") thinking += block.text;
          }
        }
        if (!content && !thinking) content = JSON.stringify(ai.content ?? "");
      } else {
        content = JSON.stringify(ai.content ?? "");
      }
      const reasoningKw = (ai.additional_kwargs?.reasoning_content as string | undefined) ?? (ai.additional_kwargs?.reasoning as string | undefined);
      if (typeof reasoningKw === "string" && reasoningKw) thinking += reasoningKw;

      if (ai.tool_calls && ai.tool_calls.length > 0) {
        out.push({
          role: "assistant",
          content,
          thinking: thinking || undefined,
          toolCalls: ai.tool_calls.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args })),
        });
      } else {
        out.push({ role: "assistant", content, thinking: thinking || undefined });
      }
      continue;
    }
    if (type === "tool") {
      const toolMsg = msg as ToolMessage;
      out.push({
        role: "tool-result",
        toolCallId: toolMsg.tool_call_id,
        toolName: toolMsg.name ?? "unknown",
        result: toolResultToString(toolMsg.content),
      });
    }
  }
  return out;
}

export type MessageParam =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "assistant"; content: string; toolCalls: Array<{ id: string; name: string; args: unknown }> }
  | { role: "tool-result"; toolCallId: string; toolName: string; result: string };

export type AgentStepSummary = {
  toolCalls: Array<{ toolName: string; label: string; args: unknown }>;
  toolResults: Array<{ toolName: string; result: unknown }>;
  text: string;
};

export type AgentResult = {
  text: string;
  steps: AgentStepSummary[];
  usage?: TokenUsageEvent;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build enabled tool_id list from junction table assignments */
function buildEnabledToolIds(assignments: AssignmentWithTool[]): string[] {
  return assignments.map((a) => a.toolId).filter((id) => id !== "builtin:call_agent");
}

function loadCallableAgents(callableAgentIds: string[]): { id: string; name: string; description: string | null }[] {
  if (callableAgentIds.length === 0) return [];
  const db = getDb();
  const all = db.select({ id: agents.id, name: agents.name, description: agents.description }).from(agents).all();
  return all.filter((a) => callableAgentIds.includes(a.id));
}

function enrichToolCallInput(toolName: string, args: unknown): unknown {
  if (!isCallAgentToolName(toolName)) return args;
  const agentId = parseCallAgentToolTargetId(toolName);
  if (!agentId) return args;
  const base = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  return { ...base, agent_id: agentId };
}

/** Convert MessageParam[] to BaseMessage[] for LangGraph */
function toBaseMessages(messages: MessageParam[]): BaseMessage[] {
  return messages.map((m) => {
    if (m.role === "user") return new HumanMessage(m.content);
    if (m.role === "tool-result") {
      return new ToolMessage({
        content: m.result,
        tool_call_id: m.toolCallId,
        name: m.toolName,
      });
    }
    // assistant (with or without tool_calls)
    if ("toolCalls" in m && m.toolCalls.length > 0) {
      return new AIMessage({
        content: m.content,
        tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args as Record<string, unknown> })),
      });
    }
    return new AIMessage(m.content);
  });
}

/** Parse final messages from the agent's output state into AgentResult */
function parseAgentResult(resultMessages: BaseMessage[]): AgentResult {
  let fullText = "";
  const steps: AgentStepSummary[] = [];
  let currentStep: AgentStepSummary | null = null;

  for (const msg of resultMessages) {
    const type = msg._getType();

    if (type === "ai") {
      const aiMsg = msg as AIMessage;

      // Finalize previous step if it had tool calls
      if (currentStep && currentStep.toolCalls.length > 0) {
        steps.push(currentStep);
      }

      // Check for tool calls
      if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
        currentStep = {
          text: typeof aiMsg.content === "string" ? aiMsg.content : "",
          toolCalls: aiMsg.tool_calls.map((tc) => ({
            toolName: tc.name,
            label: getToolLabel(tc.name),
            args: tc.args,
          })),
          toolResults: [],
        };
      } else {
        currentStep = null;
        // This is the final text response
        if (typeof aiMsg.content === "string" && aiMsg.content) {
          fullText = aiMsg.content;
        }
      }
    } else if (type === "tool") {
      // Tool result — attach to current step
      if (currentStep) {
        const toolMsg = msg as any;
        currentStep.toolResults.push({
          toolName: toolMsg.name ?? "unknown",
          result:
            typeof toolMsg.content === "string"
              ? (() => {
                  try {
                    return JSON.parse(toolMsg.content);
                  } catch {
                    return toolMsg.content;
                  }
                })()
              : toolMsg.content,
        });
      }
    }
  }

  // Finalize last step if it had tool calls
  if (currentStep && currentStep.toolCalls.length > 0) {
    steps.push(currentStep);
  }

  // Fallback: try to find any text from AI messages if fullText is empty
  if (!fullText) {
    fullText =
      resultMessages
        .filter((m) => m._getType() === "ai")
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .filter(Boolean)
        .pop() ?? "";
  }

  return { text: fullText, steps };
}

// ─── generateAgent ────────────────────────────────────────────────────────────

/**
 * Run agent non-streaming (for call_agent tool, task runner fallback).
 * @returns { text, steps } — full response text and per-step summaries.
 */
export async function generateAgent(
  agentId: string,
  messages: MessageParam[],
  options: {
    maxSteps?: number;
    abortSignal?: AbortSignal;
    allowCallAgent?: boolean;
    ownerId?: string;
    isGuest?: boolean;
    conversationId?: string | null;
  } = {},
): Promise<AgentResult> {
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) throw new Error(`Agent not found: ${agentId}`);
  if (!agent.aiProvider || !agent.aiModel) {
    throw new Error(`Agent "${agent.name}" has no AI provider configured`);
  }

  // Get tool assignments from junction table
  const assignments = listAssignments(agentId);
  const enabledToolIds = buildEnabledToolIds(assignments);

  const ownerId = options.ownerId ?? "user";
  const isGuest = options.isGuest ?? false;
  const allowCallAgent = options.allowCallAgent !== false;

  // Callable agents from agent's callableAgentIds column
  const callableAgentIds: string[] = (agent.callableAgentIds as string[]) ?? [];
  const callableAgents = allowCallAgent ? loadCallableAgents(callableAgentIds) : [];

  const [model, baseSystemPrompt, tools] = await Promise.all([
    getChatModel(agent.aiProvider, agent.aiModel),
    Promise.resolve(resolveSystemPrompt(agentId, callableAgents.length > 0 ? callableAgentIds : undefined, ownerId, isGuest)),
    Promise.resolve(
      resolveAgentTools(agentId, enabledToolIds, ownerId, isGuest, {
        callableAgents,
        allowCallAgent,
        abortSignal: options.abortSignal,
        conversationId: options.conversationId ?? null,
      }),
    ),
  ]);

  const lazy = buildLazyToolsBundle(tools);
  const systemPrompt = appendToolsCatalog(baseSystemPrompt, lazy.catalogPromptSection);

  const reactAgent = createAgent({
    model,
    tools: lazy.allToolsForAgent,
    systemPrompt,
    middleware: [lazy.middleware],
  });

  const input = {
    messages: toBaseMessages(messages),
  };

  const maxSteps = options.maxSteps ?? 8;
  const result = await reactAgent.invoke(input, {
    recursionLimit: maxSteps * 2 + 1,
    signal: options.abortSignal,
    tags: [NOSTREAM_TAG],
  });

  // Parse result.messages (BaseMessage[]) → AgentResult
  // Skip the original input messages (system prompt is handled internally by createAgent)
  const originalCount = messages.length;
  const newMessages = result.messages.slice(originalCount);
  const parsed = parseAgentResult(newMessages);
  const providerUsage = extractProviderUsage(result.messages as Array<{ usage_metadata?: Record<string, unknown> | null }>);
  const estimate = estimateContextUsage({
    systemPrompt,
    tools: lazy.toolsForEstimate(),
    messages: baseMessagesToMessageLikes(result.messages as BaseMessage[]),
  });

  return {
    ...parsed,
    usage: {
      ...estimate,
      ...providerUsage,
      providerId: agent.aiProvider,
      model: agent.aiModel,
    },
  };
}

// ─── streamAgent ──────────────────────────────────────────────────────────────

/**
 * Run agent with streaming — yields AgentStreamEvent objects.
 * Used by the /api/agents/:id/chat SSE endpoint.
 */
export async function* streamAgent(
  agentId: string,
  messages: MessageParam[],
  options: {
    maxSteps?: number;
    abortSignal?: AbortSignal;
    ownerId?: string;
    isGuest?: boolean;
    conversationId?: string | null;
  } = {},
): AsyncGenerator<AgentStreamEvent> {
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();

  if (!agent) {
    yield { type: "error", error: `Agent not found: ${agentId}` };
    return;
  }

  if (!agent.aiProvider || !agent.aiModel) {
    yield {
      type: "error",
      error: `Agent "${agent.name}" has no AI provider configured`,
    };
    return;
  }

  // Get tool assignments from junction table
  const assignments = listAssignments(agentId);
  const enabledToolIds = buildEnabledToolIds(assignments);

  const ownerId = options.ownerId ?? "user";
  const isGuest = options.isGuest ?? false;

  try {
    // Callable agents from agent's callableAgentIds column
    const callableAgentIds: string[] = (agent.callableAgentIds as string[]) ?? [];
    const callableAgents = loadCallableAgents(callableAgentIds);

    const [model, baseSystemPrompt, tools] = await Promise.all([
      getChatModel(agent.aiProvider, agent.aiModel),
      Promise.resolve(resolveSystemPrompt(agentId, callableAgents.length > 0 ? callableAgentIds : undefined, ownerId, isGuest)),
      Promise.resolve(
        resolveAgentTools(agentId, enabledToolIds, ownerId, isGuest, {
          callableAgents,
          allowCallAgent: true,
          abortSignal: options.abortSignal,
          conversationId: options.conversationId ?? null,
        }),
      ),
    ]);

    const lazy = buildLazyToolsBundle(tools);
    const systemPrompt = appendToolsCatalog(baseSystemPrompt, lazy.catalogPromptSection);

    const initialEstimate = estimateContextUsage({ systemPrompt, tools: lazy.toolsForEstimate(), messages });
    yield { type: "context-usage", ...initialEstimate };

    const reactAgent = createAgent({
      model,
      tools: lazy.allToolsForAgent,
      systemPrompt,
      middleware: [lazy.middleware],
    });

    const input = {
      messages: toBaseMessages(messages),
    };

    const maxSteps = options.maxSteps ?? 30;
    const stream = await reactAgent.stream(input, {
      recursionLimit: maxSteps * 2 + 1,
      signal: options.abortSignal,
      streamMode: ["messages", "updates"] as any,
    });

    let fullText = "";
    // Track which tool calls we've already emitted (with complete args)
    const emittedToolCalls = new Set<string>();
    // Accumulate tool_call_chunks args (streamed incrementally by LangChain)
    // Key: toolCallId, Value: { name, argsStr (accumulated) }
    const pendingToolCalls = new Map<string, { name: string; argsStr: string }>();
    const usageMessages: ProviderUsageMessage[] = [];
    const seenUsageKeys = new Set<string>();

    const pushUsageMessage = (msg: ProviderUsageMessage) => {
      const key = providerUsageDedupeKey(msg);
      if (!key || seenUsageKeys.has(key)) return;
      seenUsageKeys.add(key);
      usageMessages.push(msg);
    };

    // Grow context estimate across the ReAct loop (tool args/results are most of the window).
    const runtimeMessages: MessageLike[] = messages.map((m) => ({ ...m }));
    let pendingAssistantText = "";
    let pendingThinkingText = "";
    const pendingAssistantToolCalls: Array<{ id: string; name: string; args: unknown }> = [];

    const trackToolCall = (tcId: string, name: string, args: unknown) => {
      const existing = pendingAssistantToolCalls.find((t) => t.id === tcId);
      if (existing) {
        existing.name = name;
        existing.args = args;
      } else {
        pendingAssistantToolCalls.push({ id: tcId, name, args });
      }
    };

    const appendThinking = (text: string) => {
      if (!text) return;
      pendingThinkingText += text;
    };

    const flushPendingAssistant = () => {
      if (!pendingAssistantText && !pendingThinkingText && pendingAssistantToolCalls.length === 0) return;
      if (pendingAssistantToolCalls.length > 0) {
        runtimeMessages.push({
          role: "assistant",
          content: pendingAssistantText,
          thinking: pendingThinkingText || undefined,
          toolCalls: pendingAssistantToolCalls.map((t) => ({ ...t })),
        });
      } else {
        runtimeMessages.push({
          role: "assistant",
          content: pendingAssistantText,
          thinking: pendingThinkingText || undefined,
        });
      }
      pendingAssistantText = "";
      pendingThinkingText = "";
      pendingAssistantToolCalls.length = 0;
    };

    const currentEstimate = () => {
      const msgs = [...runtimeMessages];
      if (pendingAssistantText || pendingThinkingText || pendingAssistantToolCalls.length > 0) {
        if (pendingAssistantToolCalls.length > 0) {
          msgs.push({
            role: "assistant",
            content: pendingAssistantText,
            thinking: pendingThinkingText || undefined,
            toolCalls: pendingAssistantToolCalls.map((t) => ({ ...t })),
          });
        } else {
          msgs.push({
            role: "assistant",
            content: pendingAssistantText,
            thinking: pendingThinkingText || undefined,
          });
        }
      }
      return estimateContextUsage({ systemPrompt, tools: lazy.toolsForEstimate(), messages: msgs });
    };

    const buildTokenUsageEvent = (): Extract<AgentStreamEvent, { type: "token-usage" }> => {
      flushPendingAssistant();
      return {
        type: "token-usage",
        ...currentEstimate(),
        ...extractProviderUsage(usageMessages),
        providerId: agent.aiProvider,
        model: agent.aiModel,
      };
    };

    try {
      for await (const chunk of stream) {
        const [mode, data] = chunk as unknown as [string, any];

        if (mode === "messages") {
          const [msgChunk, metadata] = data as [any, Record<string, unknown> | undefined];
          if (!isParentModelStreamChunk(metadata)) continue;

          const msgType = msgChunk?._getType?.() ?? msgChunk?.type;

          if (msgType === "ai" || msgType === "AIMessageChunk") {
            if (msgChunk?.usage_metadata || msgChunk?.response_metadata?.usage) {
              pushUsageMessage(msgChunk);
            }
            const content = msgChunk?.content;

            // ── Extract text + thinking from content ──
            if (typeof content === "string" && content) {
              fullText += content;
              pendingAssistantText += content;
              yield { type: "text-delta", text: content };
            } else if (Array.isArray(content)) {
              for (const block of content) {
                // Claude: {type:"thinking", thinking:"..."}
                if (block.type === "thinking" && block.thinking) {
                  appendThinking(block.thinking);
                  yield { type: "thinking-delta", text: block.thinking };
                }
                // Reasoning: LangChain standard `{type:"reasoning", reasoning}` /
                // OpenAI Responses `{summary:[...]}` / flat `{text}`
                else if (block.type === "reasoning") {
                  if (typeof block.reasoning === "string" && block.reasoning) {
                    appendThinking(block.reasoning);
                    yield { type: "thinking-delta", text: block.reasoning };
                  } else {
                    const summaries = block.summary ?? block.content ?? [];
                    if (Array.isArray(summaries)) {
                      for (const s of summaries) {
                        if (s.text) {
                          appendThinking(s.text);
                          yield { type: "thinking-delta", text: s.text };
                        } else if (typeof s.reasoning === "string" && s.reasoning) {
                          appendThinking(s.reasoning);
                          yield { type: "thinking-delta", text: s.reasoning };
                        }
                      }
                    } else if (typeof block.text === "string" && block.text) {
                      appendThinking(block.text);
                      yield { type: "thinking-delta", text: block.text };
                    } else if (typeof summaries === "string" && summaries) {
                      appendThinking(summaries);
                      yield { type: "thinking-delta", text: summaries };
                    }
                  }
                }
                // Standard text block
                else if (block.type === "text" && block.text) {
                  fullText += block.text;
                  pendingAssistantText += block.text;
                  yield { type: "text-delta", text: block.text };
                }
                // Output text block (Responses API)
                else if (block.type === "output_text" && block.text) {
                  fullText += block.text;
                  pendingAssistantText += block.text;
                  yield { type: "text-delta", text: block.text };
                }
              }
            }

            // Fallback: reasoning in additional_kwargs (older LangChain or non-Responses API)
            const reasoning = msgChunk?.additional_kwargs?.reasoning_content ?? msgChunk?.additional_kwargs?.reasoning;
            if (typeof reasoning === "string" && reasoning) {
              appendThinking(reasoning);
              yield { type: "thinking-delta", text: reasoning };
            }

            // Tool call chunks — emit early on first id+name so UI can show Running… while
            // the model finishes args and the tools node executes. updates mode later
            // re-yields the same toolCallId with full args (client/service upsert).
            if (msgChunk?.tool_call_chunks) {
              for (const tc of msgChunk.tool_call_chunks) {
                if (tc.id) {
                  const pending = pendingToolCalls.get(tc.id);
                  if (pending) {
                    // Append incremental args fragment
                    if (tc.args) pending.argsStr += tc.args;
                  } else if (tc.name) {
                    // First chunk for this tool call — register + notify UI immediately
                    pendingToolCalls.set(tc.id, { name: tc.name, argsStr: tc.args ?? "" });
                    if (!emittedToolCalls.has(tc.id)) {
                      emittedToolCalls.add(tc.id);
                      const earlyArgs = tryParseToolArgs(tc.args ?? "");
                      trackToolCall(tc.id, tc.name, earlyArgs);
                      yield {
                        type: "tool-call",
                        toolCallId: tc.id,
                        toolName: tc.name,
                        toolLabel: getToolLabel(tc.name),
                        input: enrichToolCallInput(tc.name, earlyArgs),
                      };
                    }
                  }
                }
              }
            }
          }
        } else if (mode === "updates") {
          // updates mode: { nodeName: { messages: [...] } }
          // Extract both tool-call and tool-result from updates mode to guarantee ordering
          // (tool-call from agent node always arrives before tool-result from tools node).
          for (const [, state] of Object.entries(data as Record<string, any>)) {
            if (!state?.messages) continue;

            for (const msg of state.messages) {
              // Agent node: AI message with tool_calls → emit/upsert tool-call with full args
              if (msg?.tool_calls && Array.isArray(msg.tool_calls)) {
                for (const tc of msg.tool_calls) {
                  const tcId = tc.id ?? `${tc.name}-${Date.now()}`;
                  emittedToolCalls.add(tcId);
                  // Remove from pending since we have the complete version
                  pendingToolCalls.delete(tcId);
                  trackToolCall(tcId, tc.name, tc.args);
                  // Always yield: first paint or arg-complete upsert (same toolCallId)
                  yield {
                    type: "tool-call",
                    toolCallId: tcId,
                    toolName: tc.name,
                    toolLabel: getToolLabel(tc.name),
                    input: enrichToolCallInput(tc.name, tc.args),
                  };
                }
              }

              // Tools node: ToolMessage → emit tool-result
              const msgType = msg?._getType?.() ?? msg?.type;
              if (msgType === "tool" || msgType === "ToolMessage") {
                const toolCallId: string = msg.tool_call_id ?? "";
                const toolName = msg.name ?? "unknown";
                const rawContent = msg.content;
                const result =
                  typeof rawContent === "string"
                    ? (() => {
                        try {
                          return JSON.parse(rawContent);
                        } catch {
                          return rawContent;
                        }
                      })()
                    : rawContent;
                flushPendingAssistant();
                runtimeMessages.push({
                  role: "tool-result",
                  toolCallId,
                  toolName,
                  result: toolResultToString(result),
                });
                yield { type: "tool-result", toolCallId, toolName, result };
                yield { type: "context-usage", ...currentEstimate() };
              }

              if ((msgType === "ai" || msgType === "AIMessage" || msgType === "AIMessageChunk") && (msg?.usage_metadata || msg?.response_metadata?.usage)) {
                pushUsageMessage(msg);
              }
            }
          }
        }
      }

      // Flush any pending tool calls that weren't emitted via updates mode (edge case)
      for (const [tcId, pending] of pendingToolCalls) {
        if (!emittedToolCalls.has(tcId)) {
          emittedToolCalls.add(tcId);
          const parsedArgs = pending.argsStr
            ? (() => {
                try {
                  return JSON.parse(pending.argsStr);
                } catch {
                  return pending.argsStr;
                }
              })()
            : {};
          trackToolCall(tcId, pending.name, parsedArgs);
          yield {
            type: "tool-call",
            toolCallId: tcId,
            toolName: pending.name,
            toolLabel: getToolLabel(pending.name),
            input: enrichToolCallInput(pending.name, parsedArgs),
          };
        }
      }

      yield buildTokenUsageEvent();
      yield { type: "done", text: fullText };
    } catch (streamErr) {
      const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
      const isAbort = msg.includes("AbortError") || msg === "AbortError" || (streamErr instanceof Error && streamErr.name === "AbortError");
      try {
        yield buildTokenUsageEvent();
      } catch {
        /* best-effort partial usage */
      }
      if (isAbort) {
        yield { type: "error", error: "cancelled" };
        return;
      }
      yield { type: "error", error: msg };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = msg.includes("AbortError") || msg === "AbortError" || (err instanceof Error && err.name === "AbortError");
    if (isAbort) {
      yield { type: "error", error: "cancelled" };
      return;
    }
    yield { type: "error", error: msg };
  }
}
