/**
 * AgentEditor.tsx
 *
 * Reusable component = MonacoEditor + resizable AI Chat sidebar.
 *
 * Dùng cho mọi trang cần editor + AI assistant:
 *   - Tools editor (Python code)
 *   - Prompt editor
 *   - Bất kỳ editor nào cần AI sidebar
 *
 * Props:
 *   - Tất cả MonacoEditor options (language, value, onChange, onMount, options...)
 *   - AI sidebar: systemPrompt, tools, aiProviderId, aiModel, onToolAction...
 *   - sidebarDefaultWidth, sidebarMinWidth, sidebarMaxWidth
 *   - hideSidebar để ẩn hoàn toàn sidebar
 */

import { ChatRound, CloseCircle } from "@solar-icons/react";
import type * as MonacoNS from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatAgent, type ChatAgentMessage, type ToolActionEvent } from "../../chat/ChatAgent";
import { type EditorInstance, MonacoEditor } from "../MonacoEditor";

// ── Types ─────────────────────────────────────────────────────────────────────

export type { EditorInstance, ToolActionEvent };

export interface AgentEditorHandle {
  getEditor: () => EditorInstance | null;
}

export interface AgentEditorProps {
  // ── Editor ─────────────────────────────────────────────────────────────
  /** Programming language for syntax highlighting. Default: "python" */
  language?: string;
  /** Editor content (controlled) */
  value?: string;
  /** Called on every change */
  onChange?: (value: string | undefined) => void;
  /** Called when Monaco editor mounts */
  onMount?: (editor: EditorInstance, monaco: typeof MonacoNS) => void;
  /** Monaco editor options — merged over defaults */
  monacoOptions?: MonacoNS.editor.IStandaloneEditorConstructionOptions;
  /** Placeholder text shown when editor is empty */
  editorPlaceholder?: string;

  // ── AI Sidebar ─────────────────────────────────────────────────────────
  /** System prompt injected into the AI context */
  systemPrompt?: string;
  /**
   * SSE endpoint URL — e.g. "/api/assistants/coding/stream"
   */
  streamUrl: string;
  /**
   * Extra body fields for the POST request (e.g. { toolId })
   */
  streamBody?: Record<string, unknown>;
  /** Max agentic steps. Default: 12 */
  maxSteps?: number;
  /** Pre-select provider (UUID) */
  aiProviderId?: string;
  /** Pre-select model string */
  aiModel?: string;
  /** Fired on every tool-call / tool-result event */
  onToolAction?: (event: ToolActionEvent) => void;
  /** Called after each AI exchange with full message list */
  onAiFinish?: (messages: ChatAgentMessage[]) => void;
  /** Called when user picks a new provider via picker */
  onChangeAiProvider?: (providerId: string) => void;
  /** Called when user picks a new model via picker */
  onChangeModel?: (model: string) => void;
  /** Placeholder in chat input */
  chatPlaceholder?: string;
  /** Label shown above assistant messages */
  assistantLabel?: string;

  // ── Sidebar layout ─────────────────────────────────────────────────────
  /** Hide sidebar entirely */
  hideSidebar?: boolean;
  /**
   * Chat display mode:
   *  - "sidebar"  — resizable side panel (default)
   *  - "floating" — livechat-style: floating icon + popup
   */
  chatMode?: "sidebar" | "floating";
  /** Initial sidebar width (px). Default: 400 */
  sidebarDefaultWidth?: number;
  /** Minimum sidebar width (px). Default: 260 */
  sidebarMinWidth?: number;
  /** Maximum sidebar width (px). Default: 720 */
  sidebarMaxWidth?: number;

  // ── Slot — extra content ────────────────────────────────────────────────
  /**
   * Slot dưới editor — dùng cho RunPanel, toolbar, v.v.
   * Rendered bên dưới MonacoEditor, bên trái sidebar.
   */
  bottomSlot?: React.ReactNode;

  className?: string;
}

// ── Resizable Divider ──────────────────────────────────────────────────────────

interface ResizableSplitterProps {
  sidebarWidth: number;
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
  children: [React.ReactNode, React.ReactNode];
  className?: string;
}

function ResizableSplitter({ sidebarWidth, minWidth, maxWidth, onResize, children, className = "" }: ResizableSplitterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = sidebarWidth;
      setIsDragging(true);
    },
    [sidebarWidth],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = startX.current - e.clientX; // sidebar is on the right, so dragging left = wider
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + dx));
      onResize(newWidth);
    };
    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
        setIsDragging(false);
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [minWidth, maxWidth, onResize]);

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full overflow-hidden ${className}`}
      style={{
        userSelect: isDragging ? "none" : undefined,
        cursor: isDragging ? "col-resize" : undefined,
      }}
    >
      {/* Left panel — editor */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">{children[0]}</div>

      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className={[
          "w-px shrink-0 h-full cursor-col-resize z-10",
          "transition-colors duration-150",
          isDragging ? "bg-primary/50" : "bg-border hover:bg-primary/40",
        ].join(" ")}
      />

      {/* Right panel — sidebar */}
      <div className="h-full overflow-hidden shrink-0" style={{ width: sidebarWidth }}>
        {children[1]}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentEditor({
  // Editor
  language = "python",
  value,
  onChange,
  onMount,
  monacoOptions,
  editorPlaceholder,

  // AI sidebar
  systemPrompt,
  streamUrl,
  streamBody,
  maxSteps = 12,
  aiProviderId,
  aiModel,
  onToolAction,
  onAiFinish,
  onChangeAiProvider,
  onChangeModel,
  chatPlaceholder,
  assistantLabel = "AI Assistant",

  // Layout
  hideSidebar = false,
  chatMode = "sidebar",
  sidebarDefaultWidth = 400,
  sidebarMinWidth = 260,
  sidebarMaxWidth = 720,

  // Slots
  bottomSlot,
  className = "",
}: AgentEditorProps) {
  const messagesRef = useRef<ChatAgentMessage[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(sidebarDefaultWidth);
  const [floatingOpen, setFloatingOpen] = useState(false);
  const floatingRef = useRef<HTMLDivElement>(null);

  // Auto-focus chat input when floating popup opens
  useEffect(() => {
    if (floatingOpen && floatingRef.current) {
      const textarea = floatingRef.current.querySelector<HTMLTextAreaElement>("[data-chat-input]");
      if (textarea) {
        // Small delay to let the animation start and DOM settle
        requestAnimationFrame(() => textarea.focus());
      }
    }
  }, [floatingOpen]);

  const handleEditorMount = useCallback(
    (editor: EditorInstance, monaco: typeof MonacoNS) => {
      onMount?.(editor, monaco);
    },
    [onMount],
  );

  const isEmpty = !value || value.trim().length === 0;

  const editorPanel = (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="relative flex-1 min-h-0">
        <MonacoEditor language={language} value={value} onChange={onChange} onMount={handleEditorMount} options={monacoOptions} />
        {/* Placeholder overlay — shown when editor is empty */}
        {editorPlaceholder && isEmpty && (
          <div
            className="absolute inset-0 pointer-events-none select-none"
            style={{
              padding: monacoOptions?.padding ? `${monacoOptions.padding.top ?? 10}px 0 ${monacoOptions.padding.bottom ?? 10}px 0` : "10px 0",
              paddingLeft: monacoOptions?.lineNumbers === "off" ? 20 : 64,
            }}
          >
            <span
              className="text-muted/50"
              style={{
                fontSize: monacoOptions?.fontSize ?? 13,
                fontFamily: "'Geist Mono Variable', 'Geist Mono', monospace",
                lineHeight: monacoOptions?.lineHeight ? `${monacoOptions.lineHeight}` : 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {editorPlaceholder}
            </span>
          </div>
        )}
      </div>
      {bottomSlot && <div className="shrink-0">{bottomSlot}</div>}
    </div>
  );

  if (hideSidebar) {
    return <div className={`w-full h-full overflow-hidden ${className}`}>{editorPanel}</div>;
  }

  const chatPanel = (
    <ChatAgent
      aiProviderId={aiProviderId}
      aiModel={aiModel}
      messages={messagesRef.current}
      systemPrompt={systemPrompt}
      streamUrl={streamUrl}
      streamBody={streamBody}
      maxSteps={maxSteps}
      showProviderPicker
      assistantLabel={assistantLabel}
      placeholder={chatPlaceholder}
      onToolAction={onToolAction}
      onFinish={(msgs) => {
        messagesRef.current = msgs;
        onAiFinish?.(msgs);
      }}
      onClear={() => {
        messagesRef.current = [];
      }}
      onChangeAiProvider={onChangeAiProvider}
      onChangeModel={onChangeModel}
      className="h-full rounded-none border-none"
    />
  );

  // ── Floating livechat mode ───────────────────────────────────────────
  if (chatMode === "floating") {
    return (
      <div className={`relative w-full h-full overflow-hidden ${className}`}>
        {editorPanel}

        {/* Floating chat popup */}
        {floatingOpen && (
          <div
            ref={floatingRef}
            className="absolute bottom-16 right-4 z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel"
            style={{
              width: sidebarDefaultWidth,
              height: 580,
              animation: "ae-float-in 0.2s ease-out both",
            }}
          >
            {/* Header with close */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-surface-raised bg-surface">
              <span className="text-xs font-semibold text-soft tracking-wide">{assistantLabel}</span>
              <button
                type="button"
                onClick={() => setFloatingOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-raised text-muted hover:text-main transition-colors"
              >
                <CloseCircle size={12} />
              </button>
            </div>
            <div className="flex-1 min-h-0">{chatPanel}</div>
          </div>
        )}

        {/* FAB toggle button */}
        <button
          type="button"
          onClick={() => setFloatingOpen((v) => !v)}
          className={[
            "absolute cursor-pointer bottom-4 right-4 z-50 w-10 h-10 rounded-full flex items-center justify-center",
            "border transition-all duration-200",
            floatingOpen
              ? "bg-soft border-main text-surface shadow-lg hover:bg-main"
              : "bg-primary border-primary-hover text-surface shadow-drop hover:scale-110",
          ].join(" ")}
        >
          {floatingOpen ? <CloseCircle size={16} /> : <ChatRound size={20} />}
        </button>
      </div>
    );
  }

  // ── Sidebar mode (default) ───────────────────────────────────────────
  return (
    <ResizableSplitter sidebarWidth={sidebarWidth} minWidth={sidebarMinWidth} maxWidth={sidebarMaxWidth} onResize={setSidebarWidth} className={className}>
      {editorPanel}
      {chatPanel}
    </ResizableSplitter>
  );
}
