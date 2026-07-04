import { execFile, execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

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
  timeoutMs = 30_000,
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
  for (const line of code.split("\n")) {
    const t = line.trim();
    const importMatch = t.match(/^import\s+(.+)/);
    if (importMatch) {
      for (const part of importMatch[1].split(",")) {
        const tok = part.trim().split(/\s+/)[0];
        if (tok && !tok.startsWith(".")) pkgs.add(tok.split(".")[0]);
      }
    }
    const fromMatch = t.match(/^from\s+(\S+)\s+import/);
    if (fromMatch && !fromMatch[1].startsWith(".")) pkgs.add(fromMatch[1].split(".")[0]);
  }
  return [...pkgs].filter((p) => !PYTHON_STDLIB.has(p));
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

# Capture print() from user code — show as "console" in UI
_capture = io.StringIO()
sys.stdout = _capture

def main(input):
${indented}

try:
    _input_raw = os.environ.get("INPUT_JSON", "{}")
    _input = json.loads(_input_raw)
    _result = main(_input)

    # Restore real stdout now
    sys.stdout = sys.__stdout__
    _console = _capture.getvalue().strip() or None

    if isinstance(_result, str):
        try:
            _parsed = json.loads(_result)
            sys.stdout.write(json.dumps({"ok": True, "result": _parsed, "console": _console}) + "\\n")
        except Exception:
            sys.stdout.write(json.dumps({"ok": True, "result": _result, "console": _console}) + "\\n")
    elif _result is None:
        sys.stdout.write(json.dumps({"ok": True, "result": None, "console": _console}) + "\\n")
    else:
        sys.stdout.write(json.dumps({"ok": True, "result": _result, "console": _console}) + "\\n")
    sys.exit(0)
except Exception as _e:
    sys.stdout = sys.__stdout__
    _tb = traceback.format_exc()
    sys.stdout.write(json.dumps({"ok": False, "error": str(_e) + "\\n" + _tb}) + "\\n")
    sys.exit(1)
`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function executeTool(toolId: string, code: string, inputJson: string, dataDir: string): Promise<string> {
  const sandboxDir = join(dataDir, "tool_envs", toolId);
  mkdirSync(sandboxDir, { recursive: true });

  const pythonPath = whichPython();
  const venvDir = join(sandboxDir, ".venv");
  const venvPython = join(venvDir, os.platform() === "win32" ? "Scripts/python.exe" : "bin/python");

  // Ensure venv
  if (!existsSync(venvDir)) {
    await runCmd(pythonPath, ["-m", "venv", venvDir], sandboxDir, {}, 60_000);
  }

  // Auto-install missing packages (with in-memory cache)
  const pkgs = detectPackages(code);
  if (pkgs.length > 0) {
    const cached = installedCache.get(toolId);
    const missing = cached ? pkgs.filter((p) => !cached.has(p)) : pkgs.filter((p) => !isPkgInstalled(sandboxDir, p));
    if (missing.length > 0) {
      const installResult = await runCmd(
        venvPython,
        ["-m", "pip", "install", "--quiet", ...missing],
        sandboxDir,
        {},
        120_000, // pip install: 2 min timeout
      );
      if (!installResult.success) {
        return JSON.stringify({
          ok: false,
          error: `❌ Package install failed [${missing.join(", ")}]:\n${installResult.stderr}`,
        });
      }
    }
    // Update cache with all resolved packages
    const updated = cached ?? new Set<string>();
    for (const p of pkgs) updated.add(p);
    installedCache.set(toolId, updated);
  }

  const script = buildScript(code);
  const scriptId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const scriptPath = join(sandboxDir, `run_${scriptId}.py`);
  writeFileSync(scriptPath, script, "utf-8");

  try {
    const result = await runCmd(venvPython, [scriptPath], sandboxDir, {
      INPUT_JSON: inputJson,
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONUNBUFFERED: "1",
    });

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
  } finally {
    try {
      unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
  }
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
