/**
 * stream-agent-sse.ts — Shared SSE streaming helper for LangGraph agents.
 *
 * Encapsulates the common streaming loop used by both prompt-agent and
 * coding-agent (and any future agent services). Handles:
 *   - AI text token streaming   (messages mode)
 *   - tool-call / tool-result   (updates mode)
 *   - done / error events
 */

import type { BaseMessage } from "@langchain/core/messages";
import type { SSEStreamingApi } from "hono/streaming";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreamAgentSSEOptions {
  /** A compiled LangGraph agent (returned by `createAgent`). */
  agent: { stream: (input: any, config?: any) => Promise<AsyncIterable<any>> };
  /** The full list of messages (system + user/assistant history). */
  messages: BaseMessage[];
  /** Maximum ReAct loop iterations (default 12). */
  maxSteps?: number;
  /** Hono SSE stream to write events to. */
  stream: SSEStreamingApi;
  /** Optional AbortSignal — when fired, the agent run is cancelled. */
  abortSignal?: AbortSignal;
}

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Run a LangGraph agent and stream its output as SSE events.
 *
 * SSE event types emitted (same protocol as raw-agent chat):
 *   - `{ type: "text-delta",     text }          ` — AI text token
 *   - `{ type: "thinking-delta", text }          ` — AI thinking / reasoning token
 *   - `{ type: "tool-call",      toolCallId, toolName, input }`
 *   - `{ type: "tool-result",    toolCallId, toolName, result }`
 *   - `{ type: "done" }`
 *   - `{ type: "error",          error }`
 */
export async function streamAgentSSE({ agent, messages, maxSteps = 100, stream, abortSignal }: StreamAgentSSEOptions): Promise<void> {
  try {
    const agentStream = await agent.stream(
      { messages },
      {
        recursionLimit: maxSteps * 2 + 1,
        streamMode: ["messages", "updates"] as any,
        signal: abortSignal,
      },
    );

    const emittedToolCalls = new Set<string>();

    for await (const chunk of agentStream) {
      // Check abort between chunks
      if (abortSignal?.aborted) break;
      const [mode, data] = chunk as unknown as [string, any];

      if (mode === "messages") {
        const [msgChunk] = data as [any, any];
        const msgType = msgChunk?._getType?.() ?? msgChunk?.type;

        // Stream AI text + thinking tokens
        if (msgType === "ai" || msgType === "AIMessageChunk") {
          const content = msgChunk?.content;

          if (typeof content === "string" && content) {
            await stream.writeSSE({
              data: JSON.stringify({ type: "text-delta", text: content }),
            });
          } else if (Array.isArray(content)) {
            for (const block of content) {
              // Claude: {type:"thinking", thinking:"..."}
              if (block.type === "thinking" && block.thinking) {
                await stream.writeSSE({
                  data: JSON.stringify({ type: "thinking-delta", text: block.thinking }),
                });
              }
              // OpenAI Responses API: {type:"reasoning", summary:[{type:"summary_text",text:"..."}]}
              else if (block.type === "reasoning") {
                const summaries = block.summary ?? block.content ?? [];
                if (Array.isArray(summaries)) {
                  for (const s of summaries) {
                    if (s.text) {
                      await stream.writeSSE({
                        data: JSON.stringify({ type: "thinking-delta", text: s.text }),
                      });
                    }
                  }
                } else if (typeof block.text === "string" && block.text) {
                  await stream.writeSSE({
                    data: JSON.stringify({ type: "thinking-delta", text: block.text }),
                  });
                }
              }
              // Standard text block
              else if (block.type === "text" && block.text) {
                await stream.writeSSE({
                  data: JSON.stringify({ type: "text-delta", text: block.text }),
                });
              }
              // Output text block (Responses API)
              else if (block.type === "output_text" && block.text) {
                await stream.writeSSE({
                  data: JSON.stringify({ type: "text-delta", text: block.text }),
                });
              }
            }
          }

          // Fallback: reasoning in additional_kwargs (older LangChain or non-Responses API)
          const reasoning = msgChunk?.additional_kwargs?.reasoning_content ?? msgChunk?.additional_kwargs?.reasoning;
          if (typeof reasoning === "string" && reasoning) {
            await stream.writeSSE({
              data: JSON.stringify({ type: "thinking-delta", text: reasoning }),
            });
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
                  await stream.writeSSE({
                    data: JSON.stringify({
                      type: "tool-call",
                      toolCallId: tcId,
                      toolName: tc.name,
                      input: tc.args,
                    }),
                  });
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
              await stream.writeSSE({
                data: JSON.stringify({
                  type: "tool-result",
                  toolCallId: msg.tool_call_id,
                  toolName,
                  result,
                }),
              });
            }
          }
        }
      }
    }

    await stream.writeSSE({ data: JSON.stringify({ type: "done" }) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isRecursionLimit = (err as any)?.constructor?.name === "GraphRecursionError" || msg.includes("Recursion limit");

    if (isRecursionLimit) {
      // Treat recursion limit as a graceful stop, not an error
      await stream.writeSSE({
        data: JSON.stringify({
          type: "done",
          reason: "max_steps_reached",
        }),
      });
    } else {
      await stream.writeSSE({
        data: JSON.stringify({ type: "error", error: msg }),
      });
    }
  }
}
