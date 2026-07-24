import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { agents, getDb, tokenUsage } from "../../common/db/client.js";
import { listAssignments } from "../agents/agents.service.js";
import { resolveSystemPrompt } from "../agents/raw-agent/utils/buildSystemPrompt.js";
import { loadHistory } from "../agents/raw-agent/utils/loadHistory.js";
import { resolveAgentTools } from "../agents/raw-agent/utils/resolveTools.js";
import { type ContextUsageEstimate, estimateContextUsage } from "./estimate-context-usage.js";

export type RecordTokenUsageInput = {
  agentId?: string | null;
  conversationId?: string | null;
  ownerId?: string;
  providerId?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  systemPromptTokens: number;
  toolDefTokens: number;
  conversationTokens: number;
  estimatedTotal: number;
};

export function recordTokenUsage(input: RecordTokenUsageInput) {
  const db = getDb();
  const entry = {
    id: crypto.randomUUID(),
    agentId: input.agentId ?? null,
    conversationId: input.conversationId ?? null,
    ownerId: input.ownerId ?? "user",
    providerId: input.providerId ?? null,
    model: input.model ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    totalTokens: input.totalTokens ?? null,
    systemPromptTokens: input.systemPromptTokens,
    toolDefTokens: input.toolDefTokens,
    conversationTokens: input.conversationTokens,
    estimatedTotal: input.estimatedTotal,
    createdAt: new Date(),
  };
  db.insert(tokenUsage).values(entry).run();
  return entry;
}

export function listTokenUsage(opts: {
  agentId?: string;
  model?: string;
  conversationId?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}) {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const conditions = [];
  if (opts.agentId) conditions.push(eq(tokenUsage.agentId, opts.agentId));
  if (opts.model) conditions.push(eq(tokenUsage.model, opts.model));
  if (opts.conversationId) conditions.push(eq(tokenUsage.conversationId, opts.conversationId));
  if (opts.from != null) conditions.push(gte(tokenUsage.createdAt, new Date(opts.from * 1000)));
  if (opts.to != null) conditions.push(lte(tokenUsage.createdAt, new Date(opts.to * 1000)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = db
    .select({
      id: tokenUsage.id,
      agentId: tokenUsage.agentId,
      agentName: agents.name,
      conversationId: tokenUsage.conversationId,
      ownerId: tokenUsage.ownerId,
      providerId: tokenUsage.providerId,
      model: tokenUsage.model,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      totalTokens: tokenUsage.totalTokens,
      systemPromptTokens: tokenUsage.systemPromptTokens,
      toolDefTokens: tokenUsage.toolDefTokens,
      conversationTokens: tokenUsage.conversationTokens,
      estimatedTotal: tokenUsage.estimatedTotal,
      createdAt: tokenUsage.createdAt,
    })
    .from(tokenUsage)
    .leftJoin(agents, eq(tokenUsage.agentId, agents.id))
    .where(where)
    .orderBy(desc(tokenUsage.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const [countRow] = db.select({ value: sql<number>`count(*)` }).from(tokenUsage).where(where).all();

  return { items, total: Number(countRow?.value ?? 0), limit, offset };
}

/** Distinct model ids seen in usage logs (for filter dropdowns). */
export function listUsageModels(): string[] {
  const db = getDb();
  const rows = db.selectDistinct({ model: tokenUsage.model }).from(tokenUsage).orderBy(tokenUsage.model).all();
  return rows.map((r) => r.model).filter((m): m is string => typeof m === "string" && m.length > 0);
}

export function getUsageSummary(opts: { agentId?: string; model?: string; from?: number; to?: number }) {
  const db = getDb();
  const conditions = [];
  if (opts.agentId) conditions.push(eq(tokenUsage.agentId, opts.agentId));
  if (opts.model) conditions.push(eq(tokenUsage.model, opts.model));
  if (opts.from != null) conditions.push(gte(tokenUsage.createdAt, new Date(opts.from * 1000)));
  if (opts.to != null) conditions.push(lte(tokenUsage.createdAt, new Date(opts.to * 1000)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [row] = db
    .select({
      runs: sql<number>`count(*)`,
      inputTokens: sql<number>`coalesce(sum(${tokenUsage.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${tokenUsage.outputTokens}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${tokenUsage.totalTokens}), 0)`,
      systemPromptTokens: sql<number>`coalesce(sum(${tokenUsage.systemPromptTokens}), 0)`,
      toolDefTokens: sql<number>`coalesce(sum(${tokenUsage.toolDefTokens}), 0)`,
      conversationTokens: sql<number>`coalesce(sum(${tokenUsage.conversationTokens}), 0)`,
      estimatedTotal: sql<number>`coalesce(sum(${tokenUsage.estimatedTotal}), 0)`,
    })
    .from(tokenUsage)
    .where(where)
    .all();

  return {
    runs: Number(row?.runs ?? 0),
    inputTokens: Number(row?.inputTokens ?? 0),
    outputTokens: Number(row?.outputTokens ?? 0),
    totalTokens: Number(row?.totalTokens ?? 0),
    systemPromptTokens: Number(row?.systemPromptTokens ?? 0),
    toolDefTokens: Number(row?.toolDefTokens ?? 0),
    conversationTokens: Number(row?.conversationTokens ?? 0),
    estimatedTotal: Number(row?.estimatedTotal ?? 0),
    categories: [
      { id: "system_prompt" as const, label: "System prompt", tokens: Number(row?.systemPromptTokens ?? 0) },
      { id: "tools" as const, label: "Tools", tokens: Number(row?.toolDefTokens ?? 0) },
      { id: "conversation" as const, label: "Conversation", tokens: Number(row?.conversationTokens ?? 0) },
    ],
  };
}

export function previewContextUsage(
  agentId: string,
  opts: { conversationId?: string; ownerId?: string; isGuest?: boolean } = {},
): ContextUsageEstimate & { agentId: string; conversationId: string | null; model: string | null; providerId: string | null } {
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const ownerId = opts.ownerId ?? "user";
  const isGuest = opts.isGuest ?? false;
  const callableAgentIds: string[] = (agent.callableAgentIds as string[]) ?? [];

  const assignments = listAssignments(agentId);
  const enabledToolIds = assignments.map((a) => a.toolId).filter((id) => id !== "builtin:call_agent");

  const callableAgents =
    callableAgentIds.length === 0
      ? []
      : db.select({ id: agents.id, name: agents.name, description: agents.description }).from(agents).where(inArray(agents.id, callableAgentIds)).all();

  const systemPrompt = resolveSystemPrompt(agentId, callableAgents.length > 0 ? callableAgentIds : undefined, ownerId, isGuest);
  const tools = resolveAgentTools(agentId, enabledToolIds, ownerId, isGuest, {
    callableAgents,
    allowCallAgent: true,
  });
  const messages = opts.conversationId ? loadHistory(opts.conversationId) : [];

  const estimate = estimateContextUsage({ systemPrompt, tools, messages });
  return {
    ...estimate,
    agentId,
    conversationId: opts.conversationId ?? null,
    model: agent.aiModel ?? null,
    providerId: agent.aiProvider ?? null,
  };
}
