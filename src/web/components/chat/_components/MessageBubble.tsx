import type { ChatAgentMessage } from "../common/types";
import { CompletedThinking } from "./MessageAgent";
import { MessageAgent } from "./MessageAgent";
import { MessageUser } from "./MessageUser";
import { ToolCallBubble } from "./ToolCallBubble";

interface MessageBubbleProps {
  msg: ChatAgentMessage;
  assistantLabel?: string;
  assistantColor?: string | null;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  isFirstInAgentChain?: boolean;
}

export function MessageBubble({
  msg,
  assistantLabel = "Assistant",
  assistantColor,
  isFirstInGroup = true,
  isLastInGroup = true,
  isFirstInAgentChain = true,
}: MessageBubbleProps) {
  if (msg.role === "tool-call")
    return <ToolCallBubble msg={msg} assistantLabel={assistantLabel} assistantColor={assistantColor} showAvatar={isFirstInAgentChain} />;
  if (msg.role === "tool-result") return null;

  if (msg.role === "thinking") {
    const thinking = msg.content;
    const duration = (msg.meta?.thinkingDuration as number) ?? 0;
    return (
      <div className="animate-[fadeIn_0.28s_ease-out_both] mt-1">
        <CompletedThinking thinking={thinking} duration={duration} />
      </div>
    );
  }

  if (msg.role === "error") {
    return (
      <div className="px-4 py-1 animate-[fadeIn_0.28s_ease-out_both]">
        <div className="text-xs px-3 py-2.5 rounded-md bg-accent border border-destructive/30 text-destructive leading-relaxed">{msg.content}</div>
      </div>
    );
  }

  if (msg.role === "user") return <MessageUser msg={msg} />;

  // assistant + custom roles
  return <MessageAgent msg={msg} isFirstInGroup={isFirstInGroup} isLastInGroup={isLastInGroup} />;
}
