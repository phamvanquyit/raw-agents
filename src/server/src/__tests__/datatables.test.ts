import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Datatables API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let projectId = "";
  let tableId = "";
  let columnId = "";
  let rowId = "";

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
  });

  afterAll(() => cleanup());

  test("POST /api/datatables/projects — create", async () => {
    const res = await authRequest(app, token, "POST", "/api/datatables/projects", { name: "CRM" });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; name: string };
    expect(data.name).toBe("CRM");
    projectId = data.id;
  });

  test("POST /api/datatables/projects — duplicate name", async () => {
    const res = await authRequest(app, token, "POST", "/api/datatables/projects", { name: "CRM" });
    expect(res.status).toBe(400);
  });

  test("GET /api/datatables/projects — list", async () => {
    const res = await authRequest(app, token, "GET", "/api/datatables/projects");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { name: string }[];
    expect(data.some((p) => p.name === "CRM")).toBe(true);
  });

  test("POST /api/datatables/projects/:id/tables — create table", async () => {
    const res = await authRequest(app, token, "POST", `/api/datatables/projects/${projectId}/tables`, { name: "Customers" });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; name: string };
    expect(data.name).toBe("Customers");
    tableId = data.id;
  });

  test("POST /api/datatables/tables/:id/columns — create columns", async () => {
    const nameRes = await authRequest(app, token, "POST", `/api/datatables/tables/${tableId}/columns`, {
      name: "name",
      type: "text",
      required: true,
    });
    expect(nameRes.status).toBe(201);

    const statusRes = await authRequest(app, token, "POST", `/api/datatables/tables/${tableId}/columns`, {
      name: "status",
      type: "select",
      options: ["active", "inactive"],
    });
    expect(statusRes.status).toBe(201);
    columnId = ((await statusRes.json()) as { id: string }).id;

    const ageRes = await authRequest(app, token, "POST", `/api/datatables/tables/${tableId}/columns`, {
      name: "age",
      type: "number",
    });
    expect(ageRes.status).toBe(201);
  });

  test("GET /api/datatables/projects/:id/schema — nested tables + columns", async () => {
    const res = await authRequest(app, token, "GET", `/api/datatables/projects/${projectId}/schema`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      project: { id: string; name: string };
      tables: { id: string; name: string; columns: { name: string }[] }[];
    };
    expect(data.project.id).toBe(projectId);
    expect(data.tables).toHaveLength(1);
    expect(data.tables[0].id).toBe(tableId);
    expect(data.tables[0].columns.map((c) => c.name).sort()).toEqual(["age", "name", "status"]);
  });

  test("POST /api/datatables/tables/:id/rows — insert", async () => {
    const res = await authRequest(app, token, "POST", `/api/datatables/tables/${tableId}/rows`, {
      rows: [
        { name: "Ann", status: "active", age: 30 },
        { name: "Bob", status: "inactive", age: 17 },
        { name: "Cara", status: "active", age: 42 },
      ],
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string }[];
    expect(data).toHaveLength(3);
    rowId = data[0].id;
  });

  test("POST /api/datatables/tables/:id/rows/query — where filters", async () => {
    const res = await authRequest(app, token, "POST", `/api/datatables/tables/${tableId}/rows/query`, {
      where: { status: "active", age: { $gte: 18 } },
      order_by: [{ key: "age", dir: "desc" }],
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: { data: { name: string; age: number } }[]; total: number };
    expect(data.total).toBe(2);
    expect(data.items[0].data.name).toBe("Cara");
    expect(data.items[1].data.name).toBe("Ann");
  });

  test("PUT /api/datatables/rows/:id — update", async () => {
    const res = await authRequest(app, token, "PUT", `/api/datatables/rows/${rowId}`, {
      data: { status: "inactive" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { data: { status: string } };
    expect(data.data.status).toBe("inactive");
  });

  test("DELETE /api/datatables/columns/:id — strips name from rows", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/datatables/columns/${columnId}`);
    expect(res.status).toBe(200);
    const rowRes = await authRequest(app, token, "POST", `/api/datatables/tables/${tableId}/rows/query`, {});
    const data = (await rowRes.json()) as { items: { data: Record<string, unknown> }[] };
    expect(data.items.every((r) => !("status" in r.data))).toBe(true);
  });

  test("DELETE /api/datatables/projects/:id — cascade", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/datatables/projects/${projectId}`);
    expect(res.status).toBe(200);
    const tables = await authRequest(app, token, "GET", `/api/datatables/projects/${projectId}/tables`);
    expect(tables.status).toBe(404);
  });

  test("GET /api/datatables/projects — unauthenticated → 401", async () => {
    const res = await app.request("/api/datatables/projects");
    expect(res.status).toBe(401);
  });
});
