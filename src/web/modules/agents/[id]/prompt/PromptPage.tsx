import { CloseSquare, Diskette, DocumentText } from "@solar-icons/react";
import { Button, message } from "antd";
import type * as MonacoNS from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "src/common/api";
import { SettingKey } from "src/common/enum";
import { type EditorInstance, MonacoEditor } from "src/components/MonacoEditor";
import { updateAgent } from "src/modules/agents/common/agentsSlice";
import { ensureLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { getSettingValues } from "src/modules/settings/common/settingsApi";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { useAgentDetailContext } from "../common/agentDetailContext";
import { PromptAgentPanel } from "./PromptAgentPanel";

const EDITOR_OPTIONS: MonacoNS.editor.IStandaloneEditorConstructionOptions = {
  fontSize: 14,
  lineHeight: 1.7,
  padding: { top: 20, bottom: 24 },
  lineNumbers: "off",
  folding: false,
  renderLineHighlight: "none",
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  wordWrap: "on",
};

const PLACEHOLDER = "Write instructions for this agent…\n\nPersonality, rules, tone, and what it should do.";

const SIDEBAR_DEFAULT = 400;
const SIDEBAR_MIN = 300;
const SIDEBAR_MAX = 560;
const AUTOSAVE_MS = 800;

function ResizableSplitter({
  sidebarWidth,
  onResize,
  children,
}: {
  sidebarWidth: number;
  onResize: (w: number) => void;
  children: [React.ReactNode, React.ReactNode];
}) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const onDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = sidebarWidth;
      setIsDragging(true);
    },
    [sidebarWidth],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = startX.current - e.clientX;
      onResize(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW.current + dx)));
    };
    const onUp = () => {
      if (dragging.current) {
        dragging.current = false;
        setIsDragging(false);
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [onResize]);

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ userSelect: isDragging ? "none" : undefined, cursor: isDragging ? "col-resize" : undefined }}>
      <div className="h-full min-w-0 flex-1 overflow-hidden">{children[0]}</div>
      <div
        onMouseDown={onDown}
        className={[
          "group relative z-10 h-full w-px shrink-0 cursor-col-resize transition-colors duration-150",
          isDragging ? "bg-brand/50" : "bg-border hover:bg-brand/40",
        ].join(" ")}
      >
        <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
      </div>
      <div className="h-full shrink-0 overflow-hidden" style={{ width: sidebarWidth }}>
        {children[1]}
      </div>
    </div>
  );
}

export function PromptPage({ onClose }: { onClose?: () => void }) {
  const { id, systemPrompt, setSystemPrompt, agent } = useAgentDetailContext();

  const editorRef = useRef<EditorInstance | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);

  const dispatch = useAppDispatch();
  const providerItems = useAppSelector((s) => s.llmProviders.items);
  const providersLoaded = useAppSelector((s) => s.llmProviders.items.length > 0 || s.llmProviders.total === 0);
  const [providerId, setProviderId] = useState<string | undefined>(undefined);
  const [model, setModel] = useState("");
  const initializedRef = useRef(false);

  const [savedPrompt, setSavedPrompt] = useState(agent.systemPrompt ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = systemPrompt !== savedPrompt;
  const promptRef = useRef(systemPrompt);
  promptRef.current = systemPrompt;
  const savedPromptRef = useRef(savedPrompt);
  savedPromptRef.current = savedPrompt;
  const savingRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void dispatch(ensureLlmProviders());
  }, [dispatch]);

  useEffect(() => {
    if (!providersLoaded || providerItems.length === 0) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    getSettingValues([SettingKey.PromptAssistantProvider, SettingKey.PromptAssistantModel]).then((s) => {
      const savedProvider = s[SettingKey.PromptAssistantProvider] ?? "";
      const match = providerItems.find((p) => p.id === savedProvider) ?? providerItems[0];
      setProviderId(match.id);
      const savedModel = s[SettingKey.PromptAssistantModel] ?? "";
      if (savedModel) setModel(savedModel);
    });
  }, [providersLoaded, providerItems]);

  const applyPrompt = useCallback(
    (newPrompt: string) => {
      const editor = editorRef.current;
      const monacoModel = editor?.getModel();
      if (!editor || !monacoModel) {
        setSystemPrompt(newPrompt);
        return;
      }
      if (newPrompt === monacoModel.getValue()) return;
      editor.executeEdits("ai-update", [
        {
          range: monacoModel.getFullModelRange(),
          text: newPrompt,
        },
      ]);
      setSystemPrompt(newPrompt);
    },
    [setSystemPrompt],
  );

  const lastAgentPromptRef = useRef(agent.systemPrompt ?? "");
  useEffect(() => {
    const newPrompt = agent.systemPrompt ?? "";
    if (newPrompt !== lastAgentPromptRef.current) {
      lastAgentPromptRef.current = newPrompt;
      savedPromptRef.current = newPrompt;
      setSavedPrompt(newPrompt);
      applyPrompt(newPrompt);
    }
  }, [agent.systemPrompt, applyPrompt]);

  const savePrompt = useCallback(
    async (value?: string) => {
      const next = value ?? promptRef.current;
      if (next === savedPromptRef.current) return;
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      try {
        await dispatch(updateAgent({ id, systemPrompt: next || null })).unwrap();
        lastAgentPromptRef.current = next;
        savedPromptRef.current = next;
        setSavedPrompt(next);
      } catch {
        message.error("Failed to save prompt");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [dispatch, id],
  );

  const savePromptRef = useRef(savePrompt);
  savePromptRef.current = savePrompt;

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void savePromptRef.current();
    }, AUTOSAVE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      void savePromptRef.current();
    };
  }, []);

  const handleChange = useCallback(
    (v: string | undefined) => {
      const next = v ?? "";
      setSystemPrompt(next);
      if (next !== savedPromptRef.current) scheduleAutosave();
    },
    [setSystemPrompt, scheduleAutosave],
  );

  const handleSave = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    void savePrompt();
  }, [savePrompt]);

  const isEmpty = !systemPrompt || systemPrompt.trim().length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/12">
            <DocumentText size={15} className="text-brand-soft" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold leading-none text-foreground">Instruct</div>
            {agent.name ? <div className="mt-1 truncate text-[11px] leading-none text-tertiary-foreground">{agent.name}</div> : null}
          </div>
          {dirty && !saving ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-brand-soft">
              <span className="size-1.5 animate-pulse rounded-full bg-brand-soft" />
              Unsaved
            </span>
          ) : null}
        </div>
        <Button
          type="primary"
          size="small"
          icon={!saving ? <Diskette width={14} height={14} /> : undefined}
          loading={saving}
          disabled={!dirty && !saving}
          onClick={handleSave}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-tertiary-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <CloseSquare size={18} />
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1">
        <ResizableSplitter sidebarWidth={sidebarWidth} onResize={setSidebarWidth}>
          <div className="relative h-full overflow-hidden bg-background">
            <MonacoEditor
              language="markdown"
              value={systemPrompt}
              onChange={handleChange}
              onSave={handleSave}
              onMount={(editor) => {
                editorRef.current = editor;
              }}
              options={EDITOR_OPTIONS}
            />
            {isEmpty ? (
              <div className="pointer-events-none absolute inset-0 select-none px-5 pt-5">
                <span
                  className="text-muted-foreground"
                  style={{ fontSize: 14, fontFamily: "var(--font-family-mono)", lineHeight: "1.7", whiteSpace: "pre-wrap" }}
                >
                  {PLACEHOLDER}
                </span>
              </div>
            ) : null}
          </div>

          <PromptAgentPanel
            providerId={providerId}
            model={model}
            streamUrl={`/api/agents/${id}/assistant/prompt/stream`}
            onChangeAiProvider={(pid) => {
              setProviderId(pid);
              setModel("");
              void apiClient.patch("/api/settings", {
                [SettingKey.PromptAssistantProvider]: pid,
              });
            }}
            onChangeModel={(m) => {
              setModel(m);
              void apiClient.patch("/api/settings", {
                [SettingKey.PromptAssistantModel]: m,
              });
            }}
          />
        </ResizableSplitter>
      </div>
    </div>
  );
}
