import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { getDb, tokenUsage } from "../common/db/client.js";
import { estimateContextUsage, estimateTokens, extractProviderUsage } from "../modules/usage/estimate-context-usage.js";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("estimate-context-usage", () => {
  test("estimateTokens uses chars/4", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });

  test("splits system / tools / conversation", () => {
    const estimate = estimateContextUsage({
      systemPrompt: "You are a helpful agent.".repeat(20),
      tools: [
        {
          name: "get_current_time",
          description: "Get the current time",
          schema: {},
        } as any,
      ],
      messages: [
        { role: "user", content: "Hello world, how are you today?" },
        { role: "assistant", content: "I am doing well, thanks!" },
      ],
    });

    expect(estimate.systemPromptTokens).toBeGreaterThan(0);
    expect(estimate.toolDefTokens).toBeGreaterThan(0);
    expect(estimate.conversationTokens).toBeGreaterThan(0);
    expect(estimate.estimatedTotal).toBe(estimate.systemPromptTokens + estimate.toolDefTokens + estimate.conversationTokens);
    expect(estimate.categories.map((c) => c.id)).toEqual(["system_prompt", "tools", "conversation"]);
  });

  test("counts tool call args and tool results in conversation", () => {
    const before = estimateContextUsage({
      systemPrompt: "sys",
      tools: [],
      messages: [{ role: "user", content: "search please" }],
    });

    const bigResult = JSON.stringify({ rows: Array.from({ length: 50 }, (_, i) => ({ id: i, body: "x".repeat(40) })) });
    const after = estimateContextUsage({
      systemPrompt: "sys",
      tools: [],
      messages: [
        { role: "user", content: "search please" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "tc1", name: "datatable_query", args: { table: "ideas", limit: 50 } }],
        },
        { role: "tool-result", toolCallId: "tc1", toolName: "datatable_query", result: bigResult },
      ],
    });

    expect(after.conversationTokens).toBeGreaterThan(before.conversationTokens + 100);
    expect(after.estimatedTotal).toBeGreaterThan(before.estimatedTotal);
  });

  test("counts thinking text in conversation estimate", () => {
    const without = estimateContextUsage({
      systemPrompt: "sys",
      tools: [],
      messages: [{ role: "assistant", content: "answer" }],
    });
    const withThinking = estimateContextUsage({
      systemPrompt: "sys",
      tools: [],
      messages: [{ role: "assistant", content: "answer", thinking: "x".repeat(400) }],
    });
    expect(withThinking.conversationTokens).toBeGreaterThan(without.conversationTokens);
  });

  test("extractProviderUsage dedupes the same message id from dual stream modes", () => {
    const msg = {
      id: "msg-1",
      usage_metadata: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    };
    const usage = extractProviderUsage([msg, msg]);
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
    expect(usage.totalTokens).toBe(150);
  });
});

describe("Usage API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let agentId: string;
  let adminUserId: string;

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
    adminUserId = admin.user.id as string;

    const agentRes = await authRequest(app, token, "POST", "/api/agents", { name: "Usage Agent" });
    const agent = (await agentRes.json()) as { id: string };
    agentId = agent.id;

    getDb()
      .insert(tokenUsage)
      .values({
        agentId,
        ownerId: adminUserId,
        providerId: "prov-1",
        model: "gpt-4o",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        systemPromptTokens: 40,
        toolDefTokens: 30,
        conversationTokens: 20,
        estimatedTotal: 90,
      })
      .run();
  });

  afterAll(() => cleanup());

  test("GET /api/usage — lists history", async () => {
    const res = await authRequest(app, token, "GET", "/api/usage");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      items: Array<{ estimatedTotal: number; model: string | null; agentName: string | null; agentId: string | null }>;
      total: number;
    };
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(data.items[0]?.model).toBe("gpt-4o");
    expect(data.items[0]?.agentId).toBe(agentId);
    expect(data.items[0]?.agentName).toBe("Usage Agent");
  });

  test("GET /api/usage/summary — aggregates totals", async () => {
    const res = await authRequest(app, token, "GET", "/api/usage/summary");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      runs: number;
      totalTokens: number;
      estimatedTotal: number;
      categories: Array<{ id: string; tokens: number }>;
    };
    expect(data.runs).toBeGreaterThanOrEqual(1);
    expect(data.totalTokens).toBeGreaterThanOrEqual(150);
    expect(data.estimatedTotal).toBeGreaterThanOrEqual(90);
    expect(data.categories).toHaveLength(3);
  });

  test("GET /api/usage?agentId= — filters by agent", async () => {
    const res = await authRequest(app, token, "GET", `/api/usage?agentId=${agentId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: Array<{ agentId: string | null }>; total: number };
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(data.items.every((i) => i.agentId === agentId)).toBe(true);
  });

  test("GET /api/usage?model= — filters by model", async () => {
    const res = await authRequest(app, token, "GET", "/api/usage?model=gpt-4o");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: Array<{ model: string | null }>; total: number };
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(data.items.every((i) => i.model === "gpt-4o")).toBe(true);
  });

  test("GET /api/usage/models — lists distinct models", async () => {
    const res = await authRequest(app, token, "GET", "/api/usage/models");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: string[] };
    expect(data.items).toContain("gpt-4o");
  });

  test("GET /api/usage/context/:agentId — returns breakdown", async () => {
    const res = await authRequest(app, token, "GET", `/api/usage/context/${agentId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      estimatedTotal: number;
      categories: Array<{ id: string }>;
      agentId: string;
    };
    expect(data.agentId).toBe(agentId);
    expect(data.categories.map((c) => c.id)).toEqual(["system_prompt", "tools", "conversation"]);
    expect(data.estimatedTotal).toBeGreaterThanOrEqual(0);
  });

  test("GET /api/usage/context/:agentId — 400 for missing agent", async () => {
    const res = await authRequest(app, token, "GET", "/api/usage/context/does-not-exist");
    expect(res.status).toBe(400);
  });

  test("GET /api/usage — member gets 403; context still allowed", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/users", {
      username: "usage-member",
      name: "Usage Member",
      password: "password123",
      role: "member",
    });
    expect(createRes.status).toBe(201);

    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "usage-member", password: "password123" }),
    });
    expect(loginRes.status).toBe(200);
    const loginData = (await loginRes.json()) as { token: string };

    const listRes = await authRequest(app, loginData.token, "GET", "/api/usage");
    expect(listRes.status).toBe(403);

    const summaryRes = await authRequest(app, loginData.token, "GET", "/api/usage/summary");
    expect(summaryRes.status).toBe(403);

    const contextRes = await authRequest(app, loginData.token, "GET", `/api/usage/context/${agentId}`);
    expect(contextRes.status).toBe(200);
  });
});
