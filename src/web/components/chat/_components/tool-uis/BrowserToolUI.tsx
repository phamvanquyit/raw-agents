import { Spin } from "antd";
import { useState } from "react";
import RenderIf from "src/components/RenderIf";
import { cn } from "src/lib/utils";
import { useAppSelector } from "src/store/store";
import { prettyJson } from "../../common/utils";
import type { ToolUIProps } from "./types";

type BrowserAction = {
  action: string;
  url?: string;
  selector?: string;
  value?: string;
  text?: string;
  key?: string;
  ms?: number;
  direction?: string;
  amount?: number;
};

type BrowserActionResult = {
  index: number;
  action: string;
  ok: boolean;
  error?: string;
};

type BrowserRunResult = {
  ok: boolean;
  url?: string;
  title?: string;
  results?: BrowserActionResult[];
  error?: string;
};

function parseActions(input: unknown): BrowserAction[] {
  if (!input || typeof input !== "object") return [];
  const actions = (input as { actions?: unknown }).actions;
  if (!Array.isArray(actions)) return [];
  return actions.filter((a): a is BrowserAction => !!a && typeof a === "object" && typeof (a as BrowserAction).action === "string");
}

function parseOutput(raw: string | null | undefined): BrowserRunResult | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object" && "ok" in parsed) return parsed as BrowserRunResult;
  } catch {
    /* ignore */
  }
  return null;
}

function actionSummary(action: BrowserAction): string {
  switch (action.action) {
    case "navigate":
      return action.url ?? "";
    case "click":
    case "fill":
    case "type":
    case "select":
      return action.selector ?? action.value ?? action.text ?? "";
    case "wait":
      if (action.selector) return action.selector;
      if (action.ms != null) return `${action.ms}ms`;
      return "";
    case "press":
      return action.key ?? "";
    case "scroll":
      return [action.direction, action.amount != null ? `${action.amount}px` : null, action.selector].filter(Boolean).join(" ");
    default:
      return action.selector ?? action.url ?? "";
  }
}

function firstUrl(actions: BrowserAction[], output: BrowserRunResult | null): string {
  const nav = actions.find((a) => a.action === "navigate" && a.url);
  return output?.url || nav?.url || "about:blank";
}

export function BrowserToolUI({ msg, assistantLabel = "Assistant", assistantColor, showAvatar = true }: ToolUIProps) {
  const [open, setOpen] = useState(false);
  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);
  const actions = parseActions(msg.toolInput);
  const output = parseOutput(msg.toolOutput);
  const failed = hasError || output?.ok === false;
  const activeConvId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);
  const isConvRunning = conversations.find((c) => c.id === activeConvId)?.status === "running";
  const running = !hasOutput && !hasError && !!isConvRunning;
  const url = firstUrl(actions, output);
  const callerColor = assistantColor ?? "var(--primary)";
  const preview = actions
    .slice(0, 5)
    .map((a) => a.action)
    .join(" → ");

  return (
    <div className="animate-[fadeIn_0.28s_ease-out_both] mt-1">
      <RenderIf condition={showAvatar}>
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase select-none"
            style={{ background: callerColor, color: "var(--primary-foreground)", letterSpacing: "0.08em" }}
          >
            {assistantLabel}
          </span>
        </div>
      </RenderIf>

      <div className="px-4 pb-1">
        <div className="rounded-lg border border-border overflow-hidden bg-card/50">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex flex-col gap-1.5 px-2 py-1.5 cursor-pointer outline-none border-0 bg-muted/35 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 shrink-0 pl-0.5">
                <span className="size-2 rounded-full bg-[#ff5f57]" />
                <span className="size-2 rounded-full bg-[#febc2e]" />
                <span className="size-2 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex items-center gap-0.5 text-muted-foreground/70">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M6 2L3 5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M4 2l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-1.5 rounded-full bg-background/90 border border-border px-2 py-[3px]">
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className="shrink-0 text-muted-foreground" aria-hidden="true">
                  <rect x="2" y="4.5" width="6" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M3.2 4.5V3.2a1.8 1.8 0 0 1 3.6 0V4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span className="text-[11px] text-tertiary-foreground truncate font-mono">{url}</span>
              </div>
              <RenderIf condition={running}>
                <Spin size="small" className="shrink-0" />
              </RenderIf>
              <RenderIf condition={!running && hasOutput && !failed}>
                <span className="text-[10px] text-chart-2 shrink-0">Done</span>
              </RenderIf>
              <RenderIf condition={failed}>
                <span className="text-[10px] text-destructive shrink-0">Failed</span>
              </RenderIf>
              <svg
                width="9"
                height="9"
                viewBox="0 0 10 10"
                fill="none"
                className={cn("shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-180")}
              >
                <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex items-center gap-1.5 min-w-0 pl-0.5">
              <span className="text-[10px] text-muted-foreground truncate">
                {preview}
                {actions.length > 5 ? ` → +${actions.length - 5}` : ""}
              </span>
            </div>
          </button>

          <RenderIf condition={open}>
            <div className="border-t border-border px-2.5 py-2">
              <div className="relative flex flex-col">
                {actions.map((action, i) => {
                  const result = output?.results?.find((r) => r.index === i);
                  const summary = actionSummary(action);
                  const isLast = i === actions.length - 1;
                  const stepFailed = result?.ok === false;
                  const stepOk = result?.ok === true;
                  const stepPending = result == null && running && i === 0;

                  return (
                    <div key={`${action.action}-${i}`} className="relative flex gap-2.5 min-w-0">
                      <div className="relative flex w-3 shrink-0 self-stretch justify-center">
                        <RenderIf condition={!isLast}>
                          <span className="absolute top-2.5 bottom-0 w-px bg-border" />
                        </RenderIf>
                        <span
                          className={cn(
                            "relative z-10 mt-1 size-2 rounded-full ring-2 ring-card shrink-0",
                            stepFailed && "bg-destructive",
                            stepOk && "bg-chart-2",
                            stepPending && "bg-primary animate-pulse",
                            !stepFailed && !stepOk && !stepPending && "bg-muted-foreground/40",
                          )}
                        />
                      </div>
                      <div className={cn("min-w-0 flex-1 pb-2.5", isLast && "pb-0")}>
                        <div className="flex items-baseline gap-1.5 min-w-0">
                          <span className="text-[10px] font-mono text-muted-foreground shrink-0 tabular-nums">{i + 1}</span>
                          <span className="text-[11px] font-medium text-foreground shrink-0">{action.action}</span>
                          <RenderIf condition={!!summary}>{() => <span className="text-[11px] text-tertiary-foreground truncate">{summary}</span>}</RenderIf>
                        </div>
                        <RenderIf condition={!!result?.error}>
                          {() => <p className="text-[10px] text-destructive m-0 mt-0.5 truncate">{result?.error}</p>}
                        </RenderIf>
                      </div>
                    </div>
                  );
                })}
              </div>

              <RenderIf condition={!!output?.error || hasError}>
                <p className="text-[11px] text-destructive m-0 mt-1.5">{output?.error ?? "Tool execution failed"}</p>
              </RenderIf>
              <RenderIf condition={hasOutput}>
                <pre className="[scrollbar-width:thin] m-0 mt-1.5 whitespace-pre-wrap break-all text-[10px] text-tertiary-foreground leading-[1.5] max-h-40 overflow-y-auto font-mono">
                  {prettyJson(msg.toolOutput)}
                </pre>
              </RenderIf>
            </div>
          </RenderIf>
        </div>
      </div>
    </div>
  );
}
