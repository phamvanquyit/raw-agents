import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateDraftCode } from "../../jobs.service.js";

export function makeJobGenerateCodeTool(jobId: string) {
  return tool(
    async ({ code, summary }) => {
      updateDraftCode(jobId, code);
      return JSON.stringify({
        ok: true,
        message: summary ?? "Code updated to draft.",
        next: "REQUIRED NEXT TOOL CALL: run_current_job (now). Do not reply with text first. run_current_job returns instantly — then give a short summary.",
      });
    },
    {
      name: "generate_code",
      description:
        "Write the entire TypeScript job file into the editor (COMPLETELY replacing the old content). Raw TS only — NO markdown fences. You must call this tool to apply code; NEVER return code as chat text.",
      schema: z.object({
        code: z.string().describe('THE ENTIRE TypeScript job file (raw code, NO markdown fences). Top-level await OK. import rawagents from "rawagents".'),
        summary: z.string().optional().describe("Short description of changes (shown to the user)."),
      }),
    },
  );
}
