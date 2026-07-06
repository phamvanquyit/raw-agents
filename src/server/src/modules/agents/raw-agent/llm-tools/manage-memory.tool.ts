/**
 * manage_memory.tool.ts — Unified memory tool
 *
 * Single tool for all long-term storage:
 *   - Facts: short key-value items, always injected into system prompt
 *   - Documents: long markdown docs, only titles in prompt, full content on-demand
 *
 * Actions:
 *   add_facts     — add one or more facts
 *   remove_facts  — remove facts by IDs
 *   list          — list all facts + document titles
 *   save_doc      — create or update a document
 *   read_doc      — read full document content by ID
 *   delete_doc    — delete a document by ID
 *
 * LangGraph JS version — uses @langchain/core/tools
 */

import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { agentNotes, agentUserFacts, getDb } from "../../../../common/db/client.js";

/**
 * Create the manage_memory tool for a specific agent + owner.
 *
 * @param agentId  — the agent this memory belongs to
 * @param ownerId  — user ID (UUID) or fingerprint (guest)
 * @param isGuest  — if true, document actions are disabled
 */
export function makeManageMemoryTool(agentId: string, ownerId: string, isGuest = false): StructuredToolInterface {
  // Build description dynamically based on guest status
  const docActions = isGuest
    ? ""
    : `
- **save_doc**: Save a long document. Provide \`title\` and \`content\`. Optionally provide \`id\` to update existing.
- **read_doc**: Read full document content. Requires \`id\`.
- **delete_doc**: Delete a document. Requires \`id\`.`;

  const description = `Manage your long-term memory. Use this to remember important information across conversations.

Available actions:
- **add_facts**: Add short facts (preferences, names, key info). Provide \`facts\` array.
- **remove_facts**: Remove facts by IDs. Provide \`fact_ids\` array.
- **list**: List all your saved facts and document titles.${docActions}

Facts are always visible to you in the <memory> section. Documents require \`read_doc\` to access full content.`;

  // Build action enum based on guest status
  const allActions = ["add_facts", "remove_facts", "list", "save_doc", "read_doc", "delete_doc"] as const;
  const guestActions = ["add_facts", "remove_facts", "list"] as const;
  const actions = isGuest ? guestActions : allActions;

  return tool(
    async ({
      action,
      facts,
      fact_ids,
      id,
      title,
      content,
    }: {
      action: string;
      facts?: string[];
      fact_ids?: string[];
      id?: string;
      title?: string;
      content?: string;
    }) => {
      const db = getDb();
      const now = new Date();

      // ── add_facts ──
      if (action === "add_facts") {
        if (!facts || facts.length === 0) return JSON.stringify({ ok: false, error: "Provide at least one fact in the 'facts' array." });
        const inserted: { id: string; content: string }[] = [];
        for (const fact of facts) {
          if (!fact.trim()) continue;
          const factId = crypto.randomUUID();
          db.insert(agentUserFacts).values({ id: factId, agentId, ownerId, content: fact.trim(), createdAt: now }).run();
          inserted.push({ id: factId, content: fact.trim() });
        }
        return JSON.stringify({ ok: true, added: inserted.length, facts: inserted });
      }

      // ── remove_facts ──
      if (action === "remove_facts") {
        if (!fact_ids || fact_ids.length === 0) return JSON.stringify({ ok: false, error: "Provide fact IDs in 'fact_ids' array." });
        let removed = 0;
        for (const fid of fact_ids) {
          const existing = db
            .select({ id: agentUserFacts.id })
            .from(agentUserFacts)
            .where(and(eq(agentUserFacts.id, fid), eq(agentUserFacts.agentId, agentId), eq(agentUserFacts.ownerId, ownerId)))
            .get();
          if (existing) {
            db.delete(agentUserFacts).where(eq(agentUserFacts.id, fid)).run();
            removed++;
          }
        }
        return JSON.stringify({ ok: true, removed });
      }

      // ── list ──
      if (action === "list") {
        const factRows = db
          .select({ id: agentUserFacts.id, content: agentUserFacts.content })
          .from(agentUserFacts)
          .where(and(eq(agentUserFacts.agentId, agentId), eq(agentUserFacts.ownerId, ownerId)))
          .all();

        if (isGuest) {
          return JSON.stringify({ ok: true, facts: factRows, documents: [] });
        }

        const docRows = db
          .select({ id: agentNotes.id, title: agentNotes.title })
          .from(agentNotes)
          .where(and(eq(agentNotes.agentId, agentId), eq(agentNotes.ownerId, ownerId)))
          .all();

        return JSON.stringify({ ok: true, facts: factRows, documents: docRows });
      }

      // ── Document actions (authenticated users only) ──
      if (isGuest && ["save_doc", "read_doc", "delete_doc"].includes(action)) {
        return JSON.stringify({ ok: false, error: "Document storage is not available for guest users." });
      }

      // ── save_doc ──
      if (action === "save_doc") {
        if (!title && !id) return JSON.stringify({ ok: false, error: "Provide 'title' for new doc, or 'id' to update existing." });

        // Update existing
        if (id) {
          const existing = db
            .select({ id: agentNotes.id })
            .from(agentNotes)
            .where(and(eq(agentNotes.id, id), eq(agentNotes.agentId, agentId), eq(agentNotes.ownerId, ownerId)))
            .get();
          if (!existing) return JSON.stringify({ ok: false, error: "Document not found." });
          db.update(agentNotes)
            .set({
              ...(title ? { title } : {}),
              ...(content !== undefined ? { content } : {}),
              updatedAt: now,
            })
            .where(eq(agentNotes.id, id))
            .run();
          return JSON.stringify({ ok: true, id, message: "Document updated." });
        }

        // Create new
        const docId = crypto.randomUUID();
        db.insert(agentNotes)
          .values({ id: docId, agentId, ownerId, title: title!, content: content ?? "", createdAt: now, updatedAt: now })
          .run();
        return JSON.stringify({ ok: true, id: docId, message: `Document "${title}" created.` });
      }

      // ── read_doc ──
      if (action === "read_doc") {
        if (!id) return JSON.stringify({ ok: false, error: "'id' is required for read_doc." });
        const doc = db
          .select()
          .from(agentNotes)
          .where(and(eq(agentNotes.id, id), eq(agentNotes.agentId, agentId), eq(agentNotes.ownerId, ownerId)))
          .get();
        if (!doc) return JSON.stringify({ ok: false, error: "Document not found." });
        return JSON.stringify({ ok: true, id: doc.id, title: doc.title, content: doc.content });
      }

      // ── delete_doc ──
      if (action === "delete_doc") {
        if (!id) return JSON.stringify({ ok: false, error: "'id' is required for delete_doc." });
        db.delete(agentNotes)
          .where(and(eq(agentNotes.id, id), eq(agentNotes.agentId, agentId), eq(agentNotes.ownerId, ownerId)))
          .run();
        return JSON.stringify({ ok: true, message: "Document deleted." });
      }

      return JSON.stringify({ ok: false, error: `Unknown action: ${action}` });
    },
    {
      name: "manage_memory",
      description,
      schema: z.object({
        action: z.enum(actions as unknown as [string, ...string[]]),
        facts: z.array(z.string()).optional().describe("Facts to add (for add_facts)"),
        fact_ids: z.array(z.string()).optional().describe("Fact IDs to remove (for remove_facts)"),
        id: z.string().optional().describe("Document ID (for save_doc update, read_doc, delete_doc)"),
        title: z.string().optional().describe("Document title (for save_doc)"),
        content: z.string().optional().describe("Document content in markdown (for save_doc)"),
      }),
    },
  );
}

export const TOOL_DEF = {
  toolName: "manage_memory",
  toolLabel: "Manage Memory",
  description: "Add/remove facts and manage long documents for the agent's long-term memory.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["add_facts", "remove_facts", "list", "save_doc", "read_doc", "delete_doc"] },
    },
    required: ["action"],
  },
};
