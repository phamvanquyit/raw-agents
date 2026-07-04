import type { ChatAgentMessage } from "../common/types";
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

  if (msg.role === "error") {
    return (
      <div className="px-4 py-1 ca-fade-in">
        <div className="text-xs px-3 py-2.5 rounded-xl bg-primary-50 border border-danger/30 text-danger leading-relaxed">{msg.content}</div>
      </div>
    );
  }

  if (msg.role === "user") return <MessageUser msg={msg} />;

  // assistant + custom roles
  return <MessageAgent msg={msg} isFirstInGroup={isFirstInGroup} isLastInGroup={isLastInGroup} />;
}
