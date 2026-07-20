/**
 * PromptAgentPanel.tsx
 *
 * Self-contained AI assistant panel for the Prompt editor sidebar.
 * Streaming lives in useAssistantStreaming — no Redux dependency.
 */

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
    <div className="flex flex-col h-full min-h-0 bg-card overflow-hidden">
      <MessageList
        messages={messages}
        generating={generating}
        assistantLabel="Prompt AI"
        emptyStateContent={<p className="text-xs text-muted-foreground leading-relaxed max-w-50 m-0">Describe your request to refine the prompt.</p>}
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
  );
}
