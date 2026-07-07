// ─── Edit Tool Page ───────────────────────────────────────────────────────────
// Route: /tools/:id — Full-page editor for a single tool.
// Layout: Header → [ Editor(top) + RunPanel(bottom, collapsible) | CodingAgentPanel(right) ]

import { CheckCircle, CloseCircle, Play, TestTube } from "@solar-icons/react";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "src/common/api";
import { wsClient } from "src/common/api/wsClient";
import { SettingKey } from "src/common/enum";
import type { AgentTool } from "src/common/types";
import { type EditorInstance, MonacoDiffEditor, MonacoEditor } from "src/components/ui/MonacoEditor";
import { getSettingValues } from "src/modules/settings/common/settingsApi";
import { useAppDispatch, useAppSelector } from "src/store/store";
import type { ToolActionEvent } from "./components/CodingAgentPanel";

import { deleteTool, fetchTools, updateTool } from "../common/toolsSlice";
import { injectMetaIntoCode, injectParamsIntoCode, parseMetaFromCode, parseParams } from "../common/utils";

import { CodingAgentPanel } from "./components/CodingAgentPanel";
import { EditToolHeader } from "./components/EditToolHeader";
import { RunPanel, type RunPanelHandle } from "./components/RunPanel";
import { ValidationBanner } from "./components/ValidationBanner";

const BOTTOM_PANEL_DEFAULT = 280;
const BOTTOM_PANEL_MIN = 120;
const BOTTOM_PANEL_MAX = 600;

export default function EditToolPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // ── Fetch tool ──
  const [tool, setTool] = useState<AgentTool | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setTool(undefined);
    setLoading(true);
    apiClient
      .get<AgentTool>(`/api/tools/${id}`)
      .then((tool) => setTool(tool))
      .catch(() => setTool(undefined))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Code state ──
  const [localCode, setLocalCode] = useState("");
  const [savedCode, setSavedCode] = useState("");
  const [sharedCode, setSharedCode] = useState("");
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const codeRef = useRef(localCode);
  codeRef.current = localCode;
  const currentLoadedToolIdRef = useRef<string | null>(null);

  // ── Load code when tool is fetched ──
  useEffect(() => {
    if (!tool || currentLoadedToolIdRef.current === tool.id) return;
    let code = injectParamsIntoCode(tool.codeContent ?? "", parseParams(tool));
    code = injectMetaIntoCode(code, {
      label: tool.label,
      description: tool.description,
    });
    setLocalCode(code);
    setSavedCode(code);
    setSharedCode(code);
    currentLoadedToolIdRef.current = tool.id;

    // If there's a pending AI draft that differs from saved code, show diff
    if (tool.draftCode && tool.draftCode !== (tool.codeContent ?? "")) {
      let draft = injectParamsIntoCode(tool.draftCode, parseParams(tool));
      draft = injectMetaIntoCode(draft, {
        label: tool.label,
        description: tool.description,
      });
      if (draft !== code) {
        setCodeDraft(draft);
      }
    }
  }, [tool]);

  // ── Listen for WS tools:updated — sync draftCode from AI / other tabs ──
  useEffect(() => {
    if (!id) return;
    const unsub = wsClient.on<Partial<AgentTool> & { id: string }>("tools:updated", (payload) => {
      if (payload.id !== id) return;

      // Sync codeContent when another tab saves
      if ("codeContent" in payload && payload.codeContent != null) {
        const code = payload.codeContent;
        setSavedCode(code);
        setLocalCode(code);
        setSharedCode(code);
        // If codeContent now matches the current draft, draft was accepted — clear diff
        setCodeDraft((prev) => (prev !== null && prev === code ? null : prev));
      }

      // Only show diff when draftCode differs from codeContent
      if ("draftCode" in payload && payload.draftCode != null) {
        const draft = payload.draftCode;
        const code = payload.codeContent ?? codeRef.current;
        if (draft !== code) {
          setCodeDraft(draft);
        } else {
          setCodeDraft(null);
        }
      }
    });
    return unsub;
  }, [id]);

  // ── Save + delete state ──
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isDirty = localCode !== savedCode;

  // ── Annotation validation ──
  const codeMeta = useMemo(() => parseMetaFromCode(localCode), [localCode]);
  const codeValidationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!codeMeta.label) errors.push("@name");
    if (!codeMeta.description) errors.push("@description");
    const codeLines = localCode.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    if (codeLines.length === 0) errors.push("code body");
    if (!/\breturn\b/.test(localCode)) errors.push("return statement");
    return errors;
  }, [codeMeta, localCode]);
  const hasValidationErrors = codeValidationErrors.length > 0;
  const [showValidationError, setShowValidationError] = useState(false);

  useEffect(() => {
    if (!hasValidationErrors) setShowValidationError(false);
  }, [hasValidationErrors]);

  // ── Provider / model (persisted) ──
  const providerItems = useAppSelector((s) => s.llmProviders.items);
  const providersLoaded = useAppSelector((s) => s.llmProviders.items.length > 0 || s.llmProviders.total === 0);
  const [providerId, setProviderId] = useState<string | undefined>(undefined);
  const [model, setModel] = useState("");
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!providersLoaded || providerItems.length === 0) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    getSettingValues([SettingKey.ToolAssistantProvider, SettingKey.ToolAssistantModel]).then((s) => {
      const savedProvider = s[SettingKey.ToolAssistantProvider] ?? "";
      const savedModel = s[SettingKey.ToolAssistantModel] ?? "";
      const match = providerItems.find((p) => p.id === savedProvider) ?? providerItems[0];
      setProviderId(match.id);
      setModel(savedModel);
    });
  }, [providersLoaded, providerItems]);

  // ── Handle tool actions from AI ──
  const runPanelRef = useRef<RunPanelHandle>(null);

  const handleToolAction = useCallback((event: ToolActionEvent) => {
    if (event.toolName === "generate_code") {
      if (event.type === "tool-call") {
        const input = event.input as { code: string; summary?: string };
        if (input?.code) {
          // If draft code is the same as current code, skip diff
          if (input.code === codeRef.current) return;
          setCodeDraft(input.code);
        }
      }
    } else if (event.toolName === "run_current_script") {
      // Auto-open the test panel when AI runs a script
      setBottomOpen(true);
      if (event.type === "tool-call") {
        runPanelRef.current?.setRunning(true);
      } else if (event.type === "tool-result") {
        const out = event.output as any;
        runPanelRef.current?.setExternalResult({
          ok: out?.success ?? false,
          output: out?.output,
          error: out?.error,
          console: out?.console,
        });
      }
    }
  }, []);

  // ── Active toggle ──
  const isActive = tool?.isActive ?? false;
  const [toggling, setToggling] = useState(false);

  const handleToggleActive = useCallback(async () => {
    if (!id || toggling) return;
    if (!isActive && hasValidationErrors) {
      setShowValidationError(true);
      return;
    }
    setToggling(true);
    try {
      await dispatch(updateTool({ id, isActive: !isActive })).unwrap();
      setTool((prev) => (prev ? { ...prev, isActive: !isActive } : prev));
    } finally {
      setToggling(false);
    }
  }, [id, isActive, toggling, dispatch, hasValidationErrors]);

  // ── Save ──
  const handleSave = async (codeOverride?: string) => {
    if (!id) return;
    const code = codeOverride ?? localCode;
    const meta = parseMetaFromCode(code);
    const errors: string[] = [];
    if (!meta.label) errors.push("@name");
    if (!meta.description) errors.push("@description");
    const codeLines = code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    if (codeLines.length === 0) errors.push("code body");
    if (!/\breturn\b/.test(code)) errors.push("return statement");
    if (errors.length > 0) {
      setShowValidationError(true);
      return;
    }
    if (!codeOverride && !isDirty) return;
    setSaving(true);
    try {
      // Server auto-derives parameters, label, name, description from codeContent
      await dispatch(
        updateTool({
          id,
          codeContent: code,
          draftCode: code,
        }),
      ).unwrap();
      setSavedCode(code);
      setTool((prev) =>
        prev
          ? {
              ...prev,
              ...(meta.label ? { label: meta.label } : {}),
              ...(meta.description ? { description: meta.description } : {}),
            }
          : prev,
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──
  const handleDelete = useCallback(async () => {
    if (!id || deleting) return;
    setDeleting(true);
    try {
      await dispatch(deleteTool(id)).unwrap();
      await dispatch(fetchTools());
      navigate("/tools");
    } finally {
      setDeleting(false);
    }
  }, [id, deleting, dispatch, navigate]);

  const toolLabel = parseMetaFromCode(localCode).label || tool?.label || "Untitled Tool";

  // ── Bottom panel (RunPanel) — hidden by default ──
  const [bottomOpen, setBottomOpen] = useState(false);
  const [bottomHeight, setBottomHeight] = useState(BOTTOM_PANEL_DEFAULT);
  const [isDraggingBottom, setIsDraggingBottom] = useState(false);
  const bottomDragRef = useRef({ active: false, startY: 0, startH: 0 });

  const handleBottomDragMove = useCallback((e: MouseEvent) => {
    if (!bottomDragRef.current.active) return;
    const dy = e.clientY - bottomDragRef.current.startY;
    setBottomHeight(Math.min(BOTTOM_PANEL_MAX, Math.max(BOTTOM_PANEL_MIN, bottomDragRef.current.startH - dy)));
  }, []);

  const handleBottomDragUp = useCallback(() => {
    if (bottomDragRef.current.active) {
      bottomDragRef.current.active = false;
      setIsDraggingBottom(false);
      document.removeEventListener("mousemove", handleBottomDragMove);
      document.removeEventListener("mouseup", handleBottomDragUp);
    }
  }, [handleBottomDragMove]);

  const startBottomDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      bottomDragRef.current = { active: true, startY: e.clientY, startH: bottomHeight };
      setIsDraggingBottom(true);
      document.addEventListener("mousemove", handleBottomDragMove);
      document.addEventListener("mouseup", handleBottomDragUp);
    },
    [bottomHeight, handleBottomDragMove, handleBottomDragUp],
  );

  // ── Loading / Not found states ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-sm text-muted font-medium">Loading tool…</span>
        </div>
      </div>
    );
  }

  if (!loading && id && !tool) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-surface-raised flex items-center justify-center">
            <span className="text-xl">🔧</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-main mb-1">Tool not found</p>
            <p className="text-xs text-muted">This tool may have been deleted.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/tools")}
            className="text-xs font-semibold text-primary hover:text-primary-hover cursor-pointer bg-transparent border-0 underline underline-offset-2"
          >
            Back to Tools
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top bar */}
      <EditToolHeader
        label={toolLabel}
        toolId={id}
        isActive={isActive}
        toggling={toggling}
        deleting={deleting}
        saving={saving}
        isDirty={isDirty}
        onToggleActive={handleToggleActive}
        onDelete={handleDelete}
        onSave={handleSave}
      />

      {/* Validation error banner */}
      {showValidationError && hasValidationErrors && <ValidationBanner errors={codeValidationErrors} onDismiss={() => setShowValidationError(false)} />}

      {/* Body: [Editor + RunPanel] | CodingAgentPanel */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Editor (top) + RunPanel (bottom) */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Monaco editor — diff mode when AI draft exists */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {codeDraft !== null && codeDraft !== localCode ? (
              <>
                <MonacoDiffEditor
                  language="python"
                  original={localCode}
                  modified={codeDraft}
                  options={{ fontSize: 13, renderSideBySide: false, renderIndicators: false }}
                  onMount={(editor) => {
                    editor.getOriginalEditor().updateOptions({ lineNumbers: "off" });
                  }}
                />
                {/* Accept / Reject floating bar */}
                <div
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-sm border border-border/60"
                  style={{ background: "rgba(14,15,18,0.92)", backdropFilter: "blur(8px)" }}
                >
                  <span className="text-[11px] font-semibold text-muted tracking-wide uppercase mr-1">AI Draft</span>
                  <button
                    type="button"
                    onClick={() => {
                      const draft = codeDraft;
                      setLocalCode(draft);
                      setSharedCode(draft);
                      setSavedCode(draft);
                      if (id) void apiClient.put(`/api/tools/${id}`, { codeContent: draft });
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#A8FF53] hover:text-[#c4ff8a] cursor-pointer bg-[#A8FF53]/10 hover:bg-[#A8FF53]/20 border border-[#A8FF53]/30 rounded-sm px-3 py-1 transition-all duration-150"
                  >
                    <CheckCircle size={14} />
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCodeDraft(localCode);
                      if (id) void apiClient.put(`/api/tools/${id}`, { draftCode: localCode });
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FF4D6D] hover:text-[#ff7a93] cursor-pointer bg-[#FF4D6D]/10 hover:bg-[#FF4D6D]/20 border border-[#FF4D6D]/30 rounded-sm px-3 py-1 transition-all duration-150"
                  >
                    <CloseCircle size={14} />
                    Reject
                  </button>
                </div>
              </>
            ) : (
              <MonacoEditor
                language="python"
                value={localCode}
                onChange={(v) => {
                  const next = v ?? "";
                  setLocalCode(next);
                  setSharedCode(next);
                }}
                onMount={(editor) => {
                  editorRef.current = editor;
                }}
                onSave={() => handleSave()}
                options={{ fontSize: 13, tabSize: 2 }}
              />
            )}
          </div>

          {/* Bottom panel toggle bar + RunPanel */}
          {bottomOpen ? (
            <>
              {/* Drag handle */}
              <div
                onMouseDown={startBottomDrag}
                className={[
                  "h-[3px] shrink-0 w-full cursor-row-resize z-10 transition-colors duration-150",
                  isDraggingBottom ? "bg-primary/50" : "bg-transparent hover:bg-primary/25",
                ].join(" ")}
              />

              {/* Panel header */}
              <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-t border-border bg-surface">
                <div className="flex items-center gap-1.5">
                  <TestTube size={12} className="text-primary" />
                  <span className="text-[10px] font-bold text-soft uppercase tracking-wider">Test</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBottomOpen(false)}
                  className="text-[10px] text-muted hover:text-main cursor-pointer bg-transparent border-0 px-1.5 py-0.5 rounded hover:bg-surface-raised transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* RunPanel */}
              <div className="shrink-0 border-t border-border overflow-hidden" style={{ height: bottomHeight }}>
                <RunPanel ref={runPanelRef} code={sharedCode} toolId={id} />
              </div>
            </>
          ) : (
            /* Collapsed: small bottom bar with open button */
            <div className="shrink-0 flex items-center px-3 py-1 border-t border-border bg-surface">
              <button
                type="button"
                onClick={() => setBottomOpen(true)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted hover:text-primary cursor-pointer bg-transparent border-0 px-1.5 py-1 rounded hover:bg-surface-raised transition-colors"
              >
                <Play size={10} />
                Test
              </button>
            </div>
          )}
        </div>

        {/* Right: AI Chat */}
        <CodingAgentPanel
          providerId={providerId}
          model={model}
          streamUrl={`/api/tools/${id}/coding/stream`}
          onToolAction={handleToolAction}
          onChangeAiProvider={(pid) => {
            setProviderId(pid);
            setModel("");
            void apiClient.patch("/api/settings", {
              [SettingKey.ToolAssistantProvider]: pid,
            });
          }}
          onChangeModel={(m) => {
            setModel(m);
            void apiClient.patch("/api/settings", {
              [SettingKey.ToolAssistantModel]: m,
            });
          }}
        />
      </div>
    </div>
  );
}
