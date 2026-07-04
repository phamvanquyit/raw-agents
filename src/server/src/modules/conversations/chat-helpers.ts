import { eq, sql } from "drizzle-orm";
import { type NewAgentMessage, agentConversations, agentMessages, getDb } from "../../common/db/client.js";
import { wsHub } from "../../common/ws/wsHub.js";

/** Load last 20 user/assistant messages for a conversation (for AI history). */
export function loadHistory(conversationId: string) {
  return getDb()
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.conversationId, conversationId))
    .orderBy(sql`rowid`)
    .all()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-20)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

/** Send or broadcast a WS event depending on whether a clientId is provided. */
function emit<T>(clientId: string | undefined, type: Parameters<typeof wsHub.broadcast>[0], payload: T) {
  if (clientId) {
    wsHub.send(clientId, type, payload);
  } else {
    wsHub.broadcast(type, payload);
  }
}

/**
 * Save a message to DB and notify via WS.
 * If clientId is provided, sends only to that client; otherwise broadcasts to all.
 */
export function saveMessage(data: Omit<NewAgentMessage, "id" | "createdAt">, clientId?: string): { id: string } & NewAgentMessage {
  const db = getDb();
  const id = crypto.randomUUID();
  const msg = { ...data, id, createdAt: new Date() } as NewAgentMessage;
  db.insert(agentMessages).values(msg).run();
  emit(clientId, "messages:created", msg);
  return { ...msg, id };
}

/**
 * Merge patch into message metadata and notify via WS.
 * If clientId is provided, sends only to that client; otherwise broadcasts to all.
 */
export function patchMessageMetadata(msgId: string, patch: Record<string, unknown>, clientId?: string) {
  const db = getDb();
  const row = db.select().from(agentMessages).where(eq(agentMessages.id, msgId)).get();
  if (!row) return;
  const merged = { ...(row.metadata ?? {}), ...patch } as Record<string, unknown>;
  db.update(agentMessages).set({ metadata: merged }).where(eq(agentMessages.id, msgId)).run();
  emit(clientId, "messages:updated", { ...row, metadata: merged });
}

/**
 * Update conversation status and notify via WS.
 * If clientId is provided, sends only to that client; otherwise broadcasts to all.
 */
export function updateConversation(conversationId: string, data: { status: "done" | "failed"; finishedAt: Date; errorMessage?: string }, _clientId?: string) {
  const db = getDb();
  db.update(agentConversations).set(data).where(eq(agentConversations.id, conversationId)).run();
  const updated = db.select().from(agentConversations).where(eq(agentConversations.id, conversationId)).get();
  if (updated) {
    // Always broadcast to ALL clients so other tabs can update their UI
    wsHub.broadcast("conversations:updated", updated);
  }
}
