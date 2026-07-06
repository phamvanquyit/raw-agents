// ─── Flow Tool Node ──────────────────────────────────────────────────────────
// Tool node on the right side of the flow. Connected tools have edges to
// the central agent config node.

import { Programming } from "@solar-icons/react";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";

export type FlowToolNodeData = {
  label: string;
  name: string;
  description: string;
  isConnected: boolean; // whether this tool is assigned to the current agent
  width?: number; // uniform width for all tool nodes (measured via Canvas API)
};

export type FlowToolNodeType = Node<FlowToolNodeData, "flowTool">;

export function FlowToolNode({ id, data }: NodeProps<FlowToolNodeType>) {
  const isBuiltin = id.startsWith("tool-builtin:");
  const color = isBuiltin ? "#a8ff53" : "#9c9af2";
  const bgColor = isBuiltin ? "rgba(168, 255, 83, 0.12)" : "rgba(156, 154, 242, 0.12)";

  return (
    <div
      className={`relative flex items-center gap-2 px-3 py-2 rounded-md border bg-surface transition-all duration-200 cursor-default ${
        data.isConnected ? "border-white/12 hover:border-border-hover hover:shadow-[0_2px_12px_rgba(0,0,0,0.2)]" : "border-border opacity-35 hover:opacity-55"
      }`}
      style={data.width ? { width: data.width } : undefined}
    >
      {/* Handle — left side (sends edge to the central agent node) */}
      <Handle
        type="source"
        position={Position.Left}
        className="!w-2 !h-2 !bg-surface-raised !border-2 !border-white/20 transition-all duration-150 hover:!bg-primary hover:!border-primary hover:!w-3 hover:!h-3"
      />

      <div className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0" style={{ background: bgColor, color }}>
        <Programming width={14} height={14} />
      </div>

      <div className="text-xs font-semibold text-main leading-[1.3]">{data.label || data.name}</div>
    </div>
  );
}
