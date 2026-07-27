import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch } from "cloakbrowser";
import type { Browser } from "playwright-core";
import { type SiteTree, getSiteRoot, treeContentHash } from "./sites-fs.js";
import { runSiteGet } from "./sites-runtime.js";

const VIEWPORT = { width: 1280, height: 800 };
const LAUNCH_TIMEOUT_MS = 45_000;
const NAV_TIMEOUT_MS = 20_000;
const CAPTURE_VERSION = "2";

/** Minimal 1×1 PNG used when browser capture is unavailable. */
const PLACEHOLDER_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const inflight = new Map<string, Promise<Buffer>>();
let browserChain: Promise<void> = Promise.resolve();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function thumbnailPath(siteId: string) {
  return join(getSiteRoot(siteId), "thumbnail.png");
}

function thumbnailMetaPath(siteId: string) {
  return join(getSiteRoot(siteId), "thumbnail.hash");
}

function thumbnailSrcPath(siteId: string) {
  return join(getSiteRoot(siteId), "thumbnail-src.html");
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function readCachedHash(siteId: string): string | null {
  const meta = thumbnailMetaPath(siteId);
  if (!existsSync(meta)) return null;
  try {
    return readFileSync(meta, "utf8").trim();
  } catch {
    return null;
  }
}

function isThumbnailFresh(siteId: string, tree: SiteTree): boolean {
  const path = thumbnailPath(siteId);
  if (!existsSync(path)) return false;
  try {
    if (statSync(path).size < 8) return false;
  } catch {
    return false;
  }
  return readCachedHash(siteId) === `${CAPTURE_VERSION}:${treeContentHash(siteId, tree)}`;
}

async function captureHtmlToPng(siteId: string, html: string, outPath: string): Promise<void> {
  let browser: Browser | null = null;
  const srcPath = thumbnailSrcPath(siteId);
  try {
    writeFileSync(srcPath, html || "<html><body></body></html>", "utf8");
    browser = await withTimeout(
      launch({
        headless: true,
        humanize: false,
      }),
      LAUNCH_TIMEOUT_MS,
      "Thumbnail browser launch",
    );
    const page = await browser.newPage();
    await page.setViewportSize(VIEWPORT);
    await page.goto(`file://${srcPath}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.screenshot({
      path: outPath,
      type: "png",
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (existsSync(srcPath)) unlinkSync(srcPath);
  }
}

async function generateThumbnail(siteId: string, tree: SiteTree): Promise<Buffer> {
  const root = getSiteRoot(siteId);
  mkdirSync(root, { recursive: true });
  const out = thumbnailPath(siteId);
  const hash = treeContentHash(siteId, tree);

  try {
    const preview = await runSiteGet(siteId, tree, { bypassCache: true });
    const html = typeof preview.html === "string" ? preview.html : "";

    await new Promise<void>((resolve, reject) => {
      browserChain = browserChain
        .then(async () => {
          await captureHtmlToPng(siteId, html, out);
        })
        .then(resolve, reject);
    });

    if (!existsSync(out) || statSync(out).size < 8) {
      writeFileSync(out, PLACEHOLDER_PNG);
    }
  } catch {
    writeFileSync(out, PLACEHOLDER_PNG);
  }

  writeFileSync(thumbnailMetaPath(siteId), `${CAPTURE_VERSION}:${hash}`, "utf8");
  return readFileSync(out);
}

/** Return cached thumbnail bytes, regenerating when missing or stale. */
export async function ensureSiteThumbnail(siteId: string, tree: SiteTree = "draft"): Promise<Buffer> {
  if (isThumbnailFresh(siteId, tree)) {
    return readFileSync(thumbnailPath(siteId));
  }

  const key = `${siteId}:${tree}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const job = generateThumbnail(siteId, tree).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}

/** Fire-and-forget refresh after source changes (debounced). */
export function refreshSiteThumbnail(siteId: string, tree: SiteTree = "draft"): void {
  const key = `${siteId}:${tree}`;
  const prev = debounceTimers.get(key);
  if (prev) clearTimeout(prev);
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      void ensureSiteThumbnail(siteId, tree).catch(() => undefined);
    }, 1500),
  );
}

export function hasSiteThumbnail(siteId: string, tree: SiteTree = "draft"): boolean {
  return isThumbnailFresh(siteId, tree);
}
