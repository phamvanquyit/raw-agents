// ─── Connected Tool Node ──────────────────────────────────────────────────────
// Read-only leaf under Tools / MCP — shown only when enabled.
// Toggle on/off is done via the parent popover; this node is display-only.

import { Folder, PlugCircle, Programming } from "@solar-icons/react";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";

export type ConnectedToolNodeData = {
  label: string;
  /** When set: group icon + name → tool icon + name (folder or MCP server) */
  folder?: string;
  width?: number;
  /** Accent — tool (default) or mcp */
  accent?: "tool" | "mcp";
};

export type ConnectedToolNodeType = Node<ConnectedToolNodeData, "connectedTool">;

export function ConnectedToolNode({ data }: NodeProps<ConnectedToolNodeType>) {
  const accent = data.accent ?? "tool";
  const GroupIcon = accent === "mcp" ? PlugCircle : Folder;
  const ToolIcon = Programming;

  return (
    <div className="relative flex items-center gap-1.5 whitespace-nowrap" style={data.width ? { minWidth: data.width } : undefined}>
      <Handle type="target" position={Position.Left} className="!w-1.5 !h-1.5 !bg-transparent !border-0 !opacity-0" />
      {data.folder ? (
        <>
          <GroupIcon weight={accent === "mcp" ? "BoldDuotone" : "Bold"} width={12} height={12} className="shrink-0 text-muted-foreground" />
          <span className="text-xs font-semibold leading-[1.3] text-muted-foreground">{data.folder}</span>
          <span className="mx-0.5 shrink-0 text-[11px] font-bold text-foreground/55" aria-hidden>
            →
          </span>
          <ToolIcon weight="BoldDuotone" width={12} height={12} className="shrink-0 text-muted-foreground" />
          <span className="text-xs font-semibold leading-[1.3] text-foreground">{data.label}</span>
        </>
      ) : (
        <>
          <ToolIcon weight="BoldDuotone" width={12} height={12} className="shrink-0 text-muted-foreground" />
          <span className="text-xs font-semibold leading-[1.3] text-foreground">{data.label}</span>
        </>
      )}
    </div>
  );
}
