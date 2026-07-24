/**
 * call-agent.tool.ts — Builtin: one LangChain tool per callable sub-agent.
 *
 * NOTE: generateAgent is imported lazily to avoid circular dependency:
 *   agentRunner → resolveTools → call-agent → agentRunner
 */

import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { agents, getDb } from "../../../../common/db/client.js";

export const CALL_AGENT_TOOL_PREFIX = "call_agent__";

export function callAgentToolName(agentId: string): string {
  return `${CALL_AGENT_TOOL_PREFIX}${agentId.replace(/-/g, "_")}`;
}

export function isCallAgentToolName(name: string | null | undefined): boolean {
  if (!name) return false;
  return name === "call_agent" || name.startsWith(CALL_AGENT_TOOL_PREFIX);
}

export function parseCallAgentToolTargetId(toolName: string): string | null {
  if (toolName === "call_agent") return null;
  if (!toolName.startsWith(CALL_AGENT_TOOL_PREFIX)) return null;
  const raw = toolName.slice(CALL_AGENT_TOOL_PREFIX.length);
  const parts = raw.split("_");
  if (parts.length !== 5) return null;
  return parts.join("-");
}

export type CallAgentTarget = {
  id: string;
  name: string;
  description: string | null;
};

/** Nested non-stream sub-agent wall clock — keeps parent SSE from hanging forever. */
const CALL_AGENT_TIMEOUT_MS = 5 * 60_000;

export type MakeCallAgentToolsOptions = {
  callerAgentId: string;
  targets: CallAgentTarget[];
  ownerId: string;
  isGuest?: boolean;
  abortSignal?: AbortSignal;
  conversationId?: string | null;
};

async function runSubAgent(opts: {
  callerAgentId: string;
  targetId: string;
  message: string;
  context?: string;
  ownerId: string;
  isGuest: boolean;
  abortSignal?: AbortSignal;
  conversationId?: string | null;
}): Promise<{ success: boolean; agent_id: string; response: string | null; error: string | null }> {
  const baseMessage = opts.context ? `${opts.message}\n\n---\n**Additional context:**\n${opts.context}` : opts.message;

  let callerName = "Another agent";
  try {
    const db = getDb();
    const caller = db.select({ name: agents.name }).from(agents).where(eq(agents.id, opts.callerAgentId)).get();
    if (caller?.name) callerName = caller.name;
  } catch {
    /* ignore */
  }

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
    const { generateAgent } = await import("../utils/agentRunner.js");

    // Combine caller abort with a wall-clock so a hung sub-agent cannot stall the parent forever
    const timeoutAbort = new AbortController();
    const timer = setTimeout(() => timeoutAbort.abort(), CALL_AGENT_TIMEOUT_MS);
    const onParentAbort = () => timeoutAbort.abort();
    if (opts.abortSignal) {
      if (opts.abortSignal.aborted) timeoutAbort.abort();
      else opts.abortSignal.addEventListener("abort", onParentAbort, { once: true });
    }

    try {
      const result = await generateAgent(opts.targetId, [{ role: "user", content: fullMessage }], {
        allowCallAgent: false,
        ownerId: opts.ownerId,
        isGuest: opts.isGuest,
        abortSignal: timeoutAbort.signal,
        conversationId: opts.conversationId,
      });
      if (result.usage) {
        try {
          const { recordTokenUsage } = await import("../../../usage/usage.service.js");
          recordTokenUsage({
            agentId: opts.targetId,
            conversationId: opts.conversationId ?? null,
            ownerId: opts.ownerId,
            providerId: result.usage.providerId,
            model: result.usage.model,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
            systemPromptTokens: result.usage.systemPromptTokens,
            toolDefTokens: result.usage.toolDefTokens,
            conversationTokens: result.usage.conversationTokens,
            estimatedTotal: result.usage.estimatedTotal,
          });
        } catch {
          /* best-effort */
        }
      }
      return { success: true, agent_id: opts.targetId, response: result.text, error: null };
    } finally {
      clearTimeout(timer);
      opts.abortSignal?.removeEventListener("abort", onParentAbort);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = (err instanceof Error && err.name === "AbortError") || msg.includes("AbortError") || opts.abortSignal?.aborted;
    return {
      success: false,
      agent_id: opts.targetId,
      response: null,
      error: timedOut && !opts.abortSignal?.aborted ? `call_agent timed out after ${CALL_AGENT_TIMEOUT_MS / 1000}s` : msg,
    };
  }
}

/**
 * Build one tool per callable agent (tool-per-agent pattern).
 * Schema is only message/context — target agent is bound in the closure.
 */
export function makeCallAgentTools(options: MakeCallAgentToolsOptions): StructuredToolInterface[] {
  const { callerAgentId, targets, ownerId, isGuest = false, abortSignal, conversationId } = options;

  return targets.map((target) => {
    const toolName = callAgentToolName(target.id);
    const descSuffix = target.description ? ` ${target.description}` : "";

    return tool(
      async (rawArgs: { message?: string; context?: string; msg?: string }) => {
        const message = rawArgs?.message ?? rawArgs?.msg ?? "";
        if (!message.trim()) {
          return JSON.stringify({
            success: false,
            agent_id: target.id,
            response: null,
            error: "call_agent: message is required",
          });
        }

        const result = await runSubAgent({
          callerAgentId,
          targetId: target.id,
          message,
          context: rawArgs?.context,
          ownerId,
          isGuest,
          abortSignal,
          conversationId,
        });
        return JSON.stringify(result);
      },
      {
        name: toolName,
        description: `Delegate a task to specialist agent "${target.name}".${descSuffix}

Use this when "${target.name}" is the right specialist for the job.
Be specific and detailed in your message. Include all context needed.
You CAN call multiple specialist tools in PARALLEL in the same step when tasks are independent.`,
        schema: z.object({
          message: z.string().min(1).describe("The message or task to send to the agent. Be specific."),
          context: z.string().optional().describe("Optional extra context from your current task."),
        }),
      },
    );
  });
}
