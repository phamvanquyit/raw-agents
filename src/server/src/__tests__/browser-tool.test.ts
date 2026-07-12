import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBrowserActions } from "../common/ai/agent-tools/browser-runner.js";

describe("browser-runner", () => {
  const prevDataDir = process.env.DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), "raw-agents-browser-"));

  afterAll(() => {
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  process.env.DATA_DIR = dataDir;

  test("rejects empty actions", async () => {
    const result = await runBrowserActions([]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("non-empty");
  });

  test("navigate + snapshot on example.com", async () => {
    const result = await runBrowserActions([{ action: "navigate", url: "https://example.com" }, { action: "snapshot" }]);

    expect(result.ok).toBe(true);
    expect(result.url).toContain("example.com");
    expect(result.results).toHaveLength(2);
    expect(result.results[0].ok).toBe(true);
    expect(result.results[1].ok).toBe(true);
    expect(result.results[1].content?.toLowerCase()).toContain("example");
  }, 60_000);

  test("stops on failed action", async () => {
    const result = await runBrowserActions([
      { action: "navigate", url: "https://example.com" },
      { action: "click", selector: "#does-not-exist-ever" },
      { action: "snapshot" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(result.results[1].ok).toBe(false);
    expect(result.results[1].error).toBeTruthy();
  }, 60_000);
});
