import { zodSchema } from "src/common/types/tool";
import type { Tool } from "src/common/types/tool";
import { z } from "zod";

// ── update_prompt — frontend-only tool ──────────────────────────────────────
// AI gọi tool này để cập nhật system prompt vào textarea.

export const UPDATE_PROMPT_TOOL_NAME = "update_prompt";

const updatePromptSchema = z.object({
  prompt: z.string().describe("The complete new system prompt content. This will replace all current content in the editor."),
  summary: z.string().optional().describe("A short description of the changes made (displayed to the user)."),
});

/**
 * Factory: tạo update_prompt tool với callback để set state bên ngoài.
 */
export function makeUpdatePromptTool(onApply: (prompt: string) => void): Tool {
  return {
    description:
      "Update the entire system prompt content in the editor. Always use this tool when writing or editing a prompt. NEVER return the prompt as text in the conversation.",
    inputSchema: zodSchema(updatePromptSchema),
    execute: async ({ prompt, summary }: { prompt: string; summary?: string }) => {
      onApply(prompt);
      return {
        ok: true,
        message: summary ?? "System prompt has been successfully updated.",
      };
    },
  };
}
