import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Conversations API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let agentId: string;

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;

    // Create an agent for conversations
    const agentRes = await authRequest(app, token, "POST", "/api/agents", {
      name: "Conv Test Agent",
    });
    const agent = (await agentRes.json()) as { id: string };
    agentId = agent.id;
  });

  afterAll(() => cleanup());

  // ── CRUD ──────────────────────────────────────────────────────────────

  let convId = "";

  test("POST /api/conversations — create conversation", async () => {
    const res = await authRequest(app, token, "POST", "/api/conversations", {
      agentId,
      title: "Test Chat",
      trigger: "manual",
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.title).toBe("Test Chat");
    expect(data.agentId).toBe(agentId);
    expect(data.trigger).toBe("manual");
    expect(data.status).toBe("done");
    convId = data.id as string;
  });

  test("GET /api/conversations — list conversations (filter by agentId)", async () => {
    const res = await authRequest(app, token, "GET", `/api/conversations?agentId=${agentId}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: Record<string, unknown>[]; total: number };
    expect(data.items.length).toBeGreaterThanOrEqual(1);

    const conv = data.items.find((c) => c.id === convId);
    expect(conv).toBeTruthy();
    expect(conv!.title).toBe("Test Chat");
  });

  test("GET /api/conversations/:id — get single", async () => {
    const res = await authRequest(app, token, "GET", `/api/conversations/${convId}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>;
    expect(data.id).toBe(convId);
  });

  test("GET /api/conversations/:id — not found", async () => {
    const res = await authRequest(app, token, "GET", "/api/conversations/nonexistent");
    expect(res.status).toBe(400);
  });

  test("PUT /api/conversations/:id — update title", async () => {
    const res = await authRequest(app, token, "PUT", `/api/conversations/${convId}`, {
      title: "Updated Chat Title",
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.title).toBe("Updated Chat Title");
  });

  // ── Messages ──────────────────────────────────────────────────────────

  test("POST /api/conversations/:id/messages — create message", async () => {
    const res = await authRequest(app, token, "POST", `/api/conversations/${convId}/messages`, {
      agentId,
      role: "user",
      content: "Hello, agent!",
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.role).toBe("user");
    expect(data.content).toBe("Hello, agent!");
    expect(data.conversationId).toBe(convId);
  });

  test("POST /api/conversations/:id/messages — create assistant message", async () => {
    const res = await authRequest(app, token, "POST", `/api/conversations/${convId}/messages`, {
      agentId,
      role: "assistant",
      content: "Hello! How can I help you?",
    });

    expect(res.status).toBe(201);
  });

  test("GET /api/conversations/:id/messages — list messages", async () => {
    const res = await authRequest(app, token, "GET", `/api/conversations/${convId}/messages`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>[];
    expect(data.length).toBe(2);
    expect(data[0].role).toBe("user");
    expect(data[1].role).toBe("assistant");
  });

  // ── Multiple conversations ────────────────────────────────────────────

  test("POST /api/conversations — create second conversation", async () => {
    const res = await authRequest(app, token, "POST", "/api/conversations", {
      agentId,
      title: "Second Chat",
    });
    expect(res.status).toBe(201);
  });

  test("GET /api/conversations — lists multiple", async () => {
    const res = await authRequest(app, token, "GET", `/api/conversations?agentId=${agentId}`);
    const data = (await res.json()) as { items: unknown[] };
    expect(data.items.length).toBe(2);
  });

  // ── Delete ────────────────────────────────────────────────────────────

  test("DELETE /api/conversations/:id — delete conversation", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/conversations/${convId}`);
    expect(res.status).toBe(200);

    // Verify deleted
    const getRes = await authRequest(app, token, "GET", `/api/conversations/${convId}`);
    expect(getRes.status).toBe(400);
  });
});
