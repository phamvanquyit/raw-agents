import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { AgentMessage } from "src/common/types";
import { wsClient } from "../../../common/api/wsClient";
import { useAgentRunner } from "../../../common/hooks/useAgent";
import { InputArea } from "../../../components/chat/_components/InputArea";
import type { ChatAgentMessage } from "../../../components/chat/_components/types";
import { useAutoScroll } from "../../../components/chat/_components/useAutoScroll";
import {
  ChatMessages,
  ChatSidebar,
  ErrorScreen,
  GridBackground,
  HIDDEN_TOOL_NAMES,
  LoadingScreen,
  PasswordGate,
  getFingerprint,
  toDisplayMsg,
} from "./components";
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
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const { run, running, cancel } = useAgentRunner();
  const [streamingContent, setStreamingContent] = useState("");

  const { scrollRef, scrollToBottom } = useAutoScroll();

  // Auto-focus chat input when switching conversations
  useEffect(() => {
    if (!conversationId) return;
    // Small delay so React finishes rendering the new conversation
    const timer = setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>("[data-chat-input]");
      el?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [conversationId]);

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

  /** Switch to a conversation — load its messages */
  const switchConversation = async (aId: string, cId: string) => {
    const fp = getFingerprint();
    setMessages([]);
    setStreamingContent("");
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

  /** Create a new conversation (or switch to existing empty one) */
  const newConversation = async (aId: string) => {
    if (running) return;
    // If there's already an empty conversation, just switch to it
    const emptyConv = conversations.find((c) => c.isEmpty);
    if (emptyConv) {
      await switchConversation(aId, emptyConv.id);
      return;
    }
    const fp = getFingerprint();
    const res = await fetch(`/api/public/agents/${aId}/conversations?fp=${fp}`, {
      method: "POST",
    });
    if (res.ok) {
      const data = await res.json();
      const convs = await refreshConversations(aId);
      if (data.conversationId) {
        setConversationId(data.conversationId);
        setMessages([]);
        setStreamingContent("");
        navigate(`/chat/${aId}?conv=${data.conversationId}`, { replace: true });
      }
      return convs;
    }
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
      } else if (convs.length > 0) {
        // Load the most recent conversation
        await switchConversation(agentId, convs[0].id);
      } else {
        // No conversations yet — create first one
        await newConversation(agentId);
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
  }, [conversationId, agentId]);

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

  // Listen to WS events globally to track processing state across ALL tabs/clients
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // chat:done / chat:error — sent only to the initiating client
    unsubs.push(
      wsClient.on<{ conversationId: string; text: string }>("chat:done", (payload) => {
        unmarkProcessing(payload.conversationId);
      }),
    );

    unsubs.push(
      wsClient.on<{ conversationId: string; error: string }>("chat:error", (payload) => {
        unmarkProcessing(payload.conversationId);
      }),
    );

    // conversations:updated — broadcast to ALL clients (other tabs receive this)
    unsubs.push(
      wsClient.on<{ id: string; status: string }>("conversations:updated", (payload) => {
        if (payload.status === "running") {
          markProcessing(payload.id);
        } else {
          unmarkProcessing(payload.id);
        }
      }),
    );

    return () => {
      for (const u of unsubs) u();
    };
  }, [markProcessing, unmarkProcessing]);

  // Sync processingConvIds from server status on conversations load
  useEffect(() => {
    const runningIds = new Set(conversations.filter((c) => c.status === "running").map((c) => c.id));
    setProcessingConvIds((prev) => {
      // Only update if there's actually a difference
      const isSame = prev.size === runningIds.size && [...runningIds].every((id) => prev.has(id));
      return isSame ? prev : runningIds;
    });
  }, [conversations]);

  const handleSend = async (text: string) => {
    if (!agent || running || !conversationId) return;

    const optimisticMsg: any = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: text,
      conversationId,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setStreamingContent("");
    scrollToBottom();

    const mockAgent: any = { id: agent.id, name: agent.name };
    const convId = conversationId;

    // Mark this conversation as processing
    markProcessing(convId);

    const savedToken = localStorage.getItem(`public_auth_${agent.id}`) ?? undefined;

    run({
      agent: mockAgent,
      conversationId: convId,
      userMessage: text,
      password: enteredPassword || undefined,
      token: savedToken,
      onChunk: (chunk) => {
        setStreamingContent((prev) => prev + chunk);
      },
      onToolCall: () => {},
      onToolResult: () => {},
      onDone: async () => {
        setStreamingContent("");
        unmarkProcessing(convId);
        try {
          const res = await fetch(`/api/conversations/${convId}/messages`);
          if (res.ok) {
            const data = await res.json();
            setMessages(data);
          }
        } catch {
          /* best-effort */
        }
        if (agentId) refreshConversations(agentId);
      },
      onError: async (err) => {
        console.error(err);
        setStreamingContent("");
        unmarkProcessing(convId);
        try {
          const res = await fetch(`/api/conversations/${convId}/messages`);
          if (res.ok) {
            const data = await res.json();
            setMessages(data);
          }
        } catch {
          /* best-effort */
        }
      },
    });
  };

  const liveMessages: ChatAgentMessage[] = [
    ...messages.map(toDisplayMsg).filter((m) => !(m.role === "tool-call" && m.toolName && HIDDEN_TOOL_NAMES.has(m.toolName))),
    ...(streamingContent
      ? [
          {
            id: "stream",
            role: "assistant" as const,
            content: streamingContent,
            streaming: true,
            timestamp: new Date(),
          },
        ]
      : []),
  ];

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
          className="md:hidden absolute top-4 left-4 z-20 text-muted hover:text-soft transition-colors p-2 rounded-lg hover:bg-white/5 bg-surface/80 backdrop-blur-sm border border-border/20"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <title>Menu</title>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <ChatMessages
          scrollRef={scrollRef}
          liveMessages={liveMessages}
          conversationId={conversationId}
          agentName={agent?.name}
          running={running}
          streamingContent={streamingContent}
        />

        {/* Input */}
        <div className="shrink-0 w-full relative z-10">
          <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />
          <div className="px-4 pb-4 pt-2">
            <div className="max-w-3xl mx-auto">
              <InputArea placeholder="Type a message..." generating={running} onSend={conversationId ? handleSend : () => {}} onCancel={cancel} hideConfig />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
