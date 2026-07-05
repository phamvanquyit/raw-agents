import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { streamChatSSE } from "../agents/raw-agent/raw-agent.service.js";
import { runRegistry } from "../agents/raw-agent/utils/run-registry.js";
import {
  createConversation,
  createMessage,
  deleteConversation,
  getConversation,
  getMessageFeed,
  listConversations,
  listMessages,
  patchMessageMeta,
  updateConversation,
} from "./conversations.service.js";

const app = new Hono();

// GET /api/conversations?page=1&limit=50&sorts=-createdAt&agentId=xxx
app.get("/", (c) => {
  return c.json(listConversations(c.req.query()));
});

// GET /api/conversations/feed/messages — must be before /:id
app.get("/feed/messages", (c) => {
  const agentId = c.req.query("agentId");
  if (!agentId) throw new BadRequestException("agentId required");
  return c.json(getMessageFeed(agentId, c.req.query("cursor")));
});

// GET /api/conversations/:id
app.get("/:id", (c) => {
  const row = getConversation(c.req.param("id"));
  if (!row) throw new BadRequestException("Not found");
  return c.json(row);
});

// POST /api/conversations
app.post("/", async (c) => {
  const body = await c.req.json();
  return c.json(createConversation(body), 201);
});

// PUT /api/conversations/:id
app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(updateConversation(c.req.param("id"), body));
});

// DELETE /api/conversations/:id
app.delete("/:id", (c) => {
  deleteConversation(c.req.param("id"));
  return c.json({ ok: true });
});

// GET /api/conversations/:id/messages
app.get("/:id/messages", (c) => c.json(listMessages(c.req.param("id"))));

// POST /api/conversations/:id/messages
app.post("/:id/messages", async (c) => {
  const body = await c.req.json();
  return c.json(createMessage(c.req.param("id"), body), 201);
});

// PATCH /api/conversations/:convId/messages/:msgId/metadata
app.patch("/:convId/messages/:msgId/metadata", async (c) => {
  const patch = await c.req.json<Record<string, unknown>>();
  const result = patchMessageMeta(c.req.param("msgId"), patch);
  if (!result) throw new BadRequestException("Message not found");
  return c.json(result);
});

// ─── Chat send (SSE response) ────────────────────────────────────────────────
// POST /api/conversations/:id/chat — validates, saves user message, then streams
// agent events directly as SSE (like coding-agent pattern). No race conditions.
app.post("/:id/chat", async (c) => {
  const conversationId = c.req.param("id");
  const body = await c.req.json<{ agentId: string; message: string; password?: string; token?: string }>();

  return streamSSE(c, async (stream) => {
    await streamChatSSE({ ...body, conversationId }, stream);
  });
});

// ─── SSE Stream ──────────────────────────────────────────────────────────────
// GET /api/conversations/:id/stream — subscribe to live stream events from a running task.
// Waits up to 5s for a stream to start (handles SSE opened before POST triggers the stream).
app.get("/:id/stream", (c) => {
  const conversationId = c.req.param("id");

  return streamSSE(c, async (stream) => {
    // Wait for stream to become available (POST may not have fired yet)
    const maxWait = 5000;
    const pollInterval = 50;
    let waited = 0;
    while (!runRegistry.has(conversationId) && waited < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));
      waited += pollInterval;
    }

    if (!runRegistry.has(conversationId)) {
      await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "No active stream" }) });
      return;
    }

    await new Promise<void>((resolve) => {
      const unsub = runRegistry.subscribe(conversationId, (event) => {
        stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {
          // Client disconnected — clean up
          unsub();
          resolve();
        });

        if (event.type === "done" || event.type === "error") {
          unsub();
          resolve();
        }
      });

      // Race: run may have finished between the has() check and subscribe()
      if (!runRegistry.has(conversationId)) {
        unsub();
        resolve();
      }

      // Clean up when client disconnects (tab close, navigation, etc.)
      stream.onAbort(() => {
        unsub();
        resolve();
      });
    });
  });
});

export default app;
