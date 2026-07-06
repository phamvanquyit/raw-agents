/**
 * ToolCallGroupBubble — high-tech "execution timeline" visualization
 * for a group of consecutive non-call_agent tool calls.
 *
 * Vertical timeline with glowing status nodes, animated progress bar,
 * full tool names, and expandable detail panels.
 */
import { CheckCircle, DangerCircle, Restart } from "@solar-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { ChatAgentMessage } from "../common/types";
import { formatToolName, prettyJson } from "../common/utils";

import RenderIf from "src/components/ui/RenderIf";

// ─── Inline styles (keyframes injected once) ─────────────────────────────────

const STYLE_ID = "tcg-pipeline-styles";

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes tcg-scanline {
      0%   { left: -30%; opacity: 0; }
      10%  { opacity: 1; }
      90%  { opacity: 1; }
      100% { left: 100%; opacity: 0; }
    }
    @keyframes tcg-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(107,154,74,0.3); }
      50%      { box-shadow: 0 0 6px 2px rgba(107,154,74,0.2); }
    }
    @keyframes tcg-pulse-error {
      0%, 100% { box-shadow: 0 0 0 0 rgba(192,57,43,0.25); }
      50%      { box-shadow: 0 0 6px 2px rgba(192,57,43,0.15); }
    }
    @keyframes tcg-node-in {
      0%   { opacity: 0; transform: scale(0.5) translateX(-4px); }
      100% { opacity: 1; transform: scale(1) translateX(0); }
    }
    @keyframes tcg-line-grow {
      0%   { height: 0; }
      100% { height: 100%; }
    }
    @keyframes tcg-row-in {
      0%   { opacity: 0; transform: translateY(4px); }
      100% { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

// ─── Status helpers ──────────────────────────────────────────────────────────

type NodeStatus = "done" | "running" | "error";

function getStatus(msg: ChatAgentMessage): NodeStatus {
  if (msg.toolError) return "error";
  if (msg.toolOutput != null) return "done";
  return "running";
}

/**
 * Extract a short contextual subtitle from toolInput for known tools.
 * Returns null if no useful subtitle can be extracted.
 */
function getSubtitle(msg: ChatAgentMessage): string | null {
  const name = msg.toolName;
  const input = msg.toolInput as Record<string, unknown> | null | undefined;
  if (!input || !name) return null;

  try {
    switch (name) {
      case "fetch_webpage": {
        const url = input.url as string | undefined;
        if (!url) return null;
        try {
          const u = new URL(url);
          return u.hostname + (u.pathname !== "/" ? u.pathname : "");
        } catch {
          return url;
        }
      }
      case "get_current_time": {
        const tz = input.timezone as string | undefined;
        return tz ? tz : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ─── System tools (hidden from user) ─────────────────────────────────────────

const SYSTEM_TOOLS = new Set(["manage_memory"]);

function isSystemTool(msg: ChatAgentMessage): boolean {
  return !!msg.toolName && SYSTEM_TOOLS.has(msg.toolName);
}

// ─── Timeline row ────────────────────────────────────────────────────────────

function TimelineRow({
  msg,
  index,
  isLast,
  isActive,
  onClick,
}: {
  msg: ChatAgentMessage;
  index: number;
  isLast: boolean;
  isActive: boolean;
  onClick: () => void;
}) {
  const status = getStatus(msg);
  const label = msg.toolLabel ?? formatToolName(msg.toolName ?? "Tool");
  const subtitle = getSubtitle(msg);

  const nodeColor = status === "error" ? "#c0392b" : status === "done" ? "#6b9a4a" : "#7db55a";

  return (
    <div
      className="relative"
      style={{
        animation: `tcg-row-in 0.25s ease-out ${index * 0.04}s both`,
        paddingLeft: 18,
      }}
    >
      {/* Vertical connector line */}
      <RenderIf condition={!isLast}>
        <div
          className="absolute overflow-hidden"
          style={{
            left: 5,
            top: 18,
            bottom: 0,
            width: 1,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `${nodeColor}25`,
              animation: `tcg-line-grow 0.3s ease-out ${index * 0.04 + 0.1}s both`,
            }}
          />
        </div>
      </RenderIf>

      {/* Row button */}
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-2.5 cursor-pointer outline-none group py-[6px] pr-1.5 rounded-md transition-colors duration-100"
        style={{
          background: isActive ? "color-mix(in srgb, var(--color-primary) 5%, transparent)" : "transparent",
        }}
      >
        {/* Simple solid dot */}
        <div
          className="absolute shrink-0 rounded-full transition-all duration-200"
          style={{
            left: 2,
            width: 7,
            height: 7,
            background: nodeColor,
            opacity: status === "running" ? 0.6 : 1,
            animation: status === "running" ? "tcg-pulse 2s ease-in-out infinite" : undefined,
          }}
        />

        {/* Tool name + inline subtitle */}
        <span
          className="text-[13px] leading-snug flex-1 text-left truncate transition-colors duration-100"
          style={{
            color: isActive ? "var(--color-main)" : "var(--color-soft)",
            fontWeight: isActive ? 500 : 400,
          }}
        >
          {label}
          <RenderIf condition={!!subtitle}>
            {() => (
              <span className="text-[11px] font-normal ml-1.5" style={{ color: "var(--color-muted)" }}>
                · {subtitle}
              </span>
            )}
          </RenderIf>
        </span>

        {/* Status tag */}
        <span
          className="text-[9px] font-semibold uppercase tracking-[0.04em] shrink-0 px-1.5 py-0.5 rounded select-none"
          style={{
            color: nodeColor,
            background: `${nodeColor}10`,
            border: `1px solid ${nodeColor}18`,
          }}
        >
          {status === "error" ? "ERR" : status === "done" ? "OK" : "RUN"}
        </span>

        {/* Chevron */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className="shrink-0 transition-transform duration-150"
          style={{
            color: "var(--color-muted)",
            transform: isActive ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          <path d="M3.5 2.5L6.5 5L3.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* ── Expandable detail ── */}
      <RenderIf condition={isActive}>
        <div className="pb-1">
          <DetailPanel msg={msg} />
        </div>
      </RenderIf>
    </div>
  );
}

// ─── Detail panel ────────────────────────────────────────────────────────────

function DetailPanel({ msg }: { msg: ChatAgentMessage }) {
  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);

  return (
    <div
      className="mt-1 mb-1 rounded-lg overflow-hidden"
      style={{
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      {/* Input */}
      <RenderIf condition={msg.toolInput != null}>
        <div
          className="px-3 py-1.5"
          style={{
            borderBottom: "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)",
          }}
        >
          <span className="text-[9px] text-muted uppercase tracking-widest font-semibold">INPUT</span>
          <pre className="tool-bubble-pre m-0 mt-0.5 whitespace-pre-wrap break-all text-soft leading-[1.5] max-h-20 overflow-y-auto font-mono text-[11px] font-normal [scrollbar-width:thin]">
            {prettyJson(msg.toolInput)}
          </pre>
        </div>
      </RenderIf>

      {/* Output */}
      <div className="px-3 py-1.5">
        <span
          className="text-[9px] uppercase tracking-widest font-semibold"
          style={{
            color: hasOutput ? "var(--color-muted)" : "color-mix(in srgb, var(--color-muted) 50%, transparent)",
          }}
        >
          OUTPUT
        </span>
        <pre
          className="tool-bubble-pre m-0 mt-0.5 whitespace-pre-wrap break-all leading-[1.5] max-h-40 overflow-y-auto font-mono text-[11px] font-normal [scrollbar-width:thin]"
          style={{
            color: hasOutput ? "var(--color-soft)" : "var(--color-muted)",
            fontStyle: hasOutput ? "normal" : "italic",
          }}
        >
          {hasOutput ? prettyJson(msg.toolOutput) : hasError ? "❌ Failed" : "waiting…"}
        </pre>
      </div>
    </div>
  );
}

// ─── Progress bar with scan-line ─────────────────────────────────────────────

function ProgressBar({
  done,
  total,
  hasErrors,
}: {
  done: number;
  total: number;
  hasErrors: boolean;
}) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  const allDone = done === total;

  return (
    <div
      className="relative h-[3px] rounded-full overflow-hidden"
      style={{
        background: "color-mix(in srgb, var(--color-border) 60%, transparent)",
      }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
        style={{
          width: `${pct}%`,
          background: hasErrors ? "linear-gradient(90deg, #c0392b, #e74c3c)" : "linear-gradient(90deg, #4a6e34, #6b9a4a, #7db55a)",
          boxShadow: allDone ? "none" : `0 0 6px ${hasErrors ? "rgba(192,57,43,0.4)" : "rgba(107,154,74,0.4)"}`,
        }}
      />
      <RenderIf condition={!allDone && !hasErrors}>
        <div
          className="absolute inset-y-0 pointer-events-none"
          style={{
            width: "30%",
            background: "linear-gradient(90deg, transparent, rgba(107,154,74,0.5), transparent)",
            animation: "tcg-scanline 2s ease-in-out infinite",
            borderRadius: "inherit",
          }}
        />
      </RenderIf>
    </div>
  );
}

// ─── Group summary ───────────────────────────────────────────────────────────

function groupSummary(messages: ChatAgentMessage[]): string {
  const counts = new Map<string, number>();
  for (const m of messages) {
    if (isSystemTool(m)) continue;
    const name = m.toolLabel ?? formatToolName(m.toolName ?? "Tool");
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [name, count] of counts) {
    parts.push(count > 1 ? `${count}× ${name}` : name);
  }
  return parts.join(" · ");
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ToolCallGroupBubble({
  messages,
  assistantLabel = "Assistant",
  assistantColor,
  showAvatar = true,
}: {
  messages: ChatAgentMessage[];
  assistantLabel?: string;
  assistantColor?: string | null;
  showAvatar?: boolean;
}) {
  const color = assistantColor ?? "#6b9a4a";
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  useEffect(() => {
    ensureStyles();
  }, []);

  // Filter out system tools for display, keep full list for progress
  const visibleMessages = useMemo(() => messages.filter((m) => !isSystemTool(m)), [messages]);

  const doneCount = useMemo(() => messages.filter((m) => m.toolOutput != null || m.toolError).length, [messages]);
  const hasErrors = useMemo(() => messages.some((m) => m.toolError), [messages]);
  const allDone = doneCount === messages.length;

  // If all messages are system tools, render nothing
  if (visibleMessages.length === 0) return null;

  return (
    <div className="ca-fade-in mt-1">
      <RenderIf condition={showAvatar}>
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase select-none"
            style={{
              background: color,
              color: "#fff",
              letterSpacing: "0.08em",
            }}
          >
            {assistantLabel}
          </span>
        </div>
      </RenderIf>

      <div className="px-4 pb-0.5">
        <div
          className="rounded-lg overflow-hidden"
          style={{
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
          }}
        >
          {/* ── Header ── */}
          <div className="px-3 py-2 flex items-center gap-2">
            <RenderIf condition={hasErrors}>
              <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(192,57,43,0.08)" }}>
                <DangerCircle size={11} style={{ color: "#c0392b" }} />
              </div>
            </RenderIf>
            <RenderIf condition={!allDone && !hasErrors}>
              <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(107,154,74,0.08)" }}>
                <Restart size={9} className="animate-spin" style={{ color: "#6b9a4a" }} />
              </div>
            </RenderIf>
            <RenderIf condition={allDone && !hasErrors}>
              <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(107,154,74,0.1)" }}>
                <CheckCircle weight="Bold" size={11} style={{ color: "#6b9a4a" }} />
              </div>
            </RenderIf>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[12px] font-semibold text-soft">{visibleMessages.length} tools</span>
                <span className="text-[10px] text-muted truncate">{groupSummary(messages)}</span>
              </div>
            </div>

            {/* Counter badge */}
            <span
              className="text-[9px] font-bold shrink-0 px-1.5 py-0.5 rounded-full select-none"
              style={{
                background: allDone ? "rgba(107,154,74,0.1)" : "rgba(107,154,74,0.06)",
                color: allDone ? "#6b9a4a" : "var(--color-muted)",
                border: `1px solid ${allDone ? "rgba(107,154,74,0.2)" : "transparent"}`,
              }}
            >
              {doneCount}/{messages.length}
            </span>
          </div>

          {/* ── Progress bar ── */}
          <div className="px-3 pb-2">
            <ProgressBar done={doneCount} total={messages.length} hasErrors={hasErrors} />
          </div>

          {/* ── Timeline ── */}
          <div
            className="px-3 pb-2.5 pt-1.5"
            style={{
              borderTop: "1px solid color-mix(in srgb, var(--color-border) 40%, transparent)",
            }}
          >
            {visibleMessages.map((m, i) => (
              <TimelineRow
                key={m.id}
                msg={m}
                index={i}
                isLast={i === visibleMessages.length - 1}
                isActive={activeIdx === i}
                onClick={() => setActiveIdx(activeIdx === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
