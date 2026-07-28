import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { HttpException } from "./common/exceptions/http.exception.js";
import { resolveAuth } from "./common/middleware/auth.middleware.js";
import { buildSpaHtml, requestOrigin } from "./common/spa-html.js";

import agentsRoute from "./modules/agents/agents.route.js";
import conversationsRoute from "./modules/conversations/conversations.route.js";
import datatablesRoute from "./modules/datatables/datatables.route.js";
import jobsRoute from "./modules/jobs/jobs.route.js";
import kvstoreRoute from "./modules/kvstore/kvstore.route.js";
import providersRoute from "./modules/llm-providers/llm-providers.route.js";
import mcpServersRoute from "./modules/mcp-servers/mcp-servers.route.js";
import secretsRoute from "./modules/secrets/secrets.route.js";
import settingsRoute from "./modules/settings/settings.route.js";
import statsRoute from "./modules/stats/stats.route.js";
import teamsRoute from "./modules/teams/teams.route.js";
import toolFoldersRoute from "./modules/tool-folders/tool-folders.route.js";
import toolsRoute from "./modules/tools/tools.route.js";
import usageRoute from "./modules/usage/usage.route.js";

import publicRoute from "./modules/public/public.route.js";
import sitesRoute from "./modules/sites/sites.route.js";

import authRoute from "./modules/auth/auth.route.js";
import usersRoute from "./modules/users/users.route.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp(): Hono {
  const app = new Hono();

  // ── Middleware ─────────────────────────────────────────────────────────────
  app.use("*", logger());
  app.use(
    "/api/*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  // ── Auth middleware — resolve JWT on all /api/* routes ─────────────────────
  app.use("/api/*", resolveAuth);

  // ── Global error handler (NestJS-style exceptions) ────────────────────────
  app.onError((err, c) => {
    if (err instanceof HttpException) {
      return c.json({ code: err.statusCode, message: err.message }, err.statusCode as any);
    }
    console.error("[Unhandled]", err);
    return c.json({ code: 500, message: "Internal Server Error" }, 500);
  });

  // ── API Routes ─────────────────────────────────────────────────────────────
  // Auth routes (login is public, me/change-password check auth internally)
  app.route("/api/auth", authRoute);

  app.route("/api/agents", agentsRoute);
  app.route("/api/conversations", conversationsRoute);
  app.route("/api/tools", toolsRoute);
  app.route("/api/tool-folders", toolFoldersRoute);
  app.route("/api/providers", providersRoute);
  app.route("/api/mcp-servers", mcpServersRoute);
  app.route("/api/kvstore", kvstoreRoute);
  app.route("/api/datatables", datatablesRoute);
  app.route("/api/sites", sitesRoute);
  app.route("/api/secrets", secretsRoute);
  app.route("/api/jobs", jobsRoute);
  app.route("/api/settings", settingsRoute);
  app.route("/api/teams", teamsRoute);
  app.route("/api/stats", statsRoute);
  app.route("/api/usage", usageRoute);

  app.route("/api/users", usersRoute);

  app.route("/api/public", publicRoute);

  // ── Health check ───────────────────────────────────────────────────────────
  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      app: "raw-agents",
      version: "0.1.0",
      runtime: "bun",
    }),
  );

  // ── Serve web build (SPA) ──────────────────────────────────────────────────
  const webDistPaths = [join(__dirname, "../../web/dist"), join(__dirname, "../public")];

  const webDist = webDistPaths.find((p) => existsSync(join(p, "index.html")));

  if (webDist) {
    // Unified static handler:
    // - Real files in dist/ (JS, CSS, favicon, og-image, …) are served as-is
    // - Everything else → index.html SPA fallback with absolute OG/Twitter meta
    //   (required for /chat/:id link previews — crawlers don't run React)
    const indexPath = join(webDist, "index.html");
    app.get("*", async (c) => {
      const reqPath = c.req.path;
      const filePath = join(webDist, reqPath);
      if (reqPath !== "/" && existsSync(filePath)) {
        const res = new Response(Bun.file(filePath));
        // OG image is hot-linked by chatrooms — allow long cache once shipped
        if (reqPath === "/og-image.png") {
          res.headers.set("Cache-Control", "public, max-age=86400");
        }
        return res;
      }

      const baseHtml = await Bun.file(indexPath).text();
      const html = buildSpaHtml(baseHtml, {
        origin: requestOrigin(c.req.raw),
        path: reqPath,
      });
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          // Don't cache HTML so OG title follows agent renames
          "Cache-Control": "no-cache",
        },
      });
    });
  } else {
    app.get("/", (c) =>
      c.json({
        ok: true,
        app: "raw-agents",
        message: "Web UI not built yet.",
      }),
    );
  }

  return app;
}
