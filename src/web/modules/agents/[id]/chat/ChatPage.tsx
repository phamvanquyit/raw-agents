import { GhostSmile, Plain3 } from "@solar-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAgentRunner } from "src/common/hooks/useAgent";
import type { ChatAgentMessage } from "src/components/chat/ChatAgent";
import { InputArea } from "src/components/chat/_components/InputArea";
import { MessageBubble } from "src/components/chat/_components/MessageBubble";
import { groupMessages } from "src/components/chat/_components/MessageList";
import { ToolCallBubble } from "src/components/chat/_components/ToolCallBubble";

import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";
import { updateAgent } from "src/modules/agents/common/agentsSlice";
import {
  clearMessages,
  createConversation,
  fetchConversations,
  fetchMessages,
  markConversationDone,
  setActiveConversationId,
  updateConversation,
} from "src/modules/chat/common/chatSlice";
import { fetchLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { useAgentDetailContext } from "../common/agentDetailContext";
import { ConversationList } from "./components/ConversationList";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDisplayMsg(m: {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | null;
}): ChatAgentMessage {
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
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    streaming: false,
    timestamp: m.createdAt ?? new Date(),
  };
}

// ─── Chat Content (embeddable — no dialog wrapper) ────────────────────────────

export function ChatPage() {
  const { agent } = useAgentDetailContext();
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const messages = useAppSelector((s) => s.chat.messages);
  const activeConversationId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);

  const { run, running, cancel } = useAgentRunner();

  // Detect if server-side conversation is still running (survives F5)
  const activeConversation = useMemo(() => conversations.find((c) => c.id === activeConversationId), [conversations, activeConversationId]);
  const isServerRunning = activeConversation?.status === "running";
  // Show thinking indicator if either: locally streaming OR server says running
  const showGenerating = running || isServerRunning;

  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [thinkingContent, setThinkingContent] = useState("");
  const [activityStatus, setActivityStatus] = useState("Thinking...");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { scrollRef, scrollToBottom } = useAutoScroll();
  const prevAgentIdRef = useRef<string | null>(null);

  // Poll conversation status while server says running (so indicator disappears when done)
  useEffect(() => {
    if (!isServerRunning || running || !agent || !activeConversationId) return;
    const timer = setInterval(async () => {
      await dispatch(fetchConversations(agent.id));
    }, 3000);
    return () => clearInterval(timer);
  }, [isServerRunning, running, agent, activeConversationId, dispatch]);

  useEffect(() => {
    dispatch(fetchLlmProviders());
  }, [dispatch]);

  const baseMessages = useMemo(() => messages.map(toDisplayMsg), [messages]);

  const liveMessages = useMemo<ChatAgentMessage[]>(() => {
    if (!streamingContent) return baseMessages;
    return [
      ...baseMessages,
      {
        id: "stream-assistant",
        role: "assistant" as const,
        content: streamingContent,
        streaming: true,
        timestamp: new Date(),
      },
    ];
  }, [baseMessages, streamingContent]);

  // Keep scroll pinned when content changes — backup for MutationObserver
  // which can miss auto-scroll when textarea resize changes clientHeight
  useEffect(() => {
    scrollToBottom();
  }, [liveMessages.length, streamingContent]);

  // Load conversations when agent changes
  useEffect(() => {
    if (!agent) return;
    if (prevAgentIdRef.current === agent.id) return;
    prevAgentIdRef.current = agent.id;

    dispatch(clearMessages());
    dispatch(setActiveConversationId(null));
    setLoading(true);
    dispatch(fetchConversations(agent.id))
      .unwrap()
      .then(async (convs) => {
        const agentConvs = convs.filter((c) => c.agentId === agent.id);
        // Prefer conversation ID from URL if present
        const urlConvId = searchParams.get("conv");
        const target = urlConvId ? agentConvs.find((c) => c.id === urlConvId) : null;
        const selected = target ?? agentConvs.find((c) => c.trigger === "manual") ?? agentConvs[0] ?? null;
        if (selected) {
          dispatch(setActiveConversationId(selected.id));
          await dispatch(fetchMessages(selected.id));
          if (selected.id !== urlConvId) {
            setSearchParams(
              (prev) => {
                const p = new URLSearchParams(prev);
                p.set("conv", selected.id);
                return p;
              },
              { replace: true },
            );
          }
        }
      })
      .finally(() => setLoading(false));
  }, [agent?.id]);

  const handleNewChat = useCallback(() => {
    dispatch(clearMessages());
    setStreamingContent("");
    dispatch(setActiveConversationId(null));
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("conv");
        return p;
      },
      { replace: true },
    );
  }, [dispatch, setSearchParams]);

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

      setStreamingContent("");
      setThinkingContent("");
      setActivityStatus("Thinking...");
      scrollToBottom();

      // If first message in a conversation still titled "New Chat", rename it
      const activeConv = conversations.find((c) => c.id === convId);
      if (activeConv && activeConv.title === "New Chat") {
        const title = text.length > 80 ? `${text.slice(0, 80)}…` : text;
        dispatch(updateConversation({ id: convId, title }));
      }

      run({
        agent,
        conversationId: convId,
        userMessage: text,
        onChunk: (chunk) => {
          setStreamingContent((prev) => prev + chunk);
          setActivityStatus("Writing...");
        },
        onThinking: (chunk) => setThinkingContent((prev) => prev + chunk),
        onToolCall: ({ toolName, toolLabel }) => {
          // Server saved accumulated text + tool-call as DB messages; re-fetch
          // so they appear immediately, and reset streaming for the next segment.
          setStreamingContent("");
          setThinkingContent("");
          void dispatch(fetchMessages(convId));
          if (toolName === "call_agent") {
            // toolLabel is "Call Trợ lý giá vàng" → strip "Call " for natural reading
            const agentName = toolLabel?.replace(/^Call\s+/i, "") ?? "agent";
            setActivityStatus(`Talking to ${agentName}...`);
          } else {
            setActivityStatus(`Running ${toolLabel ?? toolName}...`);
          }
        },
        onToolResult: () => {
          setActivityStatus("Thinking...");
          void dispatch(fetchMessages(convId));
        },
        onDone: async () => {
          setStreamingContent("");
          setThinkingContent("");
          setActivityStatus("Thinking...");
          dispatch(markConversationDone(convId));
          // Re-fetch messages from server to ensure tool call metadata (toolInput etc.) is complete
          await dispatch(fetchMessages(convId));
        },
        onError: async (err) => {
          console.error("[AgentChat] Error:", err);
          setStreamingContent("");
          setThinkingContent("");
          setActivityStatus("Thinking...");
          // Re-fetch messages from server to ensure any partial tool calls are shown correctly
          await dispatch(fetchMessages(convId));
        },
      });
    },
    [agent, running, activeConversationId, dispatch, run, scrollToBottom, setSearchParams],
  );

  const handleCancel = useCallback(() => {
    cancel();
    setStreamingContent("");
    setThinkingContent("");
    setActivityStatus("Thinking...");
  }, [cancel]);

  return (
    <div className="flex h-full w-full" style={{ fontFamily: "var(--font-family-chat)" }}>
      {/* Conversation list sidebar */}
      <ConversationList onNewChat={handleNewChat} />

      {/* Chat content */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto game-scrollbar">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-[#8a7a5a] text-[12px]">
              <GhostSmile width={14} height={14} className="animate-pulse" />
              Loading...
            </div>
          )}

          {!loading && !activeConversationId && liveMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
              <Plain3 width={28} height={28} className="text-[#5a5040] opacity-40" />
              <span className="text-[12px] text-[#8a7a5a]">Start a conversation with {agent.name}</span>
            </div>
          )}

          {!loading && (activeConversationId || liveMessages.length > 0) && (
            <div className="px-1 pt-2 pb-20 max-w-[760px] mx-auto w-full">
              {activeConversationId && liveMessages.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-[#8a7a5a]">
                  <Plain3 width={20} height={20} className="opacity-30" />
                  <span className="text-[11px]">Type a message to begin</span>
                </div>
              )}
              {groupMessages(liveMessages).map((item) =>
                item.msg.role === "tool-call" ? (
                  <ToolCallBubble key={item.msg.id} msg={item.msg} assistantLabel={agent.name} showAvatar={item.showAvatar} />
                ) : (
                  <MessageBubble
                    key={item.msg.id}
                    msg={item.msg}
                    assistantLabel={agent.name}
                    isFirstInGroup={item.isFirstInGroup}
                    isLastInGroup={item.isLastInGroup}
                    isFirstInAgentChain={item.showAvatar}
                  />
                ),
              )}
              {showGenerating && !streamingContent && (
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  <div className="flex gap-1 items-center">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-primary opacity-70 inline-block"
                        style={{
                          animation: `ca-dot-bounce 1.1s ease-in-out ${i * 0.18}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-[#8a7a5a] italic">{isServerRunning && !running ? "Processing..." : activityStatus}</span>
                </div>
              )}
              {showGenerating && !streamingContent && thinkingContent && (
                <div className="px-3 pb-1">
                  <div className="px-3 py-2 rounded-lg border border-border bg-surface-raised/50 max-h-40 overflow-y-auto [scrollbar-width:thin]">
                    <p className="text-[11px] text-muted leading-relaxed whitespace-pre-wrap m-0">{thinkingContent}</p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        {!loading && (
          <div className="shrink-0 w-full max-w-[760px] mx-auto">
            <InputArea
              generating={showGenerating}
              placeholder={`Message ${agent.name}...`}
              onSend={(text) => void handleSend(text)}
              onCancel={handleCancel}
              providerId={agent.aiProvider ?? undefined}
              model={agent.aiModel ?? undefined}
              onProviderChange={(pid) => void dispatch(updateAgent({ id: agent.id, aiProvider: pid }))}
              onModelChange={(m) => void dispatch(updateAgent({ id: agent.id, aiModel: m }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
