import { Hono } from "hono";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
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

export default app;
