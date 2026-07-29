/**
 * SPA HTML helpers — inject absolute Open Graph / Twitter meta so link previews
 * (Slack, iMessage, Discord, Facebook, …) work when sharing /chat/:id.
 *
 * Crawlers do not execute React; tags must be in the HTML response itself.
 */

import { eq } from "drizzle-orm";
import { agents, getDb } from "./db/client.js";

const DEFAULT_TITLE = "Raw Agents";
const DEFAULT_DESCRIPTION = "Raw Agents — AI Agent Management Platform";
const OG_IMAGE_PATH = "/og-image.png";
const OG_IMAGE_WIDTH = "1731";
const OG_IMAGE_HEIGHT = "909";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Resolve public origin, honouring reverse-proxy forwarded headers. */
export function requestOrigin(req: Request): string {
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (xfHost) {
    const proto = (xfProto?.split(",")[0]?.trim() || "https").replace(/:$/, "");
    return `${proto}://${xfHost.split(",")[0].trim()}`;
  }
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function isHttpOrigin(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Public base URL for absolute links in prompts / OG / share URLs.
 * Priority: PUBLIC_BASE_URL (or PUBLIC_URL) env → client origin → requestOrigin (X-Forwarded-* / Host).
 */
export function resolvePublicBaseUrl(opts: { request?: Request; clientOrigin?: string | null } = {}): string {
  const fromEnv = normalizeBaseUrl(process.env.PUBLIC_BASE_URL ?? process.env.PUBLIC_URL ?? "");
  if (fromEnv && isHttpOrigin(fromEnv)) return fromEnv;

  const fromClient = normalizeBaseUrl(opts.clientOrigin ?? "");
  if (fromClient && isHttpOrigin(fromClient)) return fromClient;

  if (opts.request) {
    const fromReq = normalizeBaseUrl(requestOrigin(opts.request));
    if (fromReq && isHttpOrigin(fromReq)) return fromReq;
  }

  return "";
}

function loadPublicChatOg(agentId: string): { title: string; description: string } | null {
  try {
    const db = getDb();
    const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
    if (!agent?.isPublic) return null;
    const name = agent.name?.trim() || "AI Agent";
    const title = `${name} · Raw Agents`;
    const description = (agent.description?.trim() || `Chat with ${name} on Raw Agents.`).slice(0, 300);
    return { title, description };
  } catch {
    return null;
  }
}

/**
 * Rewrite index.html with absolute OG/Twitter tags.
 * For `/chat/:agentId`, title/description come from the public agent when available.
 */
export function buildSpaHtml(baseHtml: string, opts: { origin: string; path: string }): string {
  const origin = opts.origin.replace(/\/$/, "");
  const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;
  const pageUrl = `${origin}${path === "/" ? "/" : path}`;
  const imageUrl = `${origin}${OG_IMAGE_PATH}`;

  let title = DEFAULT_TITLE;
  let description = DEFAULT_DESCRIPTION;

  const chatMatch = path.match(/^\/chat\/([^/?#]+)\/?$/);
  if (chatMatch) {
    const meta = loadPublicChatOg(decodeURIComponent(chatMatch[1]));
    if (meta) {
      title = meta.title;
      description = meta.description;
    }
  }

  // Drop tags we re-inject so rebuilds/dev HTML don't duplicate.
  const html = baseHtml
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, "")
    .replace(/<meta\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, "");

  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(pageUrl);
  const img = escapeHtml(imageUrl);

  const tags = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Raw Agents" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${t}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
  ].join("\n    ");

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `    ${tags}\n  </head>`);
  }
  // Malformed shell — still prepend tags
  return `${tags}\n${html}`;
}
