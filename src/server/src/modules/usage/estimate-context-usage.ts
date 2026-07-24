import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";

export type ContextUsageCategoryId = "system_prompt" | "tools" | "conversation";

export type ContextUsageCategory = {
  id: ContextUsageCategoryId;
  label: string;
  tokens: number;
};

export type ContextUsageEstimate = {
  categories: ContextUsageCategory[];
  systemPromptTokens: number;
  toolDefTokens: number;
  conversationTokens: number;
  estimatedTotal: number;
};

export type MessageLike = {
  role?: string;
  content?: unknown;
  thinking?: string;
  toolCalls?: unknown;
  toolCallId?: string;
  toolName?: string;
  result?: unknown;
};

export type ProviderUsageMessage = {
  id?: string | null;
  usage_metadata?: Record<string, unknown> | null;
  response_metadata?: Record<string, unknown> | null;
};

/** Approximate token count — chars/4, same ballpark as Cursor's "~" estimates. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function serializeToolSchema(tool: StructuredToolInterface): string {
  const name = tool.name ?? "";
  const description = tool.description ?? "";
  let params = "";
  const schema = (tool as { schema?: unknown }).schema;
  if (schema) {
    try {
      if (typeof (z as { toJSONSchema?: (s: unknown) => unknown }).toJSONSchema === "function") {
        params = JSON.stringify((z as { toJSONSchema: (s: unknown) => unknown }).toJSONSchema(schema));
      } else {
        params = JSON.stringify(schema);
      }
    } catch {
      try {
        const shape = (schema as { shape?: Record<string, unknown> }).shape;
        if (shape) params = JSON.stringify(Object.keys(shape));
      } catch {
        /* ignore */
      }
    }
  }
  return `${name}\n${description}\n${params}`;
}

function serializeMessages(messages: MessageLike[]): string {
  return messages
    .map((m) => {
      const role = m.role ?? "unknown";
      const content = typeof m.content === "string" ? m.content : m.content != null ? JSON.stringify(m.content) : "";
      const extras: string[] = [];
      if (m.thinking) extras.push(m.thinking);
      if (m.toolCalls) extras.push(JSON.stringify(m.toolCalls));
      if (m.toolCallId) extras.push(String(m.toolCallId));
      if (m.toolName) extras.push(String(m.toolName));
      if (m.result != null) extras.push(typeof m.result === "string" ? m.result : JSON.stringify(m.result));
      return `${role}\n${content}\n${extras.join("\n")}`;
    })
    .join("\n\n");
}

export function estimateContextUsage(input: {
  systemPrompt: string;
  tools: StructuredToolInterface[];
  messages: MessageLike[];
}): ContextUsageEstimate {
  const systemPromptTokens = estimateTokens(input.systemPrompt ?? "");
  const toolDefTokens = estimateTokens(input.tools.map(serializeToolSchema).join("\n\n"));
  const conversationTokens = estimateTokens(serializeMessages(input.messages ?? []));
  const estimatedTotal = systemPromptTokens + toolDefTokens + conversationTokens;

  return {
    systemPromptTokens,
    toolDefTokens,
    conversationTokens,
    estimatedTotal,
    categories: [
      { id: "system_prompt", label: "System prompt", tokens: systemPromptTokens },
      { id: "tools", label: "Tools", tokens: toolDefTokens },
      { id: "conversation", label: "Conversation", tokens: conversationTokens },
    ],
  };
}

function readUsageNumbers(msg: ProviderUsageMessage): { inputTokens: number; outputTokens: number; totalTokens: number } | null {
  const um = msg.usage_metadata;
  if (um && typeof um === "object") {
    const inputTokens = Number(um.input_tokens ?? um.inputTokens ?? 0);
    const outputTokens = Number(um.output_tokens ?? um.outputTokens ?? 0);
    const totalTokens = Number(um.total_tokens ?? um.totalTokens ?? inputTokens + outputTokens);
    if (inputTokens || outputTokens || totalTokens) {
      return { inputTokens, outputTokens, totalTokens: totalTokens || inputTokens + outputTokens };
    }
  }

  const usage = msg.response_metadata?.usage as Record<string, unknown> | undefined;
  if (usage && typeof usage === "object") {
    const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? 0);
    const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? 0);
    const totalTokens = Number(usage.total_tokens ?? usage.totalTokens ?? inputTokens + outputTokens);
    if (inputTokens || outputTokens || totalTokens) {
      return { inputTokens, outputTokens, totalTokens: totalTokens || inputTokens + outputTokens };
    }
  }

  return null;
}

/** Stable key so the same AI turn counted in both stream modes is not summed twice. */
export function providerUsageDedupeKey(msg: ProviderUsageMessage): string | null {
  const nums = readUsageNumbers(msg);
  if (!nums) return null;
  if (typeof msg.id === "string" && msg.id.length > 0) return `id:${msg.id}`;
  return `u:${nums.inputTokens}:${nums.outputTokens}:${nums.totalTokens}`;
}

export function extractProviderUsage(messages: ProviderUsageMessage[]): {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
} {
  let input = 0;
  let output = 0;
  let total = 0;
  let found = false;
  const seen = new Set<string>();

  for (const msg of messages) {
    const key = providerUsageDedupeKey(msg);
    if (!key || seen.has(key)) continue;
    const nums = readUsageNumbers(msg);
    if (!nums) continue;
    seen.add(key);
    found = true;
    input += nums.inputTokens;
    output += nums.outputTokens;
    total += nums.totalTokens;
  }

  if (!found) return { inputTokens: null, outputTokens: null, totalTokens: null };
  return { inputTokens: input, outputTokens: output, totalTokens: total || input + output };
}
