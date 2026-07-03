/**
 * resolveAgentContext.ts — Single source of truth
 *
 * Tập trung toàn bộ logic chuẩn bị context cho agent:
 * - Build system prompt (time + role + memory + note titles)
 * - Resolve tools (builtin + custom + update_memory + note — always-on)
 *
 * Dùng chung bởi useAgentTools (chat) và useAgentRunner (task runner).
 *
 * Token strategy:
 * - Memory  → đọc trực tiếp từ agent.memoryContent (0 DB query)
 * - Notes   → chỉ load titles (1 DB query nhẹ), full content load on-demand qua tool
 */

import { apiClient } from "src/common/api";
import type { Agent } from "src/common/types";
import type { ToolSet } from "src/common/types/tool";

// ─── System prompt builder ────────────────────────────────────────────────────

export function buildAgentSystemPrompt(
  agent: Agent,
  noteTitles: { id: string; title: string }[],
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

  // ── Memory & Notes instructions ──
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

  return parts.join("\n\n");
}

// ─── Main resolver ────────────────────────────────────────────────────────────

export interface AgentContext {
  tools: ToolSet;
  systemPrompt: string;
}

/**
 * Resolve toàn bộ context để chạy agent.
 * - Memory: đọc từ agent.memoryContent (0 overhead)
 * - Notes titles: 1 DB query nhẹ
 * - Tools: handled server-side
 */
export async function resolveAgentContext(agent: Agent): Promise<AgentContext> {
  // Load note titles + settings in parallel
  const [noteTitles, settings] = await Promise.all([
    apiClient.get<{ id: string; title: string }[]>(`/api/agents/${agent.id}/notes?titlesOnly=1`),
    apiClient.get<Record<string, string>>("/api/settings").catch(() => ({}) as Record<string, string>),
  ]);

  const timezone = settings.timezone || undefined;
  const systemPrompt = buildAgentSystemPrompt(agent, noteTitles, timezone);

  // NOTE: Tool execution has been moved to the server side (src/server/src/ai/tools/resolveTools.ts).
  // The frontend no longer resolves or executes tools locally.
  const tools: ToolSet = {};

  return { tools, systemPrompt };
}
