/**
 * buildSystemPrompt.ts (server-side)
 *
 * Build system prompt from agent data + DB (per-user facts, docs).
 * Runs entirely on server — no HTTP round-trips.
 *
 * Memory is per-user:
 *   - Facts: always injected (short items)
 *   - Documents: only titles injected, full content loaded on-demand via manage_memory tool
 *   - Guest users: only facts, no documents
 *
 * Callable agents:
 *   Populated only from explicit UI selection (callableAgentIds).
 *   If no agents are explicitly selected → no delegation context.
 */

import { and, eq } from "drizzle-orm";
import { agentNotes, agentUserFacts, agents, getDb } from "../../../../common/db/client.js";
import { callAgentToolName } from "../llm-tools/call-agent.tool.js";

export function buildSystemPrompt(
  agent: {
    id: string;
    name: string;
    systemPrompt: string | null | undefined;
  },
  facts: { id: string; content: string }[],
  docTitles: { id: string; title: string }[],
  options: {
    isGuest?: boolean;
    agentsToDelegate?: { id: string; name: string; description: string | null; teamName?: string }[];
  } = {},
): string {
  const { isGuest = false, agentsToDelegate } = options;
  const parts: string[] = [];

  // ── Role & Behavior ──
  if (agent.systemPrompt) {
    parts.push(`<role>
${agent.systemPrompt}
</role>`);
  }

  // ── Memory instructions ──
  if (isGuest) {
    parts.push(`<memory_instructions>
You have a long-term memory tool: \`manage_memory\`.

- Use \`manage_memory({ action: "add_facts", facts: [...] })\` to remember important information.
- Use \`manage_memory({ action: "remove_facts", fact_ids: [...] })\` to forget outdated facts.
- Use \`manage_memory({ action: "list" })\` to see all saved facts.

Your current facts are listed in the \`<memory>\` section below.
</memory_instructions>`);
  } else {
    parts.push(`<memory_instructions>
You have a long-term memory tool: \`manage_memory\`.

**Facts** (short items — always visible in \`<memory>\`):
- \`manage_memory({ action: "add_facts", facts: ["fact1", "fact2"] })\` — remember new facts.
- \`manage_memory({ action: "remove_facts", fact_ids: ["id1"] })\` — forget outdated facts.

**Documents** (long content — titles listed in \`<documents>\`):
- \`manage_memory({ action: "save_doc", title: "...", content: "..." })\` — create a document.
- \`manage_memory({ action: "save_doc", id: "...", content: "..." })\` — update existing document.
- \`manage_memory({ action: "read_doc", id: "..." })\` — read full document content.
- \`manage_memory({ action: "delete_doc", id: "..." })\` — delete a document.

Use \`manage_memory({ action: "list" })\` to see all facts and document titles.
</memory_instructions>`);
  }

  // ── Facts (always injected) ──
  if (facts.length > 0) {
    const list = facts.map((f) => `- [${f.id}] ${f.content}`).join("\n");
    parts.push(`<memory>
${list}
</memory>`);
  }

  // ── Documents (titles only — authenticated users only) ──
  if (!isGuest && docTitles.length > 0) {
    const list = docTitles.map((d) => `- [id:${d.id}] ${d.title}`).join("\n");
    parts.push(`<documents>
Use \`manage_memory({ action: "read_doc", id: "..." })\` to read full content.

${list}
</documents>`);
  }

  // ── Callable Agents ──
  if (agentsToDelegate && agentsToDelegate.length > 0) {
    const memberList = agentsToDelegate
      .map((a) => {
        const desc = a.description ? ` — ${a.description}` : "";
        const toolName = callAgentToolName(a.id);
        return `- **${a.name}** → tool \`${toolName}\`${desc}`;
      })
      .join("\n");

    parts.push(`<callable_agents>
You can delegate tasks using these specialist tools (one tool per agent):

${memberList}

### Rules
- Call the tool that matches the specialist you need — do not invent tool names.
- When you need **multiple independent tasks**, call those tools in the SAME step (parallel).
- Only call specialists **sequentially** when one result is needed as input for the next.
- If an agent call fails, report the error clearly to the user.
</callable_agents>`);
  }

  // ── Response format ──
  parts.push(`<response_format>
Always respond using **Markdown** formatting.
- Use headings, lists, bold, italic, code blocks, tables, etc. for clarity.
- When you need to visualize a graph, flowchart, or diagram, use a mermaid code block.
</response_format>`);

  return parts.join("\n\n");
}

/**
 * Resolve full system prompt for an agent directly from DB.
 *
 * @param agentId          — the agent
 * @param callableAgentIds — Agent IDs this agent can delegate to
 * @param ownerId          — user ID or fingerprint for per-user memory
 * @param isGuest          — if true, skip documents
 */
export function resolveSystemPrompt(agentId: string, callableAgentIds?: string[], ownerId = "user", isGuest = false): string {
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  // Per-user facts
  const facts = db
    .select({ id: agentUserFacts.id, content: agentUserFacts.content })
    .from(agentUserFacts)
    .where(and(eq(agentUserFacts.agentId, agentId), eq(agentUserFacts.ownerId, ownerId)))
    .all();

  // Per-user document titles (skip for guests)
  const docTitles = isGuest
    ? []
    : db
        .select({ id: agentNotes.id, title: agentNotes.title })
        .from(agentNotes)
        .where(and(eq(agentNotes.agentId, agentId), eq(agentNotes.ownerId, ownerId)))
        .all();

  // Callable agents: use param if provided, otherwise read from agent record
  const effectiveCallableIds = callableAgentIds ?? (agent.callableAgentIds as string[] | null) ?? [];

  let agentsToDelegate: { id: string; name: string; description: string | null }[] | undefined;

  if (effectiveCallableIds.length > 0) {
    const all = db.select({ id: agents.id, name: agents.name, description: agents.description }).from(agents).all();
    agentsToDelegate = all.filter((a) => effectiveCallableIds.includes(a.id));
  }

  return buildSystemPrompt(agent, facts, docTitles, { isGuest, agentsToDelegate });
}
