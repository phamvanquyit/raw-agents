import { MagicStick } from "@solar-icons/react";
import { useRef } from "react";

import { useAssistantStreaming } from "src/common/hooks/useAssistantStreaming";
import { InputArea } from "src/components/chat/_components/InputArea";
import { MessageList } from "src/components/chat/_components/MessageList";
import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";

interface PromptAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  maxSteps?: number;
  onChangeAiProvider: (pid: string) => void;
  onChangeModel: (m: string) => void;
}

export function PromptAgentPanel({ providerId, model, streamUrl, maxSteps = 6, onChangeAiProvider, onChangeModel }: PromptAgentPanelProps) {
  const { messages, generating, send, cancel } = useAssistantStreaming({ streamUrl, maxSteps });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { scrollRef: scrollContainerRef, scrollToBottom } = useAutoScroll();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <MagicStick size={13} className="shrink-0 text-brand-soft" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Refine</span>
      </div>

      <MessageList
        messages={messages}
        generating={generating}
        assistantLabel="Prompt AI"
        emptyStateContent={
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <p className="m-0 max-w-52 text-[12px] leading-relaxed text-tertiary-foreground">
              Ask for tone, structure, or constraints — the editor updates as you refine.
            </p>
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
        onProviderChange={onChangeAiProvider}
        onModelChange={onChangeModel}
        enableTypeToFocus={false}
      />
    </div>
  );
}
