import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { UserAvatar } from "src/components/UserAvatar";
import type { ChatAgentMessage } from "../common/types";
import { markdownComponents, markdownRootClass } from "./markdown";

interface MessageAgentProps {
  msg: ChatAgentMessage;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
}

const DEFAULT_AGENT_COLOR = "#71717a";

/** AI assistant avatar — exported for reuse in ToolCallBubble & tool UIs */
export function AgentAvatar({
  color,
  avatar,
  name,
}: {
  color?: string | null;
  avatar?: string | null;
  name?: string | null;
}) {
  const c = color ?? DEFAULT_AGENT_COLOR;
  const bgStyle = {
    background: `${c}18`,
    border: `1px solid ${c}40`,
  };
  return (
    <div className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center overflow-hidden" style={bgStyle} aria-label="Assistant avatar">
      <UserAvatar avatar={avatar} name={name} size={28} />
    </div>
  );
}

/** Live streaming thinking — expanded, auto-scrolls as content arrives */
function ActiveThinking({ thinking }: { thinking: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thinking]);

  return (
    <div className="px-4 pb-1">
      <div className="flex items-center gap-1.5 py-0.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" />
        <span className="text-xs text-tertiary-foreground select-none">Thinking…</span>
      </div>
      <div ref={scrollRef} className="mt-1 px-3 py-2 rounded-lg border border-border bg-muted/50 max-h-40 overflow-y-auto">
        <p className="text-xs text-tertiary-foreground leading-relaxed whitespace-pre-wrap m-0">{thinking}</p>
      </div>
    </div>
  );
}

/** Completed thinking — collapsed summary, expandable */
export function CompletedThinking({ thinking, duration }: { thinking: string; duration: number }) {
  const label = duration < 1 ? "Thought for <1s" : `Thought for ${duration}s`;
  return (
    <details className="px-4 pb-2 group/thinking">
      <summary className="cursor-pointer select-none text-[13px] text-tertiary-foreground hover:text-foreground flex items-center gap-1 py-0.5 list-none [&::-webkit-details-marker]:hidden">
        <svg className="w-3 h-3 transition-transform group-open/thinking:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>{label}</span>
      </summary>
      <div className="mt-1 pl-4 max-h-40 overflow-y-auto">
        <p className="text-[13px] text-tertiary-foreground leading-relaxed whitespace-pre-wrap m-0">{thinking}</p>
      </div>
    </details>
  );
}

export function MessageAgent({ msg }: MessageAgentProps) {
  const thinking = msg.meta?.thinking as string | undefined;
  const thinkingDuration = msg.meta?.thinkingDuration as number | undefined;
  const isThinkingDone = thinkingDuration != null;

  return (
    <div className="mt-1 animate-[fadeIn_0.28s_ease-out_both]">
      {/* Thinking / reasoning content */}
      {thinking && !isThinkingDone && <ActiveThinking thinking={thinking} />}
      {thinking && isThinkingDone && <CompletedThinking thinking={thinking} duration={thinkingDuration} />}
      {/* Markdown content */}
      {msg.content ? (
        <div className="px-4 pb-0.5">
          <div className={markdownRootClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {msg.content}
            </ReactMarkdown>
          </div>
        </div>
      ) : null}
    </div>
  );
}
