import { AppLogo } from "../../../../components/AppLogo";
import { MessageBubble } from "../../../../components/chat/_components/MessageBubble";
import type { ChatAgentMessage } from "../../../../components/chat/common/types";

interface ChatMessagesProps {
  scrollRef: (node: HTMLElement | null) => void;
  liveMessages: ChatAgentMessage[];
  conversationId: string | null;
  agentName?: string;
  running: boolean;
  streamingContent: string;
}

export function ChatMessages({ scrollRef, liveMessages, conversationId, agentName, running, streamingContent }: ChatMessagesProps) {
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto w-full relative z-0" style={{ scrollbarWidth: "thin" }}>
      <div className="max-w-3xl mx-auto w-full pt-24 pb-6 flex flex-col gap-1">
        {liveMessages.length === 0 && !running && (
          <div className="flex flex-col items-center justify-center text-center py-28 relative">
            {conversationId ? (
              <>
                <div className="absolute w-40 h-40 rounded-full bg-primary/[0.06] blur-[60px]" />
                <div className="relative mb-6 opacity-30">
                  <AppLogo size={64} />
                </div>
                <p className="relative font-display text-[16px] text-main font-semibold">{agentName}</p>
                <p className="relative text-[13px] text-muted mt-2 max-w-xs">Ask me anything to get started</p>
              </>
            ) : (
              <>
                <div className="animate-pulse mb-3">
                  <AppLogo size={32} />
                </div>
                <p className="text-[13px] text-muted">Connecting...</p>
              </>
            )}
          </div>
        )}

        {liveMessages.map((msg, idx) => {
          const prev = idx > 0 ? liveMessages[idx - 1] : null;
          // Show the assistant label only when this is the first non-user message
          // after a user message (or at the start of the conversation)
          const isNonUser = msg.role !== "user";
          const prevIsNonUser = prev && prev.role !== "user";
          const isFirstInAgentChain = isNonUser ? !prevIsNonUser : true;

          return <MessageBubble key={msg.id} msg={msg} isFirstInAgentChain={isFirstInAgentChain} isFirstInGroup={isFirstInAgentChain} />;
        })}

        {running && !streamingContent && (
          <div className="flex items-center gap-2.5 px-4 py-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-raised border border-border/40">
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60 inline-block animate-bounce" style={{ animationDelay: `${i * 0.18}s` }} />
                ))}
              </div>
              <span className="text-[11px] text-muted ml-1">Thinking...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
