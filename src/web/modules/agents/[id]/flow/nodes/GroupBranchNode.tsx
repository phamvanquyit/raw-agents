// ─── Group Branch Node ────────────────────────────────────────────────────────
// Mid-level display node under a fan-out root (Tools folder / MCP server).
// Only shown when ≥1 leaf under the group is connected. Single-line name only.

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";

export type GroupBranchNodeData = {
  name: string;
  width?: number;
  accent?: "tool" | "mcp";
};

export type GroupBranchNodeType = Node<GroupBranchNodeData, "groupBranch">;

const ACCENT_BORDER: Record<NonNullable<GroupBranchNodeData["accent"]>, string> = {
  tool: "border-edge-tool/35",
  mcp: "border-edge-mcp/35",
};

export function GroupBranchNode({ data }: NodeProps<GroupBranchNodeType>) {
  const accent = data.accent ?? "tool";

  return (
    <div
      className={`relative flex items-center gap-2 px-3 py-2 rounded-md border bg-card ${ACCENT_BORDER[accent]}`}
      style={data.width ? { width: data.width } : undefined}
    >
      <Handle type="target" position={Position.Left} className="!w-1.5 !h-1.5 !bg-transparent !border-0 !opacity-0" />
      <Handle type="source" position={Position.Right} id="to-leaves" className="!w-1.5 !h-1.5 !bg-transparent !border-0 !opacity-0 !right-0" />

      <div className="min-w-0 flex-1 text-xs font-semibold text-foreground leading-[1.3] truncate">{data.name}</div>
    </div>
  );
}
