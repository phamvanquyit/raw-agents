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
 *   2. agent.callableAgentIds → injected into system prompt
 *   3. Always-on: manage_memory (per-user facts + documents)
 */

import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { eq } from "drizzle-orm";
import { createAgent } from "langchain";
import { getChatModel } from "../../../../common/ai/getChatModel.js";
import { agents, getDb } from "../../../../common/db/client.js";
import { type AssignmentWithTool, listAssignments } from "../../agents.service.js";
import { resolveSystemPrompt } from "./buildSystemPrompt.js";
import { getCallAgentLabel, getToolLabel, resolveAgentTools } from "./resolveTools.js";

// ─── Event types for streaming ────────────────────────────────────────────────

export type AgentStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "thinking-delta"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; toolLabel: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: unknown }
  | { type: "done"; text: string }
  | { type: "error"; error: string };

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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build enabled tool_id list from junction table assignments */
function buildEnabledToolIds(assignments: AssignmentWithTool[], options: { allowCallAgent?: boolean } = {}): string[] {
  let ids = assignments.map((a) => a.toolId);

  if (options.allowCallAgent === false) {
    ids = ids.filter((id) => id !== "builtin:call_agent");
  }

  return ids;
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
  options: { maxSteps?: number; abortSignal?: AbortSignal; allowCallAgent?: boolean; ownerId?: string; isGuest?: boolean } = {},
): Promise<AgentResult> {
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) throw new Error(`Agent not found: ${agentId}`);
  if (!agent.aiProvider || !agent.aiModel) {
    throw new Error(`Agent "${agent.name}" has no AI provider configured`);
  }

  // Get tool assignments from junction table
  const assignments = listAssignments(agentId);
  const enabledToolIds = buildEnabledToolIds(assignments, options);

  const ownerId = options.ownerId ?? "user";
  const isGuest = options.isGuest ?? false;

  // Callable agents from agent's callableAgentIds column
  const callableAgentIds: string[] = (agent.callableAgentIds as string[]) ?? [];

  const [model, systemPrompt, tools] = await Promise.all([
    getChatModel(agent.aiProvider, agent.aiModel),
    Promise.resolve(resolveSystemPrompt(agentId, callableAgentIds.length > 0 ? callableAgentIds : undefined, ownerId, isGuest)),
    Promise.resolve(resolveAgentTools(agentId, enabledToolIds, ownerId, isGuest)),
  ]);

  const reactAgent = createAgent({
    model,
    tools,
    systemPrompt,
  });

  const input = {
    messages: toBaseMessages(messages),
  };

  // recursionLimit: each "step" in Vercel AI SDK = 1 model call + tools → ~2 nodes in LangGraph
  const maxSteps = options.maxSteps ?? 8;
  const result = await reactAgent.invoke(input, {
    recursionLimit: maxSteps * 2 + 1,
    signal: options.abortSignal,
  });

  // Parse result.messages (BaseMessage[]) → AgentResult
  // Skip the original input messages (system prompt is handled internally by createAgent)
  const originalCount = messages.length;
  const newMessages = result.messages.slice(originalCount);
  return parseAgentResult(newMessages);
}

// ─── streamAgent ──────────────────────────────────────────────────────────────

/**
 * Run agent with streaming — yields AgentStreamEvent objects.
 * Used by the /api/agents/:id/chat SSE endpoint.
 */
export async function* streamAgent(
  agentId: string,
  messages: MessageParam[],
  options: { maxSteps?: number; abortSignal?: AbortSignal; ownerId?: string; isGuest?: boolean } = {},
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

    const [model, systemPrompt, tools] = await Promise.all([
      getChatModel(agent.aiProvider, agent.aiModel),
      Promise.resolve(resolveSystemPrompt(agentId, callableAgentIds.length > 0 ? callableAgentIds : undefined, ownerId, isGuest)),
      Promise.resolve(resolveAgentTools(agentId, enabledToolIds, ownerId, isGuest)),
    ]);

    const reactAgent = createAgent({
      model,
      tools,
      systemPrompt,
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

    for await (const chunk of stream) {
      const [mode, data] = chunk as unknown as [string, any];

      if (mode === "messages") {
        // messages mode: [messageChunk, metadata]
        const [msgChunk] = data as [any, any];
        const msgType = msgChunk?._getType?.() ?? msgChunk?.type;

        if (msgType === "ai" || msgType === "AIMessageChunk") {
          const content = msgChunk?.content;

          // ── Extract text + thinking from content ──
          if (typeof content === "string" && content) {
            fullText += content;
            yield { type: "text-delta", text: content };
          } else if (Array.isArray(content)) {
            for (const block of content) {
              // Claude: {type:"thinking", thinking:"..."}
              if (block.type === "thinking" && block.thinking) {
                yield { type: "thinking-delta", text: block.thinking };
              }
              // OpenAI Responses API: {type:"reasoning", summary:[{type:"summary_text",text:"..."}]}
              else if (block.type === "reasoning") {
                const summaries = block.summary ?? block.content ?? [];
                if (Array.isArray(summaries)) {
                  for (const s of summaries) {
                    if (s.text) yield { type: "thinking-delta", text: s.text };
                  }
                } else if (typeof block.text === "string" && block.text) {
                  yield { type: "thinking-delta", text: block.text };
                }
              }
              // Standard text block
              else if (block.type === "text" && block.text) {
                fullText += block.text;
                yield { type: "text-delta", text: block.text };
              }
              // Output text block (Responses API)
              else if (block.type === "output_text" && block.text) {
                fullText += block.text;
                yield { type: "text-delta", text: block.text };
              }
            }
          }

          // Fallback: reasoning in additional_kwargs (older LangChain or non-Responses API)
          const reasoning = msgChunk?.additional_kwargs?.reasoning_content ?? msgChunk?.additional_kwargs?.reasoning;
          if (typeof reasoning === "string" && reasoning) {
            yield { type: "thinking-delta", text: reasoning };
          }

          // Tool call chunks — accumulate args, DON'T emit yet.
          // LangChain streams tool_call_chunks incrementally: first chunk has name+id
          // but empty/partial args. We buffer until updates mode gives us the complete args.
          if (msgChunk?.tool_call_chunks) {
            for (const tc of msgChunk.tool_call_chunks) {
              if (tc.id) {
                const pending = pendingToolCalls.get(tc.id);
                if (pending) {
                  // Append incremental args fragment
                  if (tc.args) pending.argsStr += tc.args;
                } else if (tc.name) {
                  // First chunk for this tool call — register it
                  pendingToolCalls.set(tc.id, { name: tc.name, argsStr: tc.args ?? "" });
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
            // Agent node: AI message with tool_calls → emit tool-call
            if (msg?.tool_calls && Array.isArray(msg.tool_calls)) {
              for (const tc of msg.tool_calls) {
                const tcId = tc.id ?? `${tc.name}-${Date.now()}`;
                if (!emittedToolCalls.has(tcId)) {
                  emittedToolCalls.add(tcId);
                  // Remove from pending since we're emitting the complete version
                  pendingToolCalls.delete(tcId);
                  yield {
                    type: "tool-call",
                    toolCallId: tcId,
                    toolName: tc.name,
                    toolLabel: tc.name === "call_agent" ? getCallAgentLabel(tc.args) : getToolLabel(tc.name),
                    input: tc.args,
                  };
                }
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
              yield { type: "tool-result", toolCallId, toolName, result };
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
        yield {
          type: "tool-call",
          toolCallId: tcId,
          toolName: pending.name,
          toolLabel: pending.name === "call_agent" ? getCallAgentLabel(parsedArgs) : getToolLabel(pending.name),
          input: parsedArgs,
        };
      }
    }

    yield { type: "done", text: fullText };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("AbortError") || msg === "AbortError") return;
    yield { type: "error", error: msg };
  }
}
