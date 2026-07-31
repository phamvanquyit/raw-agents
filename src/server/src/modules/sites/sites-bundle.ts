import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { PLATFORM_ENTRY_SOURCE, PLATFORM_SITE_API_SOURCE } from "./platform/site-api-source.js";
import { SITE_RUNTIME_FILES, type SiteTree, getTreeDir, readSourceFile, treeContentHash } from "./sites-fs.js";

const importGeneration = new Map<string, number>();
const BUNDLE_REV = "react-v5";

function treeKey(siteId: string, tree: SiteTree) {
  return `${siteId}:${tree}`;
}

export function invalidateSiteCaches(siteId: string) {
  for (const tree of ["prod", "draft"] as SiteTree[]) {
    const tk = treeKey(siteId, tree);
    importGeneration.set(tk, (importGeneration.get(tk) ?? 0) + 1);
  }
}

function runtimeStamp(siteId: string, tree: SiteTree) {
  return `${treeContentHash(siteId, tree)}:${BUNDLE_REV}`;
}

function materializeBundleDir(siteId: string, tree: SiteTree): string {
  const dir = getTreeDir(siteId, tree);
  const key = treeKey(siteId, tree);
  let gen = importGeneration.get(key) ?? 0;
  const bundleRoot = join(dir, ".bundle");
  const stamp = runtimeStamp(siteId, tree);

  const dirFor = (g: number) => join(bundleRoot, String(g));
  const stampPath = (g: number) => join(dirFor(g), ".stamp");
  const appPath = (g: number) => join(dirFor(g), "app.js");

  const stampOk = existsSync(stampPath(gen)) && readFileSync(stampPath(gen), "utf8") === stamp && existsSync(appPath(gen));
  if (stampOk) return dirFor(gen);

  if (existsSync(join(dirFor(gen), "app.tsx")) || existsSync(appPath(gen))) {
    gen += 1;
    importGeneration.set(key, gen);
  }

  const outDir = dirFor(gen);
  mkdirSync(outDir, { recursive: true });

  for (const file of SITE_RUNTIME_FILES) {
    const content = readSourceFile(siteId, tree, file);
    if (!content.trim()) throw new BadRequestException(`Missing ${file} in ${tree}`);
    writeFileSync(join(outDir, file), content, "utf8");
  }

  const css = readSourceFile(siteId, tree, "styles.css");
  writeFileSync(join(outDir, "styles.css"), minifyCss(css), "utf8");
  writeFileSync(join(outDir, "site-api.js"), PLATFORM_SITE_API_SOURCE, "utf8");
  writeFileSync(join(outDir, "entry.tsx"), PLATFORM_ENTRY_SOURCE, "utf8");

  return outDir;
}

export type SiteBundleResult = {
  dir: string;
  appJs: string;
  css: string;
  cached: boolean;
};

export async function buildSiteBundle(siteId: string, tree: SiteTree): Promise<SiteBundleResult> {
  const key = treeKey(siteId, tree);
  const genBefore = importGeneration.get(key) ?? 0;
  const outDir = materializeBundleDir(siteId, tree);
  const appJsPath = join(outDir, "app.js");
  const stamp = runtimeStamp(siteId, tree);
  const stampPath = join(outDir, ".stamp");

  if (existsSync(appJsPath) && existsSync(stampPath) && readFileSync(stampPath, "utf8") === stamp) {
    return {
      dir: outDir,
      appJs: readFileSync(appJsPath, "utf8"),
      css: readFileSync(join(outDir, "styles.css"), "utf8"),
      cached: true,
    };
  }

  const entry = join(outDir, "entry.tsx");
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: outDir,
    target: "browser",
    format: "esm",
    minify: true,
    sourcemap: "none",
    naming: "[name].[ext]",
  });

  if (!result.success) {
    const msg = (result.logs ?? []).map((l) => String(l)).join("\n") || "Bundle failed";
    throw new BadRequestException(`Site bundle failed: ${msg.slice(0, 2000)}`);
  }

  // Prefer entry.js / entry-*.js output → normalize to app.js
  if (!existsSync(appJsPath)) {
    const built = result.outputs.find((o) => o.path.endsWith(".js") && !o.path.includes("chunk"));
    if (!built) {
      const names = result.outputs.map((o) => o.path).join(", ");
      throw new BadRequestException(`Site bundle produced no JS output (got: ${names || "none"})`);
    }
    writeFileSync(appJsPath, await built.text(), "utf8");
  } else {
    // Bun may have written entry.js instead
  }

  // If Bun named the file entry.js, copy to app.js
  const entryJs = join(outDir, "entry.js");
  if (!existsSync(appJsPath) && existsSync(entryJs)) {
    writeFileSync(appJsPath, readFileSync(entryJs, "utf8"), "utf8");
  }
  if (!existsSync(appJsPath)) {
    const built = result.outputs.find((o) => o.path.endsWith(".js"));
    if (built) writeFileSync(appJsPath, await built.text(), "utf8");
  }
  if (!existsSync(appJsPath)) throw new BadRequestException("Site bundle produced no app.js");

  writeFileSync(stampPath, stamp, "utf8");
  // Drop older gens (keep current)
  const bundleRoot = join(getTreeDir(siteId, tree), ".bundle");
  try {
    const { readdirSync } = await import("node:fs");
    for (const name of readdirSync(bundleRoot)) {
      if (name === String(importGeneration.get(key) ?? genBefore)) continue;
      if (!/^\d+$/.test(name)) continue;
      rmSync(join(bundleRoot, name), { recursive: true, force: true });
    }
  } catch {
    /* ignore */
  }

  return {
    dir: outDir,
    appJs: readFileSync(appJsPath, "utf8"),
    css: readFileSync(join(outDir, "styles.css"), "utf8"),
    cached: false,
  };
}

export function buildSiteShellHtml(opts: {
  title: string;
  apiBase: string;
  slug: string;
  assetBase: string;
  siteToken?: string | null;
}): string {
  const qs = new URLSearchParams();
  if (opts.siteToken) qs.set("site_token", opts.siteToken);
  const q = qs.toString();
  const suffix = q ? `?${q}` : "";
  const cssHref = `${opts.assetBase}/styles.css${suffix}`;
  const jsHref = `${opts.assetBase}/app.js${suffix}`;

  return compactHtml(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="ra-site-api" content="${opts.apiBase}"/><meta name="ra-site-slug" content="${opts.slug}"/><title>${escapeHtml(opts.title)}</title><link rel="stylesheet" href="${cssHref}"/></head><body><div id="root"></div><script type="module" src="${jsHref}"></script></body></html>`,
  );
}

/** Escape JSON so it is safe inside a HTML <script> tag. */
export function serializeJsonForHtml(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Drop pretty whitespace from served HTML (keep script/json payloads intact). */
function compactHtml(html: string): string {
  return html.replace(/>\s+</g, "><").trim();
}

/** Lightweight CSS minify — strip comments + collapse whitespace. */
export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>~+])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

export function buildSiteUnlockHtml(opts: { title: string; slug: string; error?: string }) {
  const err = opts.error ? `<p style="color:#b91c1c;font-size:13px">${escapeHtml(opts.error)}</p>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
  <style>
    body{margin:0;font-family:system-ui,sans-serif;background:#fafafa;color:#111}
    .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{width:100%;max-width:360px;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:28px}
    h1{font-size:18px;margin:0 0 6px} p{margin:0 0 16px;color:#666;font-size:13px}
    input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font:inherit}
    button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#111;color:#fff;font:inherit;cursor:pointer}
  </style>
</head>
<body>
  <div class="wrap"><div class="card">
    <h1>${escapeHtml(opts.title)}</h1>
    <p>Enter password to continue</p>
    ${err}
    <form id="f">
      <input id="p" type="password" placeholder="Password" autocomplete="current-password" required />
      <button type="submit">Unlock</button>
    </form>
  </div></div>
  <script>
    (function () {
      var slug = ${JSON.stringify(opts.slug)};
      var saved = localStorage.getItem("site_public_auth_" + slug);
      if (saved && !new URLSearchParams(location.search).get("e")) {
        location.replace(location.pathname + "?site_token=" + encodeURIComponent(saved));
        return;
      }
      document.getElementById("f").addEventListener("submit", async function (e) {
        e.preventDefault();
        var password = document.getElementById("p").value;
        var res = await fetch("/api/public/sites/" + encodeURIComponent(slug) + "/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: password }),
        });
        var data = await res.json();
        if (!res.ok || !data.valid) {
          location.search = "?e=1";
          return;
        }
        if (data.token) {
          localStorage.setItem("site_public_auth_" + slug, data.token);
          location.href = location.pathname + "?site_token=" + encodeURIComponent(data.token);
          return;
        }
        location.href = location.pathname;
      });
    })();
  </script>
</body>
</html>`;
}
