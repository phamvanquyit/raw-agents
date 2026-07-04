/**
 * ChatAgent.tsx
 *
 * A generic, reusable AI chat box component.
 * All streaming/state logic lives in useChatAgent — this file is pure render.
 *
 * Features:
 *  - Controlled messages[] from parent (pass in + listen via onFinish)
 *  - Accepts `aiProviderId` + `aiModel` (or falls back to provider/model picker)
 *  - Accepts ToolSet for tool-calling
 *  - Streams text deltas + renders tool-call / tool-result bubbles
 *  - `onFinish(messages)` fires after every exchange so parent can persist
 *  - Fully customisable: title, placeholder, empty state slot, class/styles
 */

import { type ReactNode, type Ref, useImperativeHandle } from "react";
import { InputArea } from "./_components/InputArea";
import { MessageList } from "./_components/MessageList";
import type { ChatAgentMessage, ChatAgentRole } from "./common/types";
import { type ChatStatus, type ToolActionEvent, useChatAgent } from "./hooks/useChatAgent";

// ── Re-export types so consumers keep a single import path ───────────────────
export type { ChatAgentRole, ChatAgentMessage, ChatStatus, ToolActionEvent };

// ── Imperative handle exposed via ref ────────────────────────────────────────
export interface ChatAgentHandle {
  messages: ChatAgentMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatAgentMessage[]>>;
  /** Programmatically send a message as if the user typed and submitted it. */
  send: (text: string) => void;
}

// ── Inject shared animation keyframes once ───────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("chat-agent-style")) {
  const s = document.createElement("style");
  s.id = "chat-agent-style";
  s.textContent = `
    @keyframes ca-dot-bounce {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
      40%            { transform: translateY(-4px); opacity: 1; }
    }
    @keyframes ca-fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes ca-cursor-blink {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0; }
    }
    .ca-fade-in { animation: ca-fade-in 0.18s ease-out both; }
  `;

  document.head.appendChild(s);
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface ChatAgentProps {
  // ── Model config ─────────────────────────────────────────────────────
  /** Provider ID. If undefined, shows a picker. */
  aiProviderId?: string;
  /** Model string. If undefined, shows a model picker. */
  aiModel?: string;

  // ── Messages (controlled) ────────────────────────────────────────────
  /**
   * Controlled message list. Pass [] initially; ChatAgent manages streaming
   * copies internally and calls onFinish() with the final list after each exchange.
   */
  messages: ChatAgentMessage[];

  // ── AI config ────────────────────────────────────────────────────────
  /** System prompt */
  systemPrompt?: string;
  /** SSE endpoint URL — e.g. "/api/assistants/coding/stream" */
  streamUrl: string;
  /** Extra body fields for the POST request (e.g. { toolId }) */
  streamBody?: Record<string, unknown>;
  /** Max agentic steps (default: 12) */
  maxSteps?: number;

  // ── Callbacks ────────────────────────────────────────────────────────
  /** Called after every AI exchange with the full updated message list. */
  onFinish?: (messages: ChatAgentMessage[]) => void;

  /** Called when user clears chat. Fires after internal messages reset. */
  onClear?: () => void;

  /**
   * Fired on every tool-call or tool-result event during streaming.
   * The component continues processing internally — use this to observe or
   * react to tool activity externally without intercepting the AI loop.
   */
  onToolAction?: (event: ToolActionEvent) => void;

  /** Called when user picks a new AI provider via the toolbar picker. */
  onChangeAiProvider?: (providerId: string) => void;

  /** Called when user picks a new model via the toolbar picker. */
  onChangeModel?: (model: string) => void;

  /** Textarea placeholder. Default: "Type a message… (Enter to send)" */
  placeholder?: string;
  /** Label for the assistant sender tag. Default: "Assistant" */
  assistantLabel?: string;
  /** Color for the assistant avatar. Uses agent.color if available. */
  assistantColor?: string | null;
  /** Slot rendered inside the empty-state area */
  emptyStateContent?: ReactNode;
  /** Extra class names on the root element */
  className?: string;
  /** Show provider/model picker in the input toolbar */
  showProviderPicker?: boolean;
  /** Width (CSS). Default: "100%" */
  width?: string | number;
  /** Height (CSS). Default: "100%" */
  height?: string | number;
  /** Inline style override for root element */
  style?: React.CSSProperties;
  /** Ref to access the internal messages state (imperative handle). */
  ref?: Ref<ChatAgentHandle>;
}

// ── Component — delegates all logic to useChatAgent ──────────────────────────
export function ChatAgent({
  aiProviderId,
  aiModel,
  messages: externalMessages,
  systemPrompt,
  streamUrl,
  streamBody,
  maxSteps,
  onFinish,
  onClear,
  onToolAction,
  onChangeAiProvider,
  onChangeModel,
  assistantLabel = "Assistant",
  assistantColor,
  placeholder = "Type a message… (Enter to send)",
  emptyStateContent,
  className = "",
  showProviderPicker = false,
  width = "100%",
  height = "100%",
  style: styleProp,
  ref,
}: ChatAgentProps) {
  const {
    messages,
    setMessages,
    generating,
    providerId,
    model,
    messagesEndRef,
    scrollContainerRef,
    scrollToBottom,
    handleSend,
    handleCancel,
    handleProviderChange,
    handleModelChange,
  } = useChatAgent({
    propProviderId: aiProviderId,
    propModel: aiModel,
    externalMessages,
    systemPrompt,
    streamUrl,
    streamBody,
    maxSteps,
    onFinish,
    onClear,
    onToolAction,
    onChangeAiProvider,
    onChangeModel,
  });

  // Expose messages + setMessages + send via imperative handle
  useImperativeHandle(
    ref,
    () => ({
      get messages() {
        return messages;
      },
      setMessages,
      send: (text: string) => void handleSend(text),
    }),
    [messages, setMessages, handleSend],
  );

  return (
    <div
      className={`${className} bg-surface`}
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...styleProp,
      }}
    >
      <MessageList
        messages={messages}
        generating={generating}
        assistantLabel={assistantLabel}
        assistantColor={assistantColor}
        emptyStateContent={emptyStateContent}
        messagesEndRef={messagesEndRef}
        scrollContainerRef={scrollContainerRef}
        className="selectable"
      />

      <InputArea
        generating={generating}
        placeholder={placeholder}
        onSend={(text) => {
          scrollToBottom();
          void handleSend(text);
        }}
        onCancel={handleCancel}
        providerId={providerId}
        model={model}
        onProviderChange={showProviderPicker ? handleProviderChange : undefined}
        onModelChange={showProviderPicker ? handleModelChange : undefined}
      />
    </div>
  );
}
