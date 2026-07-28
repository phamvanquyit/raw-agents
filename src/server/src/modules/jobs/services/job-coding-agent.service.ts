/**
 * job-coding-agent.service.ts — Job coding assistant SSE streaming.
 */

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { browserTool } from "../../../common/ai/agent-tools/browser.tool.js";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { streamAgentSSE } from "../../../common/ai/stream-agent-sse.js";
import { makeAgentsTool } from "../../agents/raw-agent/llm-tools/agents.tool.js";
import { makeDatatableTool } from "../../agents/raw-agent/llm-tools/datatable.tool.js";
import { makeKvStoreTool } from "../../agents/raw-agent/llm-tools/kv-store.tool.js";
import { makeSecretsTool } from "../../agents/raw-agent/llm-tools/secrets.tool.js";
import { makeJobGenerateCodeTool } from "../common/agent-tools/generate-code.tool.js";
import { makeGetJobRunTool } from "../common/agent-tools/get-job-run.tool.js";
import { makeRunCurrentJobTool } from "../common/agent-tools/run-current-job.tool.js";
import { buildJobCodingSystemPrompt } from "../common/job-agent-prompt.js";
import { getDraftCode, getJob } from "../jobs.service.js";

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

export interface JobCodingStreamRequest {
  providerId: string;
  modelId: string;
  messages: (TextMessage | ToolCallMessage)[];
  maxSteps?: number;
}

const OMITTED_GENERATE_CODE = "[omitted — see <current_code> for the latest draft]";

function compactGenerateCodeHistory(messages: JobCodingStreamRequest["messages"]): JobCodingStreamRequest["messages"] {
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
    const input = m.toolInput && typeof m.toolInput === "object" && !Array.isArray(m.toolInput) ? (m.toolInput as Record<string, unknown>) : {};
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

function buildLangChainMessages(messages: JobCodingStreamRequest["messages"]): BaseMessage[] {
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
      const toolCalls: { id: string; name: string; args: Record<string, unknown> }[] = [];
      let j = i + 1;
      while (j < compacted.length && compacted[j].role === "tool-call") {
        const tc = compacted[j] as ToolCallMessage;
        toolCalls.push({
          id: tc.toolCallId || `call_${j}`,
          name: tc.toolName || "unknown",
          args: (tc.toolInput as Record<string, unknown>) ?? {},
        });
        j++;
      }
      if (toolCalls.length > 0) {
        result.push(
          new AIMessage({
            content: msg.content || "",
            tool_calls: toolCalls.map((t) => ({ id: t.id, name: t.name, args: t.args, type: "tool_call" as const })),
          }),
        );
        for (let k = i + 1; k < j; k++) {
          const tc = compacted[k] as ToolCallMessage;
          result.push(
            new ToolMessage({
              content: tc.toolOutput ?? tc.content ?? "",
              tool_call_id: tc.toolCallId || `call_${k}`,
            }),
          );
        }
        i = j - 1;
      } else {
        result.push(new AIMessage(msg.content));
      }
    }
  }

  return result;
}

export async function streamJobCodingAgent(jobId: string, body: JobCodingStreamRequest, stream: SSEStreamingApi, abortSignal?: AbortSignal): Promise<void> {
  const { providerId, modelId, messages, maxSteps = 12 } = body;
  const model = await getChatModel(providerId, modelId);

  const tools: StructuredToolInterface[] = [
    makeJobGenerateCodeTool(jobId),
    makeRunCurrentJobTool(jobId),
    makeGetJobRunTool(jobId),
    browserTool,
    makeKvStoreTool(["list"]),
    makeSecretsTool(["list"]),
    makeDatatableTool(["list_projects", "get_schema"]),
    makeAgentsTool(["list", "get"]),
  ];

  const currentCode = getDraftCode(jobId);
  const job = getJob(jobId);
  const systemPrompt = buildJobCodingSystemPrompt(currentCode, job);
  const agent = createAgent({ model, tools, systemPrompt });
  const baseMessages = buildLangChainMessages(messages);

  await streamAgentSSE({
    agent,
    messages: baseMessages,
    maxSteps,
    stream,
    abortSignal,
    contextEstimate: { systemPrompt, tools },
  });
}
