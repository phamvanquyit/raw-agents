/**
 * coding-agent.service.ts — Coding Agent SSE streaming service.
 *
 * Handles the business logic for the coding assistant:
 *   - Resolves AI model
 *   - Builds local tools (generate_code, run_current_script, fetch_webpage)
 *   - Creates a ReAct agent and streams SSE events
 */

import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { fetchWebpageTool } from "../common/agent-tools/fetch-webpage.tool.js";
import { makeGenerateCodeTool } from "../common/agent-tools/generate-code.tool.js";
import { makeRunCurrentScriptTool } from "../common/agent-tools/run-current-script.tool.js";
import { buildCodingSystemPrompt } from "../common/constants.js";
import { getDraftCode } from "../tools.service.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CodingStreamRequest {
  providerId: string;
  modelId: string;
  messages: { role: string; content: string }[];
  maxSteps?: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Stream a coding agent session over SSE.
 *
 * @param toolId  - The tool ID being edited (from URL param)
 * @param body    - Request body with model info, messages, etc.
 * @param stream  - Hono SSE stream to write events to
 */
export async function streamCodingAgent(toolId: string, body: CodingStreamRequest, stream: SSEStreamingApi): Promise<void> {
  const { providerId, modelId, messages, maxSteps = 12 } = body;

  try {
    // 1. Resolve model
    const model = await getChatModel(providerId, modelId);

    // 2. Build tools — all local to this module
    const tools: StructuredToolInterface[] = [makeGenerateCodeTool(toolId), makeRunCurrentScriptTool(toolId), fetchWebpageTool];

    // 3. Create agent
    const agent = createAgent({ model, tools });

    // 4. Build messages — system prompt includes current draftCode from DB
    const currentCode = getDraftCode(toolId);
    const baseMessages: BaseMessage[] = [new SystemMessage(buildCodingSystemPrompt(currentCode))];
    for (const msg of messages) {
      if (msg.role === "user") baseMessages.push(new HumanMessage(msg.content));
      else if (msg.role === "assistant") baseMessages.push(new AIMessage(msg.content));
      else if (msg.role === "system") baseMessages.push(new SystemMessage(msg.content));
    }

    // 5. Stream
    //    - messages mode → AI text tokens only
    //    - updates mode  → tool-call (agent node) + tool-result (tools node)
    //    LangGraph runs nodes sequentially (agent → tools → agent …),
    //    so updates always deliver tool-call before tool-result.
    const agentStream = await agent.stream({ messages: baseMessages }, { recursionLimit: maxSteps * 2 + 1, streamMode: ["messages", "updates"] as any });

    const emittedToolCalls = new Set<string>();

    for await (const chunk of agentStream) {
      const [mode, data] = chunk as unknown as [string, any];

      if (mode === "messages") {
        const [msgChunk] = data as [any, any];
        const msgType = msgChunk?._getType?.() ?? msgChunk?.type;

        // Only stream AI text tokens — tool results come from updates mode
        if (msgType === "ai" || msgType === "AIMessageChunk") {
          const content = msgChunk?.content;
          if (typeof content === "string" && content) {
            await stream.writeSSE({ data: JSON.stringify({ type: "chunk", text: content }) });
          }
        }
      } else if (mode === "updates") {
        for (const [, state] of Object.entries(data as Record<string, any>)) {
          if (!state?.messages) continue;

          for (const msg of state.messages as any[]) {
            // Agent node: AI message with tool_calls → emit tool-call
            if (msg?.tool_calls && Array.isArray(msg.tool_calls)) {
              for (const tc of msg.tool_calls) {
                const tcId = tc.id ?? `${tc.name}-${Date.now()}`;
                if (!emittedToolCalls.has(tcId)) {
                  emittedToolCalls.add(tcId);
                  await stream.writeSSE({ data: JSON.stringify({ type: "tool-call", toolCallId: tcId, toolName: tc.name, input: tc.args }) });
                }
              }
            }

            // Tools node: ToolMessage → emit tool-result
            const msgType = msg?._getType?.() ?? msg?.type;
            if (msgType === "tool" || msgType === "ToolMessage") {
              const toolName = msg.name ?? "unknown";
              const raw = msg.content;
              const result =
                typeof raw === "string"
                  ? (() => {
                      try {
                        return JSON.parse(raw);
                      } catch {
                        return raw;
                      }
                    })()
                  : raw;
              await stream.writeSSE({ data: JSON.stringify({ type: "tool-result", toolCallId: msg.tool_call_id, toolName, result }) });
            }
          }
        }
      }
    }

    await stream.writeSSE({ data: JSON.stringify({ type: "done" }) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await stream.writeSSE({ data: JSON.stringify({ type: "error", error: msg }) });
  }
}
