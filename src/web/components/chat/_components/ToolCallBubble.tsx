import { AltArrowDown, DangerCircle, Programming, Restart } from "@solar-icons/react";
import { useState } from "react";
import RenderIf from "src/components/RenderIf";
import { cn } from "src/lib/utils";
import { useAppSelector } from "src/store/store";
import type { ChatAgentMessage } from "../common/types";
import { formatToolName, prettyJson } from "../common/utils";
import { resolveToolUI } from "./tool-uis";

function ToolLeadingIcon({ hasError, open }: { hasError: boolean; open: boolean }) {
  return (
    <span className="relative size-4 shrink-0">
      <span className={cn("absolute inset-0 flex items-center justify-center transition-opacity", open ? "opacity-0" : "opacity-100 group-hover:opacity-0")}>
        {hasError ? <DangerCircle size={13} className="text-destructive" /> : <Programming size={13} className="text-muted-foreground" />}
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
  );
}

function ToolCallCard({ msg }: { msg: ChatAgentMessage }) {
  const hasOutput = msg.toolOutput != null;
  const hasInput = msg.toolInput != null;
  const hasError = Boolean(msg.toolError);
  const isPending = !hasOutput && !hasError;
  const [open, setOpen] = useState(false);
  const activeConvId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);
  const isConvRunning = conversations.find((c) => c.id === activeConvId)?.status === "running";
  const running = isPending && !!isConvRunning;

  const label = msg.toolLabel ?? formatToolName(msg.toolName ?? "Tool");

  if (isPending) {
    return (
      <div className="rounded-lg border border-border-subtle overflow-hidden mb-1.5">
        <div className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/30">
          {running ? (
            <Restart size={12} className="animate-spin text-muted-foreground shrink-0" />
          ) : (
            <Programming size={13} className="text-muted-foreground shrink-0" />
          )}
          <span className="text-[12px] font-medium text-muted-foreground truncate flex-1 text-left">{label}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle overflow-hidden mb-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group w-full flex items-center gap-2 px-3 py-1.5 cursor-pointer outline-none transition-colors bg-muted/30 hover:bg-muted/45"
      >
        <ToolLeadingIcon hasError={hasError} open={open} />
        <span className="text-[12px] font-medium text-muted-foreground group-hover:text-foreground transition-colors truncate flex-1 text-left">{label}</span>
      </button>

      <RenderIf condition={open}>
        <div className="border-t border-border-subtle font-mono text-[11px]">
          <RenderIf condition={hasInput}>
            <div className="px-3 py-2 border-b border-border-subtle/60">
              <span className="text-2xs text-muted-foreground uppercase tracking-widest font-sans font-semibold">input</span>
              <pre className="m-0 mt-1 whitespace-pre-wrap break-all text-muted-foreground leading-[1.65] max-h-27.5 overflow-y-auto font-normal">
                {prettyJson(msg.toolInput)}
              </pre>
            </div>
          </RenderIf>
          <div className="px-3 py-2">
            <span className="text-2xs uppercase tracking-widest font-sans font-semibold text-muted-foreground">output</span>
            <pre className="m-0 mt-1 whitespace-pre-wrap break-all leading-[1.65] max-h-75 overflow-y-auto font-normal text-muted-foreground">
              {hasOutput ? prettyJson(msg.toolOutput) : "Tool execution failed"}
            </pre>
          </div>
        </div>
      </RenderIf>
    </div>
  );
}

export function ToolCallGroup({
  messages,
  assistantLabel = "Assistant",
  assistantColor,
  showAvatar = true,
}: { messages: ChatAgentMessage[]; assistantLabel?: string; assistantColor?: string | null; showAvatar?: boolean }) {
  const color = assistantColor ?? "var(--primary)";
  return (
    <div className="animate-[fadeIn_0.28s_ease-out_both] mt-1">
      {showAvatar && (
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase select-none"
            style={{ background: color, color: "var(--primary-foreground)", letterSpacing: "0.08em" }}
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
  const CustomUI = resolveToolUI(msg.toolName);
  if (CustomUI) {
    return <CustomUI msg={msg} assistantLabel={assistantLabel} assistantColor={assistantColor} showAvatar={showAvatar} />;
  }

  const color = assistantColor ?? "var(--primary)";
  return (
    <div className="animate-[fadeIn_0.28s_ease-out_both] mt-1">
      {showAvatar && (
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase select-none"
            style={{ background: color, color: "var(--primary-foreground)", letterSpacing: "0.08em" }}
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
