/**
 * CallAgentBubble — renders a call_agent tool call as a single compact card.
 *
 * The assistant name badge is shown ABOVE the card (via showAvatar, same as
 * other tool bubbles). The card itself shows:
 *   Header: @CalledAgent  request preview…  ▼
 *   Expanded: REQUEST + RESPONSE (small markdown)
 *
 * Agent-to-agent communication — auxiliary info, collapsed by default.
 */
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Agent } from "src/common/types";
import { useAppSelector } from "src/store/store";
import type { ChatAgentMessage } from "../common/types";
import { prettyJson } from "../common/utils";

import RenderIf from "src/components/ui/RenderIf";
import { CodeBlock } from "./CodeBlock";
import { MarkdownTable } from "./MarkdownTable";
import "./markdown.css";

// Markdown components — same as MessageAgent
const mdComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const lang = match?.[1] ?? "";
    const codeText = String(children).replace(/\n$/, "");
    const isBlock = codeText.includes("\n") || !!match;
    if (isBlock) return <CodeBlock language={lang}>{codeText}</CodeBlock>;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCallAgentOutput(raw: string | null | undefined): {
  success: boolean;
  response: string | null;
  agentId: string | null;
  error: string | null;
} | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof parsed === "object" && parsed !== null && "success" in parsed) {
      return {
        success: Boolean(parsed.success),
        response: parsed.response ?? null,
        agentId: parsed.agent_id ?? null,
        error: parsed.error ?? null,
      };
    }
  } catch {}
  return null;
}

// ─── Call agent card ─────────────────────────────────────────────────────────

function CallAgentCard({
  calleeName,
  calleeColor,
  requestMessage,
  hasOutput,
  hasError,
  parsed,
  rawOutput,
}: {
  calleeName: string;
  calleeColor: string;
  requestMessage: string | undefined;
  hasOutput: boolean;
  hasError: boolean;
  parsed: ReturnType<typeof parseCallAgentOutput>;
  rawOutput: string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      {/* Header — @CalledAgent + request preview */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer outline-none transition-colors hover:bg-surface-raised/30"
      >
        {/* @AgentB tag */}
        <span className="text-[12px] font-semibold shrink-0 select-none" style={{ color: calleeColor }}>
          @{calleeName}
        </span>

        {/* Request preview */}
        <RenderIf condition={!!requestMessage}>{() => <span className="text-[12px] text-muted truncate flex-1 text-left">{requestMessage}</span>}</RenderIf>
        <RenderIf condition={!requestMessage}>
          <span className="flex-1" />
        </RenderIf>

        {/* Status indicator */}
        <RenderIf condition={!hasOutput && !hasError}>
          <div className="flex gap-0.5 shrink-0">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-primary/40 inline-block"
                style={{ animation: `ca-dot-bounce 1.1s ease-in-out ${i * 0.18}s infinite` }}
              />
            ))}
          </div>
        </RenderIf>

        {/* Chevron */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`shrink-0 text-muted transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expanded: Request + Response */}
      <RenderIf condition={expanded}>
        <div className="px-3 pb-2.5 pt-2" style={{ borderTop: "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)" }}>
          {/* Request */}
          <RenderIf condition={!!requestMessage}>
            {() => (
              <div className="mb-2">
                <span className="text-[9px] text-muted uppercase tracking-widest font-semibold">Request</span>
                <p className="text-[12px] text-soft leading-[1.6] m-0 mt-0.5">{requestMessage}</p>
              </div>
            )}
          </RenderIf>

          {/* Response */}
          <div>
            <span className="text-[9px] text-muted uppercase tracking-widest font-semibold">Response</span>

            <RenderIf condition={hasError}>
              <div className="text-[12px] text-danger leading-relaxed mt-0.5">{parsed?.error ?? "Agent call failed"}</div>
            </RenderIf>

            <RenderIf condition={!hasError && !hasOutput}>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1 h-1 rounded-full bg-primary/40 inline-block"
                      style={{ animation: `ca-dot-bounce 1.1s ease-in-out ${i * 0.18}s infinite` }}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-muted italic">processing…</span>
              </div>
            </RenderIf>

            <RenderIf condition={!hasError && hasOutput && !!parsed}>
              {() => (
                <div className="ca-markdown text-[12px] text-soft leading-[1.6] mt-0.5 [&_h1]:text-[14px] [&_h2]:text-[13px] [&_h3]:text-[12px] [&_p]:text-[12px] [&_li]:text-[12px] [&_td]:text-[11px] [&_th]:text-[11px] [&_code]:text-[11px]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {parsed?.response ?? "(no response)"}
                  </ReactMarkdown>
                </div>
              )}
            </RenderIf>

            <RenderIf condition={!hasError && hasOutput && !parsed}>
              <pre className="text-[11px] text-muted leading-[1.5] whitespace-pre-wrap break-all m-0 mt-0.5 font-mono max-h-40 overflow-y-auto [scrollbar-width:thin]">
                {prettyJson(rawOutput)}
              </pre>
            </RenderIf>
          </div>
        </div>
      </RenderIf>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CallAgentBubble({
  msg,
  assistantLabel,
  assistantColor,
  showAvatar = true,
}: {
  msg: ChatAgentMessage;
  assistantLabel: string;
  assistantColor?: string | null;
  showAvatar?: boolean;
}) {
  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);

  const agents = useAppSelector((s) => s.agents.items) as Agent[];

  // Resolve the called agent
  let calledAgentId: string | undefined;
  calledAgentId = (msg.toolInput as Record<string, unknown> | null)?.agent_id as string | undefined;
  if (!calledAgentId && msg.toolOutput) {
    try {
      const parsed = JSON.parse(msg.toolOutput);
      calledAgentId = parsed?.agent_id;
    } catch {
      /* ignore */
    }
  }
  const calledAgent = calledAgentId ? agents.find((a) => a.id === calledAgentId) : undefined;

  const parsed = parseCallAgentOutput(msg.toolOutput);

  const requestMessage = (msg.toolInput as Record<string, unknown> | null)?.message as string | undefined;

  const callerColor = assistantColor ?? "#6b9a4a";
  const calleeColor = "#6b9a4a";
  const calleeName = calledAgent?.name ?? msg.toolLabel?.replace(/^Call\s+/i, "") ?? "Agent";

  return (
    <div className="ca-fade-in mt-1">
      {/* Assistant name badge — shown ABOVE the card */}
      <RenderIf condition={showAvatar}>
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase select-none"
            style={{ background: callerColor, color: "#fff", letterSpacing: "0.08em" }}
          >
            {assistantLabel}
          </span>
        </div>
      </RenderIf>

      <div className="px-4 pb-0.5">
        <CallAgentCard
          calleeName={calleeName}
          calleeColor={calleeColor}
          requestMessage={requestMessage}
          hasOutput={hasOutput}
          hasError={hasError}
          parsed={parsed}
          rawOutput={msg.toolOutput}
        />
      </div>
    </div>
  );
}
