// ─── Callable Agent Node ──────────────────────────────────────────────────────
// Compact node for other agents on the left column. Connected ones have
// edges to the central agent config node.

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { AppLogo } from "src/components/AppLogo";

export type CallableAgentNodeData = {
  name: string;
  aiModel: string | null;
  isConnected: boolean; // whether this agent is in callableAgentIds
  width?: number; // uniform width for all agent nodes (measured via Canvas API)
};

export type CallableAgentNodeType = Node<CallableAgentNodeData, "callableAgent">;

export function CallableAgentNode({ data }: NodeProps<CallableAgentNodeType>) {
  return (
    <div
      className={`relative flex items-center gap-2 px-3 py-2 rounded-md border bg-surface transition-all duration-200 cursor-default ${
        data.isConnected
          ? "border-[#9c9af2]/25 hover:border-[#9c9af2]/40 hover:shadow-[0_0_16px_rgba(156,154,242,0.1)]"
          : "border-border opacity-35 hover:opacity-55"
      }`}
      style={data.width ? { width: data.width } : undefined}
    >
      {/* Handle — left side (sends edge to the central agent node) */}
      <Handle
        type="source"
        position={Position.Left}
        className="!w-2 !h-2 !bg-surface-raised !border-2 !border-white/20 transition-all duration-150 hover:!bg-[#9c9af2] hover:!border-[#9c9af2] hover:!w-3 hover:!h-3"
      />

      <div className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0 bg-[rgba(156,154,242,0.12)]">
        <AppLogo size={14} fill={data.isConnected ? "#9c9af2" : "#8b8d94"} strokeWidth={1} />
      </div>

      <div className="text-xs font-semibold text-main leading-[1.3]">{data.name}</div>
    </div>
  );
}
