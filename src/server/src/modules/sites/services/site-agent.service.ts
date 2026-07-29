import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { browserTool } from "../../../common/ai/agent-tools/browser.tool.js";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { streamAgentSSE } from "../../../common/ai/stream-agent-sse.js";
import { resolvePublicBaseUrl } from "../../../common/spa-html.js";
import { makeDatatableTool } from "../../agents/raw-agent/llm-tools/datatable.tool.js";
import { makeKvStoreTool } from "../../agents/raw-agent/llm-tools/kv-store.tool.js";
import { makeSecretsTool } from "../../agents/raw-agent/llm-tools/secrets.tool.js";
import { makeCheckSiteTool } from "../common/agent-tools/check-site.tool.js";
import { makePreviewSiteTool } from "../common/agent-tools/preview-site.tool.js";
import { makeReadSiteFilesTool } from "../common/agent-tools/read-site-files.tool.js";
import { makeWriteSiteFileTool } from "../common/agent-tools/write-site-file.tool.js";
import { buildSiteAgentSystemPrompt } from "../common/site-agent-prompt.js";
import { getSite } from "../sites.service.js";

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

export interface SiteAgentStreamRequest {
  providerId: string;
  modelId: string;
  messages: (TextMessage | ToolCallMessage)[];
  maxSteps?: number;
  /** Browser origin (window.location.origin) — used when PUBLIC_BASE_URL is unset */
  publicOrigin?: string;
}

function buildLangChainMessages(messages: SiteAgentStreamRequest["messages"]): BaseMessage[] {
  const result: BaseMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

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
      while (j < messages.length && messages[j].role === "tool-call") {
        const tc = messages[j] as ToolCallMessage;
        toolCalls.push({
          id: tc.toolCallId || `tc-${j}`,
          name: tc.toolName || "unknown",
          args: (tc.toolInput as Record<string, unknown>) ?? {},
        });
        j++;
      }

      if (toolCalls.length > 0) {
        result.push(new AIMessage({ content: msg.content, tool_calls: toolCalls }));
        for (let k = i + 1; k < j; k++) {
          const tc = messages[k] as ToolCallMessage;
          if (tc.toolOutput != null) {
            result.push(
              new ToolMessage({
                content: tc.toolOutput,
                tool_call_id: tc.toolCallId || `tc-${k}`,
              }),
            );
          }
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
              args: (tc.toolInput as Record<string, unknown>) ?? {},
            },
          ],
        }),
      );
      if (tc.toolOutput != null) {
        result.push(new ToolMessage({ content: tc.toolOutput, tool_call_id: toolCallId }));
      }
    }
  }

  return result;
}

export async function streamSiteAgent(
  siteId: string,
  body: SiteAgentStreamRequest,
  stream: SSEStreamingApi,
  abortSignal?: AbortSignal,
  request?: Request,
): Promise<void> {
  const { providerId, modelId, messages, maxSteps = 16, publicOrigin } = body;
  const site = getSite(siteId);
  const model = await getChatModel(providerId, modelId);
  const publicBaseUrl = resolvePublicBaseUrl({ request, clientOrigin: publicOrigin });

  const tools: StructuredToolInterface[] = [
    makeReadSiteFilesTool(siteId),
    makeWriteSiteFileTool(siteId),
    makeCheckSiteTool(siteId),
    makePreviewSiteTool(siteId),
    browserTool,
    makeKvStoreTool(["list"]),
    makeSecretsTool(["list"]),
    makeDatatableTool(["list_projects", "get_schema"]),
  ];

  const systemPrompt = buildSiteAgentSystemPrompt(siteId, {
    name: site.name,
    slug: site.slug,
    publicBaseUrl: publicBaseUrl || undefined,
  });
  const agent = createAgent({
    model,
    tools,
    systemPrompt,
  });

  await streamAgentSSE({
    agent,
    messages: buildLangChainMessages(messages),
    maxSteps,
    stream,
    abortSignal,
    contextEstimate: { systemPrompt, tools },
  });
}
