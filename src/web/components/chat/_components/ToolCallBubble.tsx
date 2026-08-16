import AltArrowDown from "@solar-icons/react/arrows/AltArrowDown";
import Programming from "@solar-icons/react/it/Programming";
import DangerCircle from "@solar-icons/react/ui/DangerCircle";
import { useState } from "react";
import RenderIf from "src/components/RenderIf";
import { cn } from "src/lib/utils";
import { ToolIcon } from "src/modules/tools/components/ToolIcon";
import { useAppSelector } from "src/store/store";
import type { ChatAgentMessage } from "../common/types";
import { formatToolName, prettyJson } from "../common/utils";
import { parseBgTaskRef } from "../hooks/useConversationBgTasks";
import { RunningSpinner } from "./RunningSpinner";
import { resolveToolUI } from "./tool-uis";
import { BackgroundTaskToolUI } from "./tool-uis/BackgroundTaskToolUI";

function ToolStatusIcon({ hasError, open, toolIcon }: { hasError: boolean; open: boolean; toolIcon?: string | null }) {
  return (
    <span className="relative size-4 shrink-0">
      <span className={cn("absolute inset-0 flex items-center justify-center transition-opacity", open ? "opacity-0" : "opacity-100 group-hover:opacity-0")}>
        {hasError ? (
          <DangerCircle size={13} className="text-destructive" />
        ) : (
          <ToolIcon icon={toolIcon} size={13} className="text-muted-foreground" fallback={<Programming size={13} className="text-muted-foreground" />} />
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
  const tools = useAppSelector((s) => s.tools.items) as { name: string; icon?: string | null }[];
  const isConvRunning = conversations.find((c) => c.id === activeConvId)?.status === "running";
  const running = isPending && !!isConvRunning;

  const label = msg.toolLabel ?? formatToolName(msg.toolName ?? "Tool");
  const toolIcon = msg.toolIcon ?? tools.find((t) => t.name === msg.toolName)?.icon ?? null;

  if (isPending) {
    return (
      <div className="mb-0.5 flex w-full items-center gap-2 py-1">
        {running ? (
          <RunningSpinner />
        ) : (
          <ToolIcon
            icon={toolIcon}
            size={13}
            className="shrink-0 text-muted-foreground"
            fallback={<Programming size={13} className="text-muted-foreground" />}
          />
        )}
        <span className="flex-1 truncate text-left text-[12px] font-medium text-muted-foreground">{label}</span>
      </div>
    );
  }

  return (
    <div className="mb-0.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="group flex w-full cursor-pointer items-center gap-2 py-1 outline-none">
        <ToolStatusIcon hasError={hasError} open={open} toolIcon={toolIcon} />
        <span className="flex-1 truncate text-left text-[12px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">{label}</span>
      </button>

      <RenderIf condition={open}>
        <div className="mt-0.5 overflow-hidden rounded-lg border border-border-subtle font-mono text-[11px]">
          <RenderIf condition={hasInput}>
            <pre className="m-0 max-h-27.5 overflow-y-auto bg-transparent px-3 py-2 break-all whitespace-pre-wrap font-normal leading-[1.65] text-muted-foreground">
              {prettyJson(msg.toolInput)}
            </pre>
          </RenderIf>
          <pre className="m-0 max-h-75 overflow-y-auto bg-muted/50 px-3 py-2 break-all whitespace-pre-wrap font-normal leading-[1.65] text-muted-foreground">
            {hasOutput ? prettyJson(msg.toolOutput) : "Tool execution failed"}
          </pre>
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
}: {
  messages: ChatAgentMessage[];
  assistantLabel?: string;
  assistantColor?: string | null;
  showAvatar?: boolean;
}) {
  const color = assistantColor ?? "var(--primary)";
  return (
    <div className="mt-1 animate-[fadeIn_0.28s_ease-out_both]">
      {showAvatar && (
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase select-none"
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
  if (parseBgTaskRef(msg.toolOutput)) {
    return <BackgroundTaskToolUI msg={msg} assistantLabel={assistantLabel} assistantColor={assistantColor} showAvatar={showAvatar} />;
  }

  const color = assistantColor ?? "var(--primary)";
  return (
    <div className="mt-1 animate-[fadeIn_0.28s_ease-out_both]">
      {showAvatar && (
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase select-none"
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
