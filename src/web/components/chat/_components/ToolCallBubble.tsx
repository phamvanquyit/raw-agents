import { CheckCircle, DangerCircle, Restart } from "@solar-icons/react";
import { useState } from "react";
import { useAppSelector } from "src/store/store";
import type { ChatAgentMessage } from "../common/types";
import { formatToolName, prettyJson } from "../common/utils";

import RenderIf from "src/components/ui/RenderIf";
import { CallAgentBubble } from "./CallAgentBubble";

// ─── Status indicator ────────────────────────────────────────────────────────

function StatusIcon({ hasError, hasOutput, isConvRunning, size = 14 }: { hasError: boolean; hasOutput: boolean; isConvRunning: boolean; size?: number }) {
  if (hasError) {
    return (
      <div className="w-4 h-4 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
        <DangerCircle size={size - 3} className="text-danger" />
      </div>
    );
  }
  if (!hasOutput && isConvRunning) {
    return (
      <div className="w-4 h-4 rounded-full bg-primary/8 flex items-center justify-center shrink-0">
        <Restart size={size - 5} className="animate-spin text-primary" />
      </div>
    );
  }
  return (
    <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
      <CheckCircle weight="Bold" size={size - 3} className="text-primary" />
    </div>
  );
}

// ─── Regular tool card ───────────────────────────────────────────────────────

function ToolCallCard({ msg }: { msg: ChatAgentMessage }) {
  const hasOutput = msg.toolOutput != null;
  const hasInput = msg.toolInput != null;
  const hasError = Boolean(msg.toolError);
  const [open, setOpen] = useState(false);
  // Check if the conversation is still running — if not, don't show "Running..." spinner
  const activeConvId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);
  const isConvRunning = conversations.find((c) => c.id === activeConvId)?.status === "running";

  const label = msg.toolLabel ?? formatToolName(msg.toolName ?? "Tool");

  return (
    <div className="rounded-lg border border-border overflow-hidden mb-1.5">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 cursor-pointer outline-none group transition-colors hover:bg-surface-raised/40 bg-surface/40"
      >
        {/* Status */}
        <StatusIcon hasError={hasError} hasOutput={hasOutput} isConvRunning={!!isConvRunning} size={13} />

        {/* Tool label */}
        <span className="text-[12px] font-medium text-soft group-hover:text-main transition-colors truncate flex-1 text-left">{label}</span>

        {/* Expand chevron */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expandable detail */}
      <RenderIf condition={open}>
        <div className="border-t border-border font-mono text-[11px]">
          <RenderIf condition={hasInput}>
            <div className="px-3 py-2 border-b border-border/60">
              <span className="text-[9px] text-muted uppercase tracking-widest font-sans font-semibold">input</span>
              <pre className="tool-bubble-pre m-0 mt-1 whitespace-pre-wrap break-all text-soft leading-[1.65] max-h-27.5 overflow-y-auto font-normal">
                {prettyJson(msg.toolInput)}
              </pre>
            </div>
          </RenderIf>
          <div className="px-3 py-2">
            <span className={["text-[9px] uppercase tracking-widest font-sans font-semibold", hasOutput ? "text-muted" : "text-muted/50"].join(" ")}>
              output
            </span>
            <pre
              className={[
                "tool-bubble-pre m-0 mt-1 whitespace-pre-wrap break-all leading-[1.65] max-h-75 overflow-y-auto font-normal",
                hasOutput ? "text-soft" : "text-muted italic",
              ].join(" ")}
            >
              {hasOutput ? prettyJson(msg.toolOutput) : hasError ? "❌ Tool execution failed" : "waiting…"}
            </pre>
          </div>
        </div>
      </RenderIf>

      {/* Collapsed — waiting indicator (only when conversation is actively running) */}
      <RenderIf condition={!open && !hasOutput && !hasError && !!isConvRunning}>
        <div className="border-t border-border/40 px-3 py-1">
          <div className="flex items-center gap-1.5">
            <div className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full bg-primary/35 inline-block"
                  style={{ animation: `ca-dot-bounce 1.1s ease-in-out ${i * 0.18}s infinite` }}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted italic">Running…</span>
          </div>
        </div>
      </RenderIf>
    </div>
  );
}

// ─── ToolCallGroup — timeline wrapper around consecutive tool calls ───────────

export function ToolCallGroup({
  messages,
  assistantLabel = "Assistant",
  assistantColor,
  showAvatar = true,
}: { messages: ChatAgentMessage[]; assistantLabel?: string; assistantColor?: string | null; showAvatar?: boolean }) {
  const color = assistantColor ?? "#6b9a4a";
  return (
    <div className="ca-fade-in mt-1">
      {showAvatar && (
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase select-none"
            style={{ background: color, color: "#fff", letterSpacing: "0.08em" }}
          >
            {assistantLabel}
          </span>
        </div>
      )}
      <div className="px-4 pb-0.5">
        <div className="flex flex-col">
          {messages.map((m) => (
            <ToolCallCard key={m.id} msg={m} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Single tool-call bubble (used by flat MessageList) ───────────────────────

export function ToolCallBubble({
  msg,
  assistantLabel = "Assistant",
  assistantColor,
  showAvatar = true,
}: {
  msg: ChatAgentMessage;
  assistantLabel?: string;
  assistantColor?: string | null;
  showAvatar?: boolean;
}) {
  // Delegate to the dedicated call_agent component
  if (msg.toolName === "call_agent") {
    return <CallAgentBubble msg={msg} assistantLabel={assistantLabel} assistantColor={assistantColor} showAvatar={showAvatar} />;
  }

  const color = assistantColor ?? "#6b9a4a";
  return (
    <div className="ca-fade-in mt-1">
      {showAvatar && (
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase select-none"
            style={{ background: color, color: "#fff", letterSpacing: "0.08em" }}
          >
            {assistantLabel}
          </span>
        </div>
      )}
      <div className="px-4 pb-0.5">
        <ToolCallCard msg={msg} />
      </div>
    </div>
  );
}
