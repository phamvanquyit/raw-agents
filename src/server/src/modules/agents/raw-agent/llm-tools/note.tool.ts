/**
 * note.tool.ts — Builtin tool: manage agent notes (CRUD)
 *
 * Actions:
 *   list        — list all note titles (no content)
 *   get_detail  — get full content of a note by id
 *   create      — create a new note (title + content)
 *   update      — update an existing note (id + title? + content?)
 *   delete      — delete a single note by id
 *   delete_all  — delete ALL notes for this agent
 *
 * LangGraph JS version — uses @langchain/core/tools
 */

import { tool } from "@langchain/core/tools";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { agentNotes, getDb } from "../../../../common/db/client.js";

export const makeNoteTool = (agentId: string) =>
  tool(
    async ({
      action,
      id,
      title,
      content,
    }: {
      action: "list" | "get_detail" | "create" | "update" | "delete" | "delete_all";
      id?: string;
      title?: string;
      content?: string;
    }) => {
      const db = getDb();
      const now = new Date();

      // ── list ──
      if (action === "list") {
        const notes = db.select({ id: agentNotes.id, title: agentNotes.title }).from(agentNotes).where(eq(agentNotes.agentId, agentId)).all();
        return JSON.stringify({ ok: true, count: notes.length, notes });
      }

      // ── get_detail ──
      if (action === "get_detail") {
        if (!id) return JSON.stringify({ ok: false, error: "id is required for get_detail" });
        const note = db.select().from(agentNotes).where(eq(agentNotes.id, id)).get();
        if (!note) return JSON.stringify({ ok: false, error: "Note not found" });
        return JSON.stringify({
          ok: true,
          id: note.id,
          title: note.title,
          content: note.content,
        });
      }

      // ── create ──
      if (action === "create") {
        if (!title) return JSON.stringify({ ok: false, error: "title is required for create" });
        const note = {
          id: crypto.randomUUID(),
          agentId,
          title,
          content: content ?? "",
          createdAt: now,
          updatedAt: now,
        };
        db.insert(agentNotes).values(note).run();
        return JSON.stringify({ ok: true, id: note.id, message: `Note "${title}" created.` });
      }

      // ── update ──
      if (action === "update") {
        if (!id) return JSON.stringify({ ok: false, error: "id is required for update" });
        const existing = db.select({ id: agentNotes.id }).from(agentNotes).where(eq(agentNotes.id, id)).get();
        if (!existing) return JSON.stringify({ ok: false, error: "Note not found" });
        db.update(agentNotes)
          .set({
            ...(title ? { title } : {}),
            ...(content !== undefined ? { content } : {}),
            updatedAt: now,
          })
          .where(eq(agentNotes.id, id))
          .run();
        return JSON.stringify({ ok: true, message: "Note updated." });
      }

      // ── delete ──
      if (action === "delete") {
        if (!id) return JSON.stringify({ ok: false, error: "id is required for delete" });
        db.delete(agentNotes).where(eq(agentNotes.id, id)).run();
        return JSON.stringify({ ok: true, message: "Note deleted." });
      }

      // ── delete_all ──
      if (action === "delete_all") {
        const existing = db.select({ id: agentNotes.id }).from(agentNotes).where(eq(agentNotes.agentId, agentId)).all();
        const count = existing.length;
        db.delete(agentNotes).where(eq(agentNotes.agentId, agentId)).run();
        return JSON.stringify({ ok: true, message: `All notes deleted (${count} removed).` });
      }

      return JSON.stringify({ ok: false, error: "Unknown action" });
    },
    {
      name: "manage_agent_note",
      description: `Manage long-term notes (markdown documents).

Available actions:
- **list**: List all note titles and IDs (no content).
- **get_detail**: Get full content of a note. Requires \`id\`.
- **create**: Create a new note. Requires \`title\` and \`content\`.
- **update**: Update an existing note. Requires \`id\`, optional \`title\` and \`content\`.
- **delete**: Delete a single note. Requires \`id\`.
- **delete_all**: Delete ALL notes for this agent. No parameters needed.`,
      schema: z.object({
        action: z.enum(["list", "get_detail", "create", "update", "delete", "delete_all"]),
        id: z.string().optional().describe("Note ID (required for get_detail, update, delete)"),
        title: z.string().optional().describe("Note title (required for create, optional for update)"),
        content: z.string().optional().describe("Markdown content (required for create, optional for update)"),
      }),
    },
  );

export const TOOL_DEF = {
  toolName: "manage_agent_note",
  toolLabel: "Manage Agent Note",
  description: "Create, read, update, or delete long documents, plans, scripts, and lists for the agent.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["create", "read", "update", "delete"], description: "The operation to perform" },
      title: { type: "string", description: "The title of the note" },
      content: { type: "string", description: "The content of the note" },
    },
    required: ["action"],
  },
};
