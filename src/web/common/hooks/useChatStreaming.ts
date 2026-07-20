import { useCallback, useMemo, useRef, useState } from "react";
import type { AgentMessage } from "src/common/types";
import type { ChatAgentMessage } from "src/components/chat/common/types";
import { isCallAgentToolName } from "src/components/chat/common/utils";

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
  onConversationError?: (convId: string, error?: string) => void | Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChatStreaming({ toDisplayMsg, messageFilter, fetchMessages, onConversationDone, onConversationError }: UseChatStreamingOptions) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [thinkingContent, setThinkingContent] = useState("");
  const thinkingStartRef = useRef<number>(0);
  const [thinkingDuration, setThinkingDuration] = useState<number | undefined>(undefined);
  const [activityStatus, setActivityStatus] = useState("Thinking...");
  const [streamError, setStreamError] = useState<string | null>(null);

  // Keep latest callbacks in refs so buildSSECallbacks stays stable across renders
  const onDoneRef = useRef(onConversationDone);
  const onErrorRef = useRef(onConversationError);
  onDoneRef.current = onConversationDone;
  onErrorRef.current = onConversationError;

  /** Clear all streaming/thinking state */
  const clearStreamingState = useCallback(() => {
    setStreamingContent("");
    setThinkingContent("");
    thinkingStartRef.current = 0;
    setThinkingDuration(undefined);
    setActivityStatus("Thinking...");
    setStreamError(null);
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
   * Stable identity — reads done/error handlers via refs.
   */
  const buildSSECallbacks = useCallback(
    (convId: string): SSECallbacks => ({
      onChunk: (chunk) => {
        setStreamError(null);
        setStreamingContent((prev) => prev + chunk);
        setActivityStatus("Writing...");
        if (thinkingStartRef.current) {
          setThinkingDuration(Math.round((Date.now() - thinkingStartRef.current) / 1000));
          thinkingStartRef.current = 0;
        }
      },
      onThinking: (chunk) => {
        setStreamError(null);
        if (!thinkingStartRef.current) thinkingStartRef.current = Date.now();
        setThinkingContent((prev) => prev + chunk);
      },
      onToolCall: ({ toolName, toolLabel }) => {
        setStreamingContent("");
        setThinkingContent("");
        thinkingStartRef.current = 0;
        setThinkingDuration(undefined);
        setStreamError(null);
        void loadMessages(convId);
        if (isCallAgentToolName(toolName)) {
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
        setStreamingContent("");
        setThinkingContent("");
        thinkingStartRef.current = 0;
        setThinkingDuration(undefined);
        setActivityStatus("Thinking...");
        setStreamError(null);
        // Parent first (sets suppress-resume) before loadMessages awaits
        await onDoneRef.current?.(convId);
        await loadMessages(convId);
      },
      onError: async (err) => {
        setStreamingContent("");
        setThinkingContent("");
        thinkingStartRef.current = 0;
        setThinkingDuration(undefined);
        setActivityStatus("Thinking...");
        setStreamError(null);

        // Quiet paths — do NOT mark done (server status may be failed/running).
        // Connection lost: background run may still be alive; ChatPage clears
        // resume-suppress and re-attaches via GET /stream (with event replay).
        if (err === "cancelled" || err === "No active stream" || err === "Connection lost") {
          await onErrorRef.current?.(convId, err);
          await loadMessages(convId);
          return;
        }

        const message = err?.trim() || "Something went wrong";
        setStreamError(message);
        await onErrorRef.current?.(convId, message);
        await loadMessages(convId);
      },
    }),
    [loadMessages],
  );

  /** Computed display messages with streaming bubble / error appended */
  const baseMessages = useMemo(() => {
    const mapped = messages.map(toDisplayMsg);
    return messageFilter ? mapped.filter(messageFilter) : mapped;
  }, [messages, toDisplayMsg, messageFilter]);

  const liveMessages = useMemo<ChatAgentMessage[]>(() => {
    const result = [...baseMessages];

    if (streamingContent || thinkingContent) {
      result.push({
        id: "stream",
        role: "assistant" as const,
        content: streamingContent,
        streaming: true,
        timestamp: new Date(),
        meta: thinkingContent ? { thinking: thinkingContent, ...(thinkingDuration != null ? { thinkingDuration } : {}) } : undefined,
      });
    }

    if (streamError) {
      result.push({
        id: "stream-error",
        role: "error",
        content: streamError,
        timestamp: new Date(),
      });
    }

    return result;
  }, [baseMessages, streamingContent, thinkingContent, thinkingDuration, streamError]);

  return {
    messages,
    setMessages,
    streamingContent,
    activityStatus,
    streamError,
    clearStreamingState,
    buildSSECallbacks,
    loadMessages,
    liveMessages,
  };
}
