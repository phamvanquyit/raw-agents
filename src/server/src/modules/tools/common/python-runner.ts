import { type ChildProcess, execFile, execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { bgTaskRegistry } from "./bg-task-registry.js";
import { startRawagentsProxy } from "./rawagents-proxy.js";
import { writeRawagentsPackage } from "./rawagents-python.js";

/** Soft-wait before detaching a custom tool into bgTaskRegistry (Cursor-style). */
export const CUSTOM_TOOL_SOFT_WAIT_MS = 120_000;

// ─── Python stdlib (skip auto-install) ───────────────────────────────────────
const PYTHON_STDLIB = new Set([
  "os",
  "sys",
  "re",
  "io",
  "abc",
  "ast",
  "json",
  "math",
  "time",
  "copy",
  "enum",
  "uuid",
  "functools",
  "itertools",
  "operator",
  "datetime",
  "calendar",
  "random",
  "string",
  "textwrap",
  "pathlib",
  "shutil",
  "tempfile",
  "glob",
  "fnmatch",
  "subprocess",
  "threading",
  "multiprocessing",
  "concurrent",
  "asyncio",
  "socket",
  "ssl",
  "http",
  "urllib",
  "email",
  "html",
  "xml",
  "csv",
  "configparser",
  "argparse",
  "logging",
  "unittest",
  "pdb",
  "profile",
  "cProfile",
  "timeit",
  "hashlib",
  "hmac",
  "secrets",
  "base64",
  "binascii",
  "struct",
  "codecs",
  "unicodedata",
  "locale",
  "collections",
  "heapq",
  "bisect",
  "array",
  "queue",
  "typing",
  "types",
  "dataclasses",
  "contextlib",
  "weakref",
  "gc",
  "inspect",
  "traceback",
  "warnings",
  "pprint",
  "reprlib",
  "numbers",
  "decimal",
  "fractions",
  "statistics",
  "cmath",
  "builtins",
  "site",
  "platform",
  "signal",
  "ctypes",
  "faulthandler",
  "zipfile",
  "tarfile",
  "gzip",
  "bz2",
  "lzma",
  "zlib",
  "pickle",
  "shelve",
  "sqlite3",
  "dbm",
  "imaplib",
  "smtplib",
  "ftplib",
  "xmlrpc",
  "mimetypes",
  "encodings",
  "__future__",
  "importlib",
  "pkgutil",
  "pstats",
]);

// ─── In-memory cache: toolId → Set<installed package names> ───────────────────
const installedCache = new Map<string, Set<string>>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
  timeoutMs = 600_000,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        cwd,
        env: { ...process.env, ...env },
        timeout: timeoutMs,
        maxBuffer: 5 * 1024 * 1024, // 5 MB
      },
      (err, stdout, stderr) => {
        if (err && "killed" in err && err.killed) {
          resolve({
            success: false,
            stdout: "",
            stderr: `⏰ Process timed out after ${timeoutMs / 1000}s`,
          });
          return;
        }
        resolve({ success: !err, stdout, stderr });
      },
    );
  });
}

type SpawnHandle = {
  pid: number | undefined;
  child: ChildProcess;
  done: Promise<{ success: boolean; stdout: string; stderr: string }>;
  kill: () => void;
};

const PYTHON_UTF8_ENV = {
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
} as const;

function inputJsonPathFor(scriptPath: string): string {
  return scriptPath.replace(/\.py$/, ".input.json");
}

function writeToolInputJson(scriptPath: string, inputJson: string): string {
  const inputPath = inputJsonPathFor(scriptPath);
  writeFileSync(inputPath, inputJson, "utf-8");
  return inputPath;
}

function unlinkQuiet(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    /* ignore */
  }
}

function createUtf8Collectors(maxChars: number) {
  const outDec = new TextDecoder("utf-8");
  const errDec = new TextDecoder("utf-8");
  let stdout = "";
  let stderr = "";

  const push = (decoder: TextDecoder, current: string, chunk: Buffer | string) => {
    const piece = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    let next = current + piece;
    if (next.length > maxChars) next = next.slice(-maxChars);
    return next;
  };

  return {
    pushStdout(chunk: Buffer | string) {
      stdout = push(outDec, stdout, chunk);
    },
    pushStderr(chunk: Buffer | string) {
      stderr = push(errDec, stderr, chunk);
    },
    finish() {
      stdout += outDec.decode();
      stderr += errDec.decode();
      if (stdout.length > maxChars) stdout = stdout.slice(-maxChars);
      if (stderr.length > maxChars) stderr = stderr.slice(-maxChars);
      return { stdout, stderr };
    },
  };
}

/** Spawn without hard timeout — used for agent soft-wait / background tasks. */
function spawnCmd(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}, onStderr?: (chunk: string) => void): SpawnHandle {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const maxBuf = 5 * 1024 * 1024;
  const collectors = createUtf8Collectors(maxBuf);
  const liveDec = new TextDecoder("utf-8");
  child.stdout?.on("data", (chunk: Buffer | string) => collectors.pushStdout(chunk));
  child.stderr?.on("data", (chunk: Buffer | string) => {
    collectors.pushStderr(chunk);
    if (!onStderr) return;
    const piece = typeof chunk === "string" ? chunk : liveDec.decode(chunk, { stream: true });
    if (piece) onStderr(piece);
  });

  let killed = false;
  let settled = false;
  const done = new Promise<{ success: boolean; stdout: string; stderr: string }>((resolve) => {
    const settle = (success: boolean, stderrOverride?: string) => {
      if (settled) return;
      settled = true;
      const collected = collectors.finish();
      resolve({
        success,
        stdout: collected.stdout,
        stderr: stderrOverride ?? collected.stderr,
      });
    };
    child.on("error", (err) => {
      settle(false, err.message);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      const collected = collectors.finish();
      resolve({
        success: !killed && code === 0,
        stdout: collected.stdout,
        stderr: killed ? collected.stderr || "Process cancelled" : collected.stderr,
      });
    });
  });

  return {
    pid: child.pid,
    child,
    done,
    kill: () => {
      killed = true;
      if (child.killed) return;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        if (!child.killed) {
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }
      }, 2_000);
    },
  };
}

function whichPython(): string {
  const knownPaths = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3", "/usr/bin/python"];
  for (const p of knownPaths) {
    if (existsSync(p)) return p;
  }
  try {
    const found = execSync("which python3", { encoding: "utf8" }).trim();
    if (found) return found;
  } catch {
    try {
      const found = execSync("which python", { encoding: "utf8" }).trim();
      if (found) return found;
    } catch {
      /* noop */
    }
  }
  return "python3";
}

function detectPackages(code: string): string[] {
  const pkgs = new Set<string>();
  // Parse "# pip: pkg1 pkg2" comments — explicit pip package names override import-based detection
  // Supports both standalone "# pip: pkg" lines AND inline "import whois  # pip: python-whois"
  const pipOverrides = new Set<string>();
  for (const line of code.split("\n")) {
    const t = line.trim();

    // Standalone: # pip: python-whois beautifulsoup4
    const pipMatch = t.match(/^#\s*pip:\s*(.+)/i);
    if (pipMatch) {
      for (const p of pipMatch[1].split(/[\s,]+/).filter(Boolean)) pipOverrides.add(p);
      continue;
    }

    // Strip inline "# pip: ..." from import lines and capture pip overrides
    const inlinePipMatch = t.match(/#\s*pip:\s*(.+)/i);
    if (inlinePipMatch) {
      for (const p of inlinePipMatch[1].split(/[\s,]+/).filter(Boolean)) pipOverrides.add(p);
    }

    // Remove any inline comment before parsing imports
    const codePart = t.replace(/#.*$/, "").trim();

    const importMatch = codePart.match(/^import\s+(.+)/);
    if (importMatch) {
      for (const part of importMatch[1].split(",")) {
        const tok = part.trim().split(/\s+/)[0];
        if (tok && !tok.startsWith(".")) pkgs.add(tok.split(".")[0]);
      }
    }
    const fromMatch = codePart.match(/^from\s+(\S+)\s+import/);
    if (fromMatch && !fromMatch[1].startsWith(".")) pkgs.add(fromMatch[1].split(".")[0]);
  }

  const fromImports = [...pkgs].filter((p) => !PYTHON_STDLIB.has(p) && p !== "rawagents");
  // If pip overrides exist, use them; also include any import-detected packages not covered by overrides
  if (pipOverrides.size > 0) {
    for (const p of fromImports) pipOverrides.add(p);
    return [...pipOverrides];
  }
  return fromImports;
}

function isPkgInstalled(sandboxDir: string, pkg: string): boolean {
  const normalised = pkg.toLowerCase().replace(/-/g, "_");
  const venvLib = join(sandboxDir, ".venv", "lib");
  if (!existsSync(venvLib)) return false;
  for (const entry of readdirSync(venvLib)) {
    const sitePackages = join(venvLib, entry, "site-packages");
    if (!existsSync(sitePackages)) continue;
    if (existsSync(join(sitePackages, normalised))) return true;
    if (existsSync(join(sitePackages, pkg))) return true;
    for (const sp of readdirSync(sitePackages)) {
      const n = sp.toLowerCase();
      if (n.startsWith(normalised) && (n.includes(".dist-info") || n.includes(".egg-info"))) return true;
    }
  }
  return false;
}

/**
 * Defensively normalize AI-generated code before wrapping it in def main().
 *
 * AI models sometimes include things they shouldn't:
 *   - Markdown fences (```python ... ```)
 *   - The full "def main(input):" wrapper with indented body
 * This function strips those so the code always works on the first run.
 */
function normalizeUserCode(raw: string): string {
  let code = raw.trim();

  // 1. Strip markdown code fences (```python ... ``` or ``` ... ```)
  code = code
    .replace(/^```(?:python)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  // 2. If the AI sent ONLY a bare "def main(input):" function (no helpers before it),
  //    extract just the body and de-indent it.
  //    Pattern: code starts directly with "def main(...):""
  const soloDefMainMatch = code.match(/^def\s+main\s*\([^)]*\)\s*(?:->[^:]+)?:\s*\n([\s\S]*)$/);
  if (soloDefMainMatch) {
    const body = soloDefMainMatch[1];
    const bodyLines = body.split("\n");
    const nonEmptyLines = bodyLines.filter((l) => l.trim() !== "");
    if (nonEmptyLines.length > 0) {
      const minIndent = Math.min(...nonEmptyLines.map((l) => l.match(/^(\s*)/)?.[1].length ?? 0));
      code = bodyLines
        .map((l) => l.slice(minIndent))
        .join("\n")
        .trim();
    } else {
      code = "";
    }
    return code;
  }

  // 3. If the AI sent a multi-function file with helper defs + def main at the end,
  //    keep the helper functions as-is (they'll be top-level inside main() which is fine
  //    in Python), but extract main()'s body and append it after the helpers.
  //    e.g.:
  //      def helper(x): ...        <- keep top-level (AI indented code for readability)
  //      def main(input):          <- strip wrapper, extract body
  //          result = helper(...)
  //          return result
  //    → result: helper at top + body of main at bottom
  const multiMatch = code.match(/^([\s\S]*?)\ndef\s+main\s*\([^)]*\)\s*(?:->[^:]+)?:\s*\n([\s\S]*)$/);
  if (multiMatch && multiMatch[1].trim() !== "") {
    const before = multiMatch[1].trim(); // helper functions etc.
    const body = multiMatch[2];
    const bodyLines = body.split("\n");
    const nonEmptyLines = bodyLines.filter((l) => l.trim() !== "");
    if (nonEmptyLines.length > 0) {
      const minIndent = Math.min(...nonEmptyLines.map((l) => l.match(/^(\s*)/)?.[1].length ?? 0));
      const strippedBody = bodyLines
        .map((l) => l.slice(minIndent))
        .join("\n")
        .trim();
      code = `${before}\n${strippedBody}`;
    } else {
      code = before;
    }
  }

  return code;
}

function buildScript(userCode: string): string {
  const normalized = normalizeUserCode(userCode);
  const lines = normalized.split("\n");

  // Indent every line by 4 spaces; keep blank lines as-is (empty string)
  // so Python is happy with blank lines inside a function body.
  const indentedLines = lines.map((l) => (l.trim() === "" ? "" : `    ${l}`));

  // If the entire body is blank/empty → inject `pass` so def main() is valid
  const hasBody = indentedLines.some((l) => l.trim() !== "");
  if (!hasBody) indentedLines.push("    pass");

  const indented = indentedLines.join("\n");

  return `import sys, os, json, traceback, io

try:
    sys.__stdout__.reconfigure(encoding="utf-8")
    sys.__stderr__.reconfigure(encoding="utf-8")
except Exception:
    pass

# Capture print() from user code — show as "console" in UI, tee to stderr for live logs
_capture = io.StringIO()

class _Tee:
    def write(self, s):
        if not isinstance(s, str):
            s = str(s)
        _capture.write(s)
        try:
            sys.__stderr__.write(s)
            sys.__stderr__.flush()
        except Exception:
            pass
        return len(s)
    def flush(self):
        try:
            sys.__stderr__.flush()
        except Exception:
            pass

sys.stdout = _Tee()

def main(input):
${indented}

def _out(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\\n")

try:
    _input_path = os.environ.get("INPUT_JSON_FILE")
    if _input_path:
        with open(_input_path, encoding="utf-8") as _f:
            _input_raw = _f.read()
    else:
        _input_raw = os.environ.get("INPUT_JSON", "{}")
    _input = json.loads(_input_raw)
    _result = main(_input)

    # Restore real stdout now
    sys.stdout = sys.__stdout__
    _console = _capture.getvalue().strip() or None

    if isinstance(_result, str):
        try:
            _parsed = json.loads(_result)
            _out({"ok": True, "result": _parsed, "console": _console})
        except Exception:
            _out({"ok": True, "result": _result, "console": _console})
    elif _result is None:
        _out({"ok": True, "result": None, "console": _console})
    else:
        _out({"ok": True, "result": _result, "console": _console})
    sys.exit(0)
except Exception as _e:
    sys.stdout = sys.__stdout__
    _tb = traceback.format_exc()
    _out({"ok": False, "error": str(_e) + "\\n" + _tb})
    sys.exit(1)
`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

type PreparedRun = {
  venvPython: string;
  sandboxDir: string;
  scriptPath: string;
  proxy: ReturnType<typeof startRawagentsProxy>;
};

async function prepareToolRun(toolId: string, code: string, dataDir: string): Promise<PreparedRun | { errorJson: string }> {
  const sandboxDir = join(dataDir, "tool_envs", toolId);
  mkdirSync(sandboxDir, { recursive: true });

  const pythonPath = whichPython();
  const venvDir = join(sandboxDir, ".venv");
  const venvPython = join(venvDir, os.platform() === "win32" ? "Scripts/python.exe" : "bin/python");

  if (!existsSync(venvDir)) {
    await runCmd(pythonPath, ["-m", "venv", venvDir], sandboxDir, {}, 60_000);
  }

  const pkgs = detectPackages(code);
  if (pkgs.length > 0) {
    const cached = installedCache.get(toolId);
    const missing = cached ? pkgs.filter((p) => !cached.has(p)) : pkgs.filter((p) => !isPkgInstalled(sandboxDir, p));
    if (missing.length > 0) {
      const installResult = await runCmd(venvPython, ["-m", "pip", "install", "--quiet", ...missing], sandboxDir, {}, 120_000);
      if (!installResult.success) {
        return {
          errorJson: JSON.stringify({
            ok: false,
            error: `❌ Package install failed [${missing.join(", ")}]:\n${installResult.stderr}`,
          }),
        };
      }
    }
    const updated = cached ?? new Set<string>();
    for (const p of pkgs) updated.add(p);
    installedCache.set(toolId, updated);
  }

  writeRawagentsPackage(sandboxDir);

  const script = buildScript(code);
  const scriptId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const scriptPath = join(sandboxDir, `run_${scriptId}.py`);
  writeFileSync(scriptPath, script, "utf-8");

  const proxy = startRawagentsProxy();
  return { venvPython, sandboxDir, scriptPath, proxy };
}

function cleanupPrepared(prep: PreparedRun): void {
  prep.proxy.stop();
  unlinkQuiet(prep.scriptPath);
  unlinkQuiet(inputJsonPathFor(prep.scriptPath));
}

function formatRunResult(result: { success: boolean; stdout: string; stderr: string }): string {
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();

  const attachConsole = (v: Record<string, unknown>) => {
    if (stderr) v.console = stderr;
    return v;
  };

  if (!result.success) {
    if (stdout?.startsWith("{")) {
      try {
        return JSON.stringify(attachConsole(JSON.parse(stdout)));
      } catch {
        /* noop */
      }
    }
    return JSON.stringify({
      ok: false,
      error: stderr || stdout || "Script exited with error",
    });
  }

  if (!stdout) {
    return JSON.stringify(attachConsole({ ok: true, result: null, console: stderr || null }));
  }

  try {
    return JSON.stringify(attachConsole(JSON.parse(stdout)));
  } catch {
    return JSON.stringify(attachConsole({ ok: true, result: stdout }));
  }
}

function parseOutcomeFromResultJson(resultStr: string): { ok: boolean; result?: unknown; error?: string; console?: string } {
  try {
    const parsed = JSON.parse(resultStr) as { ok?: boolean; result?: unknown; error?: string; console?: string };
    return {
      ok: parsed.ok === true,
      result: parsed.result,
      error: parsed.error,
      console: typeof parsed.console === "string" ? parsed.console : undefined,
    };
  } catch {
    return { ok: false, error: resultStr };
  }
}

function pythonRunEnv(prepared: PreparedRun, inputPath: string): Record<string, string> {
  return {
    INPUT_JSON_FILE: inputPath,
    RAWAGENTS_URL: prepared.proxy.url,
    RAWAGENTS_TOKEN: prepared.proxy.token,
    PYTHONPATH: prepared.sandboxDir,
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONUNBUFFERED: "1",
    ...PYTHON_UTF8_ENV,
  };
}

export async function executeTool(toolId: string, code: string, inputJson: string, dataDir: string): Promise<string> {
  const prepared = await prepareToolRun(toolId, code, dataDir);
  if ("errorJson" in prepared) return prepared.errorJson;

  try {
    const inputPath = writeToolInputJson(prepared.scriptPath, inputJson);
    const handle = spawnCmd(prepared.venvPython, [prepared.scriptPath], prepared.sandboxDir, pythonRunEnv(prepared, inputPath));
    const result = await handle.done;
    return formatRunResult(result);
  } finally {
    cleanupPrepared(prepared);
  }
}

export type SoftWaitExecuteResult = { status: "completed"; payload: string } | { status: "running"; taskId: string; toolName: string };

export type ExecuteToolSoftWaitOptions = {
  toolId: string;
  toolName: string;
  code: string;
  inputJson: string;
  dataDir: string;
  softWaitMs?: number;
  agentId?: string;
  conversationId?: string | null;
};

/**
 * Run a custom tool with Cursor-style soft-wait: wait up to softWaitMs for completion,
 * otherwise return taskId while the process continues in the background.
 */
export async function executeToolWithSoftWait(opts: ExecuteToolSoftWaitOptions): Promise<SoftWaitExecuteResult> {
  const softWaitMs = opts.softWaitMs ?? CUSTOM_TOOL_SOFT_WAIT_MS;
  const prepared = await prepareToolRun(opts.toolId, opts.code, opts.dataDir);
  if ("errorJson" in prepared) {
    return { status: "completed", payload: prepared.errorJson };
  }

  const inputPath = writeToolInputJson(prepared.scriptPath, opts.inputJson);
  let attachedTaskId: string | null = null;
  let pendingLog = "";
  const handle = spawnCmd(prepared.venvPython, [prepared.scriptPath], prepared.sandboxDir, pythonRunEnv(prepared, inputPath), (chunk) => {
    if (attachedTaskId) bgTaskRegistry.appendLog(attachedTaskId, chunk);
    else pendingLog += chunk;
  });

  const softTimer = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), Math.max(0, softWaitMs));
  });

  const raced = await Promise.race([handle.done.then((r) => ({ kind: "done" as const, r })), softTimer.then(() => ({ kind: "timeout" as const }))]);

  if (raced.kind === "done") {
    cleanupPrepared(prepared);
    return { status: "completed", payload: formatRunResult(raced.r) };
  }

  const taskId = bgTaskRegistry.register({
    toolId: opts.toolId,
    toolName: opts.toolName,
    agentId: opts.agentId,
    conversationId: opts.conversationId,
    pid: handle.pid,
    kill: handle.kill,
  });
  attachedTaskId = taskId;
  if (pendingLog) bgTaskRegistry.appendLog(taskId, pendingLog);

  void handle.done.then((r) => {
    const payload = formatRunResult(r);
    const outcome = parseOutcomeFromResultJson(payload);
    bgTaskRegistry.finish(taskId, outcome);
    cleanupPrepared(prepared);
  });

  return { status: "running", taskId, toolName: opts.toolName };
}

export async function validateToolCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const pythonPath = whichPython();
  const tmpFile = join(os.tmpdir(), `continue_agent_validate_${Date.now()}.py`);
  writeFileSync(tmpFile, code, "utf-8");

  const checkScript = `import py_compile, json, sys, os
try:
    py_compile.compile(os.environ["CHECK_FILE"], doraise=True)
    sys.stdout.write(json.dumps({"ok": True}))
except py_compile.PyCompileError as e:
    sys.stdout.write(json.dumps({"ok": False, "error": str(e)}))
`;
  try {
    const result = await runCmd(
      pythonPath,
      ["-c", checkScript],
      os.tmpdir(),
      { CHECK_FILE: tmpFile },
      10_000, // 10s timeout for validation
    );
    try {
      return JSON.parse(result.stdout);
    } catch {
      return { ok: false, error: "Failed to validate" };
    }
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
