/**
 * agent-tool-assignments.service.ts
 *
 * CRUD for agent ↔ tool assignments (junction table).
 * All queries JOIN agent_tools to return tool info.
 */

import { and, eq } from "drizzle-orm";
import { agentToolAssignments, agentTools, getDb } from "../../common/db/client.js";
import { wsHub } from "../../common/ws/wsHub.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssignmentWithTool {
  id: string;
  agentId: string;
  toolId: string;
  createdAt: Date;
  tool: {
    name: string;
    label: string;
    description: string;
    isBuiltin: boolean;
  };
}

export interface NewAssignmentInput {
  toolId: string;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

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
      toolIsBuiltin: agentTools.isBuiltin,
    })
    .from(agentToolAssignments)
    .innerJoin(agentTools, eq(agentToolAssignments.toolId, agentTools.id))
    .where(eq(agentToolAssignments.agentId, agentId))
    .all();

  return rows.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    toolId: r.toolId,
    createdAt: r.createdAt,
    tool: {
      name: r.toolName,
      label: r.toolLabel,
      description: r.toolDescription,
      isBuiltin: r.toolIsBuiltin,
    },
  }));
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
