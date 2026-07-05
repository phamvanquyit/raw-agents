import { useCallback, useMemo, useRef, useState } from "react";
import type { AgentMessage } from "src/common/types";
import type { ChatAgentMessage } from "../common/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToDisplayMsg = (m: AgentMessage) => ChatAgentMessage;
type MessageFilter = (m: ChatAgentMessage) => boolean;

export interface SSECallbacks {
  onChunk: (chunk: string) => void;
  onThinking: (chunk: string) => void;
  onToolCall: (call: { toolCallId?: string; toolName: string; toolLabel?: string; input: unknown }) => void;
  onToolResult: (call: { toolCallId?: string; toolName: string; result: unknown }) => void;
  onDone: () => Promise<void> | void;
  onError: (err?: string) => Promise<void> | void;
}

export interface UseChatStreamingOptions {
  /** Convert raw AgentMessage → display format */
  toDisplayMsg: ToDisplayMsg;
  /** Optional filter applied after toDisplayMsg (e.g. hide internal tool calls) */
  messageFilter?: MessageFilter;
  /** Fetch messages from server — returns the array, hook sets state internally */
  fetchMessages: (convId: string) => Promise<AgentMessage[]>;
  /** Called when streaming finishes successfully */
  onConversationDone?: (convId: string) => void | Promise<void>;
  /** Called when streaming encounters an error */
  onConversationError?: (convId: string) => void | Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChatStreaming({ toDisplayMsg, messageFilter, fetchMessages, onConversationDone, onConversationError }: UseChatStreamingOptions) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [thinkingContent, setThinkingContent] = useState("");
  const thinkingStartRef = useRef<number>(0);
  const [thinkingDuration, setThinkingDuration] = useState<number | undefined>(undefined);
  const [activityStatus, setActivityStatus] = useState("Thinking...");

  /** Clear all streaming/thinking state */
  const clearStreamingState = useCallback(() => {
    setStreamingContent("");
    setThinkingContent("");
    thinkingStartRef.current = 0;
    setThinkingDuration(undefined);
    setActivityStatus("Thinking...");
  }, []);

  /** Fetch messages from server and update local state */
  const loadMessages = useCallback(
    async (convId: string) => {
      try {
        const rows = await fetchMessages(convId);
        setMessages(rows);
      } catch {
        // best-effort
      }
    },
    [fetchMessages],
  );

  /**
   * Build SSE callback object for a given conversation.
   * Used by both `run()` (initial send) and `connectChatSSE()` (auto-resume).
   */
  const buildSSECallbacks = useCallback(
    (convId: string): SSECallbacks => ({
      onChunk: (chunk) => {
        setStreamingContent((prev) => prev + chunk);
        setActivityStatus("Writing...");
        if (thinkingStartRef.current) {
          setThinkingDuration(Math.round((Date.now() - thinkingStartRef.current) / 1000));
          thinkingStartRef.current = 0;
        }
      },
      onThinking: (chunk) => {
        if (!thinkingStartRef.current) thinkingStartRef.current = Date.now();
        setThinkingContent((prev) => prev + chunk);
      },
      onToolCall: ({ toolName, toolLabel }) => {
        clearStreamingState();
        void loadMessages(convId);
        if (toolName === "call_agent") {
          const agentName = toolLabel?.replace(/^Call\s+/i, "") ?? "agent";
          setActivityStatus(`Talking to ${agentName}...`);
        } else {
          setActivityStatus(`Running ${toolLabel ?? toolName}...`);
        }
      },
      onToolResult: () => {
        setActivityStatus("Thinking...");
        void loadMessages(convId);
      },
      onDone: async () => {
        clearStreamingState();
        await loadMessages(convId);
        await onConversationDone?.(convId);
      },
      onError: async () => {
        clearStreamingState();
        await loadMessages(convId);
        await onConversationError?.(convId);
      },
    }),
    [clearStreamingState, loadMessages, onConversationDone, onConversationError],
  );

  /** Computed display messages with streaming bubble appended */
  const baseMessages = useMemo(() => {
    const mapped = messages.map(toDisplayMsg);
    return messageFilter ? mapped.filter(messageFilter) : mapped;
  }, [messages, toDisplayMsg, messageFilter]);

  const liveMessages = useMemo<ChatAgentMessage[]>(() => {
    if (!streamingContent && !thinkingContent) return baseMessages;
    return [
      ...baseMessages,
      {
        id: "stream",
        role: "assistant" as const,
        content: streamingContent,
        streaming: true,
        timestamp: new Date(),
        meta: thinkingContent ? { thinking: thinkingContent, ...(thinkingDuration != null ? { thinkingDuration } : {}) } : undefined,
      },
    ];
  }, [baseMessages, streamingContent, thinkingContent, thinkingDuration]);

  return {
    messages,
    setMessages,
    streamingContent,
    activityStatus,
    clearStreamingState,
    buildSSECallbacks,
    loadMessages,
    liveMessages,
  };
}
