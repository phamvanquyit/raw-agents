// ─── Chat Node ────────────────────────────────────────────────────────────────
// make.com-style action node — circular icon with label below.
// Positioned to the left of the AgentConfigNode on the flow canvas.
// Clicking opens the full-screen chat dialog.

import { ChatRound } from "@solar-icons/react";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";

export type ChatNodeData = {
  onOpenChat: () => void;
};

export type ChatNodeType = Node<ChatNodeData, "chat">;

export function ChatNode({ data }: NodeProps<ChatNodeType>) {
  return (
    <button
      type="button"
      onClick={data.onOpenChat}
      className="nodrag nopan relative flex flex-col items-center gap-2 bg-transparent border-none cursor-pointer group font-[inherit] p-0 outline-none"
    >
      {/* Handle — right side (connects to config node) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-[rgba(168,255,83,0.2)] !border-2 !border-[rgba(168,255,83,0.35)] transition-all duration-150"
      />

      {/* Circular icon container */}
      <div className="w-14 h-14 rounded-full bg-surface border-2 border-white/10 shadow-[0_0_24px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.04)] flex items-center justify-center transition-all duration-200 group-hover:border-primary/40 group-hover:shadow-[0_0_28px_rgba(168,255,83,0.12),0_0_0_1px_rgba(168,255,83,0.1)] group-hover:scale-[1.08] group-active:scale-[0.95]">
        <ChatRound width={22} height={22} className="text-primary opacity-60 group-hover:opacity-100 transition-opacity duration-200" />
      </div>

      {/* Label below */}
      <span className="text-[11px] font-semibold text-muted leading-[1] tracking-wide group-hover:text-primary transition-colors duration-200">Chat</span>
    </button>
  );
}
