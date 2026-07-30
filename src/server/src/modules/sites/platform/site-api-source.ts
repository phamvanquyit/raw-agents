/** Injected into each site bundle as `site-api.js` — client helpers for data/actions. */

export const PLATFORM_SITE_API_SOURCE = `const meta = document.querySelector('meta[name="ra-site-api"]');
const API_BASE = (meta && meta.getAttribute("content")) || "";

var injectedTaken = false;

function readInjectedRaw() {
  var el = document.getElementById("__RA_SITE_DATA__");
  if (!el) return { present: false };
  try {
    return { present: true, value: JSON.parse(el.textContent || "null") };
  } catch (_) {
    return { present: false };
  }
}

/** Sync read of server-injected load() data (does not consume). */
export function peekSiteData() {
  var raw = readInjectedRaw();
  return raw.present ? raw.value : undefined;
}

function takeInjectedData() {
  if (injectedTaken) return { ok: false };
  injectedTaken = true;
  var raw = readInjectedRaw();
  if (!raw.present) return { ok: false };
  return { ok: true, value: raw.value };
}

function authHeaders() {
  const headers = {};
  const params = new URLSearchParams(window.location.search);
  const siteToken = params.get("site_token");
  if (siteToken) headers["X-Site-Access-Token"] = siteToken;
  try {
    const slugMeta = document.querySelector('meta[name="ra-site-slug"]');
    const slug = slugMeta && slugMeta.getAttribute("content");
    if (slug) {
      const saved = localStorage.getItem("site_public_auth_" + slug);
      if (saved && !headers["X-Site-Access-Token"]) headers["X-Site-Access-Token"] = saved;
    }
  } catch (_) {}
  return headers;
}

function withQuery(url, query) {
  if (!query || typeof query !== "object") return url;
  const u = new URL(url, window.location.origin);
  for (const [k, v] of Object.entries(query)) {
    if (v == null) continue;
    u.searchParams.set(k, String(v));
  }
  return u.pathname + u.search;
}

function hasQueryKeys(query) {
  return !!(query && typeof query === "object" && Object.keys(query).length > 0);
}

/**
 * First call without query uses server-injected __RA_SITE_DATA__ (Next-style).
 * Later calls, or calls with a query object, hit GET …/data.
 */
export async function loadSiteData(query) {
  if (!hasQueryKeys(query)) {
    var injected = takeInjectedData();
    if (injected.ok) return injected.value;
  }
  const path = withQuery(API_BASE + "/data", query);
  const res = await fetch(path, { headers: authHeaders(), credentials: "same-origin", cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || "Failed to load data");
  return data.data;
}

export async function siteAction(body) {
  const headers = authHeaders();
  var init;
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    init = { method: "POST", headers: headers, credentials: "same-origin", body: body };
  } else {
    headers["Content-Type"] = "application/json";
    init = { method: "POST", headers: headers, credentials: "same-origin", body: JSON.stringify(body == null ? {} : body) };
  }
  const res = await fetch(API_BASE + "/action", init);
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(data.message || data.error || "Action failed");
  return data.result != null ? data.result : data;
}
`;

export const PLATFORM_ENTRY_SOURCE = `import { createRoot } from "react-dom/client";
import App from "./app.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
`;
