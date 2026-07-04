import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatAgentMessage } from "../common/types";
import { CodeBlock } from "./CodeBlock";
import { MarkdownTable } from "./MarkdownTable";
import "./markdown.css";
import { AppLogo } from "src/components/AppLogo";

interface MessageAgentProps {
  msg: ChatAgentMessage;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
}

// Custom ReactMarkdown components — plugs in our decorated CodeBlock + MarkdownTable
const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const lang = match?.[1] ?? "";
    const codeText = String(children).replace(/\n$/, "");
    const isBlock = codeText.includes("\n") || !!match;

    if (isBlock) {
      return <CodeBlock language={lang}>{codeText}</CodeBlock>;
    }

    // Inline code
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  table({ children }) {
    return <MarkdownTable>{children}</MarkdownTable>;
  },
};

const DEFAULT_AGENT_COLOR = "#6b9a4a";

/** AI assistant avatar — exported for reuse in ToolCallBubble & CallAgentBubble */
export function AgentAvatar({ color }: { color?: string | null }) {
  const c = color ?? DEFAULT_AGENT_COLOR;
  // Derive a very light bg from the color (10% opacity overlay on white)
  const bgStyle = {
    background: `${c}18`,
    border: `1px solid ${c}40`,
  };
  return (
    <div className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center overflow-hidden" style={bgStyle} aria-label="Assistant avatar">
      <AppLogo size={28} />
    </div>
  );
}

export function MessageAgent({ msg }: MessageAgentProps) {
  return (
    <div className="ca-fade-in mt-1">
      {/* Markdown content */}
      <div className="px-4 pb-0.5">
        <div className="ca-markdown text-sm leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {msg.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
