import { and, desc, eq, lt, ne, sql } from "drizzle-orm";
import { type NewAgentConversation, type NewAgentMessage, agentConversations, agentMessages, getDb } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { wsHub } from "../../common/ws/wsHub.js";

const STALE_MS = 60_000;

export function listConversations(query: RawQuery = {}) {
  // Build static WHERE: exclude "public" trigger, optionally filter by agentId
  const agentId = query.agentId;
  const staticWhere = agentId
    ? and(eq(agentConversations.agentId, agentId), ne(agentConversations.trigger, "public"))
    : ne(agentConversations.trigger, "public");

  // Remove agentId from query so listQuery doesn't re-apply it as a column filter
  const { agentId: _, ...cleanQuery } = query;

  const result = listQuery({ table: agentConversations, where: staticWhere }, cleanQuery);

  // Heal stale "running" conversations
  const now = new Date();
  const db = getDb();
  result.items = result.items.map((conv: any) => {
    if (conv.status !== "running") return conv;
    const age = now.getTime() - (conv.createdAt ?? now).getTime();
    if (age < STALE_MS) return conv;
    db.update(agentConversations).set({ status: "done", finishedAt: now }).where(eq(agentConversations.id, conv.id)).run();
    return { ...conv, status: "done" as const, finishedAt: now };
  });

  return result;
}

export function getConversation(id: string) {
  return getDb().select().from(agentConversations).where(eq(agentConversations.id, id)).get();
}

export function createConversation(body: {
  agentId: string;
  title?: string;
  trigger?: NewAgentConversation["trigger"];
  ownerId?: string;
}) {
  const now = new Date();
  const conv: NewAgentConversation = {
    id: crypto.randomUUID(),
    agentId: body.agentId,
    title: body.title ?? "New Chat",
    trigger: body.trigger ?? "manual",
    ownerId: body.ownerId ?? "user",
    status: "done",
    startedAt: now,
    createdAt: now,
  };
  getDb().insert(agentConversations).values(conv).run();
  wsHub.emit("conversations:created", conv);
  return conv;
}

export function updateConversation(id: string, body: Partial<Pick<NewAgentConversation, "title" | "status" | "finishedAt" | "errorMessage">>) {
  getDb().update(agentConversations).set(body).where(eq(agentConversations.id, id)).run();
  const updated = getDb().select().from(agentConversations).where(eq(agentConversations.id, id)).get();
  wsHub.emit("conversations:updated", updated);
  return updated;
}

export function deleteConversation(id: string) {
  getDb().delete(agentConversations).where(eq(agentConversations.id, id)).run();
  wsHub.emit("conversations:deleted", { id });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function listMessages(conversationId: string) {
  return getDb()
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.conversationId, conversationId))
    .orderBy(sql`rowid`)
    .all()
    .filter((r) => !(r.role === "tool" && r.content === ""));
}

export function createMessage(conversationId: string, body: Omit<NewAgentMessage, "id" | "conversationId" | "createdAt">) {
  const msg: NewAgentMessage = { ...body, id: crypto.randomUUID(), conversationId, createdAt: new Date() };
  getDb().insert(agentMessages).values(msg).run();
  wsHub.emit("messages:created", msg);
  return msg;
}

export function patchMessageMeta(msgId: string, patch: Record<string, unknown>) {
  const db = getDb();
  const row = db.select().from(agentMessages).where(eq(agentMessages.id, msgId)).get();
  if (!row) return null;
  const merged = { ...(row.metadata ?? {}), ...patch };
  db.update(agentMessages).set({ metadata: merged }).where(eq(agentMessages.id, msgId)).run();
  return { ok: true };
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export function getMessageFeed(agentId: string, cursor?: string) {
  const PAGE = 30;
  const db = getDb();
  const cursorDate = cursor ? new Date(cursor) : undefined;

  const convRows = db.select().from(agentConversations).where(eq(agentConversations.agentId, agentId)).orderBy(desc(agentConversations.createdAt)).all();

  if (convRows.length === 0) return { items: [], hasMore: false };

  const convMap = new Map(convRows.map((conv) => [conv.id, conv]));

  const whereClause = cursorDate ? and(eq(agentMessages.agentId, agentId), lt(agentMessages.createdAt, cursorDate)) : eq(agentMessages.agentId, agentId);

  const msgRows = db
    .select()
    .from(agentMessages)
    .where(whereClause)
    .orderBy(desc(agentMessages.createdAt))
    .limit(PAGE + 1)
    .all();

  const filtered = msgRows.filter((r) => !(r.role === "tool" && r.content === ""));
  const hasMore = filtered.length > PAGE;
  const page = filtered
    .slice(0, PAGE)
    .map((m) => {
      const conv = m.conversationId ? convMap.get(m.conversationId) : undefined;
      return { ...m, convTitle: conv?.title ?? "Unknown", convTrigger: conv?.trigger ?? "manual", convCreatedAt: conv?.createdAt ?? null };
    })
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));

  return { items: page, hasMore };
}
