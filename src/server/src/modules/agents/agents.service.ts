import { and, count, eq, inArray } from "drizzle-orm";
import { type McpCatalogTool, type NewAgent, agentToolAssignments, agentTools, agents, getDb, mcpServers, users } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { wsHub } from "../../common/ws/wsHub.js";
import { buildMcpLangGraphName, parseMcpToolId } from "../mcp-servers/mcp-tool-id.js";
import { getBuiltinTool } from "../tools/tools.service.js";

// ─── Agents ───────────────────────────────────────────────────────────────────

/**
 * List agents with pagination, search, sorting, plus enrichment
 * (creator name, tool assignment count).
 */
export function listAgentsEnriched(query: RawQuery, user?: { id: string; role: string }) {
  const db = getDb();

  // Role-based filtering: admin sees all, member sees only own agents
  const ownerFilter = user && user.role !== "admin" ? eq(agents.createdBy, user.id) : undefined;

  const result = listQuery(
    {
      table: agents,
      searchColumns: ["name", "description"],
      ...(ownerFilter ? { where: ownerFilter } : {}),
    },
    query,
  );

  // Enrich with creator name
  const creatorIds = [...new Set(result.items.map((a: any) => a.createdBy).filter(Boolean))];
  const creatorMap = new Map<string, string>();
  if (creatorIds.length > 0) {
    const rows = db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, creatorIds)).all();
    for (const r of rows) creatorMap.set(r.id, r.name);
  }

  // Enrich with tool assignment count
  const agentIds = result.items.map((a: any) => a.id);
  const toolCountMap = new Map<string, number>();
  if (agentIds.length > 0) {
    const rows = db
      .select({ agentId: agentToolAssignments.agentId, count: count() })
      .from(agentToolAssignments)
      .where(inArray(agentToolAssignments.agentId, agentIds))
      .groupBy(agentToolAssignments.agentId)
      .all();
    for (const r of rows) toolCountMap.set(r.agentId, r.count);
  }

  return {
    ...result,
    items: result.items.map((a: any) => ({
      ...a,
      creatorName: a.createdBy ? (creatorMap.get(a.createdBy) ?? null) : null,
      toolCount: toolCountMap.get(a.id) ?? 0,
    })),
  };
}

export function getAgent(id: string) {
  return getDb().select().from(agents).where(eq(agents.id, id)).get();
}

/**
 * List agents filtered by ownership:
 * - admin sees all agents
 * - member sees only agents they created
 */
export function listAgents(user?: { id: string; role: string }) {
  const db = getDb();
  if (!user || user.role === "admin") {
    return db.select().from(agents).all();
  }
  // member: only own agents
  return db.select().from(agents).where(eq(agents.createdBy, user.id)).all();
}

/** Minimal random nice-avatar JSON when client omits avatar */
function randomAvatarJson(): string {
  const hex = () =>
    `#${Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0")}`;
  return JSON.stringify({
    sex: Math.random() > 0.5 ? "man" : "woman",
    faceColor: hex(),
    earSize: Math.random() > 0.5 ? "small" : "big",
    hairColor: hex(),
    hairStyle: ["normal", "thick", "mohawk", "womanLong", "womanShort"][Math.floor(Math.random() * 5)],
    hatColor: hex(),
    hatStyle: "none",
    eyeStyle: ["circle", "oval", "smile"][Math.floor(Math.random() * 3)],
    glassesStyle: "none",
    noseStyle: ["short", "long", "round"][Math.floor(Math.random() * 3)],
    mouthStyle: ["laugh", "smile", "peace"][Math.floor(Math.random() * 3)],
    shirtStyle: ["hoody", "short", "polo"][Math.floor(Math.random() * 3)],
    shirtColor: hex(),
    bgColor: hex(),
  });
}

export function createAgent(body: Omit<NewAgent, "id" | "createdAt" | "updatedAt">) {
  const now = new Date();
  const newAgent: NewAgent = {
    ...body,
    avatar: body.avatar?.trim() ? body.avatar : randomAvatarJson(),
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  getDb().insert(agents).values(newAgent).run();
  wsHub.emit("agents:created", newAgent);
  return newAgent;
}

export function updateAgent(id: string, body: Partial<NewAgent>) {
  getDb()
    .update(agents)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(agents.id, id))
    .run();
  const updated = getDb().select().from(agents).where(eq(agents.id, id)).get();
  wsHub.emit("agents:updated", updated);
  return updated;
}

export function deleteAgent(id: string) {
  getDb().delete(agents).where(eq(agents.id, id)).run();
  wsHub.emit("agents:deleted", { id });
}

export function cloneAgent(sourceId: string, createdBy?: string) {
  const db = getDb();
  const src = db.select().from(agents).where(eq(agents.id, sourceId)).get();
  if (!src) return null;

  const now = new Date();
  const newId = crypto.randomUUID();

  // Strip existing "(Copy)" / "(Copy N)" suffix to get the base name
  const baseName = src.name.replace(/\s*\(Copy(?:\s+\d+)?\)$/, "");

  // Find all agents with names like "BaseName (Copy)" or "BaseName (Copy N)"
  const allAgents = db.select({ name: agents.name }).from(agents).all();
  const copyPattern = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(Copy(?:\\s+(\\d+))?\\)$`);
  let maxNum = 0;
  for (const a of allAgents) {
    const m = a.name.match(copyPattern);
    if (m) {
      const num = m[1] ? Number.parseInt(m[1], 10) : 1;
      if (num > maxNum) maxNum = num;
    }
  }
  const nextNum = maxNum + 1;
  const cloneName = nextNum === 1 ? `${baseName} (Copy)` : `${baseName} (Copy ${nextNum})`;

  const cloned: NewAgent = {
    id: newId,
    name: cloneName,
    description: src.description,
    avatar: src.avatar?.trim() ? src.avatar : randomAvatarJson(),
    systemPrompt: src.systemPrompt,
    isActive: true,
    isPublic: false,
    publicPassword: null,
    aiProvider: src.aiProvider,
    aiModel: src.aiModel,
    callableAgentIds: src.callableAgentIds ?? [],
    teamId: src.teamId,
    createdBy: createdBy ?? src.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(agents).values(cloned).run();

  // Copy tool assignments
  const srcAssignments = db.select().from(agentToolAssignments).where(eq(agentToolAssignments.agentId, sourceId)).all();
  for (const a of srcAssignments) {
    db.insert(agentToolAssignments)
      .values({
        id: crypto.randomUUID(),
        agentId: newId,
        toolId: a.toolId,
        createdAt: now,
      })
      .run();
  }

  const result = db.select().from(agents).where(eq(agents.id, newId)).get();
  wsHub.emit("agents:created", result);
  return result;
}

// ─── Tool Assignments ─────────────────────────────────────────────────────────

export interface AssignmentWithTool {
  id: string;
  agentId: string;
  toolId: string;
  createdAt: Date;
  tool: {
    name: string;
    label: string;
    description: string;
  };
}

export interface NewAssignmentInput {
  toolId: string;
}

/** List all tool assignments for an agent, joined with tool info. */
export function listAssignments(agentId: string): AssignmentWithTool[] {
  const db = getDb();
  const rows = db
    .select({
      id: agentToolAssignments.id,
      agentId: agentToolAssignments.agentId,
      toolId: agentToolAssignments.toolId,
      createdAt: agentToolAssignments.createdAt,
      toolName: agentTools.name,
      toolLabel: agentTools.label,
      toolDescription: agentTools.description,
    })
    .from(agentToolAssignments)
    .leftJoin(agentTools, eq(agentToolAssignments.toolId, agentTools.id))
    .where(eq(agentToolAssignments.agentId, agentId))
    .all();

  return rows.map((r) => {
    // For builtin tools, resolve info from in-memory registry
    if (r.toolId.startsWith("builtin:")) {
      const builtin = getBuiltinTool(r.toolId);
      return {
        id: r.id,
        agentId: r.agentId,
        toolId: r.toolId,
        createdAt: r.createdAt,
        tool: {
          name: builtin?.name ?? r.toolId,
          label: builtin?.label ?? r.toolId,
          description: builtin?.description ?? "",
        },
      };
    }

    const mcp = parseMcpToolId(r.toolId);
    if (mcp) {
      const server = db.select().from(mcpServers).where(eq(mcpServers.id, mcp.serverId)).get();
      const catalog = (server?.tools ?? []) as McpCatalogTool[];
      const def = catalog.find((t) => t.name === mcp.toolName);
      return {
        id: r.id,
        agentId: r.agentId,
        toolId: r.toolId,
        createdAt: r.createdAt,
        tool: {
          name: buildMcpLangGraphName(server?.name ?? "mcp", mcp.toolName),
          label: `${server?.name ?? "mcp"} → ${def?.name ?? mcp.toolName}`,
          description: def?.description ?? "",
        },
      };
    }

    return {
      id: r.id,
      agentId: r.agentId,
      toolId: r.toolId,
      createdAt: r.createdAt,
      tool: {
        name: r.toolName ?? "",
        label: r.toolLabel ?? "",
        description: r.toolDescription ?? "",
      },
    };
  });
}

/** Replace all tool assignments for an agent. */
export function setAssignments(agentId: string, items: NewAssignmentInput[]): AssignmentWithTool[] {
  const db = getDb();

  // Delete existing
  db.delete(agentToolAssignments).where(eq(agentToolAssignments.agentId, agentId)).run();

  // Insert new
  for (const item of items) {
    db.insert(agentToolAssignments)
      .values({
        id: crypto.randomUUID(),
        agentId,
        toolId: item.toolId,
        createdAt: new Date(),
      })
      .run();
  }

  const result = listAssignments(agentId);
  wsHub.emit("agents:tools-updated", { agentId, assignments: result });
  return result;
}

/** Add a single tool assignment (upsert: if already assigned, update it). */
export function addAssignment(agentId: string, input: NewAssignmentInput): AssignmentWithTool | null {
  const db = getDb();

  // Check if an assignment already exists for this (agentId, toolId)
  const existing = db
    .select({ id: agentToolAssignments.id })
    .from(agentToolAssignments)
    .where(and(eq(agentToolAssignments.agentId, agentId), eq(agentToolAssignments.toolId, input.toolId)))
    .get();

  if (existing) {
    // Already assigned, nothing to update
  } else {
    const id = crypto.randomUUID();
    db.insert(agentToolAssignments)
      .values({
        id,
        agentId,
        toolId: input.toolId,
        createdAt: new Date(),
      })
      .run();
  }

  const result = listAssignments(agentId);
  wsHub.emit("agents:tools-updated", { agentId, assignments: result });
  return result.find((a) => a.toolId === input.toolId) ?? null;
}

/** Remove a single assignment by its ID. */
export function removeAssignment(assignmentId: string): void {
  const db = getDb();
  const row = db.select({ agentId: agentToolAssignments.agentId }).from(agentToolAssignments).where(eq(agentToolAssignments.id, assignmentId)).get();

  db.delete(agentToolAssignments).where(eq(agentToolAssignments.id, assignmentId)).run();

  if (row) {
    wsHub.emit("agents:tools-updated", { agentId: row.agentId });
  }
}
