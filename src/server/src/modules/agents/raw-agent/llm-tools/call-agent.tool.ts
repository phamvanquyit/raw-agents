/**
 * call-agent.tool.ts — Builtin tool: call another agent
 *
 * NOTE: generateAgent is imported lazily to avoid circular dependency:
 *   agentRunner → resolveTools → call-agent → agentRunner
 *
 * LangGraph JS version — uses @langchain/core/tools
 */

import { tool } from "@langchain/core/tools";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { agents, getDb } from "../../../../common/db/client.js";

export function makeCallAgentTool(callerAgentId?: string) {
  return tool(
    async (rawArgs: any) => {
      const agent_id: string | undefined = rawArgs?.agent_id ?? rawArgs?.agentId ?? rawArgs?.id;
      const message: string = rawArgs?.message ?? rawArgs?.msg ?? "";
      const context: string | undefined = rawArgs?.context;

      if (!agent_id) {
        return JSON.stringify({
          success: false,
          agent_id: undefined,
          response: null,
          error: `call_agent: agent_id missing. Got keys: ${Object.keys(rawArgs ?? {}).join(", ")}`,
        });
      }

      const baseMessage = context ? `${message}\n\n---\n**Additional context:**\n${context}` : message;

      // Resolve caller agent name for context injection
      let callerName = "Another agent";
      if (callerAgentId) {
        try {
          const db = getDb();
          const caller = db.select({ name: agents.name }).from(agents).where(eq(agents.id, callerAgentId)).get();
          if (caller?.name) callerName = caller.name;
        } catch {
          /* ignore */
        }
      }

      // Wrap message with inter-agent context so the called agent knows
      // it's being invoked by another agent, not a human user.
      const fullMessage = `<caller_context>
This request comes from agent "${callerName}" (not a human user).
You are being called as a sub-agent to handle a specific task.

Rules for your response:
- Be concise and information-dense. No filler, no pleasantries.
- Provide complete, actionable information in your response.
- Do NOT ask follow-up questions — you will not get a reply.
- Focus solely on executing the task and returning the result.
</caller_context>

${baseMessage}`;

      try {
        // Lazy import to avoid circular dep: agentRunner → resolveTools → call-agent → agentRunner
        const { generateAgent } = await import("../utils/agentRunner.js");
        // allowCallAgent:false — prevent sub-agents from calling other agents (avoids recursive loops)
        const { text, steps } = await generateAgent(agent_id, [{ role: "user", content: fullMessage }], { allowCallAgent: false });
        return JSON.stringify({ success: true, agent_id, response: text, steps, error: null });
      } catch (err) {
        return JSON.stringify({ success: false, agent_id, response: null, steps: [], error: String(err) });
      }
    },
    {
      name: "call_agent",
      description: `Calls another AI agent by their agent_id and returns their response.

IMPORTANT:
- You MUST provide a valid agent_id (UUID) — get it from the "\<callable_agents\>" section in your system prompt.
- Do NOT call this tool without agent_id. It will fail.
- agent_id must be the exact UUID string shown next to the agent's name, e.g. agent_id: \`4d0196c4-...\`
- You CAN call multiple agents in PARALLEL by making multiple call_agent calls in the same step. Do this when the tasks are independent.

Use this when you need help from a specialist agent — for research, writing, analysis, translation, code review, etc.
The target agent will run with its own system prompt, memory, tools, and notes.

Tips:
- Be specific and detailed in your message to the agent.
- Include all context the agent needs to help you effectively.`,
      schema: z.object({
        agent_id: z.string().describe("The ID of the agent to call (UUID)."),
        message: z.string().min(1).describe("The message or task to send to the agent. Be specific."),
        context: z.string().optional().describe("Optional extra context from your current task."),
      }),
    },
  );
}

export const TOOL_DEF = {
  toolName: "call_agent",
  toolLabel: "Call Agent",
  description: "Delegates a prompt or task to another specialized agent by ID and returns their response.",
  parameters: {
    type: "object",
    properties: {
      agent_id: { type: "string", description: "The ID of the agent to call (UUID)" },
      message: { type: "string", description: "The message or task to send to the agent" },
      context: { type: "string", description: "Optional extra context from your current task" },
    },
    required: ["agent_id", "message"],
  },
};
