import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { type CodingStreamRequest, streamCodingAgent } from "./services/coding-agent.service.js";
import { createTool, deleteTool, getTool, listTools, runCode, runTool, updateTool, validateCode } from "./tools.service.js";

const app = new Hono();

// GET /api/tools?page=1&limit=50&sorts=-createdAt
app.get("/", (c) => {
  return c.json(listTools(c.req.query()));
});

// POST /api/tools/validate — before /:id
app.post("/validate", async (c) => {
  const { code } = await c.req.json<{ code: string }>();
  return c.json(await validateCode(code));
});

// POST /api/tools/run-code — before /:id
app.post("/run-code", async (c) => {
  const body = await c.req.json<{ code: string; inputJson?: string }>();
  if (!body.code?.trim()) throw new BadRequestException("No code provided");
  return c.json(await runCode(body.code, body.inputJson));
});

// POST /api/tools/:id/coding/stream — coding agent SSE
app.post("/:id/coding/stream", async (c) => {
  const toolId = c.req.param("id");
  const body = await c.req.json<CodingStreamRequest>();

  return streamSSE(c, async (stream) => {
    await streamCodingAgent(toolId, body, stream);
  });
});

// GET /api/tools/:id
app.get("/:id", (c) => {
  const row = getTool(c.req.param("id"));
  if (!row) throw new BadRequestException("Not found");
  return c.json(row);
});

// POST /api/tools
app.post("/", async (c) => {
  const body = await c.req.json();
  return c.json(createTool(body), 201);
});

// PUT /api/tools/:id
app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(updateTool(c.req.param("id"), body));
});

// DELETE /api/tools/:id
app.delete("/:id", (c) => {
  deleteTool(c.req.param("id"));
  return c.json({ ok: true });
});

// POST /api/tools/:id/run
app.post("/:id/run", async (c) => {
  const body = await c.req.json<{ inputJson?: string; code?: string }>();
  const result = await runTool(c.req.param("id"), body.inputJson, body.code);
  if (!result) throw new BadRequestException("Tool not found");
  return c.json(result);
});

export default app;
