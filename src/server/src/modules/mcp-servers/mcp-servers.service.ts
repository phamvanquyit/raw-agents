/**
 * mcp-servers.service.ts — CRUD + sync for MCP servers.
 *
 * Sync flow:
 *   1. Connect to MCP server via URL + headers
 *   2. Call listTools to discover available tools
 *   3. Store catalog on mcp_servers.tools (JSON)
 *   4. Remove stale agent assignments for tools that disappeared
 */

import { eq, like } from "drizzle-orm";
import { type McpCatalogTool, type NewMcpServer, agentToolAssignments, getDb, mcpServers } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { wsHub } from "../../common/ws/wsHub.js";
import { type McpToolDef, disconnectMcp, listMcpTools } from "./mcp-client.js";
import { mergeHeaders, toSafeMcpServer } from "./mcp-safe.js";
import { buildMcpToolId } from "./mcp-tool-id.js";
import { assertSafeMcpUrl } from "./mcp-url.js";

function toCatalogTools(remoteDefs: McpToolDef[]): McpCatalogTool[] {
  return remoteDefs.map((d) => ({
    name: d.name,
    description: d.description || "",
    inputSchema: d.inputSchema,
  }));
}

function syncCatalogForServer(serverId: string, remoteDefs: McpToolDef[]): SyncResult {
  const db = getDb();
  const server = db.select().from(mcpServers).where(eq(mcpServers.id, serverId)).get();
  if (!server) throw new Error("MCP server not found");

  const previous = (server.tools ?? []) as McpCatalogTool[];
  const previousNames = new Set(previous.map((t) => t.name));
  const next = toCatalogTools(remoteDefs);
  const nextNames = new Set(next.map((t) => t.name));

  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const tool of next) {
    if (previousNames.has(tool.name)) updated++;
    else added++;
  }

  for (const name of previousNames) {
    if (!nextNames.has(name)) {
      db.delete(agentToolAssignments)
        .where(eq(agentToolAssignments.toolId, buildMcpToolId(serverId, name)))
        .run();
      removed++;
    }
  }

  db.update(mcpServers).set({ tools: next, updatedAt: new Date() }).where(eq(mcpServers.id, serverId)).run();

  const updatedServer = db.select().from(mcpServers).where(eq(mcpServers.id, serverId)).get();
  if (updatedServer) {
    wsHub.emit("mcp-servers:updated", toSafeMcpServer({ ...updatedServer, toolCount: next.length }));
  }

  return {
    added,
    updated,
    removed,
    tools: next.map((t) => t.name),
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function listMcpServers(query: RawQuery = {}) {
  const result = listQuery({ table: mcpServers, searchColumns: ["name", "url"] }, query);
  const items = result.items.map((server: (typeof result.items)[number]) => {
    const tools = (server.tools ?? []) as McpCatalogTool[];
    return toSafeMcpServer({ ...server, toolCount: tools.length, tools });
  });
  return { ...result, items };
}

export function getMcpServer(id: string) {
  const db = getDb();
  const server = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
  if (!server) return null;
  const tools = (server.tools ?? []) as McpCatalogTool[];
  return toSafeMcpServer({ ...server, tools });
}

export async function createMcpServer(body: Pick<NewMcpServer, "name" | "url" | "headers">) {
  await assertSafeMcpUrl(body.url);

  const db = getDb();
  const now = new Date();
  const server: NewMcpServer = {
    id: crypto.randomUUID(),
    name: body.name,
    url: body.url,
    headers: body.headers ?? {},
    tools: [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(mcpServers).values(server).run();
  const safe = toSafeMcpServer({ ...server, toolCount: 0, tools: [] });
  wsHub.emit("mcp-servers:created", safe);
  return safe;
}

export async function updateMcpServer(id: string, body: Partial<NewMcpServer>) {
  const db = getDb();
  const existing = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
  if (!existing) return null;

  if (body.url) {
    await assertSafeMcpUrl(body.url);
  }

  const patch: Partial<NewMcpServer> = { ...body };
  delete patch.tools;
  if (body.headers) {
    patch.headers = mergeHeaders((existing.headers ?? {}) as Record<string, string>, body.headers);
  }

  db.update(mcpServers)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(mcpServers.id, id))
    .run();

  if (body.url || body.headers) {
    await disconnectMcp(existing.id);
  }

  const updated = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
  if (!updated) return null;

  const tools = (updated.tools ?? []) as McpCatalogTool[];
  const safe = toSafeMcpServer({ ...updated, toolCount: tools.length, tools });
  wsHub.emit("mcp-servers:updated", safe);
  return safe;
}

export async function deleteMcpServer(id: string) {
  const db = getDb();

  await disconnectMcp(id);

  db.delete(agentToolAssignments)
    .where(like(agentToolAssignments.toolId, `mcp:${id}:%`))
    .run();
  db.delete(mcpServers).where(eq(mcpServers.id, id)).run();
  wsHub.emit("mcp-servers:deleted", { id });
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  tools: string[];
}

/** Sync tools from an MCP server into mcp_servers.tools JSON catalog. */
export async function syncMcpTools(serverId: string): Promise<SyncResult> {
  const db = getDb();
  const server = db.select().from(mcpServers).where(eq(mcpServers.id, serverId)).get();
  if (!server) throw new Error("MCP server not found");
  if (!server.isActive) throw new Error("MCP server is inactive");

  await disconnectMcp(serverId);

  const remoteDefs = await listMcpTools(serverId, server.url, (server.headers ?? {}) as Record<string, string>);
  return syncCatalogForServer(serverId, remoteDefs);
}

// ─── Cursor-format config ─────────────────────────────────────────────────────

export type McpConfigEntry = {
  url: string;
  headers?: Record<string, string>;
};

export type McpConfig = {
  mcpServers: Record<string, McpConfigEntry>;
};

export interface ApplyConfigResult {
  created: string[];
  updated: string[];
  deleted: string[];
  syncErrors: { name: string; error: string }[];
}

/** Return Cursor-format config with plaintext headers (for the edit page). */
export function getMcpConfig(): McpConfig {
  const db = getDb();
  const servers = db.select().from(mcpServers).all();
  const mcpServersMap: Record<string, McpConfigEntry> = {};
  for (const s of servers) {
    const entry: McpConfigEntry = { url: s.url };
    const headers = (s.headers ?? {}) as Record<string, string>;
    if (Object.keys(headers).length > 0) {
      entry.headers = headers;
    }
    mcpServersMap[s.name] = entry;
  }
  return { mcpServers: mcpServersMap };
}

/**
 * Apply a Cursor-style MCP config:
 *   { "mcpServers": { "name": { "url": "...", "headers": {} } } }
 *
 * Creates / updates / deletes servers by name, then syncs tools.
 */
export async function applyMcpConfig(config: McpConfig): Promise<ApplyConfigResult> {
  if (!config || typeof config !== "object" || !config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
    throw new Error('Config must be an object with an "mcpServers" map');
  }

  const entries: { name: string; url: string; headers: Record<string, string> }[] = [];
  for (const [name, entry] of Object.entries(config.mcpServers)) {
    if (!name.trim()) throw new Error("Server name cannot be empty");
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Server "${name}" must be an object with "url"`);
    }
    if (!entry.url || typeof entry.url !== "string" || !entry.url.trim()) {
      throw new Error(`Server "${name}" requires a non-empty "url"`);
    }
    if (entry.headers !== undefined && (typeof entry.headers !== "object" || entry.headers === null || Array.isArray(entry.headers))) {
      throw new Error(`Server "${name}" headers must be an object`);
    }
    await assertSafeMcpUrl(entry.url.trim());
    entries.push({ name: name.trim(), url: entry.url.trim(), headers: (entry.headers ?? {}) as Record<string, string> });
  }

  const db = getDb();
  const existing = db.select().from(mcpServers).all();
  const existingByName = new Map(existing.map((s) => [s.name, s]));
  const desiredNames = new Set(entries.map((e) => e.name));

  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const syncErrors: { name: string; error: string }[] = [];

  for (const server of existing) {
    if (!desiredNames.has(server.name)) {
      await deleteMcpServer(server.id);
      deleted.push(server.name);
    }
  }

  for (const entry of entries) {
    const current = existingByName.get(entry.name);

    let serverId: string;
    if (current) {
      await updateMcpServer(current.id, { url: entry.url, headers: entry.headers });
      updated.push(entry.name);
      serverId = current.id;
    } else {
      const server = await createMcpServer({ name: entry.name, url: entry.url, headers: entry.headers });
      created.push(entry.name);
      serverId = server.id!;
    }

    try {
      await syncMcpTools(serverId);
    } catch (err) {
      syncErrors.push({ name: entry.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { created, updated, deleted, syncErrors };
}
