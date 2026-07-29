import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { startRawagentsProxy } from "../tools/common/rawagents-proxy.js";

const WORKER_WALL_MS = 20_000;
/** After soft kill, wait this long then SIGKILL + abandon stream reads. */
const WORKER_KILL_GRACE_MS = 2_000;

/** Dev: sibling .ts next to this module. Prod bundle: sites-ssr-worker.js next to dist/index.js. */
function resolveWorkerPath(): string {
  const candidates = [join(import.meta.dir, "sites-ssr-worker.js"), join(import.meta.dir, "sites-ssr-worker.ts")];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return candidates[0];
}

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

type SiteWorkerProc = {
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  exited: Promise<number>;
  kill: (signal?: number | NodeJS.Signals) => void;
};

function killWorker(proc: SiteWorkerProc, signal?: number | NodeJS.Signals) {
  try {
    if (signal === undefined) proc.kill();
    else proc.kill(signal);
  } catch {
    /* ignore */
  }
}

async function readPipeText(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return "";
  try {
    return await new Response(stream).text();
  } catch {
    return "";
  }
}

async function awaitWorker(proc: SiteWorkerProc): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  let stdout = "";
  let stderr = "";

  const readStdout = readPipeText(proc.stdout).then((text) => {
    stdout = text;
  });
  const readStderr = readPipeText(proc.stderr).then((text) => {
    stderr = text;
  });

  const finished = Promise.all([readStdout, readStderr, proc.exited]).then(([, , exitCode]) => ({
    exitCode,
    timedOut: false as const,
  }));

  let wallTimer: ReturnType<typeof setTimeout> | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  const wall = new Promise<{ exitCode: number; timedOut: true }>((resolve) => {
    wallTimer = setTimeout(() => {
      killWorker(proc);
      graceTimer = setTimeout(() => {
        killWorker(proc, "SIGKILL");
        resolve({ exitCode: -1, timedOut: true });
      }, WORKER_KILL_GRACE_MS);
    }, WORKER_WALL_MS);
  });

  try {
    const outcome = await Promise.race([finished, wall]);
    if (outcome.timedOut) {
      // Do not wait forever on pipes after kill — abandon after a short settle.
      await Promise.race([finished.catch(() => undefined), new Promise<void>((r) => setTimeout(r, 500))]);
      return { stdout, stderr, exitCode: outcome.exitCode, timedOut: true };
    }
    return { stdout, stderr, exitCode: outcome.exitCode, timedOut: false };
  } finally {
    if (wallTimer) clearTimeout(wallTimer);
    if (graceTimer) clearTimeout(graceTimer);
  }
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

    const workerPath = resolveWorkerPath();
    if (!existsSync(workerPath)) {
      throw new BadRequestException(`SSR worker not found at ${workerPath}`);
    }

    const proc = Bun.spawn(["bun", workerPath], {
      env,
      stdout: "pipe",
      stderr: "pipe",
      cwd: opts.treeDir,
    });

    const { stdout, stderr, exitCode, timedOut } = await awaitWorker(proc);

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
