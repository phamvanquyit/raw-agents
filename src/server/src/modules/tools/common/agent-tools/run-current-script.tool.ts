/**
 * run_current_script — coding assistant builtin tool.
 *
 * Reads draftCode via tools service, runs it via Python sandbox.
 * AI only passes testInput — code is read from DB automatically.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { runDraftCode } from "../../tools.service.js";

export function makeRunCurrentScriptTool(toolId: string) {
  return tool(
    async ({ testInput }) => {
      const inputJson = JSON.stringify(testInput ?? {});
      const resultStr = await runDraftCode(toolId, inputJson);

      if (!resultStr) {
        return JSON.stringify({ ok: false, error: "No draft code available. Use generate_code first." });
      }

      try {
        const parsed = JSON.parse(resultStr);
        if (parsed.ok) {
          return JSON.stringify({ success: true, output: parsed.result, console: parsed.console });
        }
        return JSON.stringify({ success: false, error: parsed.error, console: parsed.console });
      } catch {
        return resultStr;
      }
    },
    {
      name: "run_current_script",
      description:
        "Run the current Python script from the editor inside a sandbox environment (Python venv). Pass only testInput — the code is automatically fetched from the editor. Returns { success: true, output } or { success: false, error } with a Python traceback.",
      schema: z.object({
        testInput: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Parameters object to pass into the script. Keys must match the @param declarations in the code. Example: { query: 'lofi music', limit: 5 }",
          ),
      }),
    },
  );
}
