/**
 * update_prompt — prompt assistant builtin tool.
 *
 * Broadcasts prompt update to FE via WS hub.
 * FE listens and applies to the prompt editor.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { wsHub } from "../../../common/ws/wsHub.js";

export const TOOL_DEF = {
  toolName: "update_prompt",
  toolLabel: "Update Prompt",
  description:
    "Update the entire system prompt content in the editor. Always use this tool when writing or editing a prompt. NEVER return the prompt as text in the conversation.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The complete new system prompt content. This will replace all current content in the editor.",
      },
      summary: {
        type: "string",
        description: "A short description of the changes made (displayed to the user).",
      },
    },
    required: ["prompt"],
  },
};

const schema = z.object({
  prompt: z.string().describe("The complete new system prompt content. This will replace all current content in the editor."),
  summary: z.string().optional().describe("A short description of the changes made (displayed to the user)."),
});

export function makeUpdatePromptTool(clientId: string) {
  return tool(
    async ({ prompt, summary }) => {
      // Send to the specific client that initiated the request
      wsHub.send(clientId, "assistant:prompt-updated" as any, { prompt, summary });

      return JSON.stringify({
        ok: true,
        message: summary ?? "System prompt has been successfully updated.",
      });
    },
    {
      name: "update_prompt",
      description:
        "Update the entire system prompt content in the editor. Always use this tool when writing or editing a prompt. NEVER return the prompt as text in the conversation.",
      schema,
    },
  );
}
