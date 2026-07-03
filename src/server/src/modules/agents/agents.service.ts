import { eq } from "drizzle-orm";
import { type NewAgent, type NewAgentNote, agentNotes, agentTeams, agentToolAssignments, agents, getDb } from "../../common/db/client.js";
import { wsHub } from "../../common/ws/wsHub.js";

// ─── Agents ───────────────────────────────────────────────────────────────────

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

export function createAgent(body: Omit<NewAgent, "id" | "createdAt" | "updatedAt">) {
  const now = new Date();
  const newAgent: NewAgent = { ...body, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
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
    systemPrompt: src.systemPrompt,
    isActive: true,
    isPublic: false,
    publicPassword: null,
    aiProvider: src.aiProvider,
    aiModel: src.aiModel,
    memoryContent: src.memoryContent,
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

// ─── Agent Notes ──────────────────────────────────────────────────────────────

export function listAgentNotes(agentId: string) {
  return getDb().select().from(agentNotes).where(eq(agentNotes.agentId, agentId)).all();
}

export function createAgentNote(agentId: string, body: { title: string; content?: string }) {
  const now = new Date();
  const note: NewAgentNote = {
    id: crypto.randomUUID(),
    agentId,
    title: body.title,
    content: body.content ?? "",
    createdAt: now,
    updatedAt: now,
  };
  getDb().insert(agentNotes).values(note).run();
  return note;
}

// ─── Teammates ────────────────────────────────────────────────────────────────

export function getTeammates(agentId: string) {
  const db = getDb();
  const self = db.select({ teamId: agents.teamId }).from(agents).where(eq(agents.id, agentId)).get();
  if (!self?.teamId) return [];
  const teamId = self.teamId;
  const team = db.select().from(agentTeams).where(eq(agentTeams.id, teamId)).get();
  if (!team) return [];
  const teammates = db
    .select({ id: agents.id, name: agents.name, description: agents.description })
    .from(agents)
    .where(eq(agents.teamId, teamId))
    .all()
    .filter((a) => a.id !== agentId);
  return [{ teamId: team.id, teamName: team.name, teamDescription: team.description, teammates }];
}
