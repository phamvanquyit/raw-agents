import { eq } from "drizzle-orm";

interface ToolDefinition {
  toolName: string;
  toolLabel: string;
  description: string;
  parameters: object;
}
import { TOOL_DEF as UPDATE_PROMPT_DEF } from "../agents/assistant/update-prompt.js";
import { TOOL_DEF as CALL_AGENT_DEF } from "../agents/builtin-tools/call-agent.js";
import { TOOL_DEF as FETCH_WEBPAGE_DEF } from "../agents/builtin-tools/fetch-webpage.js";
import { TOOL_DEF as GET_TIME_DEF } from "../agents/builtin-tools/get-current-time.js";
import { TOOL_DEF as MEMORY_DEF } from "../agents/builtin-tools/memory.js";
import { TOOL_DEF as NOTE_DEF } from "../agents/builtin-tools/note.js";

const ALL_TOOL_DEFS: ToolDefinition[] = [
  GET_TIME_DEF,
  FETCH_WEBPAGE_DEF,
  CALL_AGENT_DEF,
  MEMORY_DEF,
  NOTE_DEF,
  {
    toolName: "generate_code",
    toolLabel: "Generate Code",
    description:
      "Write the entire Python function body into the editor (COMPLETELY replacing the old content). The 'code' field is the raw Python body — NO 'def main(input):', NO markdown fences. You must call this tool to apply the code; NEVER return code as text in the conversation.",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "THE ENTIRE Python function body (raw code, NO 'def main(input):' header, NO markdown fences). This is the content that will be placed INSIDE def main(input) by the system.",
        },
        summary: { type: "string", description: "Short description of changes made (shown to the user)." },
      },
      required: ["code"],
    },
  },
  {
    toolName: "run_current_script",
    toolLabel: "Run Current Script",
    description:
      "Run the current Python script from the editor inside a sandbox environment (Python venv). Pass only testInput — the code is automatically fetched from the editor. Returns { success: true, output } or { success: false, error } with a Python traceback.",
    parameters: {
      type: "object",
      properties: {
        testInput: {
          type: "object",
          description:
            "Parameters object to pass into the script. Keys must match the @param declarations in the code. Example: { query: 'lofi music', limit: 5 }",
        },
      },
    },
  },
  UPDATE_PROMPT_DEF,
];
import { type NewAgentTool, agentToolAssignments, agentTools, getDb } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { wsHub } from "../../common/ws/wsHub.js";
import { executeTool, validateToolCode } from "./common/python-runner.js";

const DATA_DIR = process.env.DATA_DIR ?? `${process.env.HOME}/.raw-agents`;

/** Core tools that are always-on and shouldn't appear in user-facing tool lists */
const ALWAYS_ON_TOOL_NAMES = new Set(["update_agent_memory", "manage_agent_note", "generate_code", "run_current_script", "update_prompt"]);

/** Virtual AgentTool objects built from the tool registry */
const BUILTIN_TOOLS = ALL_TOOL_DEFS.filter((b) => !ALWAYS_ON_TOOL_NAMES.has(b.toolName)).map((b) => ({
  id: `builtin:${b.toolName}`,
  name: b.toolName,
  label: b.toolLabel,
  description: b.description,
  icon: null,
  parameters: (b.parameters ?? { type: "object", properties: {}, required: [] }) as object,
  codeContent: "",
  isBuiltin: true,
  isActive: true,
  createdAt: new Date(0),
}));

/**
 * Seed builtin tools into the agent_tools DB table.
 * This ensures FOREIGN KEY references from agent_tool_assignments work correctly.
 * Uses INSERT OR IGNORE to avoid duplicates — safe to call on every startup.
 */
export function seedBuiltinTools(): void {
  const db = getDb();
  const allBuiltins = ALL_TOOL_DEFS.map((b) => ({
    id: `builtin:${b.toolName}`,
    name: b.toolName,
    label: b.toolLabel,
    description: b.description,
    parameters: (b.parameters ?? { type: "object", properties: {}, required: [] }) as object,
    codeContent: "",
    isBuiltin: true,
    isActive: !ALWAYS_ON_TOOL_NAMES.has(b.toolName), // always-on tools are hidden from UI
    createdAt: new Date(0),
  }));

  for (const bt of allBuiltins) {
    const existing = db.select({ id: agentTools.id }).from(agentTools).where(eq(agentTools.id, bt.id)).get();

    if (!existing) {
      db.insert(agentTools).values(bt).run();
    }
  }
}

/** Lookup a builtin tool by its virtual id (e.g. "builtin:fetch_webpage") */
export function getBuiltinTool(id: string) {
  return BUILTIN_TOOLS.find((t) => t.id === id) ?? null;
}

export function listTools(query: RawQuery = {}) {
  const result = listQuery({ table: agentTools }, query);
  // Only keep custom (non-builtin) tools from DB
  const dbItems = result.items.filter((t: any) => !t.isBuiltin);
  // Join constant-based builtins + custom tools from DB
  // Exclude builtin:call_agent — it's internal-only
  const visibleBuiltins = BUILTIN_TOOLS.filter((t) => t.id !== "builtin:call_agent");
  const items = [...visibleBuiltins, ...dbItems].map(({ codeContent, draftCode, ...rest }: any) => rest);
  return {
    ...result,
    items,
    total: items.length,
  };
}

export function getTool(id: string) {
  // Handle virtual builtin tool IDs
  if (id.startsWith("builtin:")) return getBuiltinTool(id);
  return getDb().select().from(agentTools).where(eq(agentTools.id, id)).get();
}

export function createTool(body: Pick<NewAgentTool, "name" | "label" | "description" | "parameters" | "codeContent"> & { isActive?: boolean }) {
  const { isActive = true, ...rest } = body;
  const tool: NewAgentTool = {
    ...rest,
    id: crypto.randomUUID(),
    isActive,
    createdAt: new Date(),
  };
  getDb().insert(agentTools).values(tool).run();
  wsHub.emit("tools:created", tool);
  return tool;
}

export function updateTool(id: string, body: Partial<NewAgentTool>) {
  if (id.startsWith("builtin:")) throw new Error("Cannot modify builtin tools");
  const db = getDb();
  // Prevent modifying builtin tools
  const existing = db.select({ isBuiltin: agentTools.isBuiltin }).from(agentTools).where(eq(agentTools.id, id)).get();
  if (existing?.isBuiltin) throw new Error("Cannot modify builtin tools");
  db.update(agentTools).set(body).where(eq(agentTools.id, id)).run();
  const updated = db.select().from(agentTools).where(eq(agentTools.id, id)).get();
  wsHub.emit("tools:updated", updated);
  return updated;
}

export function deleteTool(id: string) {
  if (id.startsWith("builtin:")) throw new Error("Cannot delete builtin tools");
  const db = getDb();
  // Prevent deleting builtin tools
  const existing = db.select({ isBuiltin: agentTools.isBuiltin }).from(agentTools).where(eq(agentTools.id, id)).get();
  if (existing?.isBuiltin) throw new Error("Cannot delete builtin tools");
  // Find affected agents BEFORE cascade delete
  const affected = db.select({ agentId: agentToolAssignments.agentId }).from(agentToolAssignments).where(eq(agentToolAssignments.toolId, id)).all();
  db.delete(agentTools).where(eq(agentTools.id, id)).run();
  wsHub.emit("tools:deleted", { id });
  // Notify affected agents that their tool assignments changed
  for (const { agentId } of affected) {
    wsHub.emit("agents:tools-updated", { agentId, toolId: id });
  }
}

export async function validateCode(code: string) {
  return validateToolCode(code);
}

export async function runCode(code: string, inputJson = "{}") {
  const resultStr = await executeTool("__anon__", code, inputJson, DATA_DIR);
  return JSON.parse(resultStr);
}

export async function runTool(id: string, inputJson = "{}", code?: string) {
  const tool = getTool(id);
  if (!tool) return null;
  const codeToRun = code ?? tool.codeContent;
  const resultStr = await executeTool(id, codeToRun, inputJson, DATA_DIR);
  return JSON.parse(resultStr);
}

/** Update draftCode for a tool and notify FE (used by generate_code tool). */
export function updateDraftCode(id: string, draftCode: string): void {
  getDb().update(agentTools).set({ draftCode }).where(eq(agentTools.id, id)).run();
  wsHub.emit("tools:updated", { id, draftCode });
}

/** Get draftCode for a tool (used by run_current_script tool). */
export function getDraftCode(id: string): string | null {
  const row = getDb().select({ draftCode: agentTools.draftCode }).from(agentTools).where(eq(agentTools.id, id)).get();
  return row?.draftCode ?? null;
}

/** Run draftCode of a tool in the Python sandbox (used by run_current_script tool). */
export async function runDraftCode(id: string, inputJson = "{}") {
  const draftCode = getDraftCode(id);
  if (!draftCode) return null;
  const resultStr = await executeTool(id, draftCode, inputJson, DATA_DIR);
  return resultStr;
}
