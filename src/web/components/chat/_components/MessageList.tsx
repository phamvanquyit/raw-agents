import { StarsMinimalistic } from "@solar-icons/react"; // used in empty state
import type { ReactNode, RefObject } from "react";
import { MessageBubble } from "./MessageBubble";
import { ToolCallBubble } from "./ToolCallBubble";

import RenderIf from "src/components/ui/RenderIf";
import type { ChatAgentMessage } from "../common/types";

interface MessageListProps {
  messages: ChatAgentMessage[];
  generating: boolean;
  /** Contextual activity status text (e.g. 'Running Fetch Webpage...') */
  activityStatus?: string;
  assistantLabel?: string;
  assistantColor?: string | null;
  emptyStateContent?: ReactNode;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef?: ((node: HTMLDivElement | null) => void) | RefObject<HTMLDivElement | null>;
  className?: string;
}

// ─── Render item types ────────────────────────────────────────────────────────

/** Single message render item */
type SingleItem = {
  kind: "single";
  msg: ChatAgentMessage;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  /** Show avatar — true only on the first agent-side message in a consecutive chain */
  showAvatar: boolean;
};

export type RenderItem = SingleItem;

// Flat render item — for backward compat
type FlatRenderItem = {
  msg: ChatAgentMessage;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  showAvatar: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAgentRole(role: ChatAgentMessage["role"]): boolean {
  return role !== "user";
}

/** True if the previous message is a call_agent tool-call (context switch back to parent) */
function prevIsCallAgent(msg: ChatAgentMessage | null): boolean {
  return msg?.role === "tool-call" && msg?.toolName === "call_agent";
}

function isSameSender(a: ChatAgentMessage, b: ChatAgentMessage): boolean {
  if (a.role === "tool-call" || b.role === "tool-call") return false;
  return a.role === b.role;
}

// ─── Build render items — flat, no grouping ───────────────────────────────────

export function buildRenderItems(messages: ChatAgentMessage[]): RenderItem[] {
  const items: RenderItem[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;
    const isFirstInGroup = !prev || !isSameSender(prev, msg);
    const isLastInGroup = !next || !isSameSender(msg, next);
    const isAgent = isAgentRole(msg.role);
    const prevIsAgent = prev ? isAgentRole(prev.role) : false;
    const showAvatar = isAgent && (!prevIsAgent || prevIsCallAgent(prev));

    items.push({ kind: "single", msg, isFirstInGroup, isLastInGroup, showAvatar });
  }

  return items;
}

/** @deprecated kept for backward compat; flattens to old format */
export function groupMessages(messages: ChatAgentMessage[]): FlatRenderItem[] {
  const items: FlatRenderItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;
    const isFirstInGroup = !prev || !isSameSender(prev, msg);
    const isLastInGroup = !next || !isSameSender(msg, next);
    const isAgent = isAgentRole(msg.role);
    const prevIsAgent = prev ? isAgentRole(prev.role) : false;
    const showAvatar = isAgent && !prevIsAgent;
    items.push({ msg, isFirstInGroup, isLastInGroup, showAvatar });
  }
  return items;
}

export function MessageList({
  messages,
  generating,
  activityStatus = "Working",
  assistantLabel = "Assistant",
  assistantColor,
  emptyStateContent,
  messagesEndRef,
  scrollContainerRef,
  className = "",
}: MessageListProps) {
  const hasMessages = messages.length > 0;
  const items = buildRenderItems(messages);
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastIsAgent = lastMsg ? isAgentRole(lastMsg.role) : false;

  return (
    <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto game-scrollbar">
      <div className={`max-w-[760px] mx-auto ${className}`}>
        <RenderIf condition={!hasMessages}>
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-6 text-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-surface-raised border border-border shadow-whisper">
              <StarsMinimalistic size={20} className="text-primary" />
            </div>
            {emptyStateContent ?? <p className="text-xs text-muted leading-relaxed max-w-50 m-0">Send a message to start a conversation with AI.</p>}
          </div>
        </RenderIf>

        <RenderIf condition={hasMessages}>
          <div className="pt-4 pb-4 flex flex-col">
            {items.map((item) =>
              item.msg.role === "tool-call" ? (
                <ToolCallBubble key={item.msg.id} msg={item.msg} assistantLabel={assistantLabel} assistantColor={assistantColor} showAvatar={item.showAvatar} />
              ) : (
                <MessageBubble
                  key={item.msg.id}
                  msg={item.msg}
                  assistantLabel={assistantLabel}
                  assistantColor={assistantColor}
                  isFirstInGroup={item.isFirstInGroup}
                  isLastInGroup={item.isLastInGroup}
                  isFirstInAgentChain={item.showAvatar}
                />
              ),
            )}

            {/* Thinking / generating indicator */}
            <RenderIf condition={generating}>
              <div className="ca-fade-in mt-1">
                <RenderIf condition={!lastIsAgent}>
                  <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase select-none"
                      style={{ background: assistantColor ?? "#6b9a4a", color: "#fff", letterSpacing: "0.08em" }}
                    >
                      {assistantLabel}
                    </span>
                  </div>
                </RenderIf>
                <div className="px-4 pb-0.5">
                  <div className="flex gap-1.5 items-center h-5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-primary/50 inline-block"
                        style={{
                          animation: `ca-dot-bounce 1.1s ease-in-out ${i * 0.18}s infinite`,
                        }}
                      />
                    ))}
                    <span className="text-[10px] text-muted italic ml-1">{activityStatus}</span>
                  </div>
                </div>
              </div>
            </RenderIf>

            <div ref={messagesEndRef} />
          </div>
        </RenderIf>
      </div>
    </div>
  );
}
