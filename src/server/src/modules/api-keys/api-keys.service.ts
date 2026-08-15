import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { agents, apiKeyAgents, apiKeys, getDb } from "../../common/db/client.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";

const KEY_PREFIX_LEN = 12;

export type ApiKeyMeta = {
  id: string;
  name: string;
  keyPrefix: string;
  agentIds: string[];
  createdBy: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export type ApiKeyContext = {
  id: string;
  createdBy: string;
  agentIds: string[];
};

function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `ra_${hex}`;
}

function loadAgentIds(keyId: string): string[] {
  return getDb()
    .select({ agentId: apiKeyAgents.agentId })
    .from(apiKeyAgents)
    .where(eq(apiKeyAgents.apiKeyId, keyId))
    .all()
    .map((r) => r.agentId);
}

function toMeta(row: typeof apiKeys.$inferSelect, agentIds: string[]): ApiKeyMeta {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    agentIds,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}

function assertAgentIds(agentIds: string[]): string[] {
  const unique = [...new Set(agentIds.filter((id) => typeof id === "string" && id.trim()))];
  if (unique.length === 0) return [];
  const found = getDb().select({ id: agents.id }).from(agents).where(inArray(agents.id, unique)).all();
  if (found.length !== unique.length) {
    throw new BadRequestException("One or more agents were not found");
  }
  return unique;
}

function replaceAgents(keyId: string, agentIds: string[]) {
  const db = getDb();
  db.delete(apiKeyAgents).where(eq(apiKeyAgents.apiKeyId, keyId)).run();
  if (agentIds.length === 0) return;
  db.insert(apiKeyAgents)
    .values(agentIds.map((agentId) => ({ apiKeyId: keyId, agentId })))
    .run();
}

export function listApiKeys(): { items: ApiKeyMeta[]; total: number } {
  const rows = getDb().select().from(apiKeys).all();
  const items = rows.map((row) => toMeta(row, loadAgentIds(row.id)));
  return { items, total: items.length };
}

export function createApiKey(body: { name: string; agentIds?: string[]; createdBy: string }): ApiKeyMeta & { key: string } {
  const name = body.name?.trim() ?? "";
  if (!name) throw new BadRequestException("name is required");
  const agentIds = assertAgentIds(body.agentIds ?? []);

  const raw = generateRawKey();
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    name,
    keyPrefix: raw.slice(0, KEY_PREFIX_LEN),
    keyHash: hashApiKey(raw),
    createdBy: body.createdBy,
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
  };
  getDb().insert(apiKeys).values(row).run();
  replaceAgents(row.id, agentIds);
  return { ...toMeta(row, agentIds), key: raw };
}

export function updateApiKey(id: string, body: { name?: string; agentIds?: string[] }): ApiKeyMeta {
  const existing = getDb().select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!existing) throw new BadRequestException("API key not found");

  const name = body.name !== undefined ? body.name.trim() : existing.name;
  if (!name) throw new BadRequestException("name is required");

  if (body.name !== undefined) {
    getDb().update(apiKeys).set({ name }).where(eq(apiKeys.id, id)).run();
  }
  let agentIds = loadAgentIds(id);
  if (body.agentIds !== undefined) {
    agentIds = assertAgentIds(body.agentIds);
    replaceAgents(id, agentIds);
  }
  const updated = getDb().select().from(apiKeys).where(eq(apiKeys.id, id)).get() ?? { ...existing, name };
  return toMeta(updated, agentIds);
}

export function revokeApiKey(id: string): ApiKeyMeta {
  const existing = getDb().select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!existing) throw new BadRequestException("API key not found");
  if (!existing.revokedAt) {
    getDb().update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id)).run();
  }
  const updated = getDb().select().from(apiKeys).where(eq(apiKeys.id, id)).get() ?? existing;
  return toMeta(updated, loadAgentIds(id));
}

export function deleteApiKey(id: string) {
  const existing = getDb().select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!existing) throw new BadRequestException("API key not found");
  getDb().delete(apiKeys).where(eq(apiKeys.id, id)).run();
}

export function authenticateApiKey(raw: string): ApiKeyContext | null {
  if (!raw.startsWith("ra_")) return null;
  const row = getDb()
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(raw)))
    .get();
  if (!row || row.revokedAt) return null;
  getDb().update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).run();
  return {
    id: row.id,
    createdBy: row.createdBy,
    agentIds: loadAgentIds(row.id),
  };
}

export function apiConversationOwnerId(apiKeyId: string): string {
  return `api:${apiKeyId}`;
}

export function listAccessibleAgents(agentIds: string[]) {
  if (agentIds.length === 0) return { items: [] as { id: string; name: string; description: string | null; avatar: string | null }[] };
  const rows = getDb()
    .select({
      id: agents.id,
      name: agents.name,
      description: agents.description,
      avatar: agents.avatar,
    })
    .from(agents)
    .where(inArray(agents.id, agentIds))
    .all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  return { items: agentIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => !!row) };
}
