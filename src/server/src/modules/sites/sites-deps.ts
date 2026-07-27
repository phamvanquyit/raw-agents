import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type SiteTree, getTreeDir } from "./sites-fs.js";

export async function installSiteDeps(siteId: string, tree: SiteTree): Promise<{ ok: true } | { ok: false; error: string }> {
  const cwd = getTreeDir(siteId, tree);
  const pkg = join(cwd, "package.json");
  if (!existsSync(pkg)) {
    return { ok: false, error: "package.json not found" };
  }

  return new Promise((resolve) => {
    const child = spawn("bun", ["install", "--ignore-scripts"], {
      cwd,
      env: { ...process.env, BUN_INSTALL_FROZEN_LOCKFILE: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, error: "bun install timed out (120s)" });
    }, 120_000);

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      const detail = (stderr || stdout).trim().slice(0, 2000);
      resolve({ ok: false, error: detail || `bun install exited with code ${code}` });
    });
  });
}
