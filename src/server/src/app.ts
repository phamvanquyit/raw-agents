import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { HttpException } from "./common/exceptions/http.exception.js";
import { resolveAuth } from "./common/middleware/auth.middleware.js";

import agentsRoute from "./modules/agents/agents.route.js";
import conversationsRoute from "./modules/conversations/conversations.route.js";
import providersRoute from "./modules/llm-providers/llm-providers.route.js";
import settingsRoute from "./modules/settings/settings.route.js";
import teamsRoute from "./modules/teams/teams.route.js";
import toolsRoute from "./modules/tools/tools.route.js";

import chatRoute from "./modules/agents/chat.route.js";
import publicRoute from "./modules/public/public.route.js";

import promptAssistantRoute from "./modules/agents/assistant/prompt.route.js";

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
  app.route("/api/agents", chatRoute); // chat + generate endpoints
  app.route("/api/conversations", conversationsRoute);
  app.route("/api/tools", toolsRoute);
  app.route("/api/providers", providersRoute);
  app.route("/api/settings", settingsRoute);
  app.route("/api/teams", teamsRoute);

  app.route("/api/assistants/prompt", promptAssistantRoute);

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
    // - Nếu path trỏ đến file thật trong dist/ → serve file đó (JS, CSS, SVG, ảnh...)
    // - Nếu không có → trả index.html để React Router tự xử lý route (SPA fallback)
    app.get("*", async (c) => {
      const filePath = join(webDist, c.req.path);
      if (c.req.path !== "/" && existsSync(filePath)) {
        return new Response(Bun.file(filePath));
      }
      return new Response(Bun.file(join(webDist, "index.html")), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
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
