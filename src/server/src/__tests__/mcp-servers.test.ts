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
    // Headers must be masked in response
    const headers = data.headers as Record<string, string>;
    expect(headers.Authorization).not.toContain("secret-token");
    serverId = data.id as string;
  });

  test("GET /api/mcp-servers — list includes catalog", async () => {
    // Seed catalog without remote sync
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
    expect(tool.name).toBe("demo_mcp_search");
  });

  test("GET /api/agents/:id/tool-assignments — resolves MCP tool metadata", async () => {
    const res = await authRequest(app, token, "GET", `/api/agents/${agentId}/tool-assignments`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>[];
    expect(data.length).toBe(1);
    expect(data[0].toolId).toBe(`mcp:${serverId}:search`);
  });

  test("POST /api/mcp-servers — reject private URL", async () => {
    const res = await authRequest(app, token, "POST", "/api/mcp-servers", {
      name: "local",
      url: "http://localhost:3000/mcp",
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/mcp-servers/config — cursor format", async () => {
    const res = await authRequest(app, token, "GET", "/api/mcp-servers/config");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { mcpServers: Record<string, { url: string }> };
    expect(data.mcpServers["demo-mcp"].url).toBe("https://example.com/mcp");
  });

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

  test("PUT /api/mcp-servers/config — invalid shape", async () => {
    const res = await authRequest(app, token, "PUT", "/api/mcp-servers/config", { foo: 1 });
    expect(res.status).toBe(400);
  });
});
