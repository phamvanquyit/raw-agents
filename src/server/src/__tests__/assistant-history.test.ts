import { describe, expect, test } from "bun:test";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import {
  buildLangChainMessages as buildSiteMessages,
  compactSiteWriteHistory,
  toolCallArgs as siteToolCallArgs,
} from "../modules/sites/services/site-agent.service.js";
import {
  buildLangChainMessages as buildCodingMessages,
  toolCallArgs as codingToolCallArgs,
  compactGenerateCodeHistory,
} from "../modules/tools/services/coding-agent.service.js";

describe("toolCallArgs", () => {
  test("accepts plain objects only", () => {
    expect(siteToolCallArgs({ file: "app.tsx" })).toEqual({ file: "app.tsx" });
    expect(codingToolCallArgs({ code: "x" })).toEqual({ code: "x" });
    expect(siteToolCallArgs("not-an-object")).toEqual({});
    expect(siteToolCallArgs(["a"])).toEqual({});
    expect(siteToolCallArgs(null)).toEqual({});
    expect(siteToolCallArgs(undefined)).toEqual({});
  });
});

describe("compactSiteWriteHistory", () => {
  test("keeps only latest write_site_file per path", () => {
    const messages = [
      { role: "user" as const, content: "edit" },
      {
        role: "tool-call" as const,
        content: "",
        toolName: "write_site_file",
        toolCallId: "w1",
        toolInput: { file: "app.tsx", content: "v1" },
        toolOutput: "ok",
      },
      {
        role: "tool-call" as const,
        content: "",
        toolName: "check_site",
        toolCallId: "c1",
        toolInput: {},
        toolOutput: '{"ok":true}',
      },
      {
        role: "tool-call" as const,
        content: "",
        toolName: "write_site_file",
        toolCallId: "w2",
        toolInput: { file: "app.tsx", content: "v2" },
        toolOutput: "ok",
      },
      {
        role: "tool-call" as const,
        content: "",
        toolName: "write_site_file",
        toolCallId: "w3",
        toolInput: { file: "styles.css", content: "css" },
        toolOutput: "ok",
      },
    ];

    const compacted = compactSiteWriteHistory(messages);
    const writes = compacted.filter((m) => m.role === "tool-call" && m.toolName === "write_site_file");
    expect(writes).toHaveLength(2);
    expect(writes.map((m) => (m as { toolCallId?: string }).toolCallId)).toEqual(["w2", "w3"]);
    expect(compacted.some((m) => m.role === "tool-call" && m.toolName === "check_site")).toBe(true);
  });
});

describe("compactGenerateCodeHistory", () => {
  test("redacts older generate_code payloads", () => {
    const messages = [
      {
        role: "tool-call" as const,
        content: "",
        toolName: "generate_code",
        toolCallId: "g1",
        toolInput: { code: "old()" },
        toolOutput: "ok",
      },
      {
        role: "tool-call" as const,
        content: "",
        toolName: "generate_code",
        toolCallId: "g2",
        toolInput: { code: "new()" },
        toolOutput: "ok",
      },
    ];

    const compacted = compactGenerateCodeHistory(messages);
    expect((compacted[0] as { toolInput: { code: string } }).toolInput.code).toContain("omitted");
    expect((compacted[1] as { toolInput: { code: string } }).toolInput.code).toBe("new()");
  });
});

describe("buildLangChainMessages", () => {
  test("site: orphan tool-call emits paired AIMessage + ToolMessage", () => {
    const result = buildSiteMessages([
      {
        role: "tool-call",
        content: "",
        toolCallId: "tc-1",
        toolName: "check_site",
        toolInput: "bad",
        toolOutput: undefined,
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(AIMessage);
    expect(result[1]).toBeInstanceOf(ToolMessage);
    const ai = result[0] as AIMessage;
    expect(ai.tool_calls?.[0]?.args).toEqual({});
    expect(ai.tool_calls?.[0]?.id).toBe("tc-1");
    expect((result[1] as ToolMessage).content).toBe("");
    expect((result[1] as ToolMessage).tool_call_id).toBe("tc-1");
  });

  test("coding: drops superseded writes via redact then pairs tool results", () => {
    const result = buildCodingMessages([
      { role: "assistant", content: "updating" },
      {
        role: "tool-call",
        content: "",
        toolCallId: "g1",
        toolName: "generate_code",
        toolInput: { code: "old" },
        toolOutput: "saved",
      },
    ]);

    expect(result[0]).toBeInstanceOf(AIMessage);
    expect(result[1]).toBeInstanceOf(ToolMessage);
    const ai = result[0] as AIMessage;
    expect(ai.tool_calls?.[0]?.args).toEqual({ code: "old" });
    expect((result[1] as ToolMessage).content).toBe("saved");
  });

  test("coding: non-object toolInput becomes empty args", () => {
    const result = buildCodingMessages([
      {
        role: "tool-call",
        content: "",
        toolCallId: "x",
        toolName: "browser",
        toolInput: ["oops"],
        toolOutput: "done",
      },
    ]);
    const ai = result[0] as AIMessage;
    expect(ai.tool_calls?.[0]?.args).toEqual({});
  });
});
