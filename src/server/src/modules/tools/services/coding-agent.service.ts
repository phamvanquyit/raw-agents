/**
 * coding-agent.service.ts — Coding Agent SSE streaming service.
 *
 * Handles the business logic for the coding assistant:
 *   - Resolves AI model
 *   - Builds local tools (generate_code, run_current_script, browser, kv_store, secrets, datatable)
 *   - Creates a ReAct agent and streams SSE events
 */

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { browserTool } from "../../../common/ai/agent-tools/browser.tool.js";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { streamAgentSSE } from "../../../common/ai/stream-agent-sse.js";
import { makeDatatableTool } from "../../agents/raw-agent/llm-tools/datatable.tool.js";
import { makeKvStoreTool } from "../../agents/raw-agent/llm-tools/kv-store.tool.js";
import { makeSecretsTool } from "../../agents/raw-agent/llm-tools/secrets.tool.js";
import { makeGenerateCodeTool } from "../common/agent-tools/generate-code.tool.js";
import { makeRunCurrentScriptTool } from "../common/agent-tools/run-current-script.tool.js";
import { buildCodingSystemPrompt } from "../common/constants.js";
import { getDraftCode, getTool } from "../tools.service.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolCallMessage {
  role: "tool-call";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
}

interface TextMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CodingStreamRequest {
  providerId: string;
  modelId: string;
  messages: (TextMessage | ToolCallMessage)[];
}

// ── Service ───────────────────────────────────────────────────────────────────

const OMITTED_GENERATE_CODE = "[omitted — see <current_code> for the latest draft]";

export function toolCallArgs(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

/**
 * Drop full code payloads from older generate_code tool calls.
 * Keep only the latest generate_code args intact; earlier ones keep summary only.
 * Latest draft is always injected via <current_code> in the system prompt.
 */
export function compactGenerateCodeHistory(messages: CodingStreamRequest["messages"]): CodingStreamRequest["messages"] {
  let lastGenerateIdx = -1;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "tool-call" && m.toolName === "generate_code") {
      lastGenerateIdx = i;
    }
  }
  if (lastGenerateIdx < 0) return messages;

  return messages.map((m, i) => {
    if (m.role !== "tool-call" || m.toolName !== "generate_code" || i >= lastGenerateIdx) {
      return m;
    }
    const input = toolCallArgs(m.toolInput);
    if (!("code" in input)) return m;
    const { code: _code, ...rest } = input;
    return {
      ...m,
      toolInput: {
        ...rest,
        code: OMITTED_GENERATE_CODE,
      },
    };
  });
}

/**
 * Build LangChain BaseMessage[] from the enriched history that includes
 * user, assistant, and tool-call messages.
 *
 * Merges assistant text + following tool-calls into a single AIMessage
 * with tool_calls, then appends ToolMessage for each tool result.
 */
export function buildLangChainMessages(messages: CodingStreamRequest["messages"]): BaseMessage[] {
  const result: BaseMessage[] = [];
  const compacted = compactGenerateCodeHistory(messages);

  for (let i = 0; i < compacted.length; i++) {
    const msg = compacted[i];

    if (msg.role === "user") {
      result.push(new HumanMessage(msg.content));
      continue;
    }

    if (msg.role === "system") {
      result.push(new SystemMessage(msg.content));
      continue;
    }

    if (msg.role === "assistant") {
      const toolMsgs: ToolCallMessage[] = [];
      let j = i + 1;
      while (j < compacted.length && compacted[j].role === "tool-call") {
        toolMsgs.push(compacted[j] as ToolCallMessage);
        j++;
      }

      if (toolMsgs.length > 0) {
        result.push(
          new AIMessage({
            content: msg.content,
            tool_calls: toolMsgs.map((tc, idx) => ({
              id: tc.toolCallId || `tc-${i + 1 + idx}`,
              name: tc.toolName || "unknown",
              args: toolCallArgs(tc.toolInput),
            })),
          }),
        );

        for (let k = 0; k < toolMsgs.length; k++) {
          const tc = toolMsgs[k];
          result.push(
            new ToolMessage({
              content: tc.toolOutput ?? "",
              tool_call_id: tc.toolCallId || `tc-${i + 1 + k}`,
            }),
          );
        }

        i = j - 1;
      } else {
        result.push(new AIMessage(msg.content));
      }
      continue;
    }

    if (msg.role === "tool-call") {
      const tc = msg as ToolCallMessage;
      const toolCallId = tc.toolCallId || `tc-${i}`;

      result.push(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              id: toolCallId,
              name: tc.toolName || "unknown",
              args: toolCallArgs(tc.toolInput),
            },
          ],
        }),
      );

      result.push(
        new ToolMessage({
          content: tc.toolOutput ?? "",
          tool_call_id: toolCallId,
        }),
      );
    }
  }

  return result;
}

/**
 * Stream a coding agent session over SSE.
 *
 * @param toolId  - The tool ID being edited (from URL param)
 * @param body    - Request body with model info, messages, etc.
 * @param stream  - Hono SSE stream to write events to
 */
export async function streamCodingAgent(toolId: string, body: CodingStreamRequest, stream: SSEStreamingApi, abortSignal?: AbortSignal): Promise<void> {
  const { providerId, modelId, messages } = body;

  // 1. Resolve model
  const model = await getChatModel(providerId, modelId);

  // 2. Build tools — all local to this module
  // kv/secrets/datatable are discovery-only (list/schema); mutations happen via import rawagents in generated code
  const tools: StructuredToolInterface[] = [
    makeGenerateCodeTool(toolId),
    makeRunCurrentScriptTool(toolId),
    browserTool,
    makeKvStoreTool(["list"]),
    makeSecretsTool(["list"]),
    makeDatatableTool(["list_projects", "get_schema"]),
  ];

  // 3. Create agent — system prompt includes current tool metadata + draftCode from DB
  const currentCode = getDraftCode(toolId);
  const toolRow = getTool(toolId);
  const systemPrompt = buildCodingSystemPrompt(currentCode, toolRow);
  const agent = createAgent({
    model,
    tools,
    systemPrompt,
  });

  // 4. Build messages — reconstruct proper LangChain messages from enriched history
  const baseMessages = buildLangChainMessages(messages);

  // 5. Stream via shared helper
  await streamAgentSSE({
    agent,
    messages: baseMessages,
    maxSteps: 20,
    stream,
    abortSignal,
    contextEstimate: { systemPrompt, tools },
  });
}
