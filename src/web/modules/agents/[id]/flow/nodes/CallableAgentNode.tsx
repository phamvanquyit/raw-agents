// ─── Callable Agent Node ──────────────────────────────────────────────────────
// Read-only child leaf under CallAgents — shown only when that agent is enabled.
// Toggle on/off is done via the Call Agents popover; this node is display-only.

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { UserAvatar } from "src/components/UserAvatar";

export type CallableAgentNodeData = {
  name: string;
  avatar?: string | null;
  width?: number;
};

export type CallableAgentNodeType = Node<CallableAgentNodeData, "callableAgent">;

export function CallableAgentNode({ data }: NodeProps<CallableAgentNodeType>) {
  return (
    <div
      className="relative flex items-center gap-2 px-3 py-2 rounded-md border bg-card border-edge-call-agent/30"
      style={data.width ? { width: data.width } : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-1.5 !h-1.5 !bg-transparent !border-0 !opacity-0"
      />

      <UserAvatar avatar={data.avatar} name={data.name} size={22} className="shrink-0 ring-1 ring-border" />

      <div className="min-w-0 flex-1 text-xs font-semibold text-foreground leading-[1.3] truncate">{data.name}</div>
    </div>
  );
}
