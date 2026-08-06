import { MagicStick } from "@solar-icons/react";
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

const SUGGESTIONS = ["Tighten the SKILL.md instructions", "Add a references doc for edge cases", "Improve the description frontmatter for discovery"];

interface SkillAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onToolAction: (event: ToolActionEvent) => void;
  onModelChange: (providerId: string, model: string) => void;
}

export function SkillAgentPanel({ providerId, model, streamUrl, onToolAction, onModelChange }: SkillAgentPanelProps) {
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startW: 0 });

  const { messages, generating, send, cancel } = useAssistantStreaming({
    streamUrl,
    onToolAction,
    summarizeToolCall: (m) => {
      if (m.toolName === "read_skill_file") {
        const input = m.toolInput as { path?: string } | undefined;
        return `read ${input?.path ?? "file"}`;
      }
      if (m.toolName === "edit_skill_file") {
        const input = m.toolInput as { path?: string; mode?: string } | undefined;
        return `edit ${input?.path ?? "file"} (${input?.mode ?? "…"})`;
      }
      return null;
    },
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
          "z-10 h-full w-px shrink-0 cursor-col-resize transition-colors duration-150",
          isDragging ? "bg-brand/60" : "bg-border hover:bg-brand/40",
        ].join(" ")}
      />

      <div className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-card" style={{ width }}>
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <MagicStick size={14} className="shrink-0 text-brand" />
          <span className="text-sm font-medium text-foreground">Assistant</span>
          <span className="truncate text-xs text-muted-foreground">Write this skill</span>
        </div>

        <MessageList
          messages={messages}
          generating={generating}
          assistantLabel="Skill AI"
          emptyStateContent={
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 px-4 py-6">
              <p className="m-0 max-w-64 text-center text-sm leading-relaxed text-muted-foreground">
                Ask for a rewrite or new reference. Changes land as a draft you can accept.
              </p>
              <div className="flex w-full max-w-64 flex-col gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!providerId || !model || generating}
                    onClick={() => sendSuggestion(s)}
                    className="w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-tertiary-foreground transition-colors hover:border-brand/30 hover:bg-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
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
          enableTypeToFocus={false}
        />
      </div>
    </div>
  );
}
