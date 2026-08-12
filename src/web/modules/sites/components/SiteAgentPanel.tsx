import CloseCircle from "@solar-icons/react/ui/CloseCircle";
import MagicStick from "@solar-icons/react/ui/MagicStick";
import { useEffect, useRef, useState } from "react";

import type { ToolActionEvent } from "src/common/hooks/useAssistantStreaming";
import { useAssistantStreaming } from "src/common/hooks/useAssistantStreaming";
import { InputArea } from "src/components/chat/_components/InputArea";
import { MessageList } from "src/components/chat/_components/MessageList";
import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";
import { siteTurnSummaryHint, summarizeSiteToolCall } from "../common/compactSiteHistory";

export type { ToolActionEvent };

const PANEL_DEFAULT = 380;
const PANEL_MIN = 280;
const PANEL_MAX = 560;

const SUGGESTIONS = ["Improve the layout and spacing", "Make the hero section more distinctive", "Wire loader data into the visible UI"];

export type SiteSelectionContext = {
  label: string;
  detail: string;
};

interface SiteAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onToolAction: (event: ToolActionEvent) => void;
  onModelChange: (providerId: string, model: string) => void;
  selectionContext?: SiteSelectionContext | null;
  onClearSelection?: () => void;
  onResizeDraggingChange?: (dragging: boolean) => void;
  onGeneratingChange?: (generating: boolean) => void;
}

export function SiteAgentPanel({
  providerId,
  model,
  streamUrl,
  onToolAction,
  onModelChange,
  selectionContext = null,
  onClearSelection,
  onResizeDraggingChange,
  onGeneratingChange,
}: SiteAgentPanelProps) {
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startW: 0 });

  const { messages, generating, send, cancel } = useAssistantStreaming({
    streamUrl,
    onToolAction,
    summarizeToolCall: summarizeSiteToolCall,
    turnSummaryHint: siteTurnSummaryHint,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { scrollRef: scrollContainerRef, scrollToBottom } = useAutoScroll();

  useEffect(() => {
    onGeneratingChange?.(generating);
  }, [generating, onGeneratingChange]);

  useEffect(() => {
    onResizeDraggingChange?.(isDragging);
  }, [isDragging, onResizeDraggingChange]);

  useEffect(() => {
    if (!isDragging) return;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
  }, [isDragging]);

  const endDrag = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
  };

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { active: true, startX: e.clientX, startW: width };
    setIsDragging(true);
  };

  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = dragRef.current.startX - e.clientX;
    setWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, dragRef.current.startW + dx)));
  };

  const onResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    endDrag();
  };

  const buildMessage = (text: string) => {
    if (!selectionContext?.detail) return text;
    return `${selectionContext.detail}\n\n${text}`;
  };

  const sendMessage = (text: string) => {
    if (!providerId || !model || generating) return;
    scrollToBottom({ force: true });
    const payload = buildMessage(text);
    onClearSelection?.();
    void send(payload, { providerId, model });
  };

  return (
    <div className="flex h-full min-h-0 shrink-0">
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        onLostPointerCapture={endDrag}
        className={[
          "w-px shrink-0 h-full cursor-col-resize touch-none z-10 transition-colors duration-150",
          isDragging ? "bg-brand/60" : "bg-border hover:bg-brand/40",
        ].join(" ")}
      />

      <div className="flex flex-col h-full min-h-0 border-l border-border bg-card overflow-hidden" style={{ width }}>
        <div className="shrink-0 flex items-center gap-2 h-10 px-3 border-b border-border">
          <MagicStick size={14} className="text-brand shrink-0" />
          <span className="text-sm font-medium text-foreground">Assistant</span>
          <span className="text-xs text-muted-foreground truncate">Edit this site draft</span>
        </div>

        <MessageList
          messages={messages}
          generating={generating}
          activityStatus={(() => {
            const last = messages[messages.length - 1];
            if (last?.role === "tool-call" && last.toolOutput) return "Thinking";
            if (last?.role === "tool-call") return "Running tool";
            return "Working";
          })()}
          assistantLabel="Site Assistant"
          emptyStateContent={
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-6 w-full">
              <p className="text-sm text-muted-foreground leading-relaxed text-center m-0 max-w-64">
                Select an element with Inspect, then describe the change. Edits stay in draft until you Approve.
              </p>
              <div className="flex flex-col gap-1.5 w-full max-w-64">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!providerId || !model || generating}
                    onClick={() => sendMessage(s)}
                    className="w-full text-left px-3 py-2 rounded-lg border border-border bg-background text-xs text-tertiary-foreground hover:text-foreground hover:border-brand/30 hover:bg-accent/40 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          }
          messagesEndRef={messagesEndRef}
          scrollContainerRef={scrollContainerRef}
          className="selectable"
        />

        {selectionContext ? (
          <div className="shrink-0 flex items-center gap-2 border-t border-border px-3 py-2 bg-accent/30">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Selected</span>
            <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={selectionContext.label}>
              {selectionContext.label}
            </span>
            <button
              type="button"
              onClick={onClearSelection}
              className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Clear selection"
            >
              <CloseCircle width={14} height={14} />
            </button>
          </div>
        ) : null}

        <InputArea
          generating={generating}
          placeholder={selectionContext ? "Describe what to change on this element…" : "Describe what to change…"}
          onSend={sendMessage}
          onCancel={cancel}
          providerId={providerId}
          model={model}
          onModelChange={onModelChange}
          enableTypeToFocus={false}
        />
      </div>
    </div>
  );
}
