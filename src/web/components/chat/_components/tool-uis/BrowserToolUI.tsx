import { AltArrowDown, DangerCircle, Global, Restart } from "@solar-icons/react";
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
        <div className="rounded-lg border border-border-subtle overflow-hidden">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="group w-full flex items-center gap-2 px-3 py-1.5 cursor-pointer outline-none border-0 bg-muted/30 hover:bg-muted/45 transition-colors text-left"
          >
            <span className="relative size-4 shrink-0">
              <span
                className={cn("absolute inset-0 flex items-center justify-center transition-opacity", open ? "opacity-0" : "opacity-100 group-hover:opacity-0")}
              >
                {failed ? (
                  <DangerCircle size={13} className="text-destructive" />
                ) : running ? (
                  <Restart size={12} className="animate-spin text-muted-foreground" />
                ) : (
                  <Global size={13} className="text-muted-foreground" />
                )}
              </span>
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center text-muted-foreground transition-opacity",
                  open ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
              >
                <AltArrowDown size={12} className={cn("transition-transform duration-150", open && "rotate-180")} />
              </span>
            </span>
            <span className="text-[11px] text-tertiary-foreground truncate font-mono min-w-0 flex-1">{url}</span>
          </button>

          <RenderIf condition={open}>
            <div className="border-t border-border-subtle px-3 py-2">
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
                            "relative z-10 mt-1 size-1.5 rounded-full ring-2 ring-card shrink-0",
                            stepFailed && "bg-muted-foreground",
                            stepOk && "bg-muted-foreground/70",
                            stepPending && "bg-muted-foreground animate-pulse",
                            !stepFailed && !stepOk && !stepPending && "bg-muted-foreground/30",
                          )}
                        />
                      </div>
                      <div className={cn("min-w-0 flex-1 pb-2.5", isLast && "pb-0")}>
                        <div className="flex items-baseline gap-1.5 min-w-0">
                          <span className="text-[10px] font-mono text-muted-foreground shrink-0 tabular-nums">{i + 1}</span>
                          <span className="text-[11px] text-foreground shrink-0">{action.action}</span>
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
                <pre className="m-0 mt-1.5 whitespace-pre-wrap break-all text-[10px] text-tertiary-foreground leading-[1.5] max-h-40 overflow-y-auto font-mono">
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
