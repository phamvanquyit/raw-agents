import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { HttpException } from "../../../../common/exceptions/http.exception.js";
import {
  deleteRowsByName,
  getProjectSchemaByRef,
  insertRowsByName,
  listProjects,
  queryRowsByName,
  resolveProject,
  updateRowByName,
} from "../../../datatables/datatables.service.js";

const ALL_ACTIONS = ["list_projects", "get_schema", "query", "insert", "update", "delete"] as const;
type DtAction = (typeof ALL_ACTIONS)[number];

const DESCRIPTIONS: Record<DtAction, string> = {
  list_projects: "**list_projects**: List all datatable projects (`id` + `name`). Prefer using returned `id` in later calls.",
  get_schema:
    "**get_schema**: Full project schema — all tables + columns. Requires `project` (id preferred, or name). Always call this after list_projects before query/insert/update.",
  query: "**query**: Query rows with optional `where`, `order_by`, `limit`, `offset`. Requires `project` and `table` (id or name from get_schema).",
  insert: "**insert**: Insert rows. Requires `project`, `table`, and `rows` (array of objects).",
  update: "**update**: Update a row. Requires `project`, `table`, `row_id`, and `data`.",
  delete: "**delete**: Delete rows. Requires `project`, `table`, and `row_ids`.",
};

function availableProjectsPayload() {
  return listProjects().map((p) => ({ id: p.id, name: p.name }));
}

export function makeDatatableTool(actions: readonly DtAction[] = ALL_ACTIONS): StructuredToolInterface {
  const allowed = actions.length > 0 ? actions : ALL_ACTIONS;
  const description = `Read and write workspace datatables (projects → tables → rows).

Discovery flow:
1. list_projects
2. get_schema(project) → full tables + columns for that project

Pass project/table as **id** (preferred from list/get_schema) or **name**.

Available actions:
${allowed.map((a) => `- ${DESCRIPTIONS[a]}`).join("\n")}

where examples: {"status": "active"} or {"age": {"$gte": 18}, "name": {"$contains": "ann"}}`;

  return tool(
    async ({
      action,
      project,
      table,
      where,
      order_by,
      limit,
      offset,
      rows,
      row_id,
      row_ids,
      data,
    }: {
      action: string;
      project?: string;
      table?: string;
      where?: Record<string, unknown>;
      order_by?: { key: string; dir?: "asc" | "desc" }[];
      limit?: number;
      offset?: number;
      rows?: Record<string, unknown>[];
      row_id?: string;
      row_ids?: string[];
      data?: Record<string, unknown>;
    }) => {
      try {
        if (!(allowed as readonly string[]).includes(action)) {
          return JSON.stringify({ ok: false, error: `Action "${action}" is not allowed. Use: ${allowed.join(", ")}.` });
        }

        if (action === "list_projects") {
          return JSON.stringify({ ok: true, projects: availableProjectsPayload() });
        }

        if (action === "get_schema") {
          if (!project?.trim()) {
            return JSON.stringify({
              ok: false,
              error: "'project' is required (id preferred, or name).",
              available_projects: availableProjectsPayload(),
            });
          }
          const p = resolveProject(project);
          if (!p) {
            return JSON.stringify({
              ok: false,
              error: `Project "${project.trim()}" not found. Use an id or name from available_projects.`,
              available_projects: availableProjectsPayload(),
            });
          }

          const schema = getProjectSchemaByRef(p.id);
          return JSON.stringify({
            ok: true,
            project: { id: schema.project.id, name: schema.project.name },
            tables: schema.tables.map((t) => ({
              id: t.id,
              name: t.name,
              columns: t.columns.map((c) => ({
                name: c.name,
                type: c.type,
                options: c.options,
                required: c.required,
              })),
            })),
          });
        }

        if (action === "query") {
          if (!project?.trim() || !table?.trim()) {
            return JSON.stringify({ ok: false, error: "'project' and 'table' are required (id or name)." });
          }
          const result = queryRowsByName(project.trim(), table.trim(), { where, order_by, limit, offset });
          return JSON.stringify({ ok: true, ...result });
        }

        if (action === "insert") {
          if (!project?.trim() || !table?.trim()) {
            return JSON.stringify({ ok: false, error: "'project' and 'table' are required (id or name)." });
          }
          if (!Array.isArray(rows) || rows.length === 0) {
            return JSON.stringify({ ok: false, error: "'rows' must be a non-empty array." });
          }
          const created = insertRowsByName(project.trim(), table.trim(), rows);
          return JSON.stringify({ ok: true, rows: created });
        }

        if (action === "update") {
          if (!project?.trim() || !table?.trim() || !row_id?.trim()) {
            return JSON.stringify({ ok: false, error: "'project', 'table', and 'row_id' are required." });
          }
          if (!data || typeof data !== "object") {
            return JSON.stringify({ ok: false, error: "'data' object is required." });
          }
          const updated = updateRowByName(project.trim(), table.trim(), row_id.trim(), data);
          return JSON.stringify({ ok: true, row: updated });
        }

        if (action === "delete") {
          if (!project?.trim() || !table?.trim()) {
            return JSON.stringify({ ok: false, error: "'project' and 'table' are required (id or name)." });
          }
          if (!Array.isArray(row_ids) || row_ids.length === 0) {
            return JSON.stringify({ ok: false, error: "'row_ids' must be a non-empty array." });
          }
          const result = deleteRowsByName(project.trim(), table.trim(), row_ids);
          return JSON.stringify({ ok: true, ...result });
        }

        return JSON.stringify({ ok: false, error: `Unknown action: ${action}` });
      } catch (err) {
        const message = err instanceof HttpException ? err.message : err instanceof Error ? err.message : String(err);
        if (project?.trim() && !resolveProject(project) && /project|table/i.test(message)) {
          return JSON.stringify({
            ok: false,
            error: message,
            available_projects: availableProjectsPayload(),
          });
        }
        return JSON.stringify({ ok: false, error: message });
      }
    },
    {
      name: "datatable",
      description,
      schema: z.object({
        action: z.enum(allowed as unknown as [string, ...string[]]).describe("Operation to perform"),
        project: z.string().optional().describe("Project id (preferred) or name"),
        table: z.string().optional().describe("Table id (preferred) or name — required for query/insert/update/delete"),
        where: z.record(z.string(), z.any()).optional().describe("Filter object (shared where contract)"),
        order_by: z
          .array(z.object({ key: z.string(), dir: z.enum(["asc", "desc"]).optional() }))
          .optional()
          .describe("Sort order"),
        limit: z.number().optional().describe("Max rows (default 50)"),
        offset: z.number().optional().describe("Offset for pagination"),
        rows: z.array(z.record(z.string(), z.any())).optional().describe("Rows to insert"),
        row_id: z.string().optional().describe("Row id for update"),
        row_ids: z.array(z.string()).optional().describe("Row ids for delete"),
        data: z.record(z.string(), z.any()).optional().describe("Partial data for update"),
      }),
    },
  );
}

export const datatableTool = makeDatatableTool();

export const TOOL_DEF = {
  toolName: "datatable",
  toolLabel: "Datatable",
  description:
    "Query and mutate workspace datatables. Discovery: list_projects → get_schema(project) for full tables+columns. Prefer ids. Supports where filters on query.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: [...ALL_ACTIONS] },
      project: { type: "string", description: "Project id (preferred) or name" },
      table: { type: "string", description: "Table id (preferred) or name — for query/insert/update/delete" },
      where: { type: "object", additionalProperties: true },
      order_by: {
        type: "array",
        items: {
          type: "object",
          properties: { key: { type: "string" }, dir: { type: "string", enum: ["asc", "desc"] } },
          required: ["key"],
        },
      },
      limit: { type: "number" },
      offset: { type: "number" },
      rows: { type: "array", items: { type: "object" } },
      row_id: { type: "string" },
      row_ids: { type: "array", items: { type: "string" } },
      data: { type: "object", additionalProperties: true },
    },
    required: ["action"],
  },
};
