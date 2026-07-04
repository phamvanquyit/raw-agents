import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { agents, getDb, users } from "../../common/db/client.js";
import { listQuery } from "../../common/db/list-query.util.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { addAssignment, listAssignments, removeAssignment, setAssignments } from "./agent-tool-assignments.service.js";
import { cloneAgent, createAgent, createAgentNote, deleteAgent, getAgent, getTeammates, listAgentNotes, updateAgent } from "./agents.service.js";

const app = new Hono();

// GET /api/agents?page=1&limit=50&sorts=-createdAt&search=&status=active
app.get("/", (c) => {
  const user = (c as any).get("user") as { id: string; role: string } | undefined;
  const query = c.req.query();

  // Role-based filtering: admin sees all, member sees only own agents
  const ownerFilter = user && user.role !== "admin" ? eq(agents.createdBy, user.id) : undefined;

  const result = listQuery(
    {
      table: agents,
      searchColumns: ["name", "description"],
      ...(ownerFilter ? { where: ownerFilter } : {}),
    },
    query,
  );

  // Enrich with creator name
  const creatorIds = [...new Set(result.items.map((a: any) => a.createdBy).filter(Boolean))];
  const creatorMap = new Map<string, string>();
  if (creatorIds.length > 0) {
    const rows = getDb().select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, creatorIds)).all();
    for (const r of rows) creatorMap.set(r.id, r.name);
  }

  return c.json({
    ...result,
    items: result.items.map((a: any) => ({
      ...a,
      creatorName: a.createdBy ? (creatorMap.get(a.createdBy) ?? null) : null,
    })),
  });
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

// GET /api/agents/:id/notes?titlesOnly=1
app.get("/:id/notes", (c) => {
  const agentId = c.req.param("id");
  const titlesOnly = c.req.query("titlesOnly") === "1";
  const rows = listAgentNotes(agentId);
  if (titlesOnly) return c.json(rows.map((r) => ({ id: r.id, title: r.title })));
  return c.json(rows);
});

// POST /api/agents/:id/notes
app.post("/:id/notes", async (c) => {
  const body = await c.req.json<{ title: string; content?: string }>();
  return c.json(createAgentNote(c.req.param("id"), body), 201);
});

// GET /api/agents/:id/teammates
app.get("/:id/teammates", (c) => c.json(getTeammates(c.req.param("id"))));

// ─── Tool Assignments ────────────────────────────────────────────────────────

// GET /api/agents/:id/tool-assignments
app.get("/:id/tool-assignments", (c) => {
  return c.json(listAssignments(c.req.param("id")));
});

// PUT /api/agents/:id/tool-assignments — replace all
app.put("/:id/tool-assignments", async (c) => {
  const body = await c.req.json<{ items: { toolId: string; parameters?: Record<string, unknown> }[] }>();
  return c.json(setAssignments(c.req.param("id"), body.items ?? (body as any)));
});

// POST /api/agents/:id/tool-assignments — add one
app.post("/:id/tool-assignments", async (c) => {
  const body = await c.req.json<{ toolId: string; parameters?: Record<string, unknown> }>();
  const result = addAssignment(c.req.param("id"), body);
  if (!result) throw new BadRequestException("Failed to add assignment");
  return c.json(result, 201);
});

// DELETE /api/agents/:id/tool-assignments/:aid
app.delete("/:id/tool-assignments/:aid", (c) => {
  removeAssignment(c.req.param("aid"));
  return c.json({ ok: true });
});

export default app;
