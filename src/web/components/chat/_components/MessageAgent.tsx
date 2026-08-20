import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { UserAvatar } from "src/components/UserAvatar";
import type { ChatAgentMessage } from "../common/types";
import { type MarkdownStreamState, createMarkdownComponents, markdownRootClass } from "./markdown";

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

/** Live thinking — shimmer only; full text is shown in CompletedThinking after it finishes */
function ActiveThinking() {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    setElapsedSec(0);
    const started = Date.now();
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const label = elapsedSec >= 3 ? `Thinking ${elapsedSec}s` : "Thinking";

  return (
    <div className="px-4 pb-0.5" style={{ overflowAnchor: "none" }}>
      <div className="flex items-center min-h-[22px]">
        <span className="text-[14px] leading-[22px] font-medium font-[family-name:var(--font-family-chat)] ca-status-shimmer">{label}</span>
      </div>
    </div>
  );
}

/** Completed thinking — collapsed summary, expandable */
export function CompletedThinking({ thinking, duration }: { thinking: string; duration: number }) {
  if (duration < 1) return null;
  return (
    <details className="px-4 pb-2 group/thinking">
      <summary className="cursor-pointer select-none text-[14px] leading-[22px] font-medium font-[family-name:var(--font-family-chat)] text-tertiary-foreground hover:text-foreground flex items-center gap-1 py-0.5 list-none [&::-webkit-details-marker]:hidden">
        <svg className="w-3 h-3 transition-transform group-open/thinking:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>{`Thought ${duration}s`}</span>
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

  const streamStateRef = useRef<MarkdownStreamState>({ content: msg.content, streaming: !!msg.streaming });
  streamStateRef.current = { content: msg.content, streaming: !!msg.streaming };

  const componentsRef = useRef<ReturnType<typeof createMarkdownComponents> | null>(null);
  if (!componentsRef.current) {
    componentsRef.current = createMarkdownComponents(() => streamStateRef.current);
  }

  return (
    <div className="mt-1 animate-[fadeIn_0.28s_ease-out_both]">
      {/* Thinking / reasoning content */}
      {thinking && !isThinkingDone && <ActiveThinking />}
      {thinking && isThinkingDone && <CompletedThinking thinking={thinking} duration={thinkingDuration} />}
      {/* Markdown content */}
      {msg.content ? (
        <div className="px-4 pb-0.5">
          <div className={markdownRootClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentsRef.current}>
              {msg.content}
            </ReactMarkdown>
          </div>
        </div>
      ) : null}
    </div>
  );
}
