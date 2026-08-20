import Stars from "@solar-icons/react/icons/weather/Stars";
import { useRef } from "react";
import { useAssistantStreaming } from "src/common/hooks/useAssistantStreaming";
import { AgentPanelComposer } from "src/components/chat/_components/AgentPanelComposer";
import { AgentPanelEmptyState } from "src/components/chat/_components/AgentPanelEmptyState";
import { InputArea } from "src/components/chat/_components/InputArea";
import { MessageList } from "src/components/chat/_components/MessageList";
import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";

interface PromptAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onModelChange: (providerId: string, model: string) => void;
}

export function PromptAgentPanel({ providerId, model, streamUrl, onModelChange }: PromptAgentPanelProps) {
  const { messages, generating, send, cancel } = useAssistantStreaming({ streamUrl });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { scrollRef: scrollContainerRef, scrollToBottom } = useAutoScroll();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#1e1e1e]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Stars size={13} className="shrink-0 text-brand-soft" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Refine</span>
      </div>

      <AgentPanelComposer
        input={
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
        }
        messages={
          <MessageList
            messages={messages}
            generating={generating}
            assistantLabel="Prompt AI"
            emptyStateContent={<AgentPanelEmptyState>Ask for tone, structure, or constraints — the editor updates as you refine.</AgentPanelEmptyState>}
            messagesEndRef={messagesEndRef}
            scrollContainerRef={scrollContainerRef}
            className="selectable"
          />
        }
      />
    </div>
  );
}
