/**
 * prompt-agent.service.ts — Prompt Agent SSE streaming service.
 *
 * Handles the business logic for the prompt assistant:
 *   - Resolves AI model
 *   - Builds tools (generate_prompt, browser, datatable discovery)
 *   - Creates a ReAct agent and streams SSE events
 *   - generate_prompt saves directly to DB and emits agents:updated via WS
 */

import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { browserTool } from "../../../common/ai/agent-tools/browser.tool.js";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { streamAgentSSE } from "../../../common/ai/stream-agent-sse.js";
import { agents as agentsTable, getDb } from "../../../common/db/client.js";
import { getAgent, listAssignments } from "../agents.service.js";
import { makeDatatableTool } from "../raw-agent/llm-tools/datatable.tool.js";
import { makeGeneratePromptTool } from "./llm-tools/generate-prompt.tool.js";

// ── System Prompt ─────────────────────────────────────────────────────────────

const PROMPT_AI_SYSTEM_PROMPT = `<role>
You are an expert at writing System Prompts for AI Agents. Help users draft, improve, and refine the system prompt for an AI Agent.
</role>

<workflow>
When the user asks to write or edit a prompt:

1. Understand what they want: role, behavior, tone, constraints, or any other guidance.
2. Draft a prompt that matches their intent. Do **not** force a fixed structure or template — adapt freely (short or long, structured or freeform) based on what works best for this agent.
3. Use the \`generate_prompt\` tool to apply the written prompt to the editor.
4. **Never** return the prompt as text in the chat — always use the tool.
5. After updating, briefly confirm and suggest further improvements if useful.
</workflow>

<principles>
- Clear and specific; avoid ambiguity.
- Prefer actionable instructions when useful ("Always", "Never", "When… then…").
- Include examples only when they clarify behavior.
- Match the user's language unless they ask otherwise.
- Keep it as concise as the use case allows.
- Use available tools and sub-agents listed below so the prompt references real capabilities — do **not** invent tools or agents that are not listed.
- When the agent has the \`datatable\` tool (or the user mentions workspace tables), use your discovery tools to load real project/table/column names before writing guidance — never invent schema names.
</principles>

<your_tools>
- \`generate_prompt\` — Apply the new system prompt to the editor and save it.
- \`browser\` — Stealth headless Chromium (navigate, click, fill, snapshot, etc.). Use when the user points to a URL/docs you should read before writing or improving the prompt (works for SPA / JS-rendered pages).
- \`datatable\` — Discover workspace datatables (read-only). Actions:
  - \`list_projects\` — list projects (\`id\` + \`name\`); prefer using \`id\` afterward
  - \`get_schema\` with \`project\` (id preferred) — full schema (all tables + columns)
  Flow: list_projects → get_schema(project). Use before writing prompts that reference real tables/columns.
</your_tools>`;

interface PromptAgentContext {
  agentName?: string | null;
  agentDescription?: string | null;
  currentPrompt?: string | null;
  tools: { name: string; label: string; description: string }[];
  callableAgents: { name: string; description: string | null }[];
}

/** Build the full system prompt for the prompt assistant, including agent context. */
function buildPromptSystemPrompt(ctx: PromptAgentContext): string {
  const parts = [PROMPT_AI_SYSTEM_PROMPT];

  // ── Agent identity ──
  if (ctx.agentName) {
    const desc = ctx.agentDescription?.trim() ? `\n${ctx.agentDescription.trim()}` : "";
    parts.push(`<agent>
**Name:** ${ctx.agentName}${desc}
</agent>`);
  }

  // ── Available tools ──
  if (ctx.tools.length > 0) {
    const list = ctx.tools
      .map((t) => {
        const desc = t.description?.trim() ? ` — ${t.description.trim()}` : "";
        return `- \`${t.name}\` (**${t.label}**)${desc}`;
      })
      .join("\n");
    parts.push(`<available_tools>
Tools this agent can use at runtime:

${list}
</available_tools>`);
  } else {
    parts.push(`<available_tools>
None assigned (agent still has built-in memory management).
</available_tools>`);
  }

  // ── Sub-agents ──
  if (ctx.callableAgents.length > 0) {
    const list = ctx.callableAgents
      .map((a) => {
        const desc = a.description?.trim() ? ` — ${a.description.trim()}` : "";
        return `- **${a.name}**${desc}`;
      })
      .join("\n");
    parts.push(`<sub_agents>
Sub-agents this agent can communicate with / delegate to:

${list}
</sub_agents>`);
  } else {
    parts.push(`<sub_agents>
None.
</sub_agents>`);
  }

  // ── Current prompt in editor ──
  if (ctx.currentPrompt?.trim()) {
    parts.push(`<current_prompt>
\`\`\`
${ctx.currentPrompt.trim()}
\`\`\`
</current_prompt>`);
  } else {
    parts.push(`<current_prompt>
Editor is empty — write a new system prompt based on user requirements.
</current_prompt>`);
  }

  return parts.join("\n\n");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PromptStreamRequest {
  providerId: string;
  modelId: string;
  messages: { role: string; content: string }[];
  maxSteps?: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

function loadCallableAgents(callableAgentIds: string[]): { name: string; description: string | null }[] {
  if (callableAgentIds.length === 0) return [];
  const db = getDb();
  const all = db.select({ id: agentsTable.id, name: agentsTable.name, description: agentsTable.description }).from(agentsTable).all();
  return all.filter((a) => callableAgentIds.includes(a.id)).map((a) => ({ name: a.name, description: a.description }));
}

/**
 * Stream a prompt agent session over SSE.
 *
 * @param agentId - The agent ID whose prompt is being edited
 * @param body    - Request body with model info, messages, etc.
 * @param stream  - Hono SSE stream to write events to
 */
export async function streamPromptAgent(agentId: string, body: PromptStreamRequest, stream: SSEStreamingApi, abortSignal?: AbortSignal): Promise<void> {
  const { providerId, modelId, messages, maxSteps = 6 } = body;

  // 1. Resolve model
  const model = await getChatModel(providerId, modelId);

  // 2. Build system prompt from agent data + connected tools/agents
  const agentRow = getAgent(agentId);
  const assignments = listAssignments(agentId);
  const connectedTools = assignments
    .filter((a) => a.toolId !== "builtin:call_agent")
    .map((a) => ({ name: a.tool.name, label: a.tool.label, description: a.tool.description }));
  const callableAgentIds: string[] = (agentRow?.callableAgentIds as string[] | null) ?? [];
  const callableAgents = loadCallableAgents(callableAgentIds);

  const aiSystemPrompt = buildPromptSystemPrompt({
    agentName: agentRow?.name,
    agentDescription: agentRow?.description,
    currentPrompt: agentRow?.systemPrompt,
    tools: connectedTools,
    callableAgents,
  });

  // 3. Build tools — generate_prompt saves to DB + emits WS
  // datatable is discovery-only so the prompt writer can reference real projects/tables/columns
  const tools: StructuredToolInterface[] = [makeGeneratePromptTool(agentId), browserTool, makeDatatableTool(["list_projects", "get_schema"])];

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
  await streamAgentSSE({ agent, messages: baseMessages, maxSteps, stream, abortSignal });
}
