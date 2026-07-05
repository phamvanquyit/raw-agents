import { eq } from "drizzle-orm";
import type { SSEStreamingApi } from "hono/streaming";
import { agentConversations, agentMessages, agents, getDb } from "../../../common/db/client.js";
import { wsHub } from "../../../common/ws/wsHub.js";
import { patchMessageMetadata, saveMessage, updateConversationStatus } from "../../conversations/conversations.service.js";
import { verifyPublicToken } from "../../public/public.service.js";
import type { AgentStreamEvent } from "./utils/agentRunner.js";
import { generateAgent, streamAgent } from "./utils/agentRunner.js";
import { loadHistory } from "./utils/loadHistory.js";
import { runRegistry } from "./utils/run-registry.js";

export { loadHistory };

// ─── Stream chat directly into an SSE response ──────────────────────────────

interface ChatStreamInput {
  agentId: string;
  conversationId: string;
  message: string;
  password?: string;
  token?: string;
}

/**
 * Validate access, save user message, then stream agent directly into SSE.
 * Also emits events to runRegistry so secondary clients (other tabs, F5 reconnect)
 * can subscribe via GET /stream.
 */
export async function streamChatSSE(body: ChatStreamInput, stream: SSEStreamingApi): Promise<void> {
  const { agentId, conversationId, message, password, token } = body;
  if (!conversationId || !agentId || !message) {
    await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "agentId, conversationId, and message are required" }) });
    return;
  }

  const db = getDb();
  const conv = db
    .select({ agentId: agentConversations.agentId, ownerId: agentConversations.ownerId, trigger: agentConversations.trigger })
    .from(agentConversations)
    .where(eq(agentConversations.id, conversationId))
    .get();

  const msgAgentId = conv?.agentId ?? agentId;

  // ── Public access validation ──────────────────────────────────────────────
  if (conv?.trigger === "public") {
    const agent = db.select({ publicPassword: agents.publicPassword, isPublic: agents.isPublic }).from(agents).where(eq(agents.id, msgAgentId)).get();
    if (!agent?.isPublic) {
      await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "Agent is not public." }) });
      return;
    }
    if (agent.publicPassword && agent.publicPassword !== password) {
      const tokenValid = token ? await verifyPublicToken(msgAgentId, token) : false;
      if (!tokenValid) {
        await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "Nhập sai mật khẩu!" }) });
        return;
      }
    }
  }

  // ── Prepare ───────────────────────────────────────────────────────────────
  const history = loadHistory(conversationId);
  saveMessage({ agentId: msgAgentId, conversationId, role: "user", content: message, metadata: null });

  // Mark running + broadcast
  db.update(agentConversations).set({ status: "running", startedAt: new Date() }).where(eq(agentConversations.id, conversationId)).run();
  const updatedConv = db.select().from(agentConversations).where(eq(agentConversations.id, conversationId)).get();
  if (updatedConv) wsHub.broadcast("conversations:updated", updatedConv);

  // Register in runRegistry so secondary clients can subscribe via GET /stream
  const abort = runRegistry.create(conversationId, agentId);

  // ── Stream agent ──────────────────────────────────────────────────────────
  let fullText = "";
  let thinkingText = "";
  let thinkingStart = 0;
  let failed = false;
  let hasSavedSegments = false;
  const toolMsgIds = new Map<string, string>();

  try {
    const messages = [...history, { role: "user" as const, content: message }];

    for await (const event of streamAgent(agentId, messages, { abortSignal: abort.signal })) {
      switch (event.type) {
        case "text-delta":
          // Thinking phase just ended → flush it before text starts
          if (thinkingText) {
            saveMessage({
              agentId: msgAgentId,
              conversationId,
              role: "thinking",
              content: thinkingText,
              metadata: { thinkingDuration: Math.round((Date.now() - thinkingStart) / 1000) },
            });
            thinkingText = "";
            thinkingStart = 0;
          }
          fullText += event.text;
          break;

        case "thinking-delta":
          if (!thinkingStart) {
            // New thinking round starting → flush any accumulated text first
            if (fullText.trim()) {
              saveMessage({ agentId: msgAgentId, conversationId, role: "assistant", content: fullText, metadata: null });
              hasSavedSegments = true;
              fullText = "";
            }
            thinkingStart = Date.now();
          }
          thinkingText += event.text;
          break;

        case "tool-call": {
          if (thinkingText) {
            saveMessage({
              agentId: msgAgentId,
              conversationId,
              role: "thinking",
              content: thinkingText,
              metadata: { thinkingDuration: Math.round((Date.now() - thinkingStart) / 1000) },
            });
            thinkingText = "";
            thinkingStart = 0;
          }
          if (fullText.trim()) {
            saveMessage({ agentId: msgAgentId, conversationId, role: "assistant", content: fullText, metadata: null });
            hasSavedSegments = true;
            fullText = "";
          }
          const toolMsg = saveMessage({
            agentId: msgAgentId,
            conversationId,
            role: "tool",
            content: event.toolName,
            metadata: { toolName: event.toolName, toolLabel: event.toolLabel, toolInput: event.input, toolCallId: event.toolCallId },
          });
          if (toolMsg.id) toolMsgIds.set(event.toolCallId, toolMsg.id);
          break;
        }

        case "tool-result": {
          const toolMsgId = toolMsgIds.get(event.toolCallId);
          if (toolMsgId) {
            const resultStr = typeof event.result === "string" ? event.result : JSON.stringify(event.result);
            const patchData: Record<string, unknown> = {
              toolOutput: resultStr,
              result: event.result,
            };
            if (event.toolName === "call_agent") {
              try {
                const parsed = typeof event.result === "string" ? JSON.parse(event.result) : event.result;
                if (parsed?.agent_id) {
                  const existingInput = ((): Record<string, unknown> => {
                    const row = getDb().select().from(agentMessages).where(eq(agentMessages.id, toolMsgId)).get();
                    const meta = row?.metadata as Record<string, unknown> | null;
                    return (meta?.toolInput as Record<string, unknown>) ?? {};
                  })();
                  patchData.toolInput = { ...existingInput, agent_id: parsed.agent_id };
                  const { getCallAgentLabel } = await import("./utils/resolveTools.js");
                  patchData.toolLabel = getCallAgentLabel({ agent_id: parsed.agent_id });
                }
              } catch {
                /* ignore parse errors */
              }
            }
            patchMessageMetadata(toolMsgId, patchData);
          }
          break;
        }

        case "done":
          if (!fullText && !hasSavedSegments) fullText = event.text || "";
          break;

        case "error":
          failed = true;
          break;
      }

      // Write to SSE response (primary client)
      await stream.writeSSE({ data: JSON.stringify(event) });

      // Fan-out to secondary clients (other tabs, F5 reconnect)
      runRegistry.emit(conversationId, event);

      if (event.type === "done" || event.type === "error") break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = msg.includes("AbortError") || msg === "AbortError" || (err instanceof Error && err.name === "AbortError");
    failed = true;
    const errorMsg = isAbort ? "cancelled" : msg;
    const errorEvent = { type: "error", error: errorMsg } as AgentStreamEvent;
    await stream.writeSSE({ data: JSON.stringify(errorEvent) });
    runRegistry.emit(conversationId, errorEvent);
  } finally {
    if (failed) {
      for (const [, toolMsgId] of toolMsgIds.entries()) {
        const row = db.select().from(agentMessages).where(eq(agentMessages.id, toolMsgId)).get();
        const meta = row?.metadata as Record<string, unknown> | null;
        if (row && !meta?.toolOutput) {
          patchMessageMetadata(toolMsgId, {
            toolOutput: JSON.stringify({ error: "Tool execution failed or was interrupted" }),
            toolError: true,
          });
        }
      }
    }

    if (thinkingText) {
      saveMessage({
        agentId: msgAgentId,
        conversationId,
        role: "thinking",
        content: thinkingText,
        metadata: { thinkingDuration: Math.round((Date.now() - thinkingStart) / 1000) },
      });
    }
    if (fullText) {
      saveMessage({ agentId: msgAgentId, conversationId, role: "assistant", content: fullText, metadata: null });
    }

    updateConversationStatus(conversationId, { status: failed ? "failed" : "done", finishedAt: new Date() });

    if (!failed) {
      const doneEvent = { type: "done", text: fullText } as AgentStreamEvent;
      await stream.writeSSE({ data: JSON.stringify(doneEvent) }).catch(() => {});
      runRegistry.emit(conversationId, doneEvent);
    }

    runRegistry.remove(conversationId);
  }
}

// ─── Generate (non-streaming) ─────────────────────────────────────────────────

export async function generateResponse(agentId: string, message: string, conversationId?: string, maxSteps = 8) {
  const history = conversationId ? loadHistory(conversationId) : [];
  const messages = [...history, { role: "user" as const, content: message }];
  return generateAgent(agentId, messages, { maxSteps });
}

// ─── Stop ─────────────────────────────────────────────────────────────────────

export function stopStream(conversationId: string) {
  return runRegistry.cancel(conversationId);
}
