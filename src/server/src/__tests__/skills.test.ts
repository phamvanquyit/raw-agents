import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Skills API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let skillId: string;
  let refId: string;
  let agentId: string;

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;

    const agentRes = await authRequest(app, token, "POST", "/api/agents", {
      name: "Skill Agent",
      systemPrompt: "You are helpful",
    });
    expect(agentRes.status).toBe(201);
    const agent = (await agentRes.json()) as { id: string };
    agentId = agent.id;
  });

  afterAll(() => cleanup());

  test("POST /api/skills — create skill", async () => {
    const res = await authRequest(app, token, "POST", "/api/skills", {
      name: "code-review",
      description: "Review PRs for quality and standards",
      content: "Follow checklist. See reference `api-details` when needed.",
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; name: string; description: string; content: string };
    expect(data.name).toBe("code-review");
    expect(data.description).toContain("Review PRs");
    expect(data.content).toContain("checklist");
    skillId = data.id;
  });

  test("POST /api/skills — reject empty name", async () => {
    const res = await authRequest(app, token, "POST", "/api/skills", {
      name: "",
      description: "x",
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/skills — list includes created", async () => {
    const res = await authRequest(app, token, "GET", "/api/skills");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: { id: string }[]; total: number };
    expect(data.items.some((s) => s.id === skillId)).toBe(true);
  });

  test("GET /api/skills/:id — detail", async () => {
    const res = await authRequest(app, token, "GET", `/api/skills/${skillId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; name: string };
    expect(data.id).toBe(skillId);
    expect(data.name).toBe("code-review");
  });

  test("PUT /api/skills/:id — update content", async () => {
    const res = await authRequest(app, token, "PUT", `/api/skills/${skillId}`, {
      content: `---
name: code-review
description: Review PRs for quality and standards
---

Updated body. Use reference \`examples\`.
`,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { content: string };
    expect(data.content).toContain("Updated body");
  });

  test("POST /api/skills/:id/references — add reference", async () => {
    const res = await authRequest(app, token, "POST", `/api/skills/${skillId}/references`, {
      name: "examples",
      title: "Examples",
      content: "Example review comments…",
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; name: string; title: string };
    expect(data.name).toBe("examples");
    expect(data.title).toBe("Examples");
    refId = data.id;
  });

  test("GET /api/skills/:id/references — list", async () => {
    const res = await authRequest(app, token, "GET", `/api/skills/${skillId}/references`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; name: string }[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((r) => r.id === refId)).toBe(true);
  });

  test("PUT /api/skills/:id/references/:refId — update", async () => {
    const res = await authRequest(app, token, "PUT", `/api/skills/${skillId}/references/${refId}`, {
      content: "Updated examples",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { content: string };
    expect(data.content).toBe("Updated examples");
  });

  test("GET /api/agents/:id/skill-assignments — empty initially", async () => {
    const res = await authRequest(app, token, "GET", `/api/agents/${agentId}/skill-assignments`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as unknown[];
    expect(data).toEqual([]);
  });

  test("POST /api/agents/:id/skill-assignments — assign skill", async () => {
    const res = await authRequest(app, token, "POST", `/api/agents/${agentId}/skill-assignments`, {
      skillId,
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { skillId: string; skill: { name: string } };
    expect(data.skillId).toBe(skillId);
    expect(data.skill.name).toBe("code-review");
  });

  test("GET /api/agents/:id/skill-assignments — has assignment", async () => {
    const res = await authRequest(app, token, "GET", `/api/agents/${agentId}/skill-assignments`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { skillId: string }[];
    expect(data).toHaveLength(1);
    expect(data[0].skillId).toBe(skillId);
  });

  test("PUT /api/agents/:id/skill-assignments — replace all", async () => {
    const res = await authRequest(app, token, "PUT", `/api/agents/${agentId}/skill-assignments`, {
      items: [{ skillId }],
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { skillId: string }[];
    expect(data).toHaveLength(1);
  });

  test("DELETE /api/agents/:id/skill-assignments/:aid — remove", async () => {
    const listRes = await authRequest(app, token, "GET", `/api/agents/${agentId}/skill-assignments`);
    const list = (await listRes.json()) as { id: string }[];
    const aid = list[0].id;

    const res = await authRequest(app, token, "DELETE", `/api/agents/${agentId}/skill-assignments/${aid}`);
    expect(res.status).toBe(200);

    const verify = await authRequest(app, token, "GET", `/api/agents/${agentId}/skill-assignments`);
    const data = (await verify.json()) as unknown[];
    expect(data).toEqual([]);
  });

  test("PUT /api/skills/:id — draftContent does not change content", async () => {
    const before = await authRequest(app, token, "GET", `/api/skills/${skillId}`);
    const beforeData = (await before.json()) as { content: string };
    const published = beforeData.content;

    const draftBody = `---
name: code-review
description: Review PRs for quality and standards
---

AI draft only — not published yet.
`;
    const res = await authRequest(app, token, "PUT", `/api/skills/${skillId}`, {
      draftContent: draftBody,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { content: string; draftContent: string | null };
    expect(data.content).toBe(published);
    expect(data.draftContent).toContain("AI draft only");
  });

  test("PUT /api/skills/:id — Accept draft publishes content", async () => {
    const draftBody = `---
name: code-review
description: Review PRs for quality and standards
---

Accepted draft body.
`;
    const res = await authRequest(app, token, "PUT", `/api/skills/${skillId}`, {
      content: draftBody,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { content: string; draftContent: string | null };
    expect(data.content).toContain("Accepted draft body");
    expect(data.draftContent).toBe(data.content);
  });

  test("writeSkillDraftPath — AI draft for new reference keeps content empty", async () => {
    const { writeSkillDraftPath, getReferenceByName, getSkill } = await import(
      "../modules/skills/skills.service.js"
    );
    const written = writeSkillDraftPath(skillId, "references/ai-notes.md", "# AI notes\n\nDraft only.\n");
    expect(written.path).toBe("references/ai-notes.md");
    expect(written.content).toContain("Draft only");

    const row = getReferenceByName(skillId, "ai-notes");
    expect(row).not.toBeNull();
    expect(row!.content).toBe("");
    expect(row!.draftContent).toContain("Draft only");

    const skill = getSkill(skillId)!;
    // published skill content unchanged by reference draft write
    expect(skill.content).toContain("Accepted draft body");
  });

  test("PUT /api/skills/:id/references/:refId — Accept reference draft", async () => {
    const listRes = await authRequest(app, token, "GET", `/api/skills/${skillId}/references`);
    const list = (await listRes.json()) as { id: string; name: string; content: string }[];
    const aiRef = list.find((r) => r.name === "ai-notes");
    expect(aiRef).toBeTruthy();

    const res = await authRequest(app, token, "PUT", `/api/skills/${skillId}/references/${aiRef!.id}`, {
      content: "# AI notes\n\nPublished.\n",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { content: string; draftContent: string | null };
    expect(data.content).toContain("Published");
    expect(data.draftContent).toBe(data.content);
  });

  test("DELETE /api/skills/:id/references/:refId — delete reference", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/skills/${skillId}/references/${refId}`);
    expect(res.status).toBe(200);
  });

  test("DELETE /api/skills/:id — delete skill", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/skills/${skillId}`);
    expect(res.status).toBe(200);
    const getRes = await authRequest(app, token, "GET", `/api/skills/${skillId}`);
    expect(getRes.status).toBe(400);
  });
});

describe("Skills runtime — read_skill / edit_skill_file / prompt", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let agentId: string;
  let ownerId: string;
  let skillId: string;
  let otherAgentId: string;

  const publishedBody = `---
name: runtime-skill
description: Runtime coverage skill
---

Published instructions. See \`api-notes\`.
`;

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
    ownerId = admin.user.id;

    const agentRes = await authRequest(app, token, "POST", "/api/agents", {
      name: "Runtime Skill Agent",
      systemPrompt: "You are helpful",
    });
    expect(agentRes.status).toBe(201);
    agentId = ((await agentRes.json()) as { id: string }).id;

    const otherRes = await authRequest(app, token, "POST", "/api/agents", {
      name: "No Skills Agent",
      systemPrompt: "You are helpful",
    });
    expect(otherRes.status).toBe(201);
    otherAgentId = ((await otherRes.json()) as { id: string }).id;

    const skillRes = await authRequest(app, token, "POST", "/api/skills", {
      name: "runtime-skill",
      description: "Runtime coverage skill",
      content: publishedBody,
    });
    expect(skillRes.status).toBe(201);
    skillId = ((await skillRes.json()) as { id: string }).id;

    const refRes = await authRequest(app, token, "POST", `/api/skills/${skillId}/references`, {
      name: "api-notes",
      title: "API Notes",
      content: "Published reference body.",
    });
    expect(refRes.status).toBe(201);

    const assignRes = await authRequest(app, token, "POST", `/api/agents/${agentId}/skill-assignments`, {
      skillId,
    });
    expect(assignRes.status).toBe(201);
  });

  afterAll(() => cleanup());

  test("makeReadSkillTool — loads assigned skill body + references list", async () => {
    const { makeReadSkillTool } = await import("../modules/agents/raw-agent/llm-tools/read-skill.tool.js");
    const tool = makeReadSkillTool(agentId);
    const raw = await tool.invoke({ name: "runtime-skill" });
    const data = JSON.parse(String(raw)) as {
      ok: boolean;
      skill: string;
      content: string;
      references: { name: string; title: string }[];
    };
    expect(data.ok).toBe(true);
    expect(data.skill).toBe("runtime-skill");
    expect(data.content).toContain("Published instructions");
    expect(data.references.some((r) => r.name === "api-notes")).toBe(true);
  });

  test("makeReadSkillTool — loads named reference", async () => {
    const { makeReadSkillTool } = await import("../modules/agents/raw-agent/llm-tools/read-skill.tool.js");
    const tool = makeReadSkillTool(agentId);
    const raw = await tool.invoke({ name: "runtime-skill", reference: "api-notes" });
    const data = JSON.parse(String(raw)) as {
      ok: boolean;
      reference: string;
      title: string;
      content: string;
    };
    expect(data.ok).toBe(true);
    expect(data.reference).toBe("api-notes");
    expect(data.title).toBe("API Notes");
    expect(data.content).toBe("Published reference body.");
  });

  test("makeReadSkillTool — rejects unassigned skill", async () => {
    const { makeReadSkillTool } = await import("../modules/agents/raw-agent/llm-tools/read-skill.tool.js");
    const tool = makeReadSkillTool(otherAgentId);
    const raw = await tool.invoke({ name: "runtime-skill" });
    const data = JSON.parse(String(raw)) as { ok: boolean; error: string };
    expect(data.ok).toBe(false);
    expect(data.error).toContain("not assigned");
  });

  test("makeReadSkillTool — missing reference lists available", async () => {
    const { makeReadSkillTool } = await import("../modules/agents/raw-agent/llm-tools/read-skill.tool.js");
    const tool = makeReadSkillTool(agentId);
    const raw = await tool.invoke({ name: "runtime-skill", reference: "nope" });
    const data = JSON.parse(String(raw)) as {
      ok: boolean;
      available_references: { name: string }[];
    };
    expect(data.ok).toBe(false);
    expect(data.available_references.some((r) => r.name === "api-notes")).toBe(true);
  });

  test("makeReadSkillTool — ignores draft; returns published content only", async () => {
    const draftBody = `---
name: runtime-skill
description: Runtime coverage skill
---

DRAFT ONLY — agents must not see this.
`;
    const putRes = await authRequest(app, token, "PUT", `/api/skills/${skillId}`, {
      draftContent: draftBody,
    });
    expect(putRes.status).toBe(200);

    const { makeReadSkillTool } = await import("../modules/agents/raw-agent/llm-tools/read-skill.tool.js");
    const tool = makeReadSkillTool(agentId);
    const raw = await tool.invoke({ name: "runtime-skill" });
    const data = JSON.parse(String(raw)) as { ok: boolean; content: string };
    expect(data.ok).toBe(true);
    expect(data.content).toContain("Published instructions");
    expect(data.content).not.toContain("DRAFT ONLY");
  });

  test("resolveSystemPrompt — injects assigned skill name + description", async () => {
    const { resolveSystemPrompt } = await import("../modules/agents/raw-agent/utils/buildSystemPrompt.js");
    const prompt = resolveSystemPrompt(agentId, undefined, ownerId);
    expect(prompt).toContain("<skills>");
    expect(prompt).toContain("runtime-skill");
    expect(prompt).toContain("Runtime coverage skill");
    expect(prompt).toContain("read_skill");
    expect(prompt).not.toContain("Published instructions");
  });

  test("resolveAgentTools — always includes read_skill", async () => {
    const { resolveAgentTools } = await import("../modules/agents/raw-agent/utils/resolveTools.js");
    const tools = resolveAgentTools(agentId, [], ownerId);
    expect(tools.some((t) => t.name === "read_skill")).toBe(true);
  });

  test("makeEditSkillFileTool — mode=full writes draft, leaves content published", async () => {
    const { makeEditSkillFileTool } = await import("../modules/skills/common/agent-tools/edit-skill-file.tool.js");
    const tool = makeEditSkillFileTool(skillId);
    const next = `---
name: runtime-skill
description: Runtime coverage skill
---

Full rewrite via assistant draft.
`;
    const raw = await tool.invoke({ path: "SKILL.md", mode: "full", content: next, summary: "rewrite" });
    const data = JSON.parse(String(raw)) as { ok: boolean; path: string; content: string };
    expect(data.ok).toBe(true);
    expect(data.path).toBe("SKILL.md");
    expect(data.content).toContain("Full rewrite via assistant draft");

    const getRes = await authRequest(app, token, "GET", `/api/skills/${skillId}`);
    const skill = (await getRes.json()) as { content: string; draftContent: string | null };
    expect(skill.content).toContain("Published instructions");
    expect(skill.draftContent).toContain("Full rewrite via assistant draft");
  });

  test("makeEditSkillFileTool — mode=replace on SKILL.md draft", async () => {
    const { makeEditSkillFileTool } = await import("../modules/skills/common/agent-tools/edit-skill-file.tool.js");
    const tool = makeEditSkillFileTool(skillId);
    const raw = await tool.invoke({
      path: "SKILL.md",
      mode: "replace",
      edits: [{ old_string: "Full rewrite via assistant draft.", new_string: "Replaced hunk body." }],
    });
    const data = JSON.parse(String(raw)) as { ok: boolean; content: string };
    expect(data.ok).toBe(true);
    expect(data.content).toContain("Replaced hunk body.");
    expect(data.content).not.toContain("Full rewrite via assistant draft.");
  });

  test("makeEditSkillFileTool — mode=full creates reference draft", async () => {
    const { makeEditSkillFileTool } = await import("../modules/skills/common/agent-tools/edit-skill-file.tool.js");
    const tool = makeEditSkillFileTool(skillId);
    const raw = await tool.invoke({
      path: "references/edge-cases.md",
      mode: "full",
      content: "# Edge cases\n\nDraft ref.\n",
    });
    const data = JSON.parse(String(raw)) as { ok: boolean; path: string };
    expect(data.ok).toBe(true);
    expect(data.path).toBe("references/edge-cases.md");

    const { getReferenceByName } = await import("../modules/skills/skills.service.js");
    const row = getReferenceByName(skillId, "edge-cases");
    expect(row).not.toBeNull();
    expect(row!.content).toBe("");
    expect(row!.draftContent).toContain("Draft ref.");
  });

  test("makeEditSkillFileTool — invalid path / empty replace rejected", async () => {
    const { makeEditSkillFileTool } = await import("../modules/skills/common/agent-tools/edit-skill-file.tool.js");
    const tool = makeEditSkillFileTool(skillId);

    const badPath = JSON.parse(String(await tool.invoke({ path: "evil.txt", mode: "full", content: "x" }))) as {
      ok: boolean;
      error: string;
    };
    expect(badPath.ok).toBe(false);

    const emptyReplace = JSON.parse(
      String(await tool.invoke({ path: "references/brand-new.md", mode: "replace", edits: [{ old_string: "a", new_string: "b" }] })),
    ) as { ok: boolean; error: string };
    expect(emptyReplace.ok).toBe(false);
    expect(emptyReplace.error).toContain("empty");
  });

  test("buildSkillAgentSystemPrompt — includes working SKILL.md and refs", async () => {
    const { buildSkillAgentSystemPrompt } = await import("../modules/skills/common/agent-tools/edit-skill-file.tool.js");
    const prompt = buildSkillAgentSystemPrompt(skillId);
    expect(prompt).toContain(skillId);
    expect(prompt).toContain("runtime-skill");
    expect(prompt).toContain("<current_skill_md>");
    expect(prompt).toContain("references/api-notes.md");
    expect(prompt).toContain("edit_skill_file");
  });

  test("POST /api/skills/:id/assistant/stream — unknown skill → SSE error", async () => {
    const res = await authRequest(app, token, "POST", "/api/skills/does-not-exist/assistant/stream", {
      providerId: "x",
      modelId: "y",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("data:");
    expect(text).toContain('"type":"error"');
    expect(text).toContain("Skill not found");
  });

  test("POST /api/skills/:id/assistant/stream — bad provider → SSE error", async () => {
    const res = await authRequest(app, token, "POST", `/api/skills/${skillId}/assistant/stream`, {
      providerId: "missing-provider",
      modelId: "missing-model",
      messages: [{ role: "user", content: "Tighten SKILL.md" }],
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("data:");
    expect(text).toContain('"type":"error"');
    expect(text).toContain("Provider");
  });
});
