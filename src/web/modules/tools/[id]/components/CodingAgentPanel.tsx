/**
 * CodingAgentPanel.tsx
 *
 * Self-contained AI coding assistant panel.
 * Streaming lives in useAssistantStreaming — no Redux dependency.
 */

import MagicStick from "@solar-icons/react/ui/MagicStick";
import { useRef, useState } from "react";

import type { ToolActionEvent } from "src/common/hooks/useAssistantStreaming";
import { useAssistantStreaming } from "src/common/hooks/useAssistantStreaming";
import { InputArea } from "src/components/chat/_components/InputArea";
import { MessageList } from "src/components/chat/_components/MessageList";
import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";
import { summarizeCodingToolCall } from "../../common/compactGenerateCodeHistory";

export type { ToolActionEvent };

const PANEL_DEFAULT = 380;
const PANEL_MIN = 280;
const PANEL_MAX = 560;

const SUGGESTIONS = ["Add error handling and retries", "Move hardcoded values into @param", "Simplify this script and explain changes"];

interface CodingAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onToolAction: (event: ToolActionEvent) => void;
  onModelChange: (providerId: string, model: string) => void;
  subtitle?: string;
  suggestions?: string[];
}

export function CodingAgentPanel({
  providerId,
  model,
  streamUrl,
  onToolAction,
  onModelChange,
  subtitle = "Edit, test, and fix this tool",
  suggestions = SUGGESTIONS,
}: CodingAgentPanelProps) {
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startW: 0 });

  const { messages, generating, send, cancel } = useAssistantStreaming({
    streamUrl,
    onToolAction,
    summarizeToolCall: summarizeCodingToolCall,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { scrollRef: scrollContainerRef, scrollToBottom } = useAutoScroll();

  const handleDragMouseMove = (e: MouseEvent) => {
    if (!dragRef.current.active) return;
    const dx = dragRef.current.startX - e.clientX;
    setWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, dragRef.current.startW + dx)));
  };

  const handleDragMouseUp = () => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      setIsDragging(false);
      document.removeEventListener("mousemove", handleDragMouseMove);
      document.removeEventListener("mouseup", handleDragMouseUp);
    }
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, startW: width };
    setIsDragging(true);
    document.addEventListener("mousemove", handleDragMouseMove);
    document.addEventListener("mouseup", handleDragMouseUp);
  };

  const sendSuggestion = (text: string) => {
    if (!providerId || !model || generating) return;
    scrollToBottom({ force: true });
    void send(text, { providerId, model });
  };

  return (
    <div className="flex h-full min-h-0 shrink-0">
      <div
        onMouseDown={startDrag}
        className={[
          "w-px shrink-0 h-full cursor-col-resize z-10 transition-colors duration-150",
          isDragging ? "bg-brand/60" : "bg-border hover:bg-brand/40",
        ].join(" ")}
      />

      <div className="flex flex-col h-full min-h-0 border-l border-border bg-card overflow-hidden" style={{ width }}>
        <div className="shrink-0 flex items-center gap-2 h-10 px-3 border-b border-border">
          <MagicStick size={14} className="text-brand shrink-0" />
          <span className="text-sm font-medium text-foreground">Assistant</span>
          <span className="text-xs text-muted-foreground truncate">{subtitle}</span>
        </div>

        <MessageList
          messages={messages}
          generating={generating}
          assistantLabel="AI Assistant"
          emptyStateContent={
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-6 w-full">
              <p className="text-sm text-muted-foreground leading-relaxed text-center m-0 max-w-64">
                Ask for a rewrite, fix, or new capability. Changes land as a draft you can accept.
              </p>
              <div className="flex flex-col gap-1.5 w-full max-w-64">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!providerId || !model || generating}
                    onClick={() => sendSuggestion(s)}
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

        <InputArea
          generating={generating}
          placeholder="Describe what to change…"
          onSend={(text) => {
            if (!providerId || !model) return;
            scrollToBottom({ force: true });
            void send(text, { providerId, model });
          }}
          onCancel={cancel}
          providerId={providerId}
          model={model}
          onModelChange={onModelChange}
          focusSignal={providerId && model ? streamUrl : undefined}
          enableTypeToFocus={false}
        />
      </div>
    </div>
  );
}
