import type { ChatAgentMessage } from "./types";

interface MessageUserProps {
  msg: ChatAgentMessage;
}

export function MessageUser({ msg }: MessageUserProps) {
  return (
    <div className="ca-fade-in mt-5">
      {/* Message row */}
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        {/* Left: tag + message */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#6b9a4a]/10 px-4 py-2.5 rounded-lg border border-primary/50">
          {/* Message text */}
          <span className="text-sm text-main whitespace-pre-wrap wrap-break-word">{msg.content}</span>
        </div>

        {/* Timestamp — monospace, far right */}
        <span className="flex-shrink-0 text-[10px] text-muted/50 font-mono tracking-wide mt-[3px] select-none">{formatTime(msg.timestamp)}</span>
      </div>
    </div>
  );
}

function formatTime(date: Date): string {
  try {
    const now = new Date();
    const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
