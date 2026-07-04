import { eq } from "drizzle-orm";
import { agentConversations, agentMessages, getDb } from "../../common/db/client.js";
import { agents } from "../../common/db/client.js";
import { wsHub } from "../../common/ws/wsHub.js";
import { loadHistory, patchMessageMetadata, saveMessage, updateConversation } from "../conversations/chat-helpers.js";
import { verifyPublicToken } from "../public/public.service.js";
import { generateAgent, streamAgent } from "./agentRunner.js";
import { runRegistry } from "./run-registry.js";

export { loadHistory };

// ─── Background stream runner ─────────────────────────────────────────────────

export function startBackgroundStream(
  clientId: string,
  agentId: string,
  conversationId: string,
  msgAgentId: string,
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
) {
  const abort = runRegistry.create(conversationId, agentId);

  void (async () => {
    let fullText = "";
    let failed = false;
    let hasSavedSegments = false;
    const toolMsgIds = new Map<string, string>();

    try {
      const messages = [...history, { role: "user" as const, content: message }];

      for await (const event of streamAgent(agentId, messages, { abortSignal: abort.signal })) {
        switch (event.type) {
          case "text-delta":
            fullText += event.text;
            wsHub.send(clientId, "chat:chunk", { conversationId, text: event.text });
            break;

          case "thinking-delta":
            wsHub.send(clientId, "chat:thinking", { conversationId, text: event.text });
            break;

          case "tool-call": {
            // Flush any accumulated text as an assistant message BEFORE the tool call
            // so it appears in the correct chronological position
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
            wsHub.send(clientId, "chat:tool-call", {
              conversationId,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              toolLabel: event.toolLabel,
              input: event.input,
            });
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
              // For call_agent: parse result to get agent_id → resolve proper label for DB
              if (event.toolName === "call_agent") {
                try {
                  const parsed = typeof event.result === "string" ? JSON.parse(event.result) : event.result;
                  if (parsed?.agent_id) {
                    // Merge agent_id into existing toolInput so we don't lose the original message/context
                    const existingInput = ((): Record<string, unknown> => {
                      const row = getDb().select().from(agentMessages).where(eq(agentMessages.id, toolMsgId)).get();
                      const meta = row?.metadata as Record<string, unknown> | null;
                      return (meta?.toolInput as Record<string, unknown>) ?? {};
                    })();
                    patchData.toolInput = { ...existingInput, agent_id: parsed.agent_id };
                    const { getCallAgentLabel } = await import("./resolveTools.js");
                    patchData.toolLabel = getCallAgentLabel({ agent_id: parsed.agent_id });
                  }
                } catch {
                  /* ignore parse errors */
                }
              }
              patchMessageMetadata(toolMsgId, patchData);
            }
            wsHub.send(clientId, "chat:tool-result", {
              conversationId,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              result: event.result,
            });
            break;
          }

          case "done":
            // Don't overwrite fullText with the full concatenated text from agentRunner
            // since we've already saved intermediate segments. Only use it as fallback
            // if we haven't accumulated any text in the current segment.
            if (!fullText && !hasSavedSegments) fullText = event.text || "";
            break;

          case "error":
            failed = true;
            wsHub.send(clientId, "chat:error", { conversationId, error: event.error });
            break;
        }

        if (event.type === "done" || event.type === "error") break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isAbort = msg.includes("AbortError") || msg === "AbortError" || (err instanceof Error && err.name === "AbortError");
      failed = true;
      wsHub.send(clientId, "chat:error", { conversationId, error: isAbort ? "cancelled" : msg });
    } finally {
      if (failed) {
        for (const [, toolMsgId] of toolMsgIds.entries()) {
          const db = getDb();
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

      if (fullText) {
        saveMessage({ agentId: msgAgentId, conversationId, role: "assistant", content: fullText, metadata: null });
      }

      updateConversation(conversationId, { status: failed ? "failed" : "done", finishedAt: new Date() });

      if (!failed) {
        wsHub.send(clientId, "chat:done", { conversationId, text: fullText });
      }

      runRegistry.remove(conversationId);
    }
  })();
}

// ─── WS handler ───────────────────────────────────────────────────────────────

export async function handleWsMessage(clientId: string, body: { agentId: string; conversationId: string; message: string; password?: string; token?: string }) {
  const { agentId, conversationId, message, password, token } = body;
  if (!conversationId || !agentId || !message) return;

  const db = getDb();
  const conv = db
    .select({ agentId: agentConversations.agentId, ownerId: agentConversations.ownerId, trigger: agentConversations.trigger })
    .from(agentConversations)
    .where(eq(agentConversations.id, conversationId))
    .get();

  const msgAgentId = conv?.agentId ?? agentId;

  if (conv?.trigger === "public") {
    const agent = db.select({ publicPassword: agents.publicPassword, isPublic: agents.isPublic }).from(agents).where(eq(agents.id, msgAgentId)).get();
    if (!agent?.isPublic) {
      wsHub.send(clientId, "chat:error", { conversationId, error: "Agent is not public." });
      return;
    }
    if (agent.publicPassword && agent.publicPassword !== password) {
      // Password mismatch — try verifying the public access token instead
      const tokenValid = token ? await verifyPublicToken(msgAgentId, token) : false;
      if (!tokenValid) {
        wsHub.send(clientId, "chat:error", { conversationId, error: "Nhập sai mật khẩu!" });
        return;
      }
    }
  }

  const history = loadHistory(conversationId);
  saveMessage({ agentId: msgAgentId, conversationId, role: "user", content: message, metadata: null });

  // Set conversation to running and broadcast to ALL clients so other tabs show spinner
  db.update(agentConversations).set({ status: "running", startedAt: new Date() }).where(eq(agentConversations.id, conversationId)).run();
  const updatedConv = db.select().from(agentConversations).where(eq(agentConversations.id, conversationId)).get();
  if (updatedConv) wsHub.broadcast("conversations:updated", updatedConv);

  startBackgroundStream(clientId, agentId, conversationId, msgAgentId, message, history);
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
