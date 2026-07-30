import { AltArrowDown, PenNewSquare, SidebarMinimalistic } from "@solar-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "src/common/api";
import { stopAgentChat, useAgentRunner } from "src/common/hooks/useAgent";
import type { AgentMessage } from "src/common/types";
import { InputArea } from "src/components/chat/_components/InputArea";
import { MessageList } from "src/components/chat/_components/MessageList";

import { useChatStreaming } from "src/common/hooks/useChatStreaming";
import { useStreamResume } from "src/common/hooks/useStreamResume";
import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";
import { updateAgent } from "src/modules/agents/common/agentsSlice";
import { createConversation, fetchConversations, markConversationDone, setActiveConversationId, updateConversation } from "src/modules/chat/common/chatSlice";
import { usageApi } from "src/modules/usage/common/usageApi";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { useAgentDetailContext } from "../common/agentDetailContext";
import { ChatEmptyState } from "./components/ChatEmptyState";
import { ConversationList } from "./components/ConversationList";

const SIDEBAR_DEFAULT = 260;
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 420;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDisplayMsg(m: {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | null;
}) {
  if (m.role === "tool") {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    return {
      id: m.id,
      role: "tool-call" as const,
      content: String(meta.toolName ?? m.content ?? "tool"),
      toolCallId: meta.toolCallId as string | undefined,
      toolName: String(meta.toolName ?? m.content ?? "Tool"),
      toolLabel: meta.toolLabel as string | undefined,
      toolInput: meta.toolInput,
      toolOutput: meta.toolOutput as string | undefined,
      toolError: Boolean(meta.toolError),
      streaming: false,
      timestamp: m.createdAt ?? new Date(),
    };
  }
  if (m.role === "thinking") {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    return {
      id: m.id,
      role: "thinking" as const,
      content: m.content,
      streaming: false,
      timestamp: m.createdAt ?? new Date(),
      meta: { thinking: m.content, thinkingDuration: (meta.thinkingDuration as number) ?? 0 },
    };
  }
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    streaming: false,
    timestamp: m.createdAt ?? new Date(),
    meta: m.metadata ? (m.metadata as Record<string, unknown>) : undefined,
  };
}

// ─── Chat Content (embeddable — no dialog wrapper) ────────────────────────────

export function ChatPage() {
  const { agent } = useAgentDetailContext();
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeConversationId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);

  const { run, running, cancel } = useAgentRunner();

  // Track which conversation is currently streaming — isolates streaming per conv
  const [streamingConvId, setStreamingConvId] = useState<string | null>(null);
  const streamingConvIdRef = useRef<string | null>(null);
  streamingConvIdRef.current = streamingConvId;

  // ── Fetch messages from API (returns data, hook handles setMessages) ────────

  const fetchMessages = useCallback(async (convId: string) => {
    return apiClient.get<AgentMessage[]>(`/api/conversations/${convId}/messages`);
  }, []);

  // Filled after useStreamResume — avoids circular hook dependency with useChatStreaming
  const markTerminalRef = useRef<(convId: string) => void>(() => {});
  const handleConnectionLostRef = useRef<() => void>(() => {});

  const handleConversationDone = useCallback(
    async (convId: string) => {
      markTerminalRef.current(convId);
      setStreamingConvId(null);
      dispatch(markConversationDone(convId));
    },
    [dispatch],
  );

  const handleConversationError = useCallback(
    async (convId: string, error?: string) => {
      if (error === "Connection lost") {
        setStreamingConvId(null);
        handleConnectionLostRef.current();
        if (agent) await dispatch(fetchConversations(agent.id));
        return;
      }
      markTerminalRef.current(convId);
      setStreamingConvId(null);
      if (agent) await dispatch(fetchConversations(agent.id));
    },
    [agent, dispatch],
  );

  // ── Streaming hook (local messages, no Redux) ───────────────────────────────

  const {
    setMessages,
    streamingContent,
    thinkingContent,
    activityStatus,
    clearStreamingState,
    buildSSECallbacks,
    loadMessages,
    liveMessages,
    contextUsage,
    setContextUsage,
  } = useChatStreaming({
    toDisplayMsg,
    fetchMessages,
    onConversationDone: handleConversationDone,
    onConversationError: handleConversationError,
  });

  // Detect if server-side conversation is still running (survives F5)
  const activeConversation = useMemo(() => conversations.find((c) => c.id === activeConversationId), [conversations, activeConversationId]);
  const isServerRunning = activeConversation?.status === "running";
  // Show thinking indicator when this conv is streaming locally or still running on server
  const showGenerating = (running && streamingConvId === activeConversationId) || isServerRunning;

  const { suppressResumeConvIdRef, markTerminal, handleConnectionLost } = useStreamResume({
    running,
    conversationId: activeConversationId,
    isServerRunning,
    buildSSECallbacks,
    loadMessages,
    clearStreamingState,
    onAttach: setStreamingConvId,
    retryOnConnectionLost: true,
  });
  markTerminalRef.current = markTerminal;
  handleConnectionLostRef.current = handleConnectionLost;

  const [loading, setLoading] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { scrollRef, scrollToBottom } = useAutoScroll({ onScrolledUpChange: setIsScrolledUp });
  const prevAgentIdRef = useRef<string | null>(null);
  const resizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizing.current = true;
      resizeStartX.current = e.clientX;
      resizeStartW.current = sidebarWidth;
      setIsResizing(true);
    },
    [sidebarWidth],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const dx = e.clientX - resizeStartX.current;
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, resizeStartW.current + dx)));
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      setIsResizing(false);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Reset streaming when switching conversations ────────────────────────────

  useEffect(() => {
    // When viewing a different conversation than the one streaming, clear display
    if (activeConversationId !== streamingConvIdRef.current) {
      clearStreamingState();
    }
  }, [activeConversationId, clearStreamingState]);

  // When another tab starts a run, pull the new user message even before SSE connects
  useEffect(() => {
    if (!isServerRunning || !activeConversationId || running) return;
    void loadMessages(activeConversationId);
  }, [isServerRunning, activeConversationId, running, loadMessages]);

  useEffect(() => {
    if (!agent?.id) {
      setContextUsage(null);
      return;
    }
    let cancelled = false;
    void usageApi
      .context(agent.id, activeConversationId)
      .then((data) => {
        if (!cancelled) setContextUsage(data);
      })
      .catch(() => {
        if (!cancelled) setContextUsage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [agent?.id, activeConversationId, activeConversation?.status, setContextUsage]);

  // Keep scroll pinned when content changes — backup for MutationObserver
  // which can miss auto-scroll when textarea resize changes clientHeight
  useEffect(() => {
    scrollToBottom();
  }, [liveMessages.length, streamingContent, thinkingContent, activityStatus, scrollToBottom]);

  // Load conversations when agent changes
  useEffect(() => {
    if (!agent) return;
    if (prevAgentIdRef.current === agent.id) return;
    prevAgentIdRef.current = agent.id;

    setMessages([]);
    dispatch(setActiveConversationId(null));
    const urlConvId = searchParams.get("conv");
    if (urlConvId) setLoading(true);
    dispatch(fetchConversations(agent.id))
      .unwrap()
      .then(async (convs) => {
        const agentConvs = convs.filter((c) => c.agentId === agent.id);
        const target = urlConvId ? agentConvs.find((c) => c.id === urlConvId) : null;
        if (target) {
          dispatch(setActiveConversationId(target.id));
          await loadMessages(target.id);
        }
      })
      .finally(() => setLoading(false));
  }, [agent?.id]);

  // ── Handle conversation selection from sidebar ──────────────────────────────

  const handleSelectConversation = useCallback(
    async (convId: string) => {
      if (convId === activeConversationId) return;
      setMessages([]);
      dispatch(setActiveConversationId(convId));
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("conv", convId);
          return p;
        },
        { replace: true },
      );
      await loadMessages(convId);
    },
    [dispatch, activeConversationId, setSearchParams, loadMessages, setMessages],
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    clearStreamingState();
    dispatch(setActiveConversationId(null));
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("conv");
        return p;
      },
      { replace: true },
    );
  }, [dispatch, setSearchParams, clearStreamingState, setMessages]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!agent || running) return;

      let convId = activeConversationId;
      // No active conversation → create one with the message as title
      if (!convId) {
        const title = text.length > 80 ? `${text.slice(0, 80)}…` : text;
        const newConv = await dispatch(createConversation({ agentId: agent.id, title })).unwrap();
        dispatch(setActiveConversationId(newConv.id));
        convId = newConv.id;
        await dispatch(fetchConversations(agent.id));
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            p.set("conv", newConv.id);
            return p;
          },
          { replace: true },
        );
      }
      if (!convId) return;

      clearStreamingState();
      // Mark which conversation we're streaming to
      setStreamingConvId(convId);

      // Optimistic: show user message immediately
      setMessages((prev) => [
        ...prev,
        {
          id: `optimistic-${Date.now()}`,
          agentId: agent.id,
          conversationId: convId,
          chatAgentId: null,
          role: "user" as const,
          content: text,
          metadata: null,
          createdAt: new Date(),
        },
      ]);
      scrollToBottom({ force: true });

      // If first message in a conversation still titled "New Chat", rename it
      const activeConv = conversations.find((c) => c.id === convId);
      if (activeConv && activeConv.title === "New Chat") {
        const title = text.length > 80 ? `${text.slice(0, 80)}…` : text;
        dispatch(updateConversation({ id: convId, title }));
      }

      const callbacks = buildSSECallbacks(convId);
      run({
        agent,
        conversationId: convId,
        userMessage: text,
        ...callbacks,
      });
    },
    [agent, running, activeConversationId, dispatch, run, scrollToBottom, setSearchParams, clearStreamingState, conversations, buildSSECallbacks, setMessages],
  );

  const handleCancel = useCallback(async () => {
    const cancelledConvId = streamingConvIdRef.current ?? activeConversationId;
    // Suppress auto-resume before running flips false (stop is in-flight)
    if (cancelledConvId) suppressResumeConvIdRef.current = cancelledConvId;

    // Always hit stop API — resume/job runs may not have local runner refs set
    if (agent && cancelledConvId) {
      await stopAgentChat(agent.id, cancelledConvId);
    }
    cancel();
    setStreamingConvId(null);

    // Give the server a moment to save the partial assistant message to DB
    await new Promise((r) => setTimeout(r, 300));

    if (cancelledConvId) {
      await loadMessages(cancelledConvId);
      // Refresh conversation status (will change to "failed"/"done")
      if (agent) await dispatch(fetchConversations(agent.id));
    }

    // Now that DB messages are loaded, clear the streaming overlay
    clearStreamingState();
  }, [cancel, agent, activeConversationId, dispatch, loadMessages, clearStreamingState, suppressResumeConvIdRef]);

  return (
    <div
      className="flex h-full w-full overflow-hidden"
      style={{
        fontFamily: "var(--font-family-chat)",
        userSelect: isResizing ? "none" : undefined,
        cursor: isResizing ? "col-resize" : undefined,
      }}
    >
      {sidebarOpen && (
        <>
          <ConversationList
            width={sidebarWidth}
            onNewChat={handleNewChat}
            onSelectConversation={handleSelectConversation}
            onCloseSidebar={() => setSidebarOpen(false)}
          />
          <div
            onMouseDown={onResizeStart}
            className={[
              "w-px shrink-0 h-full cursor-col-resize z-10 transition-colors duration-150",
              isResizing ? "bg-primary/50" : "bg-border hover:bg-primary/40",
            ].join(" ")}
          />
        </>
      )}

      <div className="relative flex flex-col flex-1 min-w-0 h-full bg-popover">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-48"
          style={{
            background: "radial-gradient(ellipse 80% 100% at 50% 0%, color-mix(in oklab, var(--muted) 55%, transparent), transparent)",
          }}
        />

        {!sidebarOpen && (
          <div className="absolute top-2 left-2 z-20 flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex items-center justify-center size-8 rounded-lg border-none bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
              aria-label="Open sidebar"
              title="Open sidebar"
            >
              <SidebarMinimalistic width={16} height={16} />
            </button>
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center justify-center size-8 rounded-lg border-none bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
              aria-label="New chat"
              title="New chat"
            >
              <PenNewSquare width={15} height={15} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="relative flex-1 flex items-center justify-center min-h-0">
            <span className="text-[12px] text-muted-foreground animate-pulse">Loading...</span>
          </div>
        ) : (
          <div className={["relative flex-1 min-h-0 flex flex-col", !sidebarOpen ? "pt-10" : ""].join(" ")}>
            <MessageList
              messages={liveMessages}
              generating={showGenerating && !streamingContent}
              activityStatus={isServerRunning && !running ? "Processing..." : activityStatus}
              assistantLabel={agent.name}
              emptyStateContent={<ChatEmptyState agent={agent} onStarter={(text) => void handleSend(text)} disabled={showGenerating} />}
              messagesEndRef={messagesEndRef}
              scrollContainerRef={scrollRef}
            />
            {isScrolledUp && (
              <button
                type="button"
                onClick={() => scrollToBottom({ force: true })}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center size-8 rounded-full border border-border bg-muted text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                aria-label="Scroll to bottom"
              >
                <AltArrowDown width={14} height={14} />
              </button>
            )}
          </div>
        )}

        {!loading && (
          <div className="relative shrink-0 w-full max-w-[760px] mx-auto">
            <div className="pointer-events-none absolute -top-6 left-0 right-0 h-6 bg-gradient-to-t from-popover to-transparent" />
            <InputArea
              generating={showGenerating}
              placeholder={`Message ${agent.name}...`}
              onSend={(text) => void handleSend(text)}
              onCancel={handleCancel}
              providerId={agent.aiProvider ?? undefined}
              model={agent.aiModel ?? undefined}
              onProviderChange={(pid) => void dispatch(updateAgent({ id: agent.id, aiProvider: pid }))}
              onModelChange={(m) => void dispatch(updateAgent({ id: agent.id, aiModel: m }))}
              focusSignal={activeConversationId}
              contextUsage={contextUsage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
