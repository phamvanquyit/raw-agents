/**
 * prompt-agent.service.ts — Prompt Agent SSE streaming service.
 *
 * Handles the business logic for the prompt assistant:
 *   - Resolves AI model
 *   - Builds tools (generate_prompt, fetch_webpage)
 *   - Creates a ReAct agent and streams SSE events
 *   - generate_prompt saves directly to DB and emits agents:updated via WS
 */

import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { fetchWebpageTool } from "../../../common/ai/agent-tools/fetch-webpage.tool.js";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { streamAgentSSE } from "../../../common/ai/stream-agent-sse.js";
import { getAgent } from "../agents.service.js";
import { makeGeneratePromptTool } from "./llm-tools/generate-prompt.tool.js";

// ── System Prompt ─────────────────────────────────────────────────────────────

const PROMPT_AI_SYSTEM_PROMPT = `You are an expert at writing System Prompts for AI Agents. Your task is to help users draft, improve, and refine the system prompt for an AI Agent.

WHEN THE USER REQUESTS TO WRITE/EDIT A PROMPT:
1. Carefully analyze the request: agent role, personality, desired behavior.
2. Draft the prompt following these standards:
   - Clearly define the ROLE of the agent in the first sentence.
   - Describe the PERSONALITY and tone of voice.
   - List CAPABILITIES and CONSTRAINTS.
   - Add OUTPUT FORMAT instructions if necessary.
3. Use the \`generate_prompt\` tool to apply the written prompt to the editor.
4. NEVER return the prompt as text in the chat — always use the tool.

GOOD PROMPT PRINCIPLES:
- Clear, specific, avoid ambiguity.
- Use action instructions ("Always", "Never", "When...then...").
- Provide examples if needed to clarify behavior.
- Prompt should be in English (unless the user requests another language).
- Keep the prompt concise but complete.

TOOL AVAILABLE:
- generate_prompt: Apply the new system prompt to the editor and save it.

AFTER UPDATING:
- Briefly confirm that the prompt has been updated.
- Suggest further improvements if needed.`;

/** Build the full system prompt for the prompt assistant, including agent context. */
function buildPromptSystemPrompt(agentName?: string | null, currentPrompt?: string | null): string {
  const parts = [PROMPT_AI_SYSTEM_PROMPT];
  if (agentName) parts.push(`\nAgent being edited: "${agentName}".`);
  if (currentPrompt?.trim()) {
    parts.push(`\nCURRENT system prompt in the editor (for reference and improvement):\n\`\`\`\n${currentPrompt.trim()}\n\`\`\``);
  } else {
    parts.push("\nEditor is currently empty — please write a new system prompt based on user requirements.");
  }
  return parts.join("\n");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PromptStreamRequest {
  providerId: string;
  modelId: string;
  messages: { role: string; content: string }[];
  maxSteps?: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Stream a prompt agent session over SSE.
 *
 * @param agentId - The agent ID whose prompt is being edited
 * @param body    - Request body with model info, messages, etc.
 * @param stream  - Hono SSE stream to write events to
 */
export async function streamPromptAgent(agentId: string, body: PromptStreamRequest, stream: SSEStreamingApi): Promise<void> {
  const { providerId, modelId, messages, maxSteps = 6 } = body;

  // 1. Resolve model
  const model = await getChatModel(providerId, modelId);

  // 2. Build system prompt from agent data in DB
  const agentRow = getAgent(agentId);
  const aiSystemPrompt = buildPromptSystemPrompt(agentRow?.name, agentRow?.systemPrompt);

  // 3. Build tools — generate_prompt saves to DB + emits WS
  const tools: StructuredToolInterface[] = [makeGeneratePromptTool(agentId), fetchWebpageTool];

  // 4. Create agent
  const agent = createAgent({
    model,
    tools,
    systemPrompt: aiSystemPrompt,
  });

  // 5. Build messages
  const baseMessages: BaseMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "user") baseMessages.push(new HumanMessage(msg.content));
    else if (msg.role === "assistant") baseMessages.push(new AIMessage(msg.content));
    else if (msg.role === "system") baseMessages.push(new SystemMessage(msg.content));
  }

  // 6. Stream via shared helper
  await streamAgentSSE({ agent, messages: baseMessages, maxSteps, stream });
}
