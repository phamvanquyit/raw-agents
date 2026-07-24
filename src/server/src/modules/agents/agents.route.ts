import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { BadRequestException, InternalServerErrorException } from "../../common/exceptions/http.exception.js";
import {
  addAssignment,
  cloneAgent,
  createAgent,
  deleteAgent,
  getAgent,
  listAgentsEnriched,
  listAssignments,
  removeAssignment,
  setAssignments,
  updateAgent,
} from "./agents.service.js";
import { type PromptStreamRequest, streamPromptAgent } from "./prompt-agent/prompt-agent.service.js";
import { generateResponse, stopStream } from "./raw-agent/raw-agent.service.js";

const app = new Hono();

// ─── Agent CRUD ──────────────────────────────────────────────────────────────

// GET /api/agents?page=1&limit=50&sorts=-createdAt&search=&status=active
app.get("/", (c) => {
  const user = (c as any).get("user") as { id: string; role: string } | undefined;
  return c.json(listAgentsEnriched(c.req.query(), user));
});

// GET /api/agents/:id
app.get("/:id", (c) => {
  const row = getAgent(c.req.param("id"));
  if (!row) throw new BadRequestException("Agent not found");
  return c.json(row);
});

// POST /api/agents
app.post("/", async (c) => {
  const body = await c.req.json();
  const user = (c as any).get("user") as { id: string } | undefined;
  if (user) body.createdBy = user.id;
  return c.json(createAgent(body), 201);
});

// PUT /api/agents/:id
app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(updateAgent(c.req.param("id"), body));
});

// POST /api/agents/:id/clone
app.post("/:id/clone", (c) => {
  const user = (c as any).get("user") as { id: string } | undefined;
  const cloned = cloneAgent(c.req.param("id"), user?.id);
  if (!cloned) throw new BadRequestException("Agent not found");
  return c.json(cloned, 201);
});

// DELETE /api/agents/:id
app.delete("/:id", (c) => {
  deleteAgent(c.req.param("id"));
  return c.json({ ok: true });
});

// ─── Tool Assignments ────────────────────────────────────────────────────────

// GET /api/agents/:id/tool-assignments
app.get("/:id/tool-assignments", (c) => {
  return c.json(listAssignments(c.req.param("id")));
});

// PUT /api/agents/:id/tool-assignments — replace all
app.put("/:id/tool-assignments", async (c) => {
  const body = await c.req.json<{
    items: { toolId: string; parameters?: Record<string, unknown> }[];
  }>();
  return c.json(setAssignments(c.req.param("id"), body.items ?? (body as any)));
});

// POST /api/agents/:id/tool-assignments — add one
app.post("/:id/tool-assignments", async (c) => {
  const body = await c.req.json<{
    toolId: string;
    parameters?: Record<string, unknown>;
  }>();
  const result = addAssignment(c.req.param("id"), body);
  if (!result) throw new BadRequestException("Failed to add assignment");
  return c.json(result, 201);
});

// DELETE /api/agents/:id/tool-assignments/:aid
app.delete("/:id/tool-assignments/:aid", (c) => {
  removeAssignment(c.req.param("aid"));
  return c.json({ ok: true });
});

// ─── Chat ────────────────────────────────────────────────────────────────────

// POST /api/agents/:id/chat/stop
app.post("/:id/chat/stop", async (c) => {
  const { conversationId } = await c.req.json<{ conversationId: string }>();
  if (!conversationId) throw new BadRequestException("conversationId is required");
  return c.json({ ok: stopStream(conversationId) });
});

// POST /api/agents/:id/generate
app.post("/:id/generate", async (c) => {
  const agentId = c.req.param("id");
  const body = await c.req.json<{
    message: string;
    conversationId?: string;
    maxSteps?: number;
  }>();
  try {
    const user = (c as any).get("user") as { id: string } | undefined;
    const result = await generateResponse(agentId, body.message, body.conversationId, body.maxSteps, {
      ownerId: user?.id,
    });
    return c.json({ ok: true, text: result.text });
  } catch (err) {
    throw new InternalServerErrorException(err instanceof Error ? err.message : String(err));
  }
});

// ─── Prompt Assistant ────────────────────────────────────────────────────────

// POST /api/agents/:id/assistant/prompt/stream
app.post("/:id/assistant/prompt/stream", async (c) => {
  const agentId = c.req.param("id");
  const body = await c.req.json<PromptStreamRequest>();

  return streamSSE(c, async (stream) => {
    const abort = new AbortController();

    // When client disconnects (stop button, page close, navigation), abort the agent
    stream.onAbort(() => {
      abort.abort();
    });

    await streamPromptAgent(agentId, body, stream, abort.signal);
  });
});

export default app;
