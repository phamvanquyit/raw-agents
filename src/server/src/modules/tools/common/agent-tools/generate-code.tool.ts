/**
 * generate_code — coding assistant builtin tool.
 *
 * Writes AI-generated code to draftCode field via tools service.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateDraftCode } from "../../tools.service.js";

export function makeGenerateCodeTool(toolId: string) {
  return tool(
    async ({ code, summary }) => {
      updateDraftCode(toolId, code);

      return JSON.stringify({
        ok: true,
        message: summary ?? "Code updated to draft.",
        next: "MANDATORY NEXT STEP: Call run_current_script IMMEDIATELY to test the draft code. NEVER call generate_code again before testing.",
      });
    },
    {
      name: "generate_code",
      description:
        "Write the entire Python function body into the editor (COMPLETELY replacing the old content). The 'code' field is the raw Python body — NO 'def main(input):', NO markdown fences. You must call this tool to apply the code; NEVER return code as text in the conversation.",
      schema: z.object({
        code: z
          .string()
          .describe(
            "THE ENTIRE Python function body (raw code, NO 'def main(input):' header, NO markdown fences). This is the content that will be placed INSIDE def main(input) by the system.",
          ),
        summary: z.string().optional().describe("Short description of changes made (shown to the user)."),
      }),
    },
  );
}
