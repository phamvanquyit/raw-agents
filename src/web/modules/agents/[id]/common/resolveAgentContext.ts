/**
 * resolveAgentContext.ts — Single source of truth
 *
 * Tập trung toàn bộ logic chuẩn bị context cho agent:
 * - Build system prompt (time + role + memory instructions)
 * - Tools are resolved server-side
 *
 * Dùng chung bởi useAgentTools (chat) và useAgentRunner (task runner).
 *
 * Memory is now per-user and handled entirely server-side:
 * - Facts: stored in agent_user_facts table
 * - Documents: stored in agent_notes table with owner_id
 * - System prompt with memory is built server-side via resolveSystemPrompt()
 */

import { apiClient } from "src/common/api";
import type { Agent } from "src/common/types";
import type { ToolSet } from "src/common/types/tool";

// ─── System prompt builder ────────────────────────────────────────────────────

export function buildAgentSystemPrompt(
  agent: Agent,
  /** IANA timezone from DB config (e.g. "Asia/Ho_Chi_Minh"). Fallback: UTC. */
  timezone?: string,
): string {
  const tz = timezone || "UTC";
  const now = new Date().toLocaleString("en-US", {
    timeZone: tz,
    dateStyle: "full",
    timeStyle: "medium",
  });
  const offsetMs = (() => {
    try {
      const utcStr = new Date().toLocaleString("en-US", { timeZone: "UTC" });
      const tzStr = new Date().toLocaleString("en-US", { timeZone: tz });
      return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 3_600_000;
    } catch {
      return 0;
    }
  })();
  const tzLabel = `UTC${offsetMs >= 0 ? "+" : ""}${offsetMs}`;

  const parts = [
    `<system_info>
Current time: ${now} (${tzLabel}, ${tz})
</system_info>`,
  ];

  // ── Role & Behavior ──
  if (agent.systemPrompt) {
    parts.push(`<role>
${agent.systemPrompt}
</role>`);
  }

  // ── Memory instructions ──
  // NOTE: Full memory context (facts, docs) is injected server-side.
  // This client-side prompt only provides basic instructions as fallback.
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

  return parts.join("\n\n");
}

// ─── Main resolver ────────────────────────────────────────────────────────────

export interface AgentContext {
  tools: ToolSet;
  systemPrompt: string;
}

/**
 * Resolve toàn bộ context để chạy agent.
 * - Memory: handled server-side (per-user facts + docs)
 * - Tools: handled server-side
 */
export async function resolveAgentContext(agent: Agent): Promise<AgentContext> {
  const settings = await apiClient.get<Record<string, string>>("/api/settings").catch(() => ({}) as Record<string, string>);

  const timezone = settings.timezone || undefined;
  const systemPrompt = buildAgentSystemPrompt(agent, timezone);

  // NOTE: Tool execution has been moved to the server side (src/server/src/ai/tools/resolveTools.ts).
  // The frontend no longer resolves or executes tools locally.
  const tools: ToolSet = {};

  return { tools, systemPrompt };
}
