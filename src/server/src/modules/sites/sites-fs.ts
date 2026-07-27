import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../common/utils/data-dir.js";

export const SITE_SOURCE_FILES = ["loader.js", "route.jsx", "action.js", "styles.css", "package.json"] as const;
export type SiteSourceFile = (typeof SITE_SOURCE_FILES)[number];

export type SiteTree = "prod" | "draft";

/** Source files copied into the Bun SSR runtime dir (JS/JSX only). */
export const SITE_RUNTIME_FILES = ["loader.js", "route.jsx", "action.js"] as const;

const DEFAULT_LOADER = `export async function loader({ request, rawagents }) {
  return {
    title: "Hello Site",
    message: "Edit loader.js, route.jsx, styles.css, and action.js — then Approve to publish.",
  };
}
`;

const DEFAULT_ROUTE = `export default function Route({ loaderData }) {
  return (
    <div className="page">
      <h1 className="title">{loaderData.title}</h1>
      <p className="message">{loaderData.message}</p>
    </div>
  );
}
`;

const DEFAULT_STYLES = `.page {
  font-family: system-ui, sans-serif;
  padding: 24px;
  max-width: 720px;
  margin: 0 auto;
}

.title {
  margin-bottom: 8px;
}

.message {
  color: #555;
}
`;

const DEFAULT_ACTION = `export async function action({ request, rawagents }) {
  return { ok: false, message: "No actions defined yet" };
}
`;

function defaultPackageJson(slug: string) {
  return `${JSON.stringify(
    {
      name: `site-${slug}`,
      private: true,
      type: "module",
      dependencies: {
        react: "^19.1.0",
        "react-dom": "^19.1.0",
      },
    },
    null,
    2,
  )}\n`;
}

export function getSitesRoot(): string {
  return join(getDataDir(), "sites");
}

export function getSiteRoot(siteId: string): string {
  return join(getSitesRoot(), siteId);
}

export function getTreeDir(siteId: string, tree: SiteTree): string {
  const root = getSiteRoot(siteId);
  return tree === "draft" ? join(root, "draft") : root;
}

export function isAllowedSourceFile(name: string): name is SiteSourceFile {
  return (SITE_SOURCE_FILES as readonly string[]).includes(name);
}

export function readSourceFile(siteId: string, tree: SiteTree, file: SiteSourceFile): string {
  const path = join(getTreeDir(siteId, tree), file);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

export function writeSourceFile(siteId: string, tree: SiteTree, file: SiteSourceFile, content: string): void {
  if (!isAllowedSourceFile(file)) throw new Error(`Invalid site file: ${file}`);
  const dir = getTreeDir(siteId, tree);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), content, "utf8");
}

export function readAllSourceFiles(siteId: string, tree: SiteTree): Record<SiteSourceFile, string> {
  const out = {} as Record<SiteSourceFile, string>;
  for (const file of SITE_SOURCE_FILES) {
    out[file] = readSourceFile(siteId, tree, file);
  }
  return out;
}

export function writeScaffold(siteId: string, slug: string): void {
  const prod = getTreeDir(siteId, "prod");
  const draft = getTreeDir(siteId, "draft");
  mkdirSync(prod, { recursive: true });
  mkdirSync(draft, { recursive: true });

  const files: Record<SiteSourceFile, string> = {
    "loader.js": DEFAULT_LOADER,
    "route.jsx": DEFAULT_ROUTE,
    "action.js": DEFAULT_ACTION,
    "styles.css": DEFAULT_STYLES,
    "package.json": defaultPackageJson(slug),
  };

  for (const [file, content] of Object.entries(files) as [SiteSourceFile, string][]) {
    writeFileSync(join(prod, file), content, "utf8");
    writeFileSync(join(draft, file), content, "utf8");
  }
}

function copySourceFiles(fromDir: string, toDir: string): void {
  mkdirSync(toDir, { recursive: true });
  for (const file of SITE_SOURCE_FILES) {
    const src = join(fromDir, file);
    if (existsSync(src)) copyFileSync(src, join(toDir, file));
  }
}

/** Promote draft source → prod (does not copy node_modules). */
export function promoteDraftToProd(siteId: string): void {
  copySourceFiles(getTreeDir(siteId, "draft"), getTreeDir(siteId, "prod"));
}

/** Reset draft source from prod. */
export function discardDraft(siteId: string): void {
  copySourceFiles(getTreeDir(siteId, "prod"), getTreeDir(siteId, "draft"));
}

export function removeSiteDir(siteId: string): void {
  const root = getSiteRoot(siteId);
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
}

export function treeContentHash(siteId: string, tree: SiteTree): string {
  const hash = createHash("sha256");
  for (const file of SITE_SOURCE_FILES) {
    hash.update(file);
    hash.update("\0");
    hash.update(readSourceFile(siteId, tree, file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function isDraftDirty(siteId: string): boolean {
  return treeContentHash(siteId, "draft") !== treeContentHash(siteId, "prod");
}

export function treeMtimeToken(siteId: string, tree: SiteTree): string {
  const dir = getTreeDir(siteId, tree);
  let max = 0;
  for (const file of SITE_SOURCE_FILES) {
    const p = join(dir, file);
    if (!existsSync(p)) continue;
    max = Math.max(max, statSync(p).mtimeMs);
  }
  return String(max);
}

/** List top-level entries (debug/tests). */
export function listSiteDir(siteId: string): string[] {
  const root = getSiteRoot(siteId);
  if (!existsSync(root)) return [];
  return readdirSync(root);
}
