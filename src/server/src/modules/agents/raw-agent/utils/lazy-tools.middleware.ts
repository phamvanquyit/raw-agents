import type { StructuredToolInterface } from "@langchain/core/tools";
import { createMiddleware } from "langchain";
import { makeGetToolSchemaTool } from "../llm-tools/get-tool-schema.tool.js";

const GET_TOOL_SCHEMA_NAME = "get_tool_schema";

function shortToolDescription(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return "";
  const first = trimmed.split(/[.\n]/)[0]?.trim() || trimmed;
  if (first.length <= 100) return first;
  return `${first.slice(0, 97)}...`;
}

export type LazyToolsBundle = {
  getToolSchema: StructuredToolInterface;
  middleware: ReturnType<typeof createMiddleware>;
  catalogPromptSection: string;
  allToolsForAgent: StructuredToolInterface[];
  /**
   * Schemas currently bound on the model `tools` parameter:
   * `get_tool_schema` + any tools loaded this run. Grows only when schemas load.
   * Tool call args / results stay in conversation tokens.
   */
  toolsForEstimate: () => StructuredToolInterface[];
  loadedToolNames: () => string[];
};

/**
 * Defer full tool schemas until the model calls get_tool_schema({ names }).
 * All resolved tools stay registered for execution; wrapModelCall only exposes
 * get_tool_schema + tools whose schemas have been loaded in this run.
 */
export function buildLazyToolsBundle(resolvedTools: StructuredToolInterface[]): LazyToolsBundle {
  const registry = new Map<string, StructuredToolInterface>();
  for (const t of resolvedTools) {
    if (t.name && t.name !== GET_TOOL_SCHEMA_NAME) registry.set(t.name, t);
  }

  const loaded = new Set<string>();

  const getToolSchema = makeGetToolSchemaTool(registry, (names) => {
    for (const name of names) loaded.add(name);
  });

  const middleware = createMiddleware({
    name: "LazyToolSchemas",
    wrapModelCall: (request, handler) => {
      const visible: StructuredToolInterface[] = [getToolSchema, ...resolvedTools.filter((t) => t.name && loaded.has(t.name))];
      return handler({ ...request, tools: visible });
    },
  });

  const catalogLines = [...registry.values()].map((t) => {
    const desc = shortToolDescription(t.description ?? "");
    return desc ? `- \`${t.name}\` — ${desc}` : `- \`${t.name}\``;
  });

  const catalogPromptSection =
    catalogLines.length === 0
      ? ""
      : `<available_tools>
Tools are listed by name only. Before calling any tool, load its schema with \`get_tool_schema({ names: ["tool_a", "tool_b"] })\`. Batch every tool you need in one call. After schemas load, call those tools with their real parameters.

${catalogLines.join("\n")}
</available_tools>`;

  return {
    getToolSchema,
    middleware,
    catalogPromptSection,
    allToolsForAgent: [getToolSchema, ...resolvedTools],
    toolsForEstimate: () => [getToolSchema, ...resolvedTools.filter((t) => t.name && loaded.has(t.name))],
    loadedToolNames: () => [...loaded],
  };
}

export function appendToolsCatalog(systemPrompt: string, catalogPromptSection: string): string {
  if (!catalogPromptSection) return systemPrompt;
  return systemPrompt ? `${systemPrompt}\n\n${catalogPromptSection}` : catalogPromptSection;
}
