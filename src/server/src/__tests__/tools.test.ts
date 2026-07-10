import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Tools API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
  });

  afterAll(() => cleanup());

  // ── List (includes builtins) ──────────────────────────────────────────

  test("GET /api/tools — list includes builtin tools", async () => {
    const res = await authRequest(app, token, "GET", "/api/tools");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: Record<string, unknown>[]; total: number };
    // Should have at least the builtin tools (get_current_time, fetch_webpage)
    expect(data.items.length).toBeGreaterThanOrEqual(1);

    // Verify builtin tools are present
    const builtinIds = data.items.map((t) => t.id).filter((id) => (id as string).startsWith("builtin:"));
    expect(builtinIds.length).toBeGreaterThanOrEqual(1);
  });

  // ── Custom Tool CRUD ──────────────────────────────────────────────────

  let customToolId = "";

  test("POST /api/tools — create custom tool", async () => {
    const res = await authRequest(app, token, "POST", "/api/tools", {
      name: "test_tool",
      label: "Test Tool",
      description: "A tool for testing",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      codeContent: "# @name test_tool\n# @label Test Tool\nreturn {'result': input.get('query')}",
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("test_tool");
    expect(data.label).toBe("Test Tool");
    expect(data.id).toBeTruthy();
    customToolId = data.id as string;
  });

  test("GET /api/tools/:id — get custom tool", async () => {
    const res = await authRequest(app, token, "GET", `/api/tools/${customToolId}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>;
    expect(data.id).toBe(customToolId);
    expect(data.name).toBe("test_tool");
    expect(data.codeContent).toBeTruthy();
  });

  test("GET /api/tools/:id — get builtin tool", async () => {
    const res = await authRequest(app, token, "GET", "/api/tools/builtin:get_current_time");
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>;
    expect(data.id).toBe("builtin:get_current_time");
  });

  test("GET /api/tools/:id — not found", async () => {
    const res = await authRequest(app, token, "GET", "/api/tools/nonexistent-id");
    expect(res.status).toBe(400);
  });

  test("PUT /api/tools/:id — update codeContent with valid code", async () => {
    const res = await authRequest(app, token, "PUT", `/api/tools/${customToolId}`, {
      codeContent: '# @name test_tool\n# @description Updated description\nreturn {"result": input.get("query")}',
    });

    expect(res.status).toBe(200);
  });

  test("PUT /api/tools/:id — update codeContent missing @name returns 400", async () => {
    const res = await authRequest(app, token, "PUT", `/api/tools/${customToolId}`, {
      codeContent: '# @description Some tool\nreturn {"sum": 1}',
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { message: string };
    expect(data.message).toContain("@name");
  });

  test("PUT /api/tools/:id — update codeContent missing return returns 400", async () => {
    const res = await authRequest(app, token, "PUT", `/api/tools/${customToolId}`, {
      codeContent: "# @name test_tool\n# @description Some tool\nx = 1 + 2",
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { message: string };
    expect(data.message).toContain("return statement");
  });

  test("PUT /api/tools/builtin:* — cannot modify builtin", async () => {
    const res = await authRequest(app, token, "PUT", "/api/tools/builtin:get_current_time", {
      label: "Hacked",
    });

    expect(res.status).toBe(500); // Throws error, caught by global handler
  });

  // ── Delete with cascade ───────────────────────────────────────────────

  test("DELETE /api/tools/:id — delete custom tool", async () => {
    // First create a second tool for delete test
    const createRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "deletable_tool",
      label: "Deletable",
      description: "Will be deleted",
      codeContent: "return {}",
    });
    const created = (await createRes.json()) as { id: string };

    // Create an agent and assign this tool
    const agentRes = await authRequest(app, token, "POST", "/api/agents", {
      name: "Agent with tool",
    });
    const agent = (await agentRes.json()) as { id: string };

    await authRequest(app, token, "POST", `/api/agents/${agent.id}/tool-assignments`, {
      toolId: created.id,
    });

    // Delete the tool
    const res = await authRequest(app, token, "DELETE", `/api/tools/${created.id}`);
    expect(res.status).toBe(200);

    // Verify tool is gone
    const getRes = await authRequest(app, token, "GET", `/api/tools/${created.id}`);
    expect(getRes.status).toBe(400);

    // Verify assignment is also removed
    const assignRes = await authRequest(app, token, "GET", `/api/agents/${agent.id}/tool-assignments`);
    const assignments = (await assignRes.json()) as unknown[];
    expect(assignments.length).toBe(0);
  });

  test("DELETE /api/tools/builtin:* — cannot delete builtin", async () => {
    const res = await authRequest(app, token, "DELETE", "/api/tools/builtin:get_current_time");
    expect(res.status).toBe(500); // Throws error
  });

  // ── List after operations ─────────────────────────────────────────────

  test("GET /api/tools — custom tool in list (without codeContent)", async () => {
    const res = await authRequest(app, token, "GET", "/api/tools");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: Record<string, unknown>[] };
    const customTool = data.items.find((t) => t.id === customToolId);
    expect(customTool).toBeTruthy();
    // List endpoint strips codeContent
    expect(customTool).not.toHaveProperty("codeContent");
  });
});
