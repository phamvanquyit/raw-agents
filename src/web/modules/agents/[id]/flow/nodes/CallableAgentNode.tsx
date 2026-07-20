// ─── Callable Agent Node ──────────────────────────────────────────────────────
// Compact node for other agents on the left column. Connected ones have
// edges to the central agent config node.

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { UserAvatar } from "src/components/UserAvatar";

export type CallableAgentNodeData = {
  name: string;
  avatar?: string | null;
  aiModel: string | null;
  isConnected: boolean; // whether this agent is in callableAgentIds
  width?: number; // uniform width for all agent nodes (measured via Canvas API)
};

export type CallableAgentNodeType = Node<CallableAgentNodeData, "callableAgent">;

export function CallableAgentNode({ data }: NodeProps<CallableAgentNodeType>) {
  return (
    <div
      className={`relative flex items-center gap-2 px-3 py-2 rounded-md border bg-card transition-all duration-200 cursor-default ${
        data.isConnected ? "border-edge-call-agent/30 hover:border-edge-call-agent/50" : "border-border hover:border-border"
      }`}
      style={data.width ? { width: data.width } : undefined}
    >
      {/* Handle — left side (sends edge to the central agent node) */}
      <Handle
        type="source"
        position={Position.Left}
        className="!w-2 !h-2 !bg-muted !border-2 !border-white/20 transition-all duration-150 hover:!bg-edge-call-agent hover:!border-edge-call-agent hover:!w-3 hover:!h-3"
      />

      <UserAvatar avatar={data.avatar} name={data.name} size={24} className="shrink-0 ring-1 ring-border" />

      <div className="text-xs font-semibold text-foreground leading-[1.3]">{data.name}</div>
    </div>
  );
}
