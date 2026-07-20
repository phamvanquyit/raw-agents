import { AltArrowDown } from "@solar-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { AgentMessage } from "src/common/types";
import { wsClient } from "../../../common/api/wsClient";
import { useAgentRunner } from "../../../common/hooks/useAgent";
import { useChatStreaming } from "../../../common/hooks/useChatStreaming";
import { useStreamResume } from "../../../common/hooks/useStreamResume";
import { AppLogo } from "../../../components/AppLogo";
import { InputArea } from "../../../components/chat/_components/InputArea";
import { MessageList } from "../../../components/chat/_components/MessageList";
import { useAutoScroll } from "../../../components/chat/hooks/useAutoScroll";
import { ChatSidebar, ErrorScreen, GridBackground, HIDDEN_TOOL_NAMES, LoadingScreen, PasswordGate, getFingerprint, toDisplayMsg } from "./components";
import type { ConvMeta, PublicAgent } from "./components";

export default function PublicChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<PublicAgent | null>(null);

  // Auth state
  const [enteredPassword, setEnteredPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Sidebar state
  const [conversations, setConversations] = useState<ConvMeta[]>([]);
  // Track which conversations are actively processing (across all tabs)
  const [processingConvIds, setProcessingConvIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Chat state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { run, running, cancel } = useAgentRunner();

  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const { scrollRef, scrollToBottom } = useAutoScroll({ onScrolledUpChange: setIsScrolledUp });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const agentId = agent?.id;

  /** Refresh conversation list from server */
  const refreshConversations = async (aId: string) => {
    const fp = getFingerprint();
    const res = await fetch(`/api/public/agents/${aId}/conversations?fp=${fp}`);
    if (res.ok) {
      const data: ConvMeta[] = await res.json();
      setConversations(data);
      return data;
    }
    return [];
  };

  // Store refreshConversations in a ref so the hook callbacks can access it without stale closures
  const refreshConversationsRef = useRef(refreshConversations);
  refreshConversationsRef.current = refreshConversations;

  /** Fetch messages from server — returns data, hook handles setMessages */
  const fetchMessages = useCallback(async (convId: string) => {
    const res = await fetch(`/api/conversations/${convId}/messages`);
    if (res.ok) return (await res.json()) as AgentMessage[];
    return [];
  }, []);

  /** Mark a conversation as processing */
  const markProcessing = useCallback((cId: string) => {
    setProcessingConvIds((prev) => {
      const next = new Set(prev);
      next.add(cId);
      return next;
    });
  }, []);

  /** Unmark a conversation as processing */
  const unmarkProcessing = useCallback((cId: string) => {
    setProcessingConvIds((prev) => {
      const next = new Set(prev);
      next.delete(cId);
      return next;
    });
  }, []);

  // ── Streaming hook (local messages, no Redux) ───────────────────────────────

  const messageFilter = useCallback(
    (m: { role: string; toolName?: string }) => !(m.role === "tool-call" && m.toolName && HIDDEN_TOOL_NAMES.has(m.toolName)),
    [],
  );

  const markTerminalRef = useRef<(convId: string) => void>(() => {});
  const handleConnectionLostRef = useRef<() => void>(() => {});

  const handleConversationDone = useCallback(
    async (convId: string) => {
      markTerminalRef.current(convId);
      unmarkProcessing(convId);
      if (agentId) refreshConversationsRef.current(agentId);
    },
    [unmarkProcessing, agentId],
  );

  const handleConversationError = useCallback(
    async (convId: string, error?: string) => {
      if (error === "Connection lost") {
        handleConnectionLostRef.current();
        if (agentId) {
          const convs = await refreshConversationsRef.current(agentId);
          const stillRunning = convs.some((c) => c.id === convId && c.status === "running");
          if (!stillRunning) unmarkProcessing(convId);
        }
        return;
      }
      markTerminalRef.current(convId);
      unmarkProcessing(convId);
      if (agentId) refreshConversationsRef.current(agentId);
    },
    [unmarkProcessing, agentId],
  );

  const { setMessages, streamingContent, activityStatus, clearStreamingState, buildSSECallbacks, loadMessages, liveMessages } = useChatStreaming({
    toDisplayMsg,
    messageFilter,
    fetchMessages,
    onConversationDone: handleConversationDone,
    onConversationError: handleConversationError,
  });

  const isServerRunning = Boolean(conversationId && processingConvIds.has(conversationId));
  const streamConnectOptions = useMemo(() => (agentId ? { fingerprint: getFingerprint(), agentId } : undefined), [agentId]);

  const { markTerminal, handleConnectionLost } = useStreamResume({
    running,
    conversationId,
    isServerRunning,
    buildSSECallbacks,
    loadMessages,
    connectOptions: streamConnectOptions,
  });
  markTerminalRef.current = markTerminal;
  handleConnectionLostRef.current = handleConnectionLost;

  // Keep scroll pinned when content changes — backup for MutationObserver
  // which can miss auto-scroll when textarea resize changes clientHeight
  useEffect(() => {
    scrollToBottom();
  }, [liveMessages.length, streamingContent]);

  // Load public info & restore auth from saved token
  useEffect(() => {
    if (!id) return;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/public/agents/${id}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || "Unavailable");
          return;
        }

        setAgent(data);

        if (!data.requiresPassword) {
          setIsAuthenticated(true);
          return;
        }

        const savedToken = localStorage.getItem(`public_auth_${id}`);
        if (savedToken) {
          try {
            const tokenRes = await fetch(`/api/public/agents/${id}/verify-token`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: savedToken }),
            });
            const tokenData = await tokenRes.json();
            if (tokenData.valid) {
              setIsAuthenticated(true);
            } else {
              localStorage.removeItem(`public_auth_${id}`);
            }
          } catch {
            localStorage.removeItem(`public_auth_${id}`);
          }
        }
      } catch {
        setError("Unable to connect to server.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  /** Switch to a conversation — load its messages */
  const switchConversation = async (aId: string, cId: string) => {
    const fp = getFingerprint();
    setMessages([]);
    clearStreamingState();
    setConversationId(cId);
    navigate(`/chat/${aId}?conv=${cId}`, { replace: true });
    const res = await fetch(`/api/public/agents/${aId}/conversations/${cId}?fp=${fp}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
    }
  };

  /** Delete a conversation and refresh list */
  const deleteConversation = async (aId: string, cId: string) => {
    const fp = getFingerprint();
    await fetch(`/api/public/agents/${aId}/conversations/${cId}?fp=${fp}`, {
      method: "DELETE",
    });
    const convs = await refreshConversations(aId);
    // If deleted active conversation, switch to next or create new
    if (cId === conversationId) {
      const next = convs.find((c) => c.id !== cId);
      if (next) {
        await switchConversation(aId, next.id);
      } else {
        await newConversation(aId);
      }
    }
  };

  /** Start a new chat — just clears state, conversation is created on first send */
  const newConversation = (aId: string) => {
    if (running) return;
    setConversationId(null);
    setMessages([]);
    clearStreamingState();
    navigate(`/chat/${aId}`, { replace: true });
  };

  // On authenticated: load conversations list + restore from URL or most recent
  useEffect(() => {
    if (!isAuthenticated || !agentId) return;
    (async () => {
      const convs = await refreshConversations(agentId);
      const urlConvId = searchParams.get("conv");
      const target = urlConvId ? convs.find((c) => c.id === urlConvId) : null;
      if (target) {
        await switchConversation(agentId, target.id);
      } else if (urlConvId) {
        // URL conv ID doesn't exist — clear it and start fresh
        newConversation(agentId);
      } else if (convs.length > 0) {
        // No conv in URL — load the most recent conversation
        await switchConversation(agentId, convs[0].id);
      } else {
        // No conversations yet — start with blank new chat state
        newConversation(agentId);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, agentId]);

  // Subscribe to WS events for current conversation
  useEffect(() => {
    if (!conversationId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(
      wsClient.on<AgentMessage>("messages:created", (msg) => {
        if (msg.conversationId !== conversationId) return;
        if (msg.role === "tool" && msg.content === "") return;
        setMessages((prev) => {
          const filtered = prev.filter((m) => !(m.id.startsWith("optimistic-") && m.role === msg.role && m.content === msg.content));
          return [...filtered, msg];
        });
        // Refresh sidebar titles when new user message arrives
        if (msg.role === "user" && agentId) {
          refreshConversations(agentId);
        }
      }),
    );

    unsubs.push(
      wsClient.on<AgentMessage>("messages:updated", (msg) => {
        if (msg.conversationId !== conversationId) return;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
      }),
    );

    return () => {
      for (const u of unsubs) u();
    };
  }, [conversationId, agentId, setMessages]);

  const verifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enteredPassword || !agent) return;

    setVerifying(true);
    setAuthError("");

    try {
      const res = await fetch(`/api/public/agents/${agent.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: enteredPassword }),
      });
      const data = await res.json();
      if (data.valid) {
        if (data.token) localStorage.setItem(`public_auth_${agent.id}`, data.token);
        setIsAuthenticated(true);
      } else {
        setAuthError(data.message || "Incorrect password");
      }
    } catch {
      setAuthError("Connection error.");
    } finally {
      setVerifying(false);
    }
  };

  // Track processing state across tabs via conversations:updated broadcast
  useEffect(() => {
    return wsClient.on<{ id: string; status: string }>("conversations:updated", (payload) => {
      if (payload.status === "running") {
        markProcessing(payload.id);
      } else {
        unmarkProcessing(payload.id);
      }
    });
  }, [markProcessing, unmarkProcessing]);

  // Sync processingConvIds from server status on conversations load
  useEffect(() => {
    const runningIds = new Set(conversations.filter((c) => c.status === "running").map((c) => c.id));
    setProcessingConvIds((prev) => {
      const isSame = prev.size === runningIds.size && [...runningIds].every((id) => prev.has(id));
      return isSame ? prev : runningIds;
    });
  }, [conversations]);

  const handleCancel = useCallback(() => {
    if (conversationId) markTerminal(conversationId);
    cancel();
  }, [cancel, conversationId, markTerminal]);

  const handleSend = async (text: string) => {
    if (!agent || running) return;

    let convId = conversationId;

    // No active conversation → create one on the server
    if (!convId) {
      const fp = getFingerprint();
      const res = await fetch(`/api/public/agents/${agent.id}/conversations?fp=${fp}`, {
        method: "POST",
      });
      if (!res.ok) return;
      const data = await res.json();
      convId = data.conversationId;
      if (!convId) return;
      setConversationId(convId);
      navigate(`/chat/${agent.id}?conv=${convId}`, { replace: true });
      await refreshConversations(agent.id);
    }

    const optimisticMsg: any = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: text,
      conversationId: convId,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    clearStreamingState();
    scrollToBottom({ force: true });

    const mockAgent: any = { id: agent.id, name: agent.name };

    // Mark this conversation as processing
    markProcessing(convId);

    const savedToken = localStorage.getItem(`public_auth_${agent.id}`) ?? undefined;

    const callbacks = buildSSECallbacks(convId);
    run({
      agent: mockAgent,
      conversationId: convId,
      userMessage: text,
      password: enteredPassword || undefined,
      token: savedToken,
      ...callbacks,
    });
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) return <LoadingScreen />;

  // ── Error ─────────────────────────────────────────────────────────────────

  if (error) return <ErrorScreen error={error} />;

  // ── Password gate ─────────────────────────────────────────────────────────

  if (!isAuthenticated && agent?.requiresPassword) {
    return (
      <PasswordGate
        agentName={agent.name}
        enteredPassword={enteredPassword}
        onPasswordChange={setEnteredPassword}
        onSubmit={verifyPassword}
        authError={authError}
        verifying={verifying}
      />
    );
  }

  // ── Chat screen ───────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden relative">
      {/* Grid background */}
      <GridBackground />

      {/* Sidebar */}
      <ChatSidebar
        agentName={agent?.name}
        agentDescription={agent?.description}
        agentModel={agent?.model}
        toolCount={agent?.tools?.length}
        conversations={conversations}
        conversationId={conversationId}
        processingConvIds={processingConvIds}
        sidebarOpen={sidebarOpen}
        running={running}
        onCloseSidebar={() => setSidebarOpen(false)}
        onNewConversation={() => agentId && newConversation(agentId)}
        onSwitchConversation={(convId) => agentId && switchConversation(agentId, convId)}
        onDeleteConversation={(convId) => agentId && deleteConversation(agentId, convId)}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Mobile sidebar toggle */}
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="md:hidden absolute top-4 left-4 z-20 text-muted-foreground hover:text-muted-foreground transition-colors p-2 rounded-lg hover:bg-accent bg-card border border-border/20"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <title>Menu</title>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="relative flex-1 min-h-0 flex flex-col">
          <MessageList
            messages={liveMessages}
            generating={running && !streamingContent}
            activityStatus={activityStatus}
            assistantLabel={agent?.name ?? "Assistant"}
            emptyStateContent={
              <div className="flex flex-col items-center gap-2">
                <AppLogo size={32} />
                <span className="text-[12px] text-muted-foreground">Ask me anything to get started</span>
              </div>
            }
            messagesEndRef={messagesEndRef}
            scrollContainerRef={scrollRef}
          />
          {isScrolledUp && (
            <button
              type="button"
              onClick={() => scrollToBottom({ force: true })}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center size-8 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Scroll to bottom"
            >
              <AltArrowDown width={14} height={14} />
            </button>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 w-full relative z-10">
          <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />
          <div className="px-4 pb-4 pt-2">
            <div className="max-w-3xl mx-auto">
              <InputArea
                placeholder="Type a message..."
                generating={running}
                onSend={handleSend}
                onCancel={handleCancel}
                hideConfig
                focusSignal={conversationId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
