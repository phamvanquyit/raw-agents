import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { type EditHunk, applyEdits, normalizeToLf } from "../../../../common/ai/apply-exact-replace.js";
import {
  getSkill,
  getWorkingContent,
  listReferences,
  writeSkillDraftPath,
} from "../../skills.service.js";

const editHunkSchema = z.object({
  old_string: z.string().min(1),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
});

const editSkillFileSchema = z
  .object({
    path: z
      .string()
      .describe('Virtual file path: "SKILL.md" or "references/{name}.md"'),
    mode: z.enum(["replace", "full"]),
    content: z.string().optional(),
    edits: z.array(editHunkSchema).optional(),
    summary: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "full") {
      if (typeof val.content !== "string") {
        ctx.addIssue({ code: "custom", message: "mode=full requires content", path: ["content"] });
      }
    } else if (!val.edits || val.edits.length === 0) {
      ctx.addIssue({ code: "custom", message: "mode=replace requires a non-empty edits array", path: ["edits"] });
    }
  });

export function makeEditSkillFileTool(skillId: string) {
  return tool(
    async (input) => {
      const parsed = editSkillFileSchema.safeParse(input);
      if (!parsed.success) {
        return JSON.stringify({
          ok: false,
          error: parsed.error.issues.map((i) => i.message).join("; "),
        });
      }

      const { path, mode, content, edits, summary } = parsed.data;
      try {
        let next: string;
        if (mode === "full") {
          next = normalizeToLf(content!);
        } else {
          const current = getWorkingContent(skillId, path) ?? "";
          if (!current.trim()) {
            return JSON.stringify({
              ok: false,
              error: "file is empty — cannot replace",
              hint: 'Use mode="full" to write the complete file first.',
            });
          }
          const applied = applyEdits(current, edits as EditHunk[]);
          if (!applied.ok) {
            return JSON.stringify({ ok: false, error: applied.error, hint: applied.hint });
          }
          next = applied.content;
        }

        const written = writeSkillDraftPath(skillId, path, next);
        return JSON.stringify({
          ok: true,
          path: written.path,
          mode,
          message: summary ?? "Draft updated. User must Accept in the editor to publish.",
          content: written.content,
        });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
    {
      name: "edit_skill_file",
      description:
        'Edit a skill virtual file as a draft (user Accepts to publish). path="SKILL.md" (must keep YAML frontmatter with name + description) or path="references/{kebab-name}.md". mode="full" replaces entire file; mode="replace" applies exact edits[{ old_string, new_string }].',
      schema: editSkillFileSchema,
    },
  );
}

export function buildSkillAgentSystemPrompt(skillId: string): string {
  const skill = getSkill(skillId);
  const refs = listReferences(skillId);
  const refList =
    refs.length === 0
      ? "(none yet)"
      : refs.map((r) => `- references/${r.name}.md — ${r.title}`).join("\n");

  const workingSkillMd = getWorkingContent(skillId, "SKILL.md") ?? skill?.content ?? "";

  return `You are the Skill writing assistant inside Raw Agents.
Help the user author Cursor-style skills: SKILL.md + optional references/*.md.
Always reply in the same language the user writes in.

<skill>
id: ${skillId}
name: ${skill?.name ?? ""}
description: ${skill?.description ?? ""}
</skill>

<files>
Virtual tree (SQLite-backed, not a real disk):
  • SKILL.md — required. YAML frontmatter MUST include:
      name: human-readable skill name
      description: when to use (injected into agent prompts)
    Then the markdown body with instructions. Keep body concise; put long detail in references.
  • references/{name}.md — optional progressive-disclosure docs. Mention them from SKILL.md by name.
Current references:
${refList}
</files>

<current_skill_md>
${workingSkillMd}
</current_skill_md>

<tools>
  • edit_skill_file — write a draft of SKILL.md or references/*.md (prefer mode=replace with hunks; mode=full for new files / large rewrites). Changes land as a draft; the user Accepts in the editor to publish.
  • fetch_url / browser — research when helpful
</tools>

<rules>
- Always edit via edit_skill_file — never paste full files as chat-only text.
- Preserve valid frontmatter on SKILL.md (name + description required).
- When adding a reference, create references/{name}.md and link it from SKILL.md.
- Be concise in SKILL.md; move long checklists/examples into references.
</rules>`;
}
