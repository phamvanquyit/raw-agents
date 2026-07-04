/**
 * prompt.route.ts — Prompt Assistant SSE endpoint.
 *
 * POST /api/assistants/prompt/stream
 *
 * Tools:
 *   - update_prompt → broadcasts prompt update to FE via WS
 *   - fetch_webpage → HTTP fetch (from BUILTIN_REGISTRY)
 */

import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createAgent } from "langchain";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { fetchWebpageTool } from "../builtin-tools/fetch-webpage.js";
import { getToolLabel } from "../resolveTools.js";
import { makeUpdatePromptTool } from "./update-prompt.js";

interface PromptStreamRequest {
  providerId: string;
  modelId: string;
  systemPrompt?: string;
  messages: { role: string; content: string }[];
  /** Client ID for targeted WS broadcast (optional — from header or body) */
  clientId?: string;
  maxSteps?: number;
}

const app = new Hono();

app.post("/stream", async (c) => {
  const body = await c.req.json<PromptStreamRequest>();
  const { providerId, modelId, systemPrompt = "", messages, maxSteps = 6 } = body;

  // Get clientId from header (set by FE wsClient) or body
  const clientId = body.clientId ?? c.req.header("x-client-id") ?? "";

  return streamSSE(c, async (stream) => {
    try {
      // 1. Resolve model
      const model = await getChatModel(providerId, modelId);

      // 2. Build tools — prompt assistant tools
      const tools: StructuredToolInterface[] = [makeUpdatePromptTool(clientId), fetchWebpageTool];

      // 3. Create agent
      const agent = createAgent({ model, tools, systemPrompt: systemPrompt || undefined });

      // 4. Build messages
      const baseMessages: BaseMessage[] = [];
      for (const msg of messages) {
        if (msg.role === "user") baseMessages.push(new HumanMessage(msg.content));
        else if (msg.role === "assistant") baseMessages.push(new AIMessage(msg.content));
      }

      // 5. Stream
      const agentStream = await agent.stream({ messages: baseMessages }, { recursionLimit: maxSteps * 2 + 1, streamMode: ["messages", "updates"] as any });

      const emittedToolCalls = new Set<string>();

      for await (const chunk of agentStream) {
        const [mode, data] = chunk as unknown as [string, any];

        if (mode === "messages") {
          const [msgChunk] = data as [any, any];
          const msgType = msgChunk?._getType?.() ?? msgChunk?.type;

          if (msgType === "ai" || msgType === "AIMessageChunk") {
            const content = msgChunk?.content;
            if (typeof content === "string" && content) {
              await stream.writeSSE({ data: JSON.stringify({ type: "chunk", text: content }) });
            }
          } else if (msgType === "tool" || msgType === "ToolMessage" || msgType === "ToolMessageChunk") {
            const toolName = msgChunk?.name ?? "unknown";
            const rawContent = msgChunk?.content;
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
            await stream.writeSSE({
              data: JSON.stringify({
                type: "tool-result",
                toolCallId: msgChunk?.tool_call_id,
                toolName,
                result,
              }),
            });
          }
        } else if (mode === "updates") {
          for (const [nodeName, state] of Object.entries(data as Record<string, any>)) {
            if (nodeName === "agent" && state?.messages) {
              for (const msg of state.messages) {
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
                          toolLabel: getToolLabel(tc.name),
                          input: tc.args,
                        }),
                      });
                    }
                  }
                }
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
  });
});

export default app;
