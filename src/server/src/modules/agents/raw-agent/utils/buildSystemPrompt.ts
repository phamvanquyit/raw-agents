/**
 * buildSystemPrompt.ts (server-side)
 *
 * Build system prompt from agent data + DB (notes, teammates).
 * Runs entirely on server — no HTTP round-trips.
 *
 * Callable agents:
 *   Populated only from explicit UI selection ("call_agent:<id>" entries).
 *   If no agents are explicitly selected → no delegation context.
 */

import { eq } from "drizzle-orm";
import { agentNotes, agents, getDb } from "../../../../common/db/client.js";

export function buildSystemPrompt(
  agent: {
    id: string;
    name: string;
    systemPrompt: string | null | undefined;
    memoryContent: string | null | undefined;
  },
  noteTitles: { id: string; title: string }[],
  /**
   * agentsToDelegate: list of agents the AI can call via `call_agent` tool.
   * - Populated from explicit UI selection ("call_agent:<id>" entries)
   * - Empty/undefined → no delegation context injected
   */
  agentsToDelegate?: { id: string; name: string; description: string | null; teamName?: string }[],
): string {
  const parts: string[] = [];

  // ── Role & Behavior ──
  if (agent.systemPrompt) {
    parts.push(`<role>
${agent.systemPrompt}
</role>`);
  }

  // ── Memory & Notes instructions (always present) ──
  parts.push(`<memory_instructions>
You have 2 long-term storage tools:

- \`update_agent_memory\` — store short facts (name, preferences, key info).
  Read the current \`<memory>\` section, edit it, then write back the **full** updated content.
- \`manage_agent_note\` — store long documents (plans, lists, guides…).
  Use \`manage_agent_note(create | read | update | delete)\`.
  Note titles are listed in \`<notes>\` below — call \`manage_agent_note(read, id)\` to retrieve full content.
</memory_instructions>`);

  // ── Memory content ──
  if (agent.memoryContent?.trim()) {
    parts.push(`<memory>
${agent.memoryContent.trim()}
</memory>`);
  }

  // ── Notes (titles only — full content load on-demand) ──
  if (noteTitles.length > 0) {
    const list = noteTitles.map((n) => `- [id:${n.id}] ${n.title}`).join("\n");
    parts.push(`<notes>
Call \`manage_agent_note(read, id)\` to retrieve full content.

${list}
</notes>`);
  }

  // ── Callable Agents ──
  if (agentsToDelegate && agentsToDelegate.length > 0) {
    const memberList = agentsToDelegate
      .map((a) => {
        const desc = a.description ? ` — ${a.description}` : "";
        return `- **${a.name}** (agent_id: \`${a.id}\`)${desc}`;
      })
      .join("\n");

    parts.push(`<callable_agents>
You can delegate tasks to these agents using the \`call_agent\` tool:

${memberList}

### Rules
- When you need to call **multiple agents with independent tasks**, call them ALL in the same step (parallel tool calls). This is faster and more efficient.
- Only call agents **sequentially** when one agent's result is needed as input for the next.
- Use the \`agent_id\` (UUID) exactly as listed — do not modify it.
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
 * @param callableAgentIds - Agent IDs this agent can delegate to.
 *   - If provided → use those.
 *   - If not provided → read from agent.callableAgentIds column.
 */
export function resolveSystemPrompt(agentId: string, callableAgentIds?: string[]): string {
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  // Notes titles
  const noteTitles = db.select({ id: agentNotes.id, title: agentNotes.title }).from(agentNotes).where(eq(agentNotes.agentId, agentId)).all();

  // Callable agents: use param if provided, otherwise read from agent record
  const effectiveCallableIds = callableAgentIds ?? (agent.callableAgentIds as string[] | null) ?? [];

  let agentsToDelegate: { id: string; name: string; description: string | null }[] | undefined;

  if (effectiveCallableIds.length > 0) {
    const all = db.select({ id: agents.id, name: agents.name, description: agents.description }).from(agents).all();
    agentsToDelegate = all.filter((a) => effectiveCallableIds.includes(a.id));
  }

  return buildSystemPrompt(agent, noteTitles, agentsToDelegate);
}
