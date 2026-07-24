import { useCallback, useMemo, useRef, useState } from "react";
import type { AgentMessage } from "src/common/types";
import type { ContextUsagePayload } from "src/components/chat/common/sse";
import type { ChatAgentMessage } from "src/components/chat/common/types";
import { formatToolName, isCallAgentToolName } from "src/components/chat/common/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToDisplayMsg = (m: AgentMessage) => ChatAgentMessage;
type MessageFilter = (m: ChatAgentMessage) => boolean;

export interface SSECallbacks {
  onChunk: (chunk: string) => void;
  onThinking: (chunk: string) => void;
  onToolCall: (call: { toolCallId?: string; toolName: string; toolLabel?: string; input: unknown }) => void;
  onToolResult: (call: { toolCallId?: string; toolName: string; result: unknown }) => void;
  onContextUsage?: (usage: ContextUsagePayload) => void;
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

// ─── Optimistic tool helpers ──────────────────────────────────────────────────

const OPT_PREFIX = "stream-tc-";

function isOptimisticToolId(id: string): boolean {
  return id.startsWith(OPT_PREFIX);
}

function toolCallIdOf(m: AgentMessage): string | undefined {
  const meta = m.metadata as Record<string, unknown> | null;
  const id = meta?.toolCallId;
  return typeof id === "string" && id ? id : undefined;
}

function hasToolOutput(m: AgentMessage): boolean {
  const meta = m.metadata as Record<string, unknown> | null;
  return meta?.toolOutput != null;
}

/**
 * Merge server rows with in-flight optimistic tool bubbles.
 * Keeps stream-tc-* tools that the server hasn't persisted yet (race on loadMessages).
 */
function mergeServerWithOptimistic(serverRows: AgentMessage[], prev: AgentMessage[]): AgentMessage[] {
  const serverCallIds = new Set<string>();
  for (const row of serverRows) {
    if (row.role !== "tool") continue;
    const cid = toolCallIdOf(row);
    if (cid) serverCallIds.add(cid);
  }

  const pendingOptimistic = prev.filter((m) => {
    if (m.role !== "tool" || !isOptimisticToolId(m.id)) return false;
    const cid = toolCallIdOf(m);
    // Drop optimistic once server has the real row for this call
    if (cid && serverCallIds.has(cid)) return false;
    return true;
  });

  if (pendingOptimistic.length === 0) return serverRows;
  return [...serverRows, ...pendingOptimistic];
}

function upsertOptimisticTool(
  prev: AgentMessage[],
  call: { toolCallId?: string; toolName: string; toolLabel?: string; input: unknown },
  convId: string,
): AgentMessage[] {
  const { toolCallId, toolName, toolLabel, input } = call;
  const label = toolLabel ?? formatToolName(toolName);

  if (toolCallId) {
    const matchIdx = prev.findIndex((m) => m.role === "tool" && toolCallIdOf(m) === toolCallId);
    if (matchIdx !== -1) {
      return prev.map((m, i) => {
        if (i !== matchIdx) return m;
        const meta = { ...(m.metadata ?? {}) };
        // Prefer non-empty complete args from later upsert events
        if (input !== undefined) meta.toolInput = input;
        if (toolLabel) meta.toolLabel = toolLabel;
        meta.toolName = toolName;
        meta.toolCallId = toolCallId;
        return { ...m, content: toolName, metadata: meta };
      });
    }
  }

  const id = `${OPT_PREFIX}${toolCallId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
  const optimistic: AgentMessage = {
    id,
    agentId: "",
    conversationId: convId,
    chatAgentId: null,
    role: "tool",
    content: toolName,
    metadata: {
      toolName,
      toolLabel: label,
      toolInput: input ?? {},
      toolCallId,
    },
    createdAt: new Date(),
  };
  return [...prev, optimistic];
}

function patchOptimisticToolResult(prev: AgentMessage[], call: { toolCallId?: string; toolName: string; result: unknown }): AgentMessage[] {
  const resultStr = typeof call.result === "string" ? call.result : JSON.stringify(call.result);

  let matchIdx = -1;
  if (call.toolCallId) {
    matchIdx = prev.findIndex((m) => m.role === "tool" && toolCallIdOf(m) === call.toolCallId && !hasToolOutput(m));
  }
  if (matchIdx === -1) {
    const revIdx = [...prev].reverse().findIndex((m) => m.role === "tool" && (m.metadata as any)?.toolName === call.toolName && !hasToolOutput(m));
    matchIdx = revIdx === -1 ? -1 : prev.length - 1 - revIdx;
  }
  if (matchIdx === -1) return prev;

  return prev.map((m, i) => {
    if (i !== matchIdx) return m;
    return {
      ...m,
      metadata: {
        ...(m.metadata ?? {}),
        toolOutput: resultStr,
        result: call.result,
      },
    };
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChatStreaming({ toDisplayMsg, messageFilter, fetchMessages, onConversationDone, onConversationError }: UseChatStreamingOptions) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [thinkingContent, setThinkingContent] = useState("");
  const thinkingStartRef = useRef<number>(0);
  const [thinkingDuration, setThinkingDuration] = useState<number | undefined>(undefined);
  /** True after tool-call until next thinking/text starts — forces a fresh live bubble */
  const segmentBoundaryRef = useRef(false);
  const [activityStatus, setActivityStatus] = useState("Thinking...");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsagePayload | null>(null);

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
    segmentBoundaryRef.current = false;
    setActivityStatus("Thinking...");
    setStreamError(null);
  }, []);

  /** Fetch messages from server and merge with in-flight optimistic tools */
  const loadMessages = useCallback(
    async (convId: string) => {
      try {
        const rows = await fetchMessages(convId);
        setMessages((prev) => mergeServerWithOptimistic(rows, prev));
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
        // New segment after tool-call: drop any stale thinking overlay; server already persisted prior rounds
        if (segmentBoundaryRef.current) {
          segmentBoundaryRef.current = false;
          setThinkingContent("");
          thinkingStartRef.current = 0;
          setThinkingDuration(undefined);
          setStreamingContent(chunk);
        } else {
          setStreamingContent((prev) => prev + chunk);
        }
        setActivityStatus("Writing...");
        if (thinkingStartRef.current) {
          setThinkingDuration(Math.round((Date.now() - thinkingStartRef.current) / 1000));
          thinkingStartRef.current = 0;
        }
      },
      onThinking: (chunk) => {
        setStreamError(null);
        // New thinking round after tool-call must NOT append onto the previous live block
        if (segmentBoundaryRef.current) {
          segmentBoundaryRef.current = false;
          setStreamingContent("");
          thinkingStartRef.current = Date.now();
          setThinkingDuration(undefined);
          setThinkingContent(chunk);
          setActivityStatus("Thinking...");
          return;
        }
        if (!thinkingStartRef.current) thinkingStartRef.current = Date.now();
        setThinkingContent((prev) => prev + chunk);
        setActivityStatus("Thinking...");
      },
      onToolCall: ({ toolCallId, toolName, toolLabel, input }) => {
        // Live overlay is discarded; tool bubble painted immediately from SSE
        setStreamingContent("");
        setThinkingContent("");
        thinkingStartRef.current = 0;
        setThinkingDuration(undefined);
        segmentBoundaryRef.current = true;
        setStreamError(null);

        setMessages((prev) => upsertOptimisticTool(prev, { toolCallId, toolName, toolLabel, input }, convId));

        if (isCallAgentToolName(toolName)) {
          const agentName = toolLabel?.replace(/^Call\s+/i, "") ?? "agent";
          setActivityStatus(`Talking to ${agentName}...`);
        } else {
          setActivityStatus(`Running ${toolLabel ?? formatToolName(toolName)}...`);
        }
        // Reconcile with DB (may lag behind early SSE)
        void loadMessages(convId);
      },
      onToolResult: ({ toolCallId, toolName, result }) => {
        // Patch local tool bubble immediately so spinner clears without waiting on refetch
        setMessages((prev) => patchOptimisticToolResult(prev, { toolCallId, toolName, result }));
        setActivityStatus("Waiting for model...");
        void loadMessages(convId);
      },
      onContextUsage: (usage) => {
        setContextUsage(usage);
      },
      onDone: async () => {
        setStreamingContent("");
        setThinkingContent("");
        thinkingStartRef.current = 0;
        setThinkingDuration(undefined);
        segmentBoundaryRef.current = false;
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
        segmentBoundaryRef.current = false;
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
    contextUsage,
    setContextUsage,
    clearStreamingState,
    buildSSECallbacks,
    loadMessages,
    liveMessages,
  };
}
