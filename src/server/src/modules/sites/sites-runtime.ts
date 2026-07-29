import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { injectJsxSourceAnchors } from "./common/inject-jsx-anchors.js";
import { PLATFORM_RA_UI_JSX } from "./platform/ra-ui-source.js";
import { SITE_RUNTIME_FILES, type SiteTree, getTreeDir, readSourceFile, treeContentHash } from "./sites-fs.js";
import { type SiteSsrActionResult, type SiteSsrGetResult, runSiteJobInWorker } from "./sites-ssr-runner.js";

const PLATFORM_RA_UI_FILE = "ra-ui.jsx";

/** Bumps on invalidate so dynamic import URLs never reuse a stale Bun module graph. */
const importGeneration = new Map<string, number>();
/** Serialize SSR per site so rematerialize/import cannot race across concurrent previews. */
const siteRunLocks = new Map<string, Promise<unknown>>();

function treeKey(siteId: string, tree: SiteTree) {
  return `${siteId}:${tree}`;
}

/** Drop cached module generations so the next SSR rematerializes. (No HTML page cache.) */
export function invalidateSiteCaches(siteId: string) {
  for (const tree of ["prod", "draft"] as SiteTree[]) {
    const tk = treeKey(siteId, tree);
    importGeneration.set(tk, (importGeneration.get(tk) ?? 0) + 1);
  }
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function sanitizeCss(css: string): string {
  return css
    .replace(/<\/style/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/javascript:/gi, "");
}

/** UA default body margin shows as a white frame in iframe srcDoc / bare documents. */
const PLATFORM_BASE_CSS = "html,body{margin:0;padding:0}";

/**
 * Capture-phase guard: POST forms must never navigate the iframe (srcDoc → /public/… = white screen).
 * Notify the parent via postMessage so it can call the action API (contentDocument listeners are unreliable with srcDoc remounts).
 */
const PLATFORM_FORM_GUARD = `<script data-ra-form-guard>
(function () {
  // srcDoc documents often report origin "null" — never use that as postMessage targetOrigin.
  var formBusy = false;

  function setFormBusy(busy) {
    formBusy = !!busy;
    document.documentElement.style.pointerEvents = formBusy ? "none" : "";
    document.documentElement.style.opacity = formBusy ? "0.65" : "";
  }

  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    if (!e.data || e.data.type !== "ra-site-form-busy") return;
    setFormBusy(!!e.data.busy);
  });

  document.addEventListener(
    "submit",
    function (e) {
      var f = e.target;
      if (!f || f.tagName !== "FORM") return;
      var method = (f.getAttribute("method") || "get").toLowerCase();
      if (method !== "post" && !f.hasAttribute("data-site-action")) return;
      e.preventDefault();
      e.stopPropagation();
      if (formBusy) return;
      try {
        var fd = new FormData(f);
        var entries = [];
        fd.forEach(function (v, k) {
          if (typeof v === "string") entries.push([k, v]);
        });
        var path = f.getAttribute("data-site-path") || undefined;
        parent.postMessage({ type: "ra-site-form-submit", entries: entries, path: path }, "*");
      } catch (err) {
        /* ignore */
      }
    },
    true,
  );
})();
</script>`;

function injectSiteStyles(siteId: string, tree: SiteTree, html: string): string {
  const css = sanitizeCss(readSourceFile(siteId, tree, "styles.css")).trim();
  const parts = [`<style data-ra-base>${PLATFORM_BASE_CSS}</style>`];
  if (css) parts.push(`<style>${css}</style>`);
  parts.push(html);
  parts.push(PLATFORM_FORM_GUARD);
  return parts.join("");
}

/** Bump when draft runtime transforms change (forces rematerialize even if source hash is unchanged). */
const DRAFT_RUNTIME_REV = "ra-ui-v1";

function runtimeStamp(siteId: string, tree: SiteTree): string {
  const content = treeContentHash(siteId, tree);
  return tree === "draft" ? `${content}:${DRAFT_RUNTIME_REV}` : `${content}:ra-ui-v1`;
}

/** Mirror sources into a unique dir so Bun never reuses a stale ESM module graph. */
function materializeRuntimeDir(siteId: string, tree: SiteTree): string {
  const dir = getTreeDir(siteId, tree);
  const key = treeKey(siteId, tree);
  let gen = importGeneration.get(key) ?? 0;
  const runtimeRoot = join(dir, ".runtime");
  const stamp = runtimeStamp(siteId, tree);

  const dirFor = (g: number) => join(runtimeRoot, String(g));
  const stampPath = (g: number) => join(dirFor(g), ".stamp");
  const markerPath = (g: number) => join(dirFor(g), "loader.js");
  const platformUiPath = (g: number) => join(dirFor(g), PLATFORM_RA_UI_FILE);

  const stampOk =
    existsSync(stampPath(gen)) && readFileSync(stampPath(gen), "utf8") === stamp && existsSync(markerPath(gen)) && existsSync(platformUiPath(gen));
  if (!stampOk) {
    // Reuse of an old gen folder (process restart) or new transform rev → always new dir for Bun import cache
    if (existsSync(markerPath(gen))) {
      gen += 1;
      importGeneration.set(key, gen);
    }
    const runtimeDir = dirFor(gen);
    mkdirSync(runtimeDir, { recursive: true });
    for (const file of SITE_RUNTIME_FILES) {
      const src = join(dir, file);
      if (!existsSync(src)) throw new BadRequestException(`Missing ${file} in ${tree}`);
      // Draft preview: inject data-ra source anchors so Inspect can map DOM → JSX lines.
      // Prod stays clean (no editor attributes in public HTML).
      if (tree === "draft" && file === "route.jsx") {
        const raw = readFileSync(src, "utf8");
        writeFileSync(join(runtimeDir, file), injectJsxSourceAnchors(raw, "route.jsx"), "utf8");
      } else {
        copyFileSync(src, join(runtimeDir, file));
      }
    }
    writeFileSync(join(runtimeDir, PLATFORM_RA_UI_FILE), PLATFORM_RA_UI_JSX, "utf8");
    writeFileSync(join(runtimeDir, ".gen"), String(gen), "utf8");
    writeFileSync(stampPath(gen), stamp, "utf8");
    queueRuntimeCleanup(runtimeRoot, gen);
  }

  importGeneration.set(key, gen);
  return dirFor(gen);
}

const RUNTIME_KEEP_GENS = 5;
const pendingCleanups = new Set<string>();

function queueRuntimeCleanup(runtimeRoot: string, currentGen: number) {
  const key = runtimeRoot;
  if (pendingCleanups.has(key)) return;
  pendingCleanups.add(key);
  setTimeout(() => {
    pendingCleanups.delete(key);
    try {
      if (!existsSync(runtimeRoot)) return;
      const names = readdirSync(runtimeRoot)
        .map((n) => ({ name: n, gen: Number(n) }))
        .filter((x) => Number.isFinite(x.gen))
        .sort((a, b) => b.gen - a.gen);
      for (const item of names.slice(RUNTIME_KEEP_GENS)) {
        if (item.gen >= currentGen) continue;
        try {
          rmSync(join(runtimeRoot, item.name), { recursive: true, force: true });
        } catch {
          /* ignore busy dir */
        }
      }
    } catch {
      /* ignore */
    }
  }, 15_000);
}

export interface RunSiteResult {
  html: string;
  data: unknown;
  cached: boolean;
}

async function runSiteGetUnlocked(siteId: string, tree: SiteTree, opts: { request?: Request; query?: Record<string, string> } = {}): Promise<RunSiteResult> {
  const query = opts.query ?? {};
  const treeDir = getTreeDir(siteId, tree);
  const runtimeDir = materializeRuntimeDir(siteId, tree);
  const request = opts.request ?? new Request(`http://site.local/?${new URLSearchParams(query)}`);

  const workerResult = (await runSiteJobInWorker({
    runtimeDir,
    treeDir,
    job: "get",
    query,
    request,
  })) as SiteSsrGetResult;

  const html = injectSiteStyles(siteId, tree, sanitizeHtml(workerResult.html));
  return { html, data: workerResult.data, cached: false };
}

/** Max wait for a previous SSR of the same site (prevents permanent queue stall). */
const SITE_LOCK_WAIT_MS = 25_000;

export async function runSiteGet(siteId: string, tree: SiteTree, opts: { request?: Request; query?: Record<string, string> } = {}): Promise<RunSiteResult> {
  const lockKey = `${siteId}:${tree}`;
  const prev = siteRunLocks.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const ourTurn = new Promise<void>((r) => {
    release = r;
  });
  // Next callers wait on our release — not prev.then(gate), so a steal on timeout
  // still lets the queue advance when we finish.
  siteRunLocks.set(lockKey, ourTurn);

  await Promise.race([prev.then(() => undefined).catch(() => undefined), new Promise<void>((r) => setTimeout(r, SITE_LOCK_WAIT_MS))]);

  try {
    return await runSiteGetUnlocked(siteId, tree, opts);
  } finally {
    release();
    if (siteRunLocks.get(lockKey) === ourTurn) siteRunLocks.delete(lockKey);
  }
}

export async function runSiteAction(siteId: string, tree: SiteTree, opts: { request: Request }): Promise<{ result: unknown }> {
  const treeDir = getTreeDir(siteId, tree);
  const runtimeDir = materializeRuntimeDir(siteId, tree);

  const workerResult = (await runSiteJobInWorker({
    runtimeDir,
    treeDir,
    job: "action",
    request: opts.request,
  })) as SiteSsrActionResult;

  const result = workerResult.result;
  invalidateSiteCaches(siteId);
  return { result };
}
