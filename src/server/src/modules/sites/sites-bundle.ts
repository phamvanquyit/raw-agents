import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { ogMetaTags } from "../../common/spa-html.js";
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

function siteOgHead(origin: string | undefined, slug: string, title: string): string {
  if (!origin) return "";
  const base = origin.replace(/\/$/, "");
  return ogMetaTags({
    title: `${title} · Raw Agents`,
    description: `Published site on Raw Agents · /public/sites/${slug}`,
    pageUrl: `${base}/public/sites/${encodeURIComponent(slug)}`,
    imageUrl: `${base}/api/og/sites/${encodeURIComponent(slug)}.png`,
  });
}

export function buildSiteShellHtml(opts: {
  title: string;
  apiBase: string;
  slug: string;
  assetBase: string;
  origin?: string;
}): string {
  const cssHref = `${opts.assetBase}/styles.css`;
  const jsHref = `${opts.assetBase}/app.js`;
  const og = siteOgHead(opts.origin, opts.slug, opts.title);

  return compactHtml(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="ra-site-api" content="${opts.apiBase}"/><meta name="ra-site-slug" content="${opts.slug}"/><title>${escapeHtml(opts.title)}</title>${og}<link rel="stylesheet" href="${cssHref}"/></head><body><div id="root"></div><script type="module" src="${jsHref}"></script></body></html>`,
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

export function buildSiteUnlockHtml(opts: { title: string; slug: string; error?: string; origin?: string }) {
  const err = opts.error ? `<p class="error" role="alert">${escapeHtml(opts.error)}</p>` : "";
  const og = siteOgHead(opts.origin, opts.slug, opts.title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
  ${og}
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;min-width:320px;background:#121212;color:#ebebeb;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .wrap{position:relative;display:flex;min-height:100vh;align-items:center;justify-content:center;overflow:hidden;padding:24px}
    .grid{pointer-events:none;position:absolute;inset:0;opacity:.58;background-image:linear-gradient(90deg,rgba(221,118,39,.09) 1px,transparent 1px),linear-gradient(rgba(221,118,39,.07) 1px,transparent 1px);background-size:48px 48px}
    .halo{pointer-events:none;position:absolute;top:0;right:0;left:0;height:34rem;background:radial-gradient(ellipse 56% 46% at 50% 0%,rgba(221,118,39,.22),transparent)}
    .shell{position:relative;width:100%;max-width:448px}
    .status{display:flex;align-items:center;justify-content:space-between;margin:0 4px 12px;color:#9a9a9a;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;font-weight:500;letter-spacing:.16em}
    .secure{display:flex;align-items:center;gap:6px;color:#ffa333}
    .dot{width:6px;height:6px;border-radius:999px;background:#ffa333}
    .card{overflow:hidden;border:1px solid rgba(102,102,102,.2);border-radius:16px;background:#191919}
    .header{padding:24px 32px 20px;border-bottom:1px solid rgba(102,102,102,.12)}
    .identity{display:flex;align-items:flex-start;gap:16px}
    .lock{display:grid;flex:0 0 auto;width:44px;height:44px;place-items:center;border:1px solid rgba(221,118,39,.3);border-radius:12px;background:rgba(221,118,39,.1);color:#ffa333}
    .eyebrow{margin:0 0 4px;color:#ffa333;font-size:12px;font-weight:500;letter-spacing:.08em}
    h1{overflow:hidden;margin:0;color:#ebebeb;font-size:24px;font-weight:600;line-height:32px;text-overflow:ellipsis;white-space:nowrap}
    .description{margin:20px 0 0;max-width:340px;color:#9a9a9a;font-size:13px;line-height:19px}
    form{padding:24px 32px 32px}
    label{display:block;margin-bottom:16px;color:#ebebeb;font-size:12px;font-weight:500}
    .input-wrap{position:relative;display:block;margin-top:8px}
    .input-lock{position:absolute;top:50%;left:14px;width:16px;height:16px;transform:translateY(-50%);color:#8a8a8a}
    input{width:100%;height:40px;border:1px solid rgba(102,102,102,.2);border-radius:6px;background:#121212;color:#ebebeb;padding:0 14px 0 40px;font:inherit;font-size:14px;outline:none;transition:border-color .15s}
    input::placeholder{color:#6e6e6e}
    input:focus{border-color:rgba(235,235,235,.3)}
    .error{margin:0 0 16px;padding:8px 12px;border:1px solid rgba(239,68,68,.25);border-radius:6px;background:rgba(239,68,68,.1);color:#ef4444;font-size:12px;font-weight:500;line-height:16px}
    button{width:100%;height:40px;border:0;border-radius:6px;background:#dd7627;color:#fff;font:inherit;font-size:14px;font-weight:500;cursor:pointer;transition:background .15s}
    button:hover{background:#ffa333}
    button:focus-visible{outline:2px solid #ffa333;outline-offset:3px}
    .help{margin:24px 0 0;color:#6e6e6e;text-align:center;font-size:12px;line-height:16px}
    @media(max-width:480px){.wrap{padding:20px}.header{padding:24px 24px 20px}form{padding:24px}.status{font-size:10px}}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="grid" aria-hidden="true"></div>
    <div class="halo" aria-hidden="true"></div>
    <section class="shell" aria-labelledby="site-title">
      <div class="status"><span>ACCESS GATEWAY</span><span class="secure"><i class="dot"></i>ENCRYPTED</span></div>
      <div class="card">
        <header class="header">
          <div class="identity">
            <div class="lock" aria-hidden="true"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="16" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path><path d="M12 14v2"></path></svg></div>
            <div><p class="eyebrow">PRIVATE SITE</p><h1 id="site-title">${escapeHtml(opts.title)}</h1></div>
          </div>
          <p class="description">This space is protected. Enter the access password to continue.</p>
        </header>
        <form id="f">
          <label for="p">Access password
            <span class="input-wrap"><svg class="input-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg><input id="p" type="password" placeholder="Enter password" autocomplete="current-password" required /></span>
          </label>
          ${err}
          <button type="submit">Unlock site</button>
        </form>
      </div>
      <p class="help">Request access from the site owner if you do not have a password.</p>
    </section>
  </main>
  <script>
    (async function () {
      var slug = ${JSON.stringify(opts.slug)};
      var params = new URLSearchParams(location.search);
      var key = "site_public_auth_" + slug;
      var saved = localStorage.getItem(key);
      // Legacy ?site_token= URLs — clear storage and strip query (cookie auth only).
      if (params.get("site_token")) {
        localStorage.removeItem(key);
        if (history.replaceState) {
          history.replaceState(null, "", location.pathname + (params.get("e") ? "?e=1" : ""));
        }
      } else if (saved && !params.get("e")) {
        try {
          var tokenRes = await fetch("/api/public/sites/" + encodeURIComponent(slug) + "/verify-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: saved }),
            credentials: "same-origin",
          });
          var tokenData = await tokenRes.json();
          if (tokenData.valid) {
            location.replace(location.pathname);
            return;
          }
        } catch (_) {}
        localStorage.removeItem(key);
      }
      document.getElementById("f").addEventListener("submit", async function (e) {
        e.preventDefault();
        var password = document.getElementById("p").value;
        var res = await fetch("/api/public/sites/" + encodeURIComponent(slug) + "/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: password }),
          credentials: "same-origin",
        });
        var data = await res.json();
        if (!res.ok || !data.valid) {
          location.search = "?e=1";
          return;
        }
        if (data.token) {
          localStorage.setItem(key, data.token);
        }
        location.href = location.pathname;
      });
    })();
  </script>
</body>
</html>`;
}
