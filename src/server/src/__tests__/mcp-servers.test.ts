import type { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("MCP Servers API", () => {
  let app: Hono;
  let raw: Database;
  let cleanup: () => void;
  let token: string;
  let serverId: string;
  let agentId: string;

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    raw = t.raw;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
  });

  afterAll(() => cleanup());

  // ─── Happy path ────────────────────────────────────────────────────────────

  test("POST /api/mcp-servers — create server (sync may fail)", async () => {
    const res = await authRequest(app, token, "POST", "/api/mcp-servers", {
      name: "demo-mcp",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer secret-token" },
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("demo-mcp");
    expect(data.url).toBe("https://example.com/mcp");
    expect(data).toHaveProperty("id");
    expect(data.tools).toEqual([]);
    const headers = data.headers as Record<string, string>;
    expect(headers.Authorization).not.toContain("secret-token");
    serverId = data.id as string;
  });

  test("GET /api/mcp-servers — list includes catalog", async () => {
    raw.query("UPDATE mcp_servers SET tools = ? WHERE id = ?").run(
      JSON.stringify([
        { name: "search", description: "Search docs", inputSchema: { type: "object", properties: {} } },
        { name: "read_file", description: "Read a file", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
      ]),
      serverId,
    );

    const res = await authRequest(app, token, "GET", "/api/mcp-servers");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: Record<string, unknown>[] };
    expect(data.items.length).toBe(1);
    expect(data.items[0].toolCount).toBe(2);
    const tools = data.items[0].tools as { name: string }[];
    expect(tools.map((t) => t.name).sort()).toEqual(["read_file", "search"]);
  });

  test("GET /api/mcp-servers/:id — get one", async () => {
    const res = await authRequest(app, token, "GET", `/api/mcp-servers/${serverId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.id).toBe(serverId);
    expect((data.tools as unknown[]).length).toBe(2);
  });

  test("PUT /api/mcp-servers/:id — update name and merge masked headers", async () => {
    const getRes = await authRequest(app, token, "GET", `/api/mcp-servers/${serverId}`);
    const current = (await getRes.json()) as { headers: Record<string, string> };

    const res = await authRequest(app, token, "PUT", `/api/mcp-servers/${serverId}`, {
      name: "demo-mcp-renamed",
      headers: current.headers,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("demo-mcp-renamed");
    expect((data.tools as unknown[]).length).toBe(2);

    const configRes = await authRequest(app, token, "GET", "/api/mcp-servers/config");
    const config = (await configRes.json()) as { mcpServers: Record<string, { headers?: Record<string, string> }> };
    expect(config.mcpServers["demo-mcp-renamed"].headers?.Authorization).toBe("Bearer secret-token");
  });

  test("POST /api/agents — create agent for MCP assignment", async () => {
    const res = await authRequest(app, token, "POST", "/api/agents", {
      name: "MCP Agent",
      description: "Uses MCP tools",
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string };
    agentId = data.id;
  });

  test("POST /api/agents/:id/tool-assignments — assign mcp virtual tool id", async () => {
    const toolId = `mcp:${serverId}:search`;
    const res = await authRequest(app, token, "POST", `/api/agents/${agentId}/tool-assignments`, { toolId });
    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.toolId).toBe(toolId);
    const tool = data.tool as { name: string; label: string; description: string };
    expect(tool.label).toBe("search");
    expect(tool.description).toBe("Search docs");
    expect(tool.name).toBe("demo_mcp_renamed_search");
  });

  test("GET /api/agents/:id/tool-assignments — resolves MCP tool metadata", async () => {
    const res = await authRequest(app, token, "GET", `/api/agents/${agentId}/tool-assignments`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>[];
    expect(data.length).toBe(1);
    expect(data[0].toolId).toBe(`mcp:${serverId}:search`);
  });

  test("GET /api/mcp-servers/config — cursor format with plaintext headers", async () => {
    const res = await authRequest(app, token, "GET", "/api/mcp-servers/config");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { mcpServers: Record<string, { url: string; headers?: Record<string, string> }> };
    expect(data.mcpServers["demo-mcp-renamed"].url).toBe("https://example.com/mcp");
    expect(data.mcpServers["demo-mcp-renamed"].headers?.Authorization).toBe("Bearer secret-token");
  });

  // ─── Validation / errors ───────────────────────────────────────────────────

  test("GET /api/mcp-servers/:id — not found", async () => {
    const res = await authRequest(app, token, "GET", "/api/mcp-servers/missing-id");
    expect(res.status).toBe(400);
  });

  test("PUT /api/mcp-servers/:id — not found", async () => {
    const res = await authRequest(app, token, "PUT", "/api/mcp-servers/missing-id", {
      name: "x",
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/mcp-servers — reject private URL", async () => {
    const res = await authRequest(app, token, "POST", "/api/mcp-servers", {
      name: "local",
      url: "http://localhost:3000/mcp",
    });
    expect(res.status).toBe(400);
  });

  test("PUT /api/mcp-servers/:id — reject private URL", async () => {
    const res = await authRequest(app, token, "PUT", `/api/mcp-servers/${serverId}`, {
      url: "http://127.0.0.1:8080/mcp",
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/mcp-servers/:id/sync — not found", async () => {
    const res = await authRequest(app, token, "POST", "/api/mcp-servers/missing-id/sync");
    expect(res.status).toBe(400);
  });

  test("POST /api/mcp-servers/:id/sync — inactive server", async () => {
    raw.query("UPDATE mcp_servers SET is_active = 0 WHERE id = ?").run(serverId);
    const res = await authRequest(app, token, "POST", `/api/mcp-servers/${serverId}/sync`);
    expect(res.status).toBe(400);
    raw.query("UPDATE mcp_servers SET is_active = 1 WHERE id = ?").run(serverId);
  });

  test("PUT /api/mcp-servers/config — invalid shape", async () => {
    const res = await authRequest(app, token, "PUT", "/api/mcp-servers/config", { foo: 1 });
    expect(res.status).toBe(400);
  });

  test("PUT /api/mcp-servers/config — missing url", async () => {
    const res = await authRequest(app, token, "PUT", "/api/mcp-servers/config", {
      mcpServers: { broken: { headers: {} } },
    });
    expect(res.status).toBe(400);
  });

  // ─── Business logic ────────────────────────────────────────────────────────

  test("DELETE /api/mcp-servers/:id — removes server and MCP assignments", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/mcp-servers/${serverId}`);
    expect(res.status).toBe(200);

    const listRes = await authRequest(app, token, "GET", "/api/mcp-servers");
    const list = (await listRes.json()) as { items: unknown[] };
    expect(list.items.length).toBe(0);

    const assignmentsRes = await authRequest(app, token, "GET", `/api/agents/${agentId}/tool-assignments`);
    const assignments = (await assignmentsRes.json()) as unknown[];
    expect(assignments.length).toBe(0);
  });

  test("PUT /api/mcp-servers/config — create / update / delete by name", async () => {
    const createRes = await authRequest(app, token, "PUT", "/api/mcp-servers/config", {
      mcpServers: {
        alpha: { url: "https://example.com/mcp-alpha", headers: { "X-Key": "alpha-secret" } },
        beta: { url: "https://example.com/mcp-beta" },
      },
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as {
      created: string[];
      updated: string[];
      deleted: string[];
      syncErrors: { name: string; error: string }[];
      items: { name: string }[];
    };
    expect(created.created.sort()).toEqual(["alpha", "beta"]);
    expect(created.updated).toEqual([]);
    expect(created.deleted).toEqual([]);
    expect(created.items.map((i) => i.name).sort()).toEqual(["alpha", "beta"]);
    expect(created.syncErrors.length).toBe(2);

    const updateRes = await authRequest(app, token, "PUT", "/api/mcp-servers/config", {
      mcpServers: {
        alpha: { url: "https://example.com/mcp-alpha-v2", headers: { "X-Key": "alpha-secret-2" } },
        gamma: { url: "https://example.com/mcp-gamma" },
      },
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as {
      created: string[];
      updated: string[];
      deleted: string[];
      items: { name: string; url: string }[];
    };
    expect(updated.created).toEqual(["gamma"]);
    expect(updated.updated).toEqual(["alpha"]);
    expect(updated.deleted).toEqual(["beta"]);
    expect(updated.items.map((i) => i.name).sort()).toEqual(["alpha", "gamma"]);
    expect(updated.items.find((i) => i.name === "alpha")?.url).toBe("https://example.com/mcp-alpha-v2");

    const configRes = await authRequest(app, token, "GET", "/api/mcp-servers/config");
    const config = (await configRes.json()) as { mcpServers: Record<string, { headers?: Record<string, string> }> };
    expect(config.mcpServers.alpha.headers?.["X-Key"]).toBe("alpha-secret-2");
    expect(config.mcpServers.beta).toBeUndefined();
  });
});
