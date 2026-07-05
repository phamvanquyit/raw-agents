import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { agentConversations, getDb } from "../../common/db/client.js";
import { runRegistry } from "../agents/raw-agent/utils/run-registry.js";
import {
  createPublicConversation,
  deletePublicConversation,
  getPublicAgent,
  getPublicConversation,
  listPublicConversations,
  verifyPublicPassword,
  verifyPublicToken,
} from "./public.service.js";

const app = new Hono();

// GET /api/public/agents/:id
app.get("/agents/:id", (c) => {
  const result = getPublicAgent(c.req.param("id"));
  return c.json(result.data);
});

// POST /api/public/agents/:id/verify
app.post("/agents/:id/verify", async (c) => {
  const { password } = await c.req.json<{ password?: string }>();
  const result = await verifyPublicPassword(c.req.param("id"), password);
  return c.json({ valid: result.valid, token: result.token });
});

// POST /api/public/agents/:id/verify-token
app.post("/agents/:id/verify-token", async (c) => {
  const { token } = await c.req.json<{ token?: string }>();
  if (!token) return c.json({ valid: false });
  const valid = await verifyPublicToken(c.req.param("id"), token);
  return c.json({ valid });
});

// GET /api/public/agents/:id/conversations?fp=<fingerprint>
// List all conversations for this fingerprint
app.get("/agents/:id/conversations", (c) => {
  const fp = c.req.query("fp");
  if (!fp) return c.json({ error: "Fingerprint required" }, 400);
  const result = listPublicConversations(c.req.param("id"), fp);
  return c.json(result.data);
});

// POST /api/public/agents/:id/conversations?fp=<fingerprint>
// Create a new conversation
app.post("/agents/:id/conversations", (c) => {
  const fp = c.req.query("fp");
  if (!fp) return c.json({ error: "Fingerprint required" }, 400);
  const result = createPublicConversation(c.req.param("id"), fp);
  return c.json(result.data);
});

// GET /api/public/agents/:id/conversations/:convId?fp=<fingerprint>
// Load a specific conversation + messages
app.get("/agents/:id/conversations/:convId", (c) => {
  const fp = c.req.query("fp");
  if (!fp) return c.json({ error: "Fingerprint required" }, 400);
  const result = getPublicConversation(c.req.param("id"), c.req.param("convId"), fp);
  return c.json(result.data);
});

// DELETE /api/public/agents/:id/conversations/:convId?fp=<fingerprint>
app.delete("/agents/:id/conversations/:convId", (c) => {
  const fp = c.req.query("fp");
  if (!fp) return c.json({ error: "Fingerprint required" }, 400);
  deletePublicConversation(c.req.param("id"), c.req.param("convId"), fp);
  return c.json({ ok: true });
});

// ─── SSE Stream ──────────────────────────────────────────────────────────────
// GET /api/public/agents/:id/conversations/:convId/stream?fp=<fingerprint>
// Subscribe to live stream events. Validates ownership via fingerprint.
app.get("/agents/:id/conversations/:convId/stream", (c) => {
  const agentId = c.req.param("id");
  const convId = c.req.param("convId");
  const fp = c.req.query("fp");
  if (!fp) return c.json({ error: "Fingerprint required" }, 400);

  // Validate ownership — same check as getPublicConversation
  const db = getDb();
  const conv = db
    .select()
    .from(agentConversations)
    .where(
      and(
        eq(agentConversations.id, convId),
        eq(agentConversations.agentId, agentId),
        eq(agentConversations.trigger, "public"),
        eq(agentConversations.ownerId, fp),
      ),
    )
    .get();
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  if (!runRegistry.has(convId)) {
    return c.json({ error: "No active stream for this conversation" }, 404);
  }

  return streamSSE(c, async (stream) => {
    await new Promise<void>((resolve) => {
      const unsub = runRegistry.subscribe(convId, (event) => {
        stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {
          unsub();
          resolve();
        });

        if (event.type === "done" || event.type === "error") {
          unsub();
          resolve();
        }
      });

      if (!runRegistry.has(convId)) {
        unsub();
        resolve();
      }

      stream.onAbort(() => {
        unsub();
        resolve();
      });
    });
  });
});

export default app;
