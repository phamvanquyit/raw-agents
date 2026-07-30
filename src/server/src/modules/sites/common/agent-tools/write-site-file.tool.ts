import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { SITE_SOURCE_FILES, type SiteSourceFile } from "../../sites-fs.js";
import { updateSiteFile } from "../../sites.service.js";
import { readFormattedCurrentDraft } from "../format-current-draft.js";

export function makeWriteSiteFileTool(siteId: string) {
  return tool(
    async (input) => {
      const file = input.file as SiteSourceFile;
      try {
        const result = await updateSiteFile(siteId, file, input.content, "draft");
        const currentDraft = readFormattedCurrentDraft(siteId);
        return JSON.stringify({
          ok: true,
          file,
          draftDirty: result.draftDirty,
          bytes: input.content.length,
          depsInstalled: result.depsInstalled,
          next: result.depsInstalled
            ? "package.json saved and dependencies installed. Continue related edits, then check_site if you need to verify."
            : "Draft updated. Trust the content you wrote. <current_draft> below is the updated app.tsx snapshot. Call check_site after related edits if you need to verify.",
          current_draft: currentDraft,
        });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
    {
      name: "write_site_file",
      description:
        "Write a complete draft site source file (app.tsx, data.ts, actions.ts, styles.css, or package.json). Writing package.json automatically runs bun install. Returns an updated <current_draft> (app.tsx only).",
      schema: z.object({
        file: z.enum(SITE_SOURCE_FILES as unknown as [string, ...string[]]),
        content: z.string().describe("Full file contents"),
      }),
    },
  );
}
