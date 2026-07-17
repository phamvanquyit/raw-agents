import { AddCircle, ChatRound, TrashBinMinimalistic } from "@solar-icons/react";
import { useCallback, useMemo, useState } from "react";
import type { AgentConversation } from "src/common/types";
import { deleteConversation } from "src/modules/chat/common/chatSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { useAgentDetailContext } from "../../common/agentDetailContext";

// ─── Component ────────────────────────────────────────────────────────────────

interface ConversationListProps {
  onNewChat: () => void;
  /** Called when user clicks a conversation — parent handles messages loading */
  onSelectConversation: (convId: string) => void;
}

export function ConversationList({ onNewChat, onSelectConversation }: ConversationListProps) {
  const dispatch = useAppDispatch();
  const { agent } = useAgentDetailContext();
  const conversations = useAppSelector((s) => s.chat.conversations);
  const activeConversationId = useAppSelector((s) => s.chat.activeConversationId);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const agentConversations = useMemo(
    () => conversations.filter((c) => c.agentId === agent.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [conversations, agent.id],
  );

  const handleSelect = useCallback(
    (conv: AgentConversation) => {
      if (conv.id === activeConversationId) return;
      onSelectConversation(conv.id);
    },
    [activeConversationId, onSelectConversation],
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent, convId: string) => {
      e.stopPropagation();
      await dispatch(deleteConversation(convId));
    },
    [dispatch],
  );

  return (
    <div className="flex flex-col h-full border-r border-border bg-surface" style={{ width: 260 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0 border-b border-border">
        <span className="text-[12px] font-semibold text-soft tracking-wide uppercase">Conversations</span>
        <button
          type="button"
          onClick={onNewChat}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold text-primary hover:bg-primary/10 transition-all disabled:opacity-30 cursor-pointer border-none bg-transparent"
          title="New chat"
        >
          <AddCircle width={14} height={14} />
          New
        </button>
      </div>

      {/* Conversation items */}
      <div className="flex-1 min-h-0 overflow-y-auto game-scrollbar py-1.5 px-1.5">
        {agentConversations.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center px-3">
            <ChatRound width={18} height={18} className="text-muted opacity-40" />
            <span className="text-[11px] text-muted">No conversations yet</span>
          </div>
        )}

        {agentConversations.map((conv) => {
          const isActive = conv.id === activeConversationId;
          const isHovered = hoveredId === conv.id;

          return (
            <div
              key={conv.id}
              role="button"
              tabIndex={0}
              onClick={() => void handleSelect(conv)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void handleSelect(conv);
                }
              }}
              onMouseEnter={() => setHoveredId(conv.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="w-full flex items-center gap-2 px-2.5 py-2.5 rounded mb-0.5 text-left transition-all duration-150 cursor-pointer border-none group"
              style={{
                backgroundColor: isActive ? "rgba(168, 255, 83, 0.08)" : isHovered ? "rgba(255, 255, 255, 0.04)" : "transparent",
              }}
            >
              <span
                className="flex-1 min-w-0 text-sm truncate font-medium"
                style={{
                  color: isActive ? "var(--color-on-surface, #F3F4F6)" : "var(--color-soft, #D7D9DD)",
                }}
              >
                {conv.title || "Untitled"}
              </span>

              {/* Running spinner */}
              {conv.status === "running" && (
                <span
                  className="shrink-0 inline-block rounded-full animate-spin"
                  style={{
                    width: 12,
                    height: 12,
                    border: "2px solid rgba(168, 255, 83, 0.2)",
                    borderTopColor: "var(--color-primary, #A8FF53)",
                  }}
                />
              )}

              {/* Delete button */}
              {isHovered && (
                <button
                  type="button"
                  onClick={(e) => void handleDelete(e, conv.id)}
                  className="shrink-0 p-1 rounded-md transition-colors duration-150 cursor-pointer border-none bg-transparent hover:bg-red-500/15"
                  style={{ color: "var(--color-muted, #B5B8C0)" }}
                  title="Delete conversation"
                >
                  <TrashBinMinimalistic width={12} height={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
