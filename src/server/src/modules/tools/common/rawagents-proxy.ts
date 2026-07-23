import { HttpException } from "../../../common/exceptions/http.exception.js";
import {
  deleteRowsByName,
  getProjectSchemaByRef,
  insertRowsByName,
  listProjects,
  queryRowsByName,
  resolveProject,
  updateRowByName,
} from "../../datatables/datatables.service.js";
import { deleteKvByKey, getKvByKey, listKvEntries, upsertKvByKey } from "../../kvstore/kvstore.service.js";
import { getSecretValueByKey, listSecrets } from "../../secrets/secrets.service.js";

type RpcBody = { ns?: string; action?: string; args?: Record<string, unknown> };

function ok(result: unknown) {
  return Response.json({ ok: true, result });
}

function fail(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

function handleKv(action: string, args: Record<string, unknown>) {
  switch (action) {
    case "get": {
      const key = String(args.key ?? "")
        .trim()
        .toUpperCase();
      const entry = getKvByKey(key);
      return ok(entry?.value ?? null);
    }
    case "set": {
      const key = String(args.key ?? "");
      const value = args.value;
      if (typeof value !== "string") throw new Error("value must be a string");
      return ok(upsertKvByKey({ key, value }));
    }
    case "list": {
      const result = listKvEntries({ limit: "1000" });
      return ok((result.items as { key: string; value: string }[]).map((e) => ({ key: e.key, value: e.value })));
    }
    case "delete": {
      const key = String(args.key ?? "")
        .trim()
        .toUpperCase();
      return ok(deleteKvByKey(key));
    }
    default:
      throw new Error(`Unknown kv action: ${action}`);
  }
}

function handleSecrets(action: string, args: Record<string, unknown>) {
  switch (action) {
    case "get": {
      const key = String(args.key ?? "")
        .trim()
        .toUpperCase();
      return ok(getSecretValueByKey(key));
    }
    case "list": {
      const result = listSecrets({ limit: "1000" });
      return ok((result.items as { key: string }[]).map((e) => e.key));
    }
    default:
      throw new Error(`Unknown secrets action: ${action}`);
  }
}

function formatProjects(projects: { id: string; name: string }[]) {
  if (projects.length === 0) return "(none)";
  return projects.map((p) => `${p.name} [id=${p.id}]`).join(", ");
}

function handleDatatable(action: string, args: Record<string, unknown>) {
  switch (action) {
    case "list_projects":
      return ok(listProjects().map((p) => ({ id: p.id, name: p.name })));
    case "get_schema": {
      const projectRef = String(args.project ?? "").trim();
      const availableProjects = listProjects().map((p) => ({ id: p.id, name: p.name }));
      if (!projectRef) {
        throw new Error(`'project' is required (id or name). Available projects: ${formatProjects(availableProjects)}`);
      }
      const project = resolveProject(projectRef);
      if (!project) {
        throw new Error(`Project "${projectRef}" not found. Available projects: ${formatProjects(availableProjects)}`);
      }

      // Always full project schema (all tables + columns)
      const schema = getProjectSchemaByRef(project.id);
      return ok({
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
    case "query":
      return ok(
        queryRowsByName(String(args.project ?? ""), String(args.table ?? ""), {
          where: args.where as Record<string, unknown> | undefined,
          order_by: args.order_by as { key: string; dir?: "asc" | "desc" }[] | undefined,
          limit: typeof args.limit === "number" ? args.limit : undefined,
          offset: typeof args.offset === "number" ? args.offset : undefined,
        }),
      );
    case "insert":
      return ok(insertRowsByName(String(args.project ?? ""), String(args.table ?? ""), (args.rows as Record<string, unknown>[]) ?? []));
    case "update":
      return ok(updateRowByName(String(args.project ?? ""), String(args.table ?? ""), String(args.row_id ?? ""), (args.data as Record<string, unknown>) ?? {}));
    case "delete":
      return ok(deleteRowsByName(String(args.project ?? ""), String(args.table ?? ""), (args.row_ids as string[]) ?? []));
    default:
      throw new Error(`Unknown datatable action: ${action}`);
  }
}

export function startRawagentsProxy(): { url: string; token: string; stop: () => void } {
  const token = crypto.randomUUID();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      if (req.headers.get("X-Rawagents-Token") !== token) {
        return new Response("Forbidden", { status: 403 });
      }
      if (req.method !== "POST") return fail("Method not allowed", 405);
      let body: RpcBody;
      try {
        body = (await req.json()) as RpcBody;
      } catch {
        return fail("Invalid JSON");
      }
      const ns = body.ns ?? "";
      const action = body.action ?? "";
      const args = body.args ?? {};
      try {
        if (ns === "kv") return handleKv(action, args);
        if (ns === "secrets") return handleSecrets(action, args);
        if (ns === "datatable") return handleDatatable(action, args);
        return fail(`Unknown namespace: ${ns}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = err instanceof HttpException ? err.statusCode : 400;
        return fail(message, status);
      }
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    token,
    stop: () => {
      try {
        server.stop(true);
      } catch {
        /* ignore */
      }
    },
  };
}
