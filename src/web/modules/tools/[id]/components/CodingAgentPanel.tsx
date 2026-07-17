/**
 * CodingAgentPanel.tsx
 *
 * Self-contained AI coding assistant panel.
 * Streaming lives in useAssistantStreaming — no Redux dependency.
 */

import { useRef, useState } from "react";

import type { ToolActionEvent } from "src/common/hooks/useAssistantStreaming";
import { useAssistantStreaming } from "src/common/hooks/useAssistantStreaming";
import { InputArea } from "src/components/chat/_components/InputArea";
import { MessageList } from "src/components/chat/_components/MessageList";
import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";

export type { ToolActionEvent };

const PANEL_DEFAULT = 380;
const PANEL_MIN = 280;
const PANEL_MAX = 560;

interface CodingAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onToolAction: (event: ToolActionEvent) => void;
  onChangeAiProvider: (pid: string) => void;
  onChangeModel: (m: string) => void;
}

export function CodingAgentPanel({ providerId, model, streamUrl, onToolAction, onChangeAiProvider, onChangeModel }: CodingAgentPanelProps) {
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startW: 0 });

  const { messages, generating, send, cancel } = useAssistantStreaming({
    streamUrl,
    maxSteps: 12,
    onToolAction,
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

  return (
    <div className="flex h-full min-h-0 shrink-0">
      <div
        onMouseDown={startDrag}
        className={[
          "w-[3px] shrink-0 h-full cursor-col-resize z-10 transition-colors duration-150",
          isDragging ? "bg-primary/50" : "bg-transparent hover:bg-primary/25",
        ].join(" ")}
      />

      <div className="flex flex-col h-full min-h-0 border-border bg-surface overflow-hidden" style={{ width }}>
        <MessageList
          messages={messages}
          generating={generating}
          assistantLabel="AI Assistant"
          emptyStateContent={<p className="text-xs text-muted leading-relaxed max-w-50 m-0">Describe your request to get coding assistance.</p>}
          messagesEndRef={messagesEndRef}
          scrollContainerRef={scrollContainerRef}
          className="selectable"
        />

        <InputArea
          generating={generating}
          placeholder="Describe request... (Enter to send)"
          onSend={(text) => {
            if (!providerId || !model) return;
            scrollToBottom({ force: true });
            void send(text, { providerId, model });
          }}
          onCancel={cancel}
          providerId={providerId}
          model={model}
          onProviderChange={onChangeAiProvider}
          onModelChange={onChangeModel}
        />
      </div>
    </div>
  );
}
