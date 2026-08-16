import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bgTaskRegistry } from "../modules/tools/common/bg-task-registry.js";
import { executeToolWithSoftWait } from "../modules/tools/common/python-runner.js";

describe("background tool soft-wait", () => {
  let dataDir: string;

  afterEach(() => {
    bgTaskRegistry._reset();
    if (dataDir) {
      try {
        rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  test("completes within soft-wait returns result", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "raw-agents-bg-"));
    const code = `return {"echo": input.get("x")}`;
    const out = await executeToolWithSoftWait({
      toolId: "tool-fast",
      toolName: "fast_echo",
      code,
      inputJson: JSON.stringify({ x: 1 }),
      dataDir,
      softWaitMs: 30_000,
    });
    expect(out.status).toBe("completed");
    if (out.status !== "completed") return;
    const parsed = JSON.parse(out.payload) as { ok: boolean; result: { echo: number } };
    expect(parsed.ok).toBe(true);
    expect(parsed.result.echo).toBe(1);
  }, 60_000);

  test("preserves Vietnamese in input and large UTF-8 stdout", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "raw-agents-bg-"));
    const vi = "khoảng 211 nghìn các kênh ấy lạ hơn ngoại nửa phân bổ";
    const code = `text = input.get("text", "")
return {"echo": text, "long": ("ảầẫ " * 20000) + text}`;
    const out = await executeToolWithSoftWait({
      toolId: "tool-utf8",
      toolName: "utf8_echo",
      code,
      inputJson: JSON.stringify({ text: vi }),
      dataDir,
      softWaitMs: 30_000,
    });
    expect(out.status).toBe("completed");
    if (out.status !== "completed") return;
    const parsed = JSON.parse(out.payload) as { ok: boolean; result: { echo: string; long: string } };
    expect(parsed.ok).toBe(true);
    expect(parsed.result.echo).toBe(vi);
    expect(parsed.result.long.startsWith("ảầẫ ")).toBe(true);
    expect(parsed.result.long.endsWith(vi)).toBe(true);
    expect(parsed.result.long.includes("�")).toBe(false);
  }, 60_000);

  test("exceeds soft-wait detaches then await completes", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "raw-agents-bg-"));
    const code = `import time
time.sleep(1.5)
return {"done": True}`;
    const out = await executeToolWithSoftWait({
      toolId: "tool-slow",
      toolName: "slow_sleep",
      code,
      inputJson: "{}",
      dataDir,
      softWaitMs: 200,
      agentId: "agent-1",
    });
    expect(out.status).toBe("running");
    if (out.status !== "running") return;

    const listed = bgTaskRegistry.list({ agentId: "agent-1" });
    expect(listed.some((t) => t.taskId === out.taskId)).toBe(true);

    const finished = await bgTaskRegistry.await(out.taskId, 15_000);
    expect(finished.status).toBe("completed");
    expect(finished.result).toEqual({ done: true });
  }, 60_000);

  test("cancel kills a running detached task", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "raw-agents-bg-"));
    const code = `import time
time.sleep(30)
return {"done": True}`;
    const out = await executeToolWithSoftWait({
      toolId: "tool-cancel",
      toolName: "slow_cancel",
      code,
      inputJson: "{}",
      dataDir,
      softWaitMs: 150,
    });
    expect(out.status).toBe("running");
    if (out.status !== "running") return;

    const cancelled = bgTaskRegistry.cancel(out.taskId);
    expect(cancelled?.status).toBe("cancelled");

    const snap = await bgTaskRegistry.await(out.taskId, 5_000);
    expect(snap.status).toBe("cancelled");
  }, 60_000);

  test("detached task streams print() into console", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "raw-agents-bg-"));
    const code = `print("line-one", flush=True)
import time
time.sleep(1.2)
print("line-two", flush=True)
return {"done": True}`;
    const out = await executeToolWithSoftWait({
      toolId: "tool-logs",
      toolName: "log_sleep",
      code,
      inputJson: "{}",
      dataDir,
      softWaitMs: 200,
      conversationId: "conv-logs",
    });
    expect(out.status).toBe("running");
    if (out.status !== "running") return;

    await new Promise((r) => setTimeout(r, 400));
    const mid = bgTaskRegistry.get(out.taskId);
    expect(mid?.console ?? "").toContain("line-one");

    const finished = await bgTaskRegistry.await(out.taskId, 15_000);
    expect(finished.status).toBe("completed");
    expect(finished.console ?? "").toContain("line-one");
    expect(finished.console ?? "").toContain("line-two");
  }, 60_000);
});
