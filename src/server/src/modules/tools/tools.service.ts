import { and, eq, isNull, ne } from "drizzle-orm";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { buildJsonSchemaFromCode, parseMetaFromCode } from "./common/code-annotations.js";

interface ToolDefinition {
  toolName: string;
  toolLabel: string;
  description: string;
  parameters: object;
}
import { TOOL_DEF as BROWSER_DEF } from "../../common/ai/agent-tools/browser.tool.js";
import { TOOL_DEF as FETCH_URL_DEF } from "../../common/ai/agent-tools/fetch-url.tool.js";
import { TOOL_DEF as BACKGROUND_TASKS_DEF } from "../agents/raw-agent/llm-tools/background-tasks.tool.js";
import { TOOL_DEF as DATATABLE_DEF } from "../agents/raw-agent/llm-tools/datatable.tool.js";
import { TOOL_DEF as GET_TIME_DEF } from "../agents/raw-agent/llm-tools/get-current-time.tool.js";
import { TOOL_DEF as KV_STORE_DEF } from "../agents/raw-agent/llm-tools/kv-store.tool.js";
import { TOOL_DEF as MEMORY_DEF } from "../agents/raw-agent/llm-tools/memory.tool.js";
import { TOOL_DEF as READ_SKILL_DEF } from "../agents/raw-agent/llm-tools/read-skill.tool.js";

const ALL_TOOL_DEFS: ToolDefinition[] = [
  GET_TIME_DEF,
  BROWSER_DEF,
  FETCH_URL_DEF,
  KV_STORE_DEF,
  DATATABLE_DEF,
  MEMORY_DEF,
  READ_SKILL_DEF,
  BACKGROUND_TASKS_DEF,
  {
    toolName: "edit_code",
    toolLabel: "Edit Code",
    description:
      'Edit the Python function body in the editor. mode="replace": exact edits[{ old_string, new_string }]. mode="full": replace entire body with code. Raw Python body only — NO def main, NO markdown fences.',
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["replace", "full"] },
        code: {
          type: "string",
          description: "Full Python body when mode=full (NO def main, NO markdown fences).",
        },
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              old_string: { type: "string" },
              new_string: { type: "string" },
              replace_all: { type: "boolean" },
            },
            required: ["old_string", "new_string"],
          },
        },
        summary: { type: "string", description: "Short description of changes made (shown to the user)." },
      },
      required: ["mode"],
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
];
import { type NewAgentTool, agentToolAssignments, agentTools, getDb } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { getDataDir } from "../../common/utils/data-dir.js";
import { wsHub } from "../../common/ws/wsHub.js";
import { type BgTaskSnapshot, bgTaskRegistry } from "./common/bg-task-registry.js";
import { type SoftWaitExecuteResult, executeTool, executeToolWithSoftWait } from "./common/python-runner.js";

/** Core tools that are always-on and shouldn't appear in user-facing tool lists */
const ALWAYS_ON_TOOL_NAMES = new Set([
  "memory",
  "user_memory",
  "manage_memory",
  "read_skill",
  "background_tasks",
  "edit_code",
  "run_current_script",
  "update_prompt",
  "datatable",
]);

/** Virtual AgentTool objects built from the tool registry */
const BUILTIN_TOOLS = ALL_TOOL_DEFS.filter((b) => !ALWAYS_ON_TOOL_NAMES.has(b.toolName)).map((b) => ({
  id: `builtin:${b.toolName}`,
  name: b.toolName,
  label: b.toolLabel,
  description: b.description,
  icon: null,
  parameters: (b.parameters ?? { type: "object", properties: {}, required: [] }) as object,
  codeContent: "",
  folderId: null as string | null,
  sortOrder: 0,
  isActive: true,
  createdAt: new Date(0),
}));

function nextSortOrder(folderId: string | null): number {
  const db = getDb();
  const rows =
    folderId == null
      ? db.select({ sortOrder: agentTools.sortOrder }).from(agentTools).where(isNull(agentTools.folderId)).all()
      : db.select({ sortOrder: agentTools.sortOrder }).from(agentTools).where(eq(agentTools.folderId, folderId)).all();
  return rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
}

/** Lookup a builtin tool by its virtual id (e.g. "builtin:browser") */
export function getBuiltinTool(id: string) {
  return BUILTIN_TOOLS.find((t) => t.id === id) ?? null;
}

export function listTools(query: RawQuery = {}) {
  const result = listQuery({ table: agentTools }, query);
  // Join constant-based builtins + custom tools from DB
  const items = [...BUILTIN_TOOLS, ...result.items].map(({ codeContent, draftCode, ...rest }: any) => rest);
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

function assertToolNameAvailable(name: string, excludeId?: string) {
  if (BUILTIN_TOOLS.some((t) => t.name === name)) {
    throw new BadRequestException("Tool name already exists");
  }
  const db = getDb();
  const dup = excludeId
    ? db
        .select()
        .from(agentTools)
        .where(and(eq(agentTools.name, name), ne(agentTools.id, excludeId)))
        .get()
    : db.select().from(agentTools).where(eq(agentTools.name, name)).get();
  if (dup) {
    throw new BadRequestException("Tool name already exists");
  }
}

export function createTool(
  body: Pick<NewAgentTool, "name" | "label" | "description" | "parameters" | "codeContent"> & {
    isActive?: boolean;
    folderId?: string | null;
    sortOrder?: number;
  },
) {
  const { isActive = true, folderId = null, sortOrder, ...rest } = body;
  assertToolNameAvailable(rest.name);
  const tool: NewAgentTool = {
    ...rest,
    id: crypto.randomUUID(),
    folderId,
    sortOrder: sortOrder ?? nextSortOrder(folderId),
    isActive,
    createdAt: new Date(),
  };
  getDb().insert(agentTools).values(tool).run();
  wsHub.emit("tools:created", tool);
  return tool;
}

export function updateTool(id: string, body: Partial<NewAgentTool>) {
  if (id.startsWith("builtin:")) throw new Error("Cannot modify builtin tools");

  // Auto-derive metadata from code annotations when codeContent is updated
  if (body.codeContent) {
    const code = body.codeContent;
    const meta = parseMetaFromCode(code);

    // Validate required annotations and structure
    const errors: string[] = [];
    if (!meta.label) errors.push("@name");
    if (!meta.description) errors.push("@description");
    const codeLines = code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    if (codeLines.length === 0) errors.push("code body");
    if (!/\breturn\b/.test(code)) errors.push("return statement");
    if (errors.length > 0) {
      throw new BadRequestException(`Missing required: ${errors.join(", ")}`);
    }

    const schema = buildJsonSchemaFromCode(code);
    if (meta.label && !body.label) body.label = meta.label;
    if (meta.name && !body.name) body.name = meta.name;
    if (meta.description && !body.description) body.description = meta.description;
    if (!body.parameters || Object.keys(schema.properties).length > 0) body.parameters = schema;
  }

  if (body.name) {
    assertToolNameAvailable(body.name, id);
  }

  const db = getDb();
  if (body.folderId !== undefined && body.sortOrder === undefined) {
    const current = db.select({ folderId: agentTools.folderId }).from(agentTools).where(eq(agentTools.id, id)).get();
    const nextFolderId = body.folderId ?? null;
    if ((current?.folderId ?? null) !== nextFolderId) {
      body.sortOrder = nextSortOrder(nextFolderId);
    }
  }

  db.update(agentTools).set(body).where(eq(agentTools.id, id)).run();
  const updated = db.select().from(agentTools).where(eq(agentTools.id, id)).get();
  wsHub.emit("tools:updated", updated);
  return updated;
}

/** Set folder + sort order for tools in one column (kanban). */
export function reorderTools(folderId: string | null, toolIds: string[]) {
  const db = getDb();
  for (let i = 0; i < toolIds.length; i++) {
    const id = toolIds[i];
    if (!id || id.startsWith("builtin:")) continue;
    db.update(agentTools).set({ folderId, sortOrder: i }).where(eq(agentTools.id, id)).run();
  }
  wsHub.emit("tools:reordered", { folderId, toolIds });
  return { folderId, toolIds };
}

export function deleteTool(id: string) {
  if (id.startsWith("builtin:")) throw new Error("Cannot delete builtin tools");
  const db = getDb();
  // Find affected agents BEFORE cascade delete
  const affected = db.select({ agentId: agentToolAssignments.agentId }).from(agentToolAssignments).where(eq(agentToolAssignments.toolId, id)).all();
  // Manually clean up assignments (no FK cascade since builtin tools share this table)
  db.delete(agentToolAssignments).where(eq(agentToolAssignments.toolId, id)).run();
  db.delete(agentTools).where(eq(agentTools.id, id)).run();
  wsHub.emit("tools:deleted", { id });
  // Notify affected agents that their tool assignments changed
  for (const { agentId } of affected) {
    wsHub.emit("agents:tools-updated", { agentId, toolId: id });
  }
}

export async function runTool(id: string, inputJson = "{}", code?: string) {
  const tool = getTool(id);
  if (!tool) return null;
  const codeToRun = code ?? tool.codeContent;
  const resultStr = await executeTool(id, codeToRun, inputJson, getDataDir());
  return JSON.parse(resultStr);
}

export async function runToolWithSoftWait(opts: {
  id: string;
  inputJson?: string;
  code?: string;
  softWaitMs?: number;
  agentId?: string;
  conversationId?: string | null;
}): Promise<SoftWaitExecuteResult | null> {
  const tool = getTool(opts.id);
  if (!tool) return null;
  const codeToRun = opts.code ?? tool.codeContent;
  return executeToolWithSoftWait({
    toolId: opts.id,
    toolName: tool.name,
    code: codeToRun,
    inputJson: opts.inputJson ?? "{}",
    dataDir: getDataDir(),
    softWaitMs: opts.softWaitMs,
    agentId: opts.agentId,
    conversationId: opts.conversationId,
  });
}

/** Update draftCode for a tool and notify FE (used by edit_code tool). */
export function updateDraftCode(id: string, draftCode: string): void {
  getDb().update(agentTools).set({ draftCode }).where(eq(agentTools.id, id)).run();
  wsHub.emit("tools:updated", { id, draftCode });
}

/** Get draftCode for a tool (used by run_current_script / edit_code). Fallback to published codeContent. */
export function getDraftCode(id: string): string | null {
  const row = getDb().select({ draftCode: agentTools.draftCode, codeContent: agentTools.codeContent }).from(agentTools).where(eq(agentTools.id, id)).get();
  if (!row) return null;
  return row.draftCode ?? row.codeContent ?? null;
}

/** Run draftCode of a tool in the Python sandbox (used by run_current_script tool). */
export async function runDraftCode(id: string, inputJson = "{}") {
  const draftCode = getDraftCode(id);
  if (!draftCode) return null;
  const resultStr = await executeTool(id, draftCode, inputJson, getDataDir());
  return resultStr;
}

export type BgTaskClient = Pick<
  BgTaskSnapshot,
  "taskId" | "toolId" | "toolName" | "conversationId" | "startedAt" | "finishedAt" | "error" | "console" | "result"
> & {
  status: BgTaskSnapshot["status"] | "expired";
};

function toBgTaskClient(t: BgTaskSnapshot, extras: { console?: boolean; result?: boolean } = {}): BgTaskClient {
  return {
    taskId: t.taskId,
    toolId: t.toolId,
    toolName: t.toolName,
    conversationId: t.conversationId,
    status: t.status,
    startedAt: t.startedAt,
    finishedAt: t.finishedAt,
    error: t.error,
    ...(extras.console ? { console: t.console } : {}),
    ...(extras.result && t.result !== undefined ? { result: t.result } : {}),
  };
}

function belongsToConversation(task: BgTaskSnapshot, conversationId: string): boolean {
  return !task.conversationId || task.conversationId === conversationId;
}

export function listConversationBgTasks(conversationId: string): BgTaskClient[] {
  return bgTaskRegistry
    .list({ conversationId })
    .filter((t) => t.status === "running")
    .map((t) => toBgTaskClient(t));
}

export function getConversationBgTask(conversationId: string, taskId: string): BgTaskClient | null {
  const existing = bgTaskRegistry.get(taskId);
  if (!existing) {
    return { taskId, toolId: "", toolName: "", status: "expired", startedAt: 0 };
  }
  if (!belongsToConversation(existing, conversationId)) return null;
  return toBgTaskClient(existing, { console: true, result: true });
}

export function cancelConversationBgTask(conversationId: string, taskId: string): BgTaskClient | null {
  const existing = bgTaskRegistry.get(taskId);
  if (!existing || !belongsToConversation(existing, conversationId)) return null;
  const cancelled = bgTaskRegistry.cancel(taskId);
  return cancelled ? toBgTaskClient(cancelled, { console: true, result: true }) : null;
}
