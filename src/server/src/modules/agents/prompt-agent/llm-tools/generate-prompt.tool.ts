/**
 * generate_prompt — prompt assistant builtin tool.
 *
 * Saves the generated prompt directly to the agent's systemPrompt in DB,
 * then broadcasts `agents:updated` via WS so FE can sync.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateAgent } from "../../agents.service.js";

const schema = z.object({
  prompt: z.string().describe("The complete new system prompt content. This will replace the agent's current systemPrompt."),
  summary: z.string().optional().describe("A short description of the changes made (displayed to the user)."),
});

/**
 * Creates a generate_prompt tool bound to a specific agentId.
 * When invoked, it writes the prompt to DB and emits agents:updated via WS.
 */
export function makeGeneratePromptTool(agentId: string) {
  return tool(
    async ({ prompt, summary }) => {
      // Save to DB + broadcast agents:updated
      updateAgent(agentId, { systemPrompt: prompt });

      return JSON.stringify({
        ok: true,
        message: summary ?? "System prompt has been updated and saved.",
      });
    },
    {
      name: "generate_prompt",
      description:
        "Update the agent's system prompt. Always use this tool when writing or editing a prompt. NEVER return the prompt as text in the conversation. The prompt will be saved to the database immediately.",
      schema,
    },
  );
}
