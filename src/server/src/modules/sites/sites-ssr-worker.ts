/**
 * SSR worker entry — runs in a Bun subprocess. No SQLite / no Hono.
 * Speaks to parent via RAWAGENTS_URL + RAWAGENTS_TOKEN.
 * Writes one JSON line to stdout: { ok, html?, data? } | { ok, result? } | { ok:false, error }.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createSiteRawagentsHttpClient } from "./sites-rawagents-http.js";

const LOADER_TIMEOUT_MS = 12_000;
const RENDER_TIMEOUT_MS = 8_000;
const IMPORT_TIMEOUT_MS = 8_000;
const ACTION_TIMEOUT_MS = 15_000;

interface SiteModule {
  [key: string]: unknown;
}

interface SerializedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function emit(payload: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function importSiteFile(runtimeDir: string, file: string): Promise<SiteModule> {
  const full = join(runtimeDir, file);
  if (!existsSync(full)) throw new Error(`Missing ${file}`);
  return await withTimeout(import(pathToFileURL(full).href) as Promise<SiteModule>, IMPORT_TIMEOUT_MS, `import ${file}`);
}

async function resolveRenderToStaticMarkup(treeDir: string): Promise<(element: unknown) => string> {
  const candidates = [
    join(treeDir, "node_modules", "react-dom", "server.js"),
    join(treeDir, "node_modules", "react-dom", "server.browser.js"),
    join(treeDir, "node_modules", "react-dom", "cjs", "react-dom-server.node.production.js"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const mod = (await import(pathToFileURL(p).href)) as { renderToStaticMarkup?: (el: unknown) => string };
    if (typeof mod.renderToStaticMarkup === "function") {
      return mod.renderToStaticMarkup.bind(mod);
    }
  }
  const host = (await import("react-dom/server")) as { renderToStaticMarkup: (el: unknown) => string };
  return host.renderToStaticMarkup.bind(host);
}

function buildRequest(query: Record<string, string>, serialized?: SerializedRequest | null): Request {
  if (serialized) {
    return new Request(serialized.url, {
      method: serialized.method,
      headers: serialized.headers,
      body: serialized.method === "GET" || serialized.method === "HEAD" ? undefined : serialized.body || undefined,
    });
  }
  return new Request(`http://site.local/?${new URLSearchParams(query)}`);
}

async function loadSerializedRequest(): Promise<SerializedRequest | null> {
  const path = process.env.SITE_REQUEST_PATH;
  if (!path || !existsSync(path)) return null;
  const text = await Bun.file(path).text();
  return JSON.parse(text) as SerializedRequest;
}

async function runGet(runtimeDir: string, treeDir: string) {
  const query = JSON.parse(process.env.SITE_QUERY_JSON || "{}") as Record<string, string>;
  const serialized = await loadSerializedRequest();
  const request = buildRequest(query, serialized);
  const rawagents = createSiteRawagentsHttpClient();

  const loaderMod = await importSiteFile(runtimeDir, "loader.js");

  let data: unknown = {};
  const loaderFn = loaderMod.loader;
  if (typeof loaderFn === "function") {
    data = await withTimeout(
      Promise.resolve(
        (loaderFn as (args: { request: Request; params: Record<string, string>; rawagents: unknown; query: Record<string, string> }) => unknown)({
          request,
          params: {},
          rawagents,
          query,
        }),
      ),
      LOADER_TIMEOUT_MS,
      "loader",
    );
  }

  const routeMod = await importSiteFile(runtimeDir, "route.jsx");
  const Route = routeMod.default;
  if (typeof Route !== "function") {
    throw new Error("route.jsx must default-export a React component");
  }

  const element = (Route as (props: { loaderData: unknown }) => unknown)({ loaderData: data });
  const renderToStaticMarkup = await resolveRenderToStaticMarkup(treeDir);
  const html = await withTimeout(
    Promise.resolve().then(() => renderToStaticMarkup(element)),
    RENDER_TIMEOUT_MS,
    "render",
  );

  emit({ ok: true, html, data });
}

async function runAction(runtimeDir: string) {
  const serialized = await loadSerializedRequest();
  if (!serialized) throw new Error("SITE_REQUEST_PATH is required for action jobs");
  const request = buildRequest({}, serialized);
  const rawagents = createSiteRawagentsHttpClient();

  const actionMod = await importSiteFile(runtimeDir, "action.js");
  const actionFn = actionMod.action;
  if (typeof actionFn !== "function") {
    throw new Error("action.js must export async function action");
  }

  const result = await withTimeout(
    Promise.resolve(
      (actionFn as (args: { request: Request; params: Record<string, string>; rawagents: unknown }) => unknown)({
        request,
        params: {},
        rawagents,
      }),
    ),
    ACTION_TIMEOUT_MS,
    "action",
  );

  // Response objects (Remix-style redirects) are not JSON-serializable — normalize for the host.
  if (result instanceof Response) {
    emit({
      ok: true,
      result: {
        ok: result.ok,
        status: result.status,
        redirect: result.status >= 300 && result.status < 400,
        location: result.headers.get("Location"),
      },
    });
    return;
  }

  emit({ ok: true, result });
}

async function main() {
  const job = process.env.SITE_JOB;
  const runtimeDir = process.env.SITE_RUNTIME_DIR;
  const treeDir = process.env.SITE_TREE_DIR;

  if (!job || !runtimeDir) {
    throw new Error("SITE_JOB and SITE_RUNTIME_DIR are required");
  }

  if (job === "get") {
    if (!treeDir) throw new Error("SITE_TREE_DIR is required for get jobs");
    await runGet(runtimeDir, treeDir);
    // Force exit — pending loader fetches must not keep the event loop alive.
    process.exit(0);
  }
  if (job === "action") {
    await runAction(runtimeDir);
    process.exit(0);
  }
  throw new Error(`Unknown SITE_JOB: ${job}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  emit({ ok: false, error: message });
  // exit() not exitCode — hung fetch/timers after withTimeout must not block the parent.
  process.exit(1);
});
