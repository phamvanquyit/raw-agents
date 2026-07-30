import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { type SiteTree, getTreeDir, readSourceFile, treeContentHash } from "./sites-fs.js";
import { createSiteRawagents } from "./sites-rawagents.js";

const importGeneration = new Map<string, number>();
const DATA_REV = "data-v1";

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
  const dataPath = (g: number) => join(dirFor(g), "data.ts");

  if (existsSync(stampPath(gen)) && readFileSync(stampPath(gen), "utf8") === stamp && existsSync(dataPath(gen))) {
    return dirFor(gen);
  }

  if (existsSync(dataPath(gen))) {
    gen += 1;
    importGeneration.set(key, gen);
  }

  const out = dirFor(gen);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "data.ts"), readSourceFile(siteId, tree, "data.ts") || "export async function load(){return{}}", "utf8");
  writeFileSync(join(out, "actions.ts"), readSourceFile(siteId, tree, "actions.ts") || "export async function action(){return{ok:false}}", "utf8");
  writeFileSync(stampPath(gen), stamp, "utf8");
  return out;
}

type LoadFn = (args: {
  request: Request;
  params: Record<string, string>;
  rawagents: unknown;
  query: Record<string, string>;
}) => unknown;

type ActionFn = (args: { request: Request; params: Record<string, string>; rawagents: unknown }) => unknown;

async function importSiteModule<T>(runtimeDir: string, file: "data.ts" | "actions.ts"): Promise<T> {
  const full = join(runtimeDir, file);
  const url = `${pathToFileURL(full).href}?t=${Date.now()}`;
  return (await import(url)) as T;
}

export async function runSiteLoad(
  siteId: string,
  tree: SiteTree,
  opts: { request: Request; query?: Record<string, string>; params?: Record<string, string> },
): Promise<{ data: unknown }> {
  const runtimeDir = materializeDataDir(siteId, tree);
  const mod = await importSiteModule<{ load?: LoadFn; loader?: LoadFn }>(runtimeDir, "data.ts");
  const loadFn = mod.load ?? mod.loader;
  if (typeof loadFn !== "function") throw new BadRequestException("data.ts must export async function load");

  const rawagents = createSiteRawagents();
  const query = opts.query ?? Object.fromEntries(new URL(opts.request.url).searchParams.entries());
  try {
    const data = await loadFn({
      request: opts.request,
      params: opts.params ?? {},
      rawagents,
      query,
    });
    return { data };
  } catch (err: unknown) {
    throw new BadRequestException(`load() failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function runSiteActionModule(
  siteId: string,
  tree: SiteTree,
  opts: { request: Request; params?: Record<string, string> },
): Promise<{ result: unknown }> {
  const runtimeDir = materializeDataDir(siteId, tree);
  const mod = await importSiteModule<{ action?: ActionFn }>(runtimeDir, "actions.ts");
  if (typeof mod.action !== "function") throw new BadRequestException("actions.ts must export async function action");

  const rawagents = createSiteRawagents();
  try {
    const result = await mod.action({
      request: opts.request,
      params: opts.params ?? {},
      rawagents,
    });
    invalidateSiteDataModules(siteId);
    return { result };
  } catch (err: unknown) {
    throw new BadRequestException(`action() failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
