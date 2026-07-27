import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import { type SiteAgentStreamRequest, streamSiteAgent } from "./services/site-agent.service.js";
import * as svc from "./sites.service.js";

const app = new Hono();

app.use("*", requireAuth);

function authUser(c: { get: (k: string) => unknown }): svc.SiteActor {
  return c.get("user") as svc.SiteActor;
}

app.get("/", (c) => c.json(svc.listSites(c.req.query(), authUser(c))));

app.post("/", async (c) => {
  const body = await c.req.json<{ name?: string; slug?: string }>();
  const user = authUser(c);
  return c.json(await svc.createSite({ ...body, createdBy: user.id }), 201);
});

app.get("/:id", (c) => {
  const id = c.req.param("id");
  svc.requireSiteAccess(id, authUser(c));
  return c.json(svc.getSite(id));
});

app.put("/:id", async (c) => {
  const id = c.req.param("id");
  svc.requireSiteAccess(id, authUser(c));
  const body = await c.req.json();
  return c.json(await svc.updateSite(id, body));
});

app.delete("/:id", (c) => {
  const id = c.req.param("id");
  svc.requireSiteAccess(id, authUser(c));
  return c.json(svc.deleteSite(id));
});

app.get("/:id/files", (c) => {
  const id = c.req.param("id");
  svc.requireSiteAccess(id, authUser(c));
  const tree = c.req.query("tree") === "prod" ? "prod" : "draft";
  return c.json(svc.getSiteFiles(id, tree));
});

app.put("/:id/files/:file", async (c) => {
  const id = c.req.param("id");
  svc.requireSiteAccess(id, authUser(c));
  const body = await c.req.json<{ content?: string; tree?: string }>();
  if (typeof body.content !== "string") throw new BadRequestException("content is required");
  if (body.tree === "prod") {
    throw new BadRequestException("Cannot write production files directly; edit draft and approve");
  }
  return c.json(await svc.updateSiteFile(id, c.req.param("file"), body.content, "draft"));
});

app.post("/:id/install", async (c) => {
  const id = c.req.param("id");
  svc.requireSiteAccess(id, authUser(c));
  const body = (await c.req.json().catch(() => ({}))) as { tree?: string };
  const tree = body.tree === "prod" ? "prod" : "draft";
  return c.json(await svc.installDeps(id, tree));
});

app.post("/:id/preview", async (c) => {
  const id = c.req.param("id");
  svc.requireSiteAccess(id, authUser(c));
  const body = (await c.req.json().catch(() => ({}))) as { query?: Record<string, string>; tree?: string };
  const tree = body.tree === "prod" ? "prod" : "draft";
  try {
    const result = await svc.previewSite(id, body.query, tree);
    return c.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Always return a JSON body — avoid socket hang up on SSR failures
    return c.json({ ok: false, error: message, html: "", data: null, cached: false }, 422);
  }
});

app.get("/:id/thumbnail", async (c) => {
  const id = c.req.param("id");
  svc.requireSiteAccess(id, authUser(c));
  const tree = c.req.query("tree") === "prod" ? "prod" : "draft";
  const png = await svc.getSiteThumbnailPng(id, tree);
  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=60",
    },
  });
});

app.post("/:id/resolve-selection", async (c) => {
  const id = c.req.param("id");
  svc.requireSiteAccess(id, authUser(c));
  const body = await c.req.json<{
    sourceAnchor?: string;
    tagName?: string;
    className?: string;
    text?: string;
    outerHtml?: string;
  }>();
  return c.json(svc.resolveSelection(id, body ?? {}));
});

app.post("/:id/approve", async (c) => {
  const id = c.req.param("id");
  svc.requireSiteAccess(id, authUser(c));
  return c.json(await svc.approveSite(id));
});

app.post("/:id/discard", (c) => {
  const id = c.req.param("id");
  svc.requireSiteAccess(id, authUser(c));
  return c.json(svc.discardSiteDraft(id));
});

app.post("/:id/agent/stream", async (c) => {
  const siteId = c.req.param("id");
  svc.requireSiteAccess(siteId, authUser(c));
  const body = await c.req.json<SiteAgentStreamRequest>();
  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    await streamSiteAgent(siteId, body, stream, abort.signal);
  });
});

export default app;
