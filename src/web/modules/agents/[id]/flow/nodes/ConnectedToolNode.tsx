// ─── Connected Tool Node ──────────────────────────────────────────────────────
// Read-only leaf under Tools / MCP server branch — shown only when enabled.
// Toggle on/off is done via the parent popover; this node is display-only.

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";

export type ConnectedToolNodeData = {
  label: string;
  width?: number;
  /** Border accent — tool (default) or mcp */
  accent?: "tool" | "mcp";
};

export type ConnectedToolNodeType = Node<ConnectedToolNodeData, "connectedTool">;

const ACCENT_BORDER: Record<NonNullable<ConnectedToolNodeData["accent"]>, string> = {
  tool: "border-edge-tool/30",
  mcp: "border-edge-mcp/30",
};

export function ConnectedToolNode({ data }: NodeProps<ConnectedToolNodeType>) {
  const accent = data.accent ?? "tool";

  return (
    <div
      className={`relative flex items-center gap-2 px-3 py-2 rounded-md border bg-card ${ACCENT_BORDER[accent]}`}
      style={data.width ? { width: data.width } : undefined}
    >
      <Handle type="target" position={Position.Left} className="!w-1.5 !h-1.5 !bg-transparent !border-0 !opacity-0" />
      <div className="min-w-0 flex-1 text-xs font-semibold text-foreground leading-[1.3] truncate">{data.label}</div>
    </div>
  );
}
