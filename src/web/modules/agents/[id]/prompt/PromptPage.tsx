import type * as MonacoNS from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "src/common/api";
import { SettingKey } from "src/common/enum";
import { type EditorInstance, MonacoEditor } from "src/components/ui/MonacoEditor";
import { fetchLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { useAgentDetailContext } from "../common/agentDetailContext";
import { PromptAgentPanel } from "./PromptAgentPanel";

// ── Monaco options for the prompt editor ──────────────────────────────────────
const EDITOR_OPTIONS: MonacoNS.editor.IStandaloneEditorConstructionOptions = {
  fontSize: 14,
  lineHeight: 1.7,
  padding: { top: 14, bottom: 14 },
  lineNumbers: "off",
  folding: false,
  renderLineHighlight: "none",
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
};

const PLACEHOLDER = "Write your system prompt here...\n\nDefine the agent's personality, behavior, and instructions.";

// ── Resizable Splitter ────────────────────────────────────────────────────────

const SIDEBAR_DEFAULT = 380;
const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 560;

function ResizableSplitter({
  sidebarWidth,
  onResize,
  children,
}: { sidebarWidth: number; onResize: (w: number) => void; children: [React.ReactNode, React.ReactNode] }) {
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
      <div className="flex-1 min-w-0 h-full overflow-hidden">{children[0]}</div>
      <div
        onMouseDown={onDown}
        className={[
          "w-px shrink-0 h-full cursor-col-resize z-10 transition-colors duration-150",
          isDragging ? "bg-primary/50" : "bg-border hover:bg-primary/40",
        ].join(" ")}
      />
      <div className="h-full overflow-hidden shrink-0" style={{ width: sidebarWidth }}>
        {children[1]}
      </div>
    </div>
  );
}

// ─── Prompt Page ──────────────────────────────────────────────────────────────

export function PromptPage() {
  const { id, systemPrompt, setSystemPrompt, agent } = useAgentDetailContext();

  const editorRef = useRef<EditorInstance | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);

  // ── Provider / model (persisted) ──
  const dispatch = useAppDispatch();
  const providerItems = useAppSelector((s) => s.llmProviders.items);
  const providersLoaded = useAppSelector((s) => s.llmProviders.items.length > 0 || s.llmProviders.total === 0);
  const settings = useAppSelector((s) => s.settings.data);
  const [providerId, setProviderId] = useState<string | undefined>(undefined);
  const [model, setModel] = useState("");
  const initializedRef = useRef(false);

  useEffect(() => {
    dispatch(fetchLlmProviders());
  }, [dispatch]);

  useEffect(() => {
    if (!providersLoaded || providerItems.length === 0) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    const savedProvider = settings[SettingKey.PromptAssistantProvider] ?? "";
    const match = providerItems.find((p) => p.id === savedProvider) ?? providerItems[0];
    setProviderId(match.id);
    const savedModel = settings[SettingKey.PromptAssistantModel] ?? "";
    if (savedModel) setModel(savedModel);
  }, [providersLoaded, providerItems, settings]);

  // ── Apply prompt via executeEdits (preserves undo history) ──
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

  // ── Sync editor when agent data updates from WS (agents:updated) ──
  const lastAgentPromptRef = useRef(agent.systemPrompt ?? "");
  useEffect(() => {
    const newPrompt = agent.systemPrompt ?? "";
    if (newPrompt !== lastAgentPromptRef.current) {
      lastAgentPromptRef.current = newPrompt;
      applyPrompt(newPrompt);
    }
  }, [agent.systemPrompt, applyPrompt]);

  const isEmpty = !systemPrompt || systemPrompt.trim().length === 0;

  return (
    <ResizableSplitter sidebarWidth={sidebarWidth} onResize={setSidebarWidth}>
      {/* Editor */}
      <div className="relative h-full overflow-hidden">
        <MonacoEditor
          language="markdown"
          value={systemPrompt}
          onChange={(v) => setSystemPrompt(v ?? "")}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
          options={EDITOR_OPTIONS}
        />
        {/* Placeholder overlay */}
        {isEmpty && (
          <div className="absolute inset-0 pointer-events-none select-none" style={{ padding: "14px 0", paddingLeft: 20 }}>
            <span
              className="text-muted/50"
              style={{ fontSize: 14, fontFamily: "'Geist Mono Variable', 'Geist Mono', monospace", lineHeight: "1.7", whiteSpace: "pre-wrap" }}
            >
              {PLACEHOLDER}
            </span>
          </div>
        )}
      </div>

      {/* AI Sidebar */}
      <PromptAgentPanel
        providerId={providerId}
        model={model}
        streamUrl={`/api/agents/${id}/assistant/prompt/stream`}
        maxSteps={6}
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
  );
}
