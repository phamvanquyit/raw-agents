import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { startRawagentsProxy } from "../tools/common/rawagents-proxy.js";

const WORKER_WALL_MS = 20_000;
const WORKER_PATH = join(import.meta.dir, "sites-ssr-worker.ts");

export type SiteSsrJob = "get" | "action";

export interface SiteSsrGetResult {
  html: string;
  data: unknown;
}

export interface SiteSsrActionResult {
  result: unknown;
}

async function serializeRequestToFile(request: Request): Promise<string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
  const path = join(tmpdir(), `site-ssr-req-${crypto.randomUUID()}.json`);
  writeFileSync(
    path,
    JSON.stringify({
      method: request.method,
      url: request.url,
      headers,
      body,
    }),
    "utf8",
  );
  return path;
}

function parseWorkerStdout(stdout: string): Record<string, unknown> {
  const lines = stdout
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      /* try previous line */
    }
  }
  throw new BadRequestException(`SSR worker returned invalid JSON: ${stdout.slice(0, 500)}`);
}

export async function runSiteJobInWorker(opts: {
  runtimeDir: string;
  treeDir: string;
  job: SiteSsrJob;
  query?: Record<string, string>;
  request?: Request;
}): Promise<SiteSsrGetResult | SiteSsrActionResult> {
  const proxy = startRawagentsProxy();
  let requestPath: string | undefined;

  try {
    if (opts.request) {
      requestPath = await serializeRequestToFile(opts.request);
    }

    const env: Record<string, string | undefined> = {
      ...process.env,
      SITE_JOB: opts.job,
      SITE_RUNTIME_DIR: opts.runtimeDir,
      SITE_TREE_DIR: opts.treeDir,
      SITE_QUERY_JSON: JSON.stringify(opts.query ?? {}),
      RAWAGENTS_URL: proxy.url,
      RAWAGENTS_TOKEN: proxy.token,
    };
    if (requestPath) env.SITE_REQUEST_PATH = requestPath;

    const proc = Bun.spawn(["bun", WORKER_PATH], {
      env,
      stdout: "pipe",
      stderr: "pipe",
      cwd: opts.treeDir,
    });

    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    }, WORKER_WALL_MS);

    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    clearTimeout(killer);

    if (timedOut) {
      throw new BadRequestException(`SSR worker timed out after ${WORKER_WALL_MS}ms`);
    }

    let payload: Record<string, unknown>;
    try {
      payload = parseWorkerStdout(stdout);
    } catch (err) {
      const detail = (stderr || stdout).trim().slice(0, 1500);
      if (detail) throw new BadRequestException(`SSR worker failed: ${detail}`);
      throw err;
    }

    if (!payload.ok) {
      const error = typeof payload.error === "string" ? payload.error : "SSR worker failed";
      throw new BadRequestException(error);
    }

    if (exitCode !== 0 && payload.ok !== true) {
      const detail = (stderr || stdout).trim().slice(0, 1500);
      throw new BadRequestException(detail || `SSR worker exited with code ${exitCode}`);
    }

    if (opts.job === "get") {
      return {
        html: String(payload.html ?? ""),
        data: payload.data,
      };
    }

    return { result: payload.result };
  } finally {
    proxy.stop();
    if (requestPath) {
      try {
        unlinkSync(requestPath);
      } catch {
        /* ignore */
      }
    }
  }
}
