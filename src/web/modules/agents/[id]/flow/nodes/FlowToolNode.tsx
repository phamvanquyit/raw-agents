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
  isMcp?: boolean;
};

export type FlowToolNodeType = Node<FlowToolNodeData, "flowTool">;

export function FlowToolNode({ id, data }: NodeProps<FlowToolNodeType>) {
  const isBuiltin = id.startsWith("tool-builtin:");
  const color = isBuiltin ? "var(--edge-tool)" : data.isMcp ? "var(--edge-mcp)" : "var(--edge-call-agent)";
  const bgColor = isBuiltin
    ? "color-mix(in srgb, var(--edge-tool) 12%, transparent)"
    : data.isMcp
      ? "color-mix(in srgb, var(--edge-mcp) 8%, transparent)"
      : "color-mix(in srgb, var(--edge-call-agent) 12%, transparent)";

  return (
    <div
      className={`relative flex items-center gap-2 px-3 py-2 rounded-md border bg-card transition-all duration-200 cursor-default ${
        data.isConnected ? "border-white/12 hover:border-border hover:shadow-[0_2px_12px_rgba(0,0,0,0.2)]" : "border-border hover:border-border"
      }`}
      style={data.width ? { width: data.width } : undefined}
    >
      {/* Handle — left side (sends edge to the central agent node) */}
      <Handle
        type="source"
        position={Position.Left}
        className="!w-2 !h-2 !bg-muted !border-2 !border-white/20 transition-all duration-150 hover:!bg-primary hover:!border-primary hover:!w-3 hover:!h-3"
      />

      <div className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0" style={{ background: bgColor, color }}>
        <Programming width={14} height={14} />
      </div>

      <div className="text-xs font-semibold text-foreground leading-[1.3] truncate">{data.label || data.name}</div>
    </div>
  );
}
