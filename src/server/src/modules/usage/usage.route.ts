import { Hono } from "hono";
import { BadRequestException, UnauthorizedException } from "../../common/exceptions/http.exception.js";
import { requireAuth, requireRole } from "../../common/middleware/auth.middleware.js";
import { getUsageSummary, listTokenUsage, listUsageModels, previewContextUsage } from "./usage.service.js";

const app = new Hono();

app.use("*", requireAuth);

function requireUser(c: { get: (key: string) => unknown }) {
  const user = c.get("user") as { id: string; role: string } | undefined;
  if (!user) throw new UnauthorizedException("Authentication required");
  return user;
}

const requireAdmin = requireRole("admin");

/** Chat context preview — any authenticated user (Context button on chat). */
app.get("/context/:agentId", (c) => {
  const agentId = c.req.param("agentId");
  const conversationId = c.req.query("conversationId") || undefined;
  const user = requireUser(c);
  try {
    return c.json(
      previewContextUsage(agentId, {
        conversationId,
        ownerId: user.id,
      }),
    );
  } catch (err) {
    throw new BadRequestException(err instanceof Error ? err.message : String(err));
  }
});

/** History / aggregates — admin only (Settings → Usage). */
app.get("/", requireAdmin, (c) => {
  const agentId = c.req.query("agentId") || undefined;
  const model = c.req.query("model") || undefined;
  const conversationId = c.req.query("conversationId") || undefined;
  const from = c.req.query("from") ? Number(c.req.query("from")) : undefined;
  const to = c.req.query("to") ? Number(c.req.query("to")) : undefined;
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
  const offset = c.req.query("offset") ? Number(c.req.query("offset")) : undefined;

  if (from != null && Number.isNaN(from)) throw new BadRequestException("Invalid from");
  if (to != null && Number.isNaN(to)) throw new BadRequestException("Invalid to");

  return c.json(listTokenUsage({ agentId, model, conversationId, from, to, limit, offset }));
});

app.get("/models", requireAdmin, (c) => {
  return c.json({ items: listUsageModels() });
});

app.get("/summary", requireAdmin, (c) => {
  const agentId = c.req.query("agentId") || undefined;
  const model = c.req.query("model") || undefined;
  const from = c.req.query("from") ? Number(c.req.query("from")) : undefined;
  const to = c.req.query("to") ? Number(c.req.query("to")) : undefined;

  if (from != null && Number.isNaN(from)) throw new BadRequestException("Invalid from");
  if (to != null && Number.isNaN(to)) throw new BadRequestException("Invalid to");

  return c.json(getUsageSummary({ agentId, model, from, to }));
});

export default app;
