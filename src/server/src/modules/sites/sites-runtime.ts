import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { injectJsxSourceAnchors } from "./common/inject-jsx-anchors.js";
import { SITE_RUNTIME_FILES, type SiteTree, getTreeDir, readSourceFile, treeContentHash } from "./sites-fs.js";
import { type SiteSsrActionResult, type SiteSsrGetResult, runSiteJobInWorker } from "./sites-ssr-runner.js";

type PageCacheEntry = { html: string; data: unknown; expiresAt: number; hash: string };

/** Public SSR page cache — managed by the runtime, not by site authors. */
const PAGE_CACHE_TTL_MS = 60_000;
const PAGE_CACHE_MAX_ENTRIES = 200;

const pageCache = new Map<string, PageCacheEntry>();
/** Bumps on invalidate so dynamic import URLs never reuse a stale Bun module graph. */
const importGeneration = new Map<string, number>();
/** Serialize SSR per site so rematerialize/import cannot race across concurrent previews. */
const siteRunLocks = new Map<string, Promise<unknown>>();

function cacheKey(siteId: string, tree: SiteTree, queryKey: string) {
  return `${tree}:${siteId}:${queryKey}`;
}

function treeKey(siteId: string, tree: SiteTree) {
  return `${siteId}:${tree}`;
}

function prunePageCache(now = Date.now()) {
  for (const [key, entry] of pageCache) {
    if (entry.expiresAt <= now) pageCache.delete(key);
  }
  while (pageCache.size > PAGE_CACHE_MAX_ENTRIES) {
    const oldest = pageCache.keys().next().value;
    if (oldest === undefined) break;
    pageCache.delete(oldest);
  }
}

function getPageCache(key: string, hash: string): PageCacheEntry | undefined {
  const hit = pageCache.get(key);
  if (!hit) return undefined;
  if (hit.hash !== hash || hit.expiresAt <= Date.now()) {
    pageCache.delete(key);
    return undefined;
  }
  // Refresh LRU order
  pageCache.delete(key);
  pageCache.set(key, hit);
  return hit;
}

function setPageCache(key: string, entry: PageCacheEntry) {
  pageCache.delete(key);
  pageCache.set(key, entry);
  prunePageCache();
}

export function invalidateSiteCaches(siteId: string) {
  for (const key of [...pageCache.keys()]) {
    if (key.startsWith(`prod:${siteId}:`) || key.startsWith(`draft:${siteId}:`)) {
      pageCache.delete(key);
    }
  }
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

function injectSiteStyles(siteId: string, tree: SiteTree, html: string): string {
  const css = sanitizeCss(readSourceFile(siteId, tree, "styles.css")).trim();
  const parts = [`<style data-ra-base>${PLATFORM_BASE_CSS}</style>`];
  if (css) parts.push(`<style>${css}</style>`);
  parts.push(html);
  return parts.join("");
}

/** Bump when draft runtime transforms change (forces rematerialize even if source hash is unchanged). */
const DRAFT_RUNTIME_REV = "anchors-v1";

function runtimeStamp(siteId: string, tree: SiteTree): string {
  const content = treeContentHash(siteId, tree);
  return tree === "draft" ? `${content}:${DRAFT_RUNTIME_REV}` : `${content}:plain`;
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

  const stampOk = existsSync(stampPath(gen)) && readFileSync(stampPath(gen), "utf8") === stamp && existsSync(markerPath(gen));
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

async function runSiteGetUnlocked(
  siteId: string,
  tree: SiteTree,
  opts: { request?: Request; query?: Record<string, string>; bypassCache?: boolean } = {},
): Promise<RunSiteResult> {
  const query = opts.query ?? {};
  const queryKey = JSON.stringify(query);
  const hash = treeContentHash(siteId, tree);
  const key = cacheKey(siteId, tree, queryKey);

  if (!opts.bypassCache) {
    const hit = getPageCache(key, hash);
    if (hit) return { html: hit.html, data: hit.data, cached: true };
  }

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
  const data = workerResult.data;

  if (!opts.bypassCache) {
    setPageCache(key, {
      html,
      data,
      hash,
      expiresAt: Date.now() + PAGE_CACHE_TTL_MS,
    });
  }

  return { html, data, cached: false };
}

export async function runSiteGet(
  siteId: string,
  tree: SiteTree,
  opts: { request?: Request; query?: Record<string, string>; bypassCache?: boolean } = {},
): Promise<RunSiteResult> {
  const lockKey = `${siteId}:${tree}`;
  const prev = siteRunLocks.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const chained = prev.then(() => gate);
  siteRunLocks.set(lockKey, chained);

  await prev.catch(() => undefined);
  try {
    return await runSiteGetUnlocked(siteId, tree, opts);
  } finally {
    release();
    if (siteRunLocks.get(lockKey) === chained) siteRunLocks.delete(lockKey);
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
