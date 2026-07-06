/**
 * resolveTools.ts — User agent tool resolver.
 *
 * Builds the full tool list for a user-created agent:
 *   - Builtin tools (directly imported)
 *   - Custom tools (from DB agent_tools table, Python sandbox)
 *   - Always-on: manage_memory
 *   - call_agent (if enabled via assignment)
 *
 * Each agent type imports its own tools directly.
 * This file is for the USER AGENT only.
 */

import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { agentTools, agents, getDb } from "../../../../common/db/client.js";
import { runTool } from "../../../tools/tools.service.js";

// ── Direct imports of user-agent builtin tools ────────────────────────────────

import { fetchWebpageTool } from "../../../../common/ai/agent-tools/fetch-webpage.tool.js";
import { makeCallAgentTool } from "../llm-tools/call-agent.tool.js";
import { getCurrentTimeTool } from "../llm-tools/get-current-time.tool.js";
import { makeManageMemoryTool } from "../llm-tools/manage-memory.tool.js";

// ── Stateless builtin registry (name → instance) ─────────────────────────────

const STATIC_BUILTINS: Record<string, StructuredToolInterface> = {
  get_current_time: getCurrentTimeTool,
  fetch_webpage: fetchWebpageTool,
};

// ── Label helpers ─────────────────────────────────────────────────────────────

/**
 * Converts a snake_case or camelCase tool name to a human-readable Title Case label.
 */
export function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get a human-readable label for any tool name.
 * Priority: known builtins → DB label column → formatToolName fallback
 */
export function getToolLabel(toolName: string): string {
  // Check TOOL_DEFs from all imported tool files
  const KNOWN_LABELS: Record<string, string> = {
    get_current_time: "Get Current Time",
    fetch_webpage: "Fetch",
    call_agent: "Call Agent",
    manage_memory: "Manage Memory",
  };
  if (KNOWN_LABELS[toolName]) return KNOWN_LABELS[toolName];
  try {
    const db = getDb();
    const row = db.select({ label: agentTools.label }).from(agentTools).where(eq(agentTools.name, toolName)).get();
    if (row?.label && row.label !== toolName) return row.label;
  } catch {
    /* ignore */
  }
  return formatToolName(toolName);
}

/**
 * For `call_agent` tool calls — resolve a label that includes the called agent's name.
 */
export function getCallAgentLabel(args: unknown): string {
  try {
    const agentId = (args as any)?.agent_id ?? (args as any)?.agentId ?? (args as any)?.id;
    if (!agentId || typeof agentId !== "string") return "Call Agent";
    const db = getDb();
    const row = db.select({ name: agents.name }).from(agents).where(eq(agents.id, agentId)).get();
    if (row?.name) return `Call ${row.name}`;
  } catch {
    /* ignore */
  }
  return "Call Agent";
}

// ─── Custom tool builder ──────────────────────────────────────────────────────

function buildCustomTool(record: {
  id: string;
  name: string;
  description: string;
  parameters: object;
  codeContent: string;
}): StructuredToolInterface {
  const props = ((record.parameters as any)?.properties ?? {}) as Record<string, { type?: string; description?: string; default?: unknown }>;
  const required = ((record.parameters as any)?.required ?? []) as string[];
  const shape: Record<string, z.ZodType> = {};

  for (const [key, def] of Object.entries(props)) {
    let field: z.ZodType;
    switch (def.type) {
      case "number":
      case "integer":
        field = z.number();
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "array":
        field = z.array(z.unknown());
        break;
      case "object":
        field = z.object({}).passthrough();
        break;
      default:
        field = z.string();
    }
    if (def.description) field = field.describe(def.description);
    if (def.default !== undefined) {
      field = field.optional().default(def.default) as z.ZodType;
    } else if (!required.includes(key)) {
      field = field.optional() as z.ZodType;
    }
    shape[key] = field;
  }

  const schema = z.object(shape);

  return tool(
    async (input: unknown) => {
      try {
        const inputJson = JSON.stringify(input ?? {});
        const result = await runTool(record.id, inputJson, record.codeContent);
        if (!result) {
          return JSON.stringify({ error: `Custom tool "${record.name}" not found`, ok: false });
        }
        if (!result.ok) {
          return JSON.stringify({ error: result.error ?? `Custom tool "${record.name}" failed`, ok: false });
        }
        return JSON.stringify(result.result);
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : String(err), ok: false });
      }
    },
    { name: record.name, description: record.description, schema },
  );
}

// ─── Known builtin names (for filtering custom vs builtin) ────────────────────

const ALL_BUILTIN_NAMES = new Set(["get_current_time", "fetch_webpage", "call_agent", "manage_memory"]);

// ─── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve full tool list for a user agent.
 * Always injects manage_memory (with per-user context).
 *
 * @param agentId       — the agent
 * @param enabledTools  — tool names from assignments
 * @param ownerId       — user ID or fingerprint
 * @param isGuest       — if true, document features disabled in manage_memory
 */
export function resolveAgentTools(agentId: string, enabledTools: string[], ownerId: string, isGuest = false): StructuredToolInterface[] {
  const db = getDb();
  const tools: StructuredToolInterface[] = [];

  for (const name of enabledTools) {
    // Static builtins
    if (name in STATIC_BUILTINS) {
      tools.push(STATIC_BUILTINS[name]);
    }
    // call_agent (factory — needs agentId)
    else if (name === "call_agent") {
      tools.push(makeCallAgentTool(agentId));
    }
  }

  // Custom tools from DB
  const customToolNames = enabledTools.filter((n) => !ALL_BUILTIN_NAMES.has(n));
  if (customToolNames.length > 0) {
    const rows = db.select().from(agentTools).where(eq(agentTools.isActive, true)).all();
    for (const row of rows) {
      if (customToolNames.includes(row.name)) {
        tools.push(buildCustomTool(row));
      }
    }
  }

  // Always-on: manage_memory (per-user)
  tools.push(makeManageMemoryTool(agentId, ownerId, isGuest));

  return tools;
}
