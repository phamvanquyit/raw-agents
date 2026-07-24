import { describe, expect, test } from "bun:test";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { makeGetToolSchemaTool } from "../modules/agents/raw-agent/llm-tools/get-tool-schema.tool.js";
import { appendToolsCatalog, buildLazyToolsBundle } from "../modules/agents/raw-agent/utils/lazy-tools.middleware.js";
import { estimateContextUsage } from "../modules/usage/estimate-context-usage.js";

function makeStubTool(name: string, description: string, paramKey: string) {
  return tool(async () => "ok", {
    name,
    description,
    schema: z.object({ [paramKey]: z.string() }),
  });
}

describe("lazy tool schemas", () => {
  test("get_tool_schema loads multiple tools in one call", async () => {
    const a = makeStubTool("alpha", "Alpha tool does alpha things.", "x");
    const b = makeStubTool("beta", "Beta tool does beta things.", "y");
    const loaded: string[] = [];
    const registry = new Map([
      [a.name, a],
      [b.name, b],
    ]);
    const getSchema = makeGetToolSchemaTool(registry, (names) => loaded.push(...names));

    const raw = await getSchema.invoke({ names: ["alpha", "beta", "missing"] });
    const parsed = JSON.parse(typeof raw === "string" ? raw : String(raw));

    expect(parsed.tools).toHaveLength(2);
    expect(parsed.tools.map((t: { name: string }) => t.name).sort()).toEqual(["alpha", "beta"]);
    expect(parsed.tools[0].parameters).toBeTruthy();
    expect(parsed.missing).toEqual(["missing"]);
    expect(loaded.sort()).toEqual(["alpha", "beta"]);
  });

  test("toolDefTokens follow bound schemas; tool I/O stays in conversation", async () => {
    const longDesc = "Browser automation tool. ".repeat(40);
    const browser = makeStubTool("browser", longDesc, "action");
    const datatable = makeStubTool("datatable", "Datatable tool. ".repeat(40), "query");
    const lazy = buildLazyToolsBundle([browser, datatable]);
    const systemPrompt = appendToolsCatalog("You are helpful.", lazy.catalogPromptSection);

    const before = estimateContextUsage({
      systemPrompt,
      tools: lazy.toolsForEstimate(),
      messages: [{ role: "user", content: "hi" }],
    });

    const schemaResult = await lazy.getToolSchema.invoke({ names: ["browser", "datatable"] });
    expect(lazy.loadedToolNames().sort()).toEqual(["browser", "datatable"]);

    const afterLoad = estimateContextUsage({
      systemPrompt,
      tools: lazy.toolsForEstimate(),
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "tc1", name: "get_tool_schema", args: { names: ["browser", "datatable"] } }],
        },
        {
          role: "tool-result",
          toolCallId: "tc1",
          toolName: "get_tool_schema",
          result: typeof schemaResult === "string" ? schemaResult : String(schemaResult),
        },
      ],
    });

    // Bound tools parameter grew; conversation grew from tool I/O — not mixed into the other bucket.
    expect(afterLoad.toolDefTokens).toBeGreaterThan(before.toolDefTokens);
    expect(afterLoad.conversationTokens).toBeGreaterThan(before.conversationTokens);

    const afterMoreIo = estimateContextUsage({
      systemPrompt,
      tools: lazy.toolsForEstimate(),
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "tc1", name: "get_tool_schema", args: { names: ["browser", "datatable"] } }],
        },
        {
          role: "tool-result",
          toolCallId: "tc1",
          toolName: "get_tool_schema",
          result: typeof schemaResult === "string" ? schemaResult : String(schemaResult),
        },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "tc2", name: "browser", args: { action: "navigate", url: "https://example.com" } }],
        },
        {
          role: "tool-result",
          toolCallId: "tc2",
          toolName: "browser",
          result: JSON.stringify({ ok: true, html: "x".repeat(400) }),
        },
      ],
    });

    // Extra tool I/O must not change tool definitions — only conversation.
    expect(afterMoreIo.toolDefTokens).toBe(afterLoad.toolDefTokens);
    expect(afterMoreIo.conversationTokens).toBeGreaterThan(afterLoad.conversationTokens);

    const fullDefs = estimateContextUsage({
      systemPrompt,
      tools: lazy.allToolsForAgent,
      messages: [],
    });
    expect(before.toolDefTokens).toBeLessThan(fullDefs.toolDefTokens);
    expect(afterLoad.toolDefTokens).toBe(fullDefs.toolDefTokens);
  });

  test("catalog lists short descriptions without full schemas", () => {
    const t = makeStubTool("kv_store", "Read and write the shared workspace key-value store. Prefer Secrets for credentials.", "key");
    const lazy = buildLazyToolsBundle([t]);
    expect(lazy.catalogPromptSection).toContain("`kv_store`");
    expect(lazy.catalogPromptSection).toContain("get_tool_schema");
    expect(lazy.catalogPromptSection).toContain("Batch every tool");
    expect(lazy.catalogPromptSection).not.toContain("Prefer Secrets for credentials");
  });
});
