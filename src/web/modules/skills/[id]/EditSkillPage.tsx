import { CheckCircle, CloseCircle } from "@solar-icons/react";
import { Alert, Button, Modal, message } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { wsClient } from "src/common/api/wsClient";
import { SettingKey } from "src/common/enum";
import type { Skill, SkillReference } from "src/common/types";
import { MonacoDiffEditor, MonacoEditor } from "src/components/MonacoEditor";
import RenderIf from "src/components/RenderIf";
import { fetchLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { getSettingValues, saveSettingValues } from "src/modules/settings/common/settingsApi";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { ensureSkillMarkdown, parseSkillFrontmatter } from "../common/frontmatter";
import { skillsApi } from "../common/skillsApi";
import { deleteSkill, updateSkill, upsertSkillLocal } from "../common/skillsSlice";
import { EditSkillHeader } from "./components/EditSkillHeader";
import { SkillAgentPanel, type ToolActionEvent } from "./components/SkillAgentPanel";
import { type SkillEditorFile, SkillFileTree } from "./components/SkillFileTree";

function EditSkillSkeleton() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <div className="size-8 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="ml-auto h-7 w-16 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-[220px] shrink-0 border-r border-border bg-card p-3">
          <div className="mb-3 h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="mb-2 h-7 w-full animate-pulse rounded-md bg-muted" />
          <div className="mb-2 h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="mb-1.5 h-6 w-full animate-pulse rounded-md bg-muted/70" />
          <div className="h-6 w-4/5 animate-pulse rounded-md bg-muted/70" />
        </div>
        <div className="min-w-0 flex-1 border-r border-border">
          <div className="h-10 border-b border-border bg-card/80 px-3 py-3">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-2 p-4">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted/60" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted/60" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted/60" />
          </div>
        </div>
        <div className="w-[380px] shrink-0 bg-card p-3">
          <div className="mb-4 h-3 w-28 animate-pulse rounded bg-muted" />
          <div className="mx-auto mt-16 h-3 w-48 animate-pulse rounded bg-muted/60" />
          <div className="mx-auto mt-3 h-8 w-52 animate-pulse rounded-lg bg-muted/50" />
          <div className="mx-auto mt-2 h-8 w-52 animate-pulse rounded-lg bg-muted/50" />
        </div>
      </div>
    </div>
  );
}

function pendingDraft(published: string, draft: string | null | undefined): string | null {
  if (draft == null || draft === "") return null;
  return draft !== published ? draft : null;
}

export default function EditSkillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const [skill, setSkill] = useState<Skill | null>(null);
  const [refs, setRefs] = useState<SkillReference[]>([]);
  const [selected, setSelected] = useState<SkillEditorFile>({ kind: "skill", path: "SKILL.md" });
  const [skillDraft, setSkillDraft] = useState("");
  const [savedSkill, setSavedSkill] = useState("");
  const [refDrafts, setRefDrafts] = useState<Record<string, string>>({});
  const [savedRefs, setSavedRefs] = useState<Record<string, string>>({});
  /** path → AI draft content pending Accept */
  const [aiDrafts, setAiDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const skillDraftRef = useRef(skillDraft);
  skillDraftRef.current = skillDraft;
  const refDraftsRef = useRef(refDrafts);
  refDraftsRef.current = refDrafts;

  const providerItems = useAppSelector((s) => s.llmProviders.items);
  const providersLoaded = useAppSelector((s) => s.llmProviders.items.length > 0 || s.llmProviders.total === 0);
  const [providerId, setProviderId] = useState<string | undefined>(undefined);
  const [model, setModel] = useState("");
  const providerInitRef = useRef(false);

  const syncAiDraftsFromServer = useCallback((s: Skill, references: SkillReference[]) => {
    const next: Record<string, string> = {};
    const skillMd = ensureSkillMarkdown(s.content, s.name, s.description);
    const skillPending = pendingDraft(skillMd, s.draftContent);
    if (skillPending) next["SKILL.md"] = skillPending;
    for (const r of references) {
      const path = `references/${r.name}.md`;
      const pending = pendingDraft(r.content, r.draftContent);
      if (pending) next[path] = pending;
    }
    setAiDrafts(next);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    const [s, references] = await Promise.all([skillsApi.get(id), skillsApi.listReferences(id)]);
    const md = ensureSkillMarkdown(s.content, s.name, s.description);
    setSkill(s);
    setRefs(references);
    setSkillDraft(md);
    setSavedSkill(md);
    const map: Record<string, string> = {};
    for (const r of references) map[r.id] = r.content;
    setRefDrafts(map);
    setSavedRefs({ ...map });
    syncAiDraftsFromServer(s, references);
    dispatch(upsertSkillLocal(s));
  }, [id, dispatch, syncAiDraftsFromServer]);

  useEffect(() => {
    load().catch(() => setError("Failed to load skill"));
  }, [load]);

  useEffect(() => {
    dispatch(fetchLlmProviders());
  }, [dispatch]);

  useEffect(() => {
    if (!providersLoaded || providerItems.length === 0) return;
    if (providerInitRef.current) return;
    providerInitRef.current = true;
    getSettingValues([SettingKey.SkillAssistantProvider, SettingKey.SkillAssistantModel]).then((s) => {
      const savedProvider = s[SettingKey.SkillAssistantProvider] ?? "";
      const savedModel = s[SettingKey.SkillAssistantModel] ?? "";
      const match = providerItems.find((p) => p.id === savedProvider) ?? providerItems[0];
      setProviderId(match.id);
      setModel(savedModel);
    });
  }, [providersLoaded, providerItems]);

  const savedSkillRef = useRef(savedSkill);
  savedSkillRef.current = savedSkill;

  // WS: sync drafts when AI writes / other tabs update
  useEffect(() => {
    if (!id) return;
    const unsub = wsClient.on<Skill>("skills:updated", (payload) => {
      if (payload.id !== id) return;
      setSkill(payload);
      dispatch(upsertSkillLocal(payload));
      const md = ensureSkillMarkdown(payload.content, payload.name, payload.description);
      const localWasClean = skillDraftRef.current === savedSkillRef.current;
      setSavedSkill(md);
      if (localWasClean) setSkillDraft(md);

      void skillsApi.listReferences(id).then((list) => {
        setRefs(list);
        setSavedRefs((prevSaved) => {
          const nextSaved: Record<string, string> = { ...prevSaved };
          for (const r of list) nextSaved[r.id] = r.content;
          return nextSaved;
        });
        setRefDrafts((prevLocal) => {
          const nextLocal: Record<string, string> = { ...prevLocal };
          for (const r of list) {
            if (!(r.id in nextLocal)) nextLocal[r.id] = r.content;
          }
          return nextLocal;
        });
        syncAiDraftsFromServer(payload, list);
      });
    });
    return unsub;
  }, [id, dispatch, syncAiDraftsFromServer]);

  const dirtyPaths = useMemo(() => {
    const set = new Set<string>();
    if (skillDraft !== savedSkill) set.add("SKILL.md");
    for (const r of refs) {
      if ((refDrafts[r.id] ?? "") !== (savedRefs[r.id] ?? "")) {
        set.add(`references/${r.name}.md`);
      }
    }
    return set;
  }, [skillDraft, savedSkill, refs, refDrafts, savedRefs]);

  const draftPaths = useMemo(() => new Set(Object.keys(aiDrafts)), [aiDrafts]);

  const isDirty = dirtyPaths.size > 0;

  const editorValue = selected.kind === "skill" ? skillDraft : (refDrafts[selected.refId] ?? "");
  const selectedAiDraft = aiDrafts[selected.path] ?? null;
  const showDiff = selectedAiDraft != null && selectedAiDraft !== editorValue;

  const handleEditorChange = (value: string | undefined) => {
    const next = value ?? "";
    if (selected.kind === "skill") {
      setSkillDraft(next);
    } else {
      setRefDrafts((prev) => ({ ...prev, [selected.refId]: next }));
    }
  };

  const handleSave = async () => {
    if (!id || !skill) return;
    setSaving(true);
    setError("");
    try {
      if (skillDraft !== savedSkill) {
        const updated = (await dispatch(updateSkill({ id, content: skillDraft })).unwrap()) as Skill;
        const md = ensureSkillMarkdown(updated.content, updated.name, updated.description);
        setSkill(updated);
        setSkillDraft(md);
        setSavedSkill(md);
        setAiDrafts((prev) => {
          const next = { ...prev };
          delete next["SKILL.md"];
          return next;
        });
      }
      for (const r of refs) {
        const draft = refDrafts[r.id] ?? "";
        if (draft !== (savedRefs[r.id] ?? "")) {
          await skillsApi.updateReference(id, r.id, { content: draft });
        }
      }
      const references = await skillsApi.listReferences(id);
      setRefs(references);
      const map: Record<string, string> = {};
      for (const r of references) map[r.id] = r.content;
      setRefDrafts(map);
      setSavedRefs({ ...map });
      syncAiDraftsFromServer(
        (await skillsApi.get(id)) as Skill,
        references,
      );
      message.success("Saved");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!id || !skill) return;
    Modal.confirm({
      title: `Delete "${skill.name}"?`,
      content: "This action cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        await dispatch(deleteSkill(id)).unwrap();
        message.success("Deleted");
        navigate("/skills");
      },
    });
  };

  const handleCreateReference = useCallback(
    async (body: { name: string; title: string }) => {
      if (!id) return;
      const created = await skillsApi.createReference(id, body);
      setRefs((prev) => [...prev, created]);
      setRefDrafts((d) => ({ ...d, [created.id]: created.content }));
      setSavedRefs((d) => ({ ...d, [created.id]: created.content }));
      setSelected({
        kind: "reference",
        path: `references/${created.name}.md`,
        refId: created.id,
        name: created.name,
      });
    },
    [id],
  );

  const handleDeleteReference = useCallback(
    async (refId: string) => {
      if (!id) return;
      const removed = refs.find((r) => r.id === refId);
      await skillsApi.deleteReference(id, refId);
      setRefs((prev) => prev.filter((r) => r.id !== refId));
      setRefDrafts((d) => {
        const next = { ...d };
        delete next[refId];
        return next;
      });
      setSavedRefs((d) => {
        const next = { ...d };
        delete next[refId];
        return next;
      });
      if (removed) {
        setAiDrafts((prev) => {
          const next = { ...prev };
          delete next[`references/${removed.name}.md`];
          return next;
        });
      }
      if (selectedRef.current.kind === "reference" && selectedRef.current.refId === refId) {
        setSelected({ kind: "skill", path: "SKILL.md" });
      }
    },
    [id, refs],
  );

  const applyAiDraft = useCallback(
    (path: string, content: string) => {
      setAiDrafts((prev) => ({ ...prev, [path]: content }));
      if (path === "SKILL.md") {
        setSelected({ kind: "skill", path: "SKILL.md" });
        return;
      }
      const m = path.match(/^references\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/);
      if (!m || !id) return;
      const name = m[1];
      void skillsApi.listReferences(id).then((list) => {
        setRefs(list);
        const map: Record<string, string> = {};
        for (const r of list) {
          map[r.id] = r.content;
        }
        setRefDrafts((prev) => {
          const next = { ...prev };
          for (const r of list) {
            if (!(r.id in next)) next[r.id] = r.content;
          }
          return next;
        });
        setSavedRefs((prev) => {
          const next = { ...prev };
          for (const r of list) {
            if (!(r.id in next)) next[r.id] = r.content;
          }
          return next;
        });
        const ref = list.find((r) => r.name === name);
        if (ref) {
          setSelected({ kind: "reference", path, refId: ref.id, name: ref.name });
        }
      });
    },
    [id],
  );

  const handleAcceptAiDraft = async () => {
    if (!id || !selectedAiDraft) return;
    const draft = selectedAiDraft;
    try {
      if (selected.kind === "skill") {
        const updated = (await dispatch(updateSkill({ id, content: draft })).unwrap()) as Skill;
        const md = ensureSkillMarkdown(updated.content, updated.name, updated.description);
        setSkill(updated);
        setSkillDraft(md);
        setSavedSkill(md);
        setAiDrafts((prev) => {
          const next = { ...prev };
          delete next["SKILL.md"];
          return next;
        });
      } else {
        await skillsApi.updateReference(id, selected.refId, { content: draft });
        setRefDrafts((prev) => ({ ...prev, [selected.refId]: draft }));
        setSavedRefs((prev) => ({ ...prev, [selected.refId]: draft }));
        setRefs((prev) =>
          prev.map((r) => (r.id === selected.refId ? { ...r, content: draft, draftContent: draft } : r)),
        );
        setAiDrafts((prev) => {
          const next = { ...prev };
          delete next[selected.path];
          return next;
        });
      }
      message.success("Draft accepted");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRejectAiDraft = async () => {
    if (!id) return;
    const published = editorValue;
    try {
      if (selected.kind === "skill") {
        await skillsApi.update(id, { draftContent: published });
        setSkill((prev) => (prev ? { ...prev, draftContent: published } : prev));
      } else {
        await skillsApi.updateReference(id, selected.refId, { draftContent: published });
        setRefs((prev) =>
          prev.map((r) => (r.id === selected.refId ? { ...r, draftContent: published } : r)),
        );
      }
      setAiDrafts((prev) => {
        const next = { ...prev };
        delete next[selected.path];
        return next;
      });
      message.success("Draft rejected");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToolAction = useCallback(
    (event: ToolActionEvent) => {
      if (event.toolName !== "edit_skill_file" || event.type !== "tool-result") return;
      let out: { ok?: boolean; path?: string; content?: string } | null = null;
      if (typeof event.output === "string") {
        try {
          out = JSON.parse(event.output) as { ok?: boolean; path?: string; content?: string };
        } catch {
          out = null;
        }
      } else if (event.output && typeof event.output === "object") {
        out = event.output as { ok?: boolean; path?: string; content?: string };
      }
      if (out?.ok && out.path && typeof out.content === "string") {
        applyAiDraft(out.path, out.content);
      }
    },
    [applyAiDraft],
  );

  const headerTitle = useMemo(() => {
    const parsed = parseSkillFrontmatter(skillDraft);
    return parsed.frontmatter.name?.trim() || skill?.name || "Skill";
  }, [skillDraft, skill?.name]);

  if (!id) return null;

  if (!skill) {
    return <EditSkillSkeleton />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <EditSkillHeader
        title={headerTitle}
        isDirty={isDirty}
        saving={saving}
        onSave={() => void handleSave()}
        onDelete={handleDelete}
      />

      <RenderIf condition={!!error}>
        <Alert type="error" description={error} showIcon closable onClose={() => setError("")} className="m-3" />
      </RenderIf>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SkillFileTree
          references={refs}
          selected={selected}
          dirtyPaths={dirtyPaths}
          draftPaths={draftPaths}
          onSelect={setSelected}
          onCreateReference={handleCreateReference}
          onDeleteReference={handleDeleteReference}
        />

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center border-b border-border bg-card/80 px-3">
            <span className="truncate font-mono text-xs text-muted-foreground">{selected.path}</span>
            {showDiff && (
              <span className="ml-2 rounded-md bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-soft">
                AI draft
              </span>
            )}
          </div>
          <div className="monaco-scroll-pad-x relative min-h-0 flex-1 overflow-hidden">
            {showDiff && selectedAiDraft != null ? (
              <>
                <MonacoDiffEditor
                  key={`diff-${selected.path}`}
                  language="markdown"
                  original={editorValue}
                  modified={selectedAiDraft}
                  height="100%"
                  options={{
                    fontSize: 14,
                    wordWrap: "on",
                    renderSideBySide: false,
                    renderIndicators: false,
                    lineNumbers: "off",
                    glyphMargin: false,
                    folding: false,
                    lineDecorationsWidth: 0,
                  }}
                />
                <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
                  <span className="mr-1 text-xs font-medium tracking-wide text-brand-soft">AI draft</span>
                  <Button
                    size="small"
                    type="primary"
                    icon={<CheckCircle size={14} />}
                    onClick={() => void handleAcceptAiDraft()}
                    className="!border-success !bg-success hover:!bg-success/90"
                  >
                    Accept
                  </Button>
                  <Button size="small" danger icon={<CloseCircle size={14} />} onClick={() => void handleRejectAiDraft()}>
                    Reject
                  </Button>
                </div>
              </>
            ) : (
              <MonacoEditor
                key={selected.path}
                language="markdown"
                value={editorValue}
                onChange={handleEditorChange}
                onSave={() => void handleSave()}
                height="100%"
                options={{
                  fontSize: 14,
                  wordWrap: "on",
                  lineNumbers: "off",
                  glyphMargin: false,
                  folding: false,
                  lineDecorationsWidth: 0,
                  guides: { indentation: false, highlightActiveIndentation: false },
                }}
              />
            )}
          </div>
        </main>

        <SkillAgentPanel
          providerId={providerId}
          model={model}
          streamUrl={`/api/skills/${id}/assistant/stream`}
          onToolAction={handleToolAction}
          onModelChange={(pid, m) => {
            setProviderId(pid);
            setModel(m);
            void saveSettingValues({
              [SettingKey.SkillAssistantProvider]: pid,
              [SettingKey.SkillAssistantModel]: m,
            });
          }}
        />
      </div>
    </div>
  );
}
