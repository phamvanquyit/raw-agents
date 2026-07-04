import { Hono } from "hono";
import { BadRequestException, InternalServerErrorException } from "../../common/exceptions/http.exception.js";
import { generateResponse, handleWsMessage, stopStream } from "./chat.service.js";

const app = new Hono();

export { handleWsMessage };

// POST /api/agents/:id/chat/stop
app.post("/:id/chat/stop", async (c) => {
  const { conversationId } = await c.req.json<{ conversationId: string }>();
  if (!conversationId) throw new BadRequestException("conversationId is required");
  return c.json({ ok: stopStream(conversationId) });
});

// POST /api/agents/:id/generate
app.post("/:id/generate", async (c) => {
  const agentId = c.req.param("id");
  const body = await c.req.json<{ message: string; conversationId?: string; maxSteps?: number }>();
  try {
    const result = await generateResponse(agentId, body.message, body.conversationId, body.maxSteps);
    return c.json({ ok: true, text: result.text });
  } catch (err) {
    throw new InternalServerErrorException(err instanceof Error ? err.message : String(err));
  }
});

export default app;
