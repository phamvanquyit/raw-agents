import { eq } from "drizzle-orm";
import type { SSEStreamingApi } from "hono/streaming";
import { agentConversations, agentMessages, agents, getDb } from "../../../common/db/client.js";
import { wsHub } from "../../../common/ws/wsHub.js";
import { patchMessageMetadata, saveMessage, updateConversationStatus } from "../../conversations/conversations.service.js";
import { verifyPublicToken } from "../../public/public.service.js";
import type { AgentStreamEvent, MessageParam } from "./utils/agentRunner.js";
import { generateAgent, streamAgent } from "./utils/agentRunner.js";
import { loadHistory } from "./utils/loadHistory.js";
import { relayRunToSSE, runRegistry } from "./utils/run-registry.js";

export { loadHistory };

// ─── Stream chat (HTTP is a subscriber; run is background) ───────────────────

interface ChatStreamInput {
  agentId: string;
  conversationId: string;
  message: string;
  password?: string;
  token?: string;
}

/**
 * Validate access, save user message, start a background agent run, then relay
 * events into the caller's SSE stream.
 *
 * The AI run is independent of this HTTP connection: client disconnect /
 * F5 only unsubscribes the relay — the background task keeps going and late
 * clients can reconnect via GET /stream (with event replay).
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

  // Mark running + broadcast (clear finishedAt so other tabs don't treat this as stale)
  db.update(agentConversations)
    .set({ status: "running", startedAt: new Date(), finishedAt: null, errorMessage: null })
    .where(eq(agentConversations.id, conversationId))
    .run();
  const updatedConv = db.select().from(agentConversations).where(eq(agentConversations.id, conversationId)).get();
  if (updatedConv) wsHub.broadcast("conversations:updated", updatedConv);

  const { abort, runId } = runRegistry.create(conversationId, agentId);

  // Background run — must not depend on this HTTP stream staying open
  void runChatBackground({
    agentId,
    conversationId,
    msgAgentId,
    message,
    history,
    ownerId: conv?.ownerId ?? "user",
    isGuest: conv?.trigger === "public",
    abortSignal: abort.signal,
    runId,
  });

  // This connection is just a subscriber; abort/disconnect only unsubscribes
  await relayRunToSSE(conversationId, stream);
}

// ─── Background agent run ─────────────────────────────────────────────────────

interface BackgroundRunInput {
  agentId: string;
  conversationId: string;
  msgAgentId: string;
  message: string;
  history: MessageParam[];
  ownerId: string;
  isGuest: boolean;
  abortSignal: AbortSignal;
  runId: symbol;
}

async function runChatBackground(input: BackgroundRunInput): Promise<void> {
  const { agentId, conversationId, msgAgentId, message, history, ownerId, isGuest, abortSignal, runId } = input;
  const db = getDb();

  let fullText = "";
  let thinkingText = "";
  let thinkingStart = 0;
  let failed = false;
  let hasSavedSegments = false;
  let terminalSent = false;
  const toolMsgIds = new Map<string, string>();

  const stillCurrent = () => runRegistry.isCurrent(conversationId, runId);

  const emit = (event: AgentStreamEvent) => {
    runRegistry.emit(conversationId, event, runId);
  };

  try {
    const messages = [...history, { role: "user" as const, content: message }];

    for await (const event of streamAgent(agentId, messages, {
      abortSignal,
      ownerId,
      isGuest,
    })) {
      // Superseded by a newer run — stop mutating DB / registry
      if (!stillCurrent()) break;

      switch (event.type) {
        case "text-delta":
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
            const { isCallAgentToolName, parseCallAgentToolTargetId } = await import("./llm-tools/call-agent.tool.js");
            if (isCallAgentToolName(event.toolName)) {
              try {
                const parsed = typeof event.result === "string" ? JSON.parse(event.result) : event.result;
                const agentId = parsed?.agent_id ?? parseCallAgentToolTargetId(event.toolName);
                if (agentId) {
                  const existingInput = ((): Record<string, unknown> => {
                    const row = getDb().select().from(agentMessages).where(eq(agentMessages.id, toolMsgId)).get();
                    const meta = row?.metadata as Record<string, unknown> | null;
                    return (meta?.toolInput as Record<string, unknown>) ?? {};
                  })();
                  patchData.toolInput = { ...existingInput, agent_id: agentId };
                  const { getCallAgentLabel } = await import("./utils/resolveTools.js");
                  patchData.toolLabel = getCallAgentLabel({ agent_id: agentId });
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

      emit(event);

      if (event.type === "done" || event.type === "error") {
        terminalSent = true;
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = msg.includes("AbortError") || msg === "AbortError" || (err instanceof Error && err.name === "AbortError");
    failed = true;
    // Only emit cancel/error if we still own the run (superseded runs already got "cancelled" from create())
    if (stillCurrent()) {
      const errorMsg = isAbort ? "cancelled" : msg;
      emit({ type: "error", error: errorMsg });
      terminalSent = true;
    }
  } finally {
    // Superseded by a newer create() — do not touch status / messages / registry
    if (stillCurrent()) {
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

      if (!terminalSent) {
        if (failed) {
          emit({ type: "error", error: "Stream ended unexpectedly" });
        } else {
          emit({ type: "done", text: fullText });
        }
      }

      runRegistry.finish(conversationId, runId);
    }
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
