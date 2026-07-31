import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { type SiteTree, getTreeDir, readSourceFile, treeContentHash } from "./sites-fs.js";
import { createSiteRawagents } from "./sites-rawagents.js";

const importGeneration = new Map<string, number>();
const DATA_REV = "backend-v1";

function treeKey(siteId: string, tree: SiteTree) {
  return `${siteId}:${tree}`;
}

export function invalidateSiteDataModules(siteId: string) {
  for (const tree of ["prod", "draft"] as SiteTree[]) {
    const tk = treeKey(siteId, tree);
    importGeneration.set(tk, (importGeneration.get(tk) ?? 0) + 1);
  }
}

function materializeDataDir(siteId: string, tree: SiteTree): string {
  const dir = getTreeDir(siteId, tree);
  const key = treeKey(siteId, tree);
  let gen = importGeneration.get(key) ?? 0;
  const root = join(dir, ".data-runtime");
  const stamp = `${treeContentHash(siteId, tree)}:${DATA_REV}`;
  const dirFor = (g: number) => join(root, String(g));
  const stampPath = (g: number) => join(dirFor(g), ".stamp");
  const backendPath = (g: number) => join(dirFor(g), "backend.ts");

  if (existsSync(stampPath(gen)) && readFileSync(stampPath(gen), "utf8") === stamp && existsSync(backendPath(gen))) {
    return dirFor(gen);
  }

  if (existsSync(backendPath(gen))) {
    gen += 1;
    importGeneration.set(key, gen);
  }

  const out = dirFor(gen);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "backend.ts"), readSourceFile(siteId, tree, "backend.ts") || "export async function handle(){return{}}", "utf8");
  writeFileSync(stampPath(gen), stamp, "utf8");
  return out;
}

type HandleFn = (args: {
  request: Request;
  params: Record<string, string>;
  rawagents: unknown;
  query: Record<string, string>;
}) => unknown;

async function importBackendModule(runtimeDir: string): Promise<{ handle?: HandleFn }> {
  const full = join(runtimeDir, "backend.ts");
  const url = `${pathToFileURL(full).href}?t=${Date.now()}`;
  return (await import(url)) as { handle?: HandleFn };
}

export async function runSiteHandle(
  siteId: string,
  tree: SiteTree,
  opts: { request: Request; query?: Record<string, string>; params?: Record<string, string> },
): Promise<{ value: unknown }> {
  const runtimeDir = materializeDataDir(siteId, tree);
  const mod = await importBackendModule(runtimeDir);
  if (typeof mod.handle !== "function") {
    throw new BadRequestException("backend.ts must export async function handle");
  }

  const rawagents = createSiteRawagents();
  const query = opts.query ?? Object.fromEntries(new URL(opts.request.url).searchParams.entries());
  try {
    const value = await mod.handle({
      request: opts.request,
      params: opts.params ?? {},
      rawagents,
      query,
    });
    if (opts.request.method !== "GET" && opts.request.method !== "HEAD") {
      invalidateSiteDataModules(siteId);
    }
    return { value };
  } catch (err: unknown) {
    const label = opts.request.method === "GET" || opts.request.method === "HEAD" ? "handle(GET)" : "handle(POST)";
    throw new BadRequestException(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** GET …/data → backend handle */
export async function runSiteLoad(
  siteId: string,
  tree: SiteTree,
  opts: { request: Request; query?: Record<string, string>; params?: Record<string, string> },
): Promise<{ data: unknown }> {
  const getRequest = new Request(opts.request.url, {
    method: "GET",
    headers: opts.request.headers,
  });
  const { value } = await runSiteHandle(siteId, tree, { ...opts, request: getRequest });
  return { data: value };
}

/** POST …/action → backend handle */
export async function runSiteActionModule(
  siteId: string,
  tree: SiteTree,
  opts: { request: Request; params?: Record<string, string> },
): Promise<{ result: unknown }> {
  const { value } = await runSiteHandle(siteId, tree, opts);
  return { result: value };
}
