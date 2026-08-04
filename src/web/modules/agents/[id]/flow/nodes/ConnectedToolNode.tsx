import { Folder, Planet2, Programming, Stars } from "@solar-icons/react";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";

export type ConnectedToolNodeData = {
  label: string;
  /** When set: group icon + name → tool icon + name (folder or MCP server) */
  folder?: string;
  width?: number;
  /** Accent — tool (default), mcp, or skill */
  accent?: "tool" | "mcp" | "skill";
};

export type ConnectedToolNodeType = Node<ConnectedToolNodeData, "connectedTool">;

const NODE_H = 16;

export function ConnectedToolNode({ data }: NodeProps<ConnectedToolNodeType>) {
  const accent = data.accent ?? "tool";
  const GroupIcon = accent === "mcp" ? Planet2 : Folder;
  const LeafIcon = accent === "skill" ? Stars : Programming;

  return (
    <div
      className="relative flex items-center gap-1.5 overflow-visible whitespace-nowrap"
      style={{ height: NODE_H, minWidth: data.width }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!border-0 !bg-transparent"
        style={{
          top: NODE_H / 2,
          width: 1,
          height: 1,
          minWidth: 1,
          minHeight: 1,
          opacity: 0,
          transform: "translate(-50%, -50%)",
        }}
      />
      {data.folder ? (
        <>
          <GroupIcon weight={accent === "mcp" ? "BoldDuotone" : "Bold"} width={12} height={12} className="block shrink-0 text-muted-foreground" />
          <span className="text-xs leading-none font-semibold text-muted-foreground">{data.folder}</span>
          <span className="mx-0.5 shrink-0 text-[11px] leading-none font-bold text-foreground/55" aria-hidden>
            →
          </span>
          <LeafIcon weight="BoldDuotone" width={12} height={12} className="block shrink-0 text-muted-foreground" />
          <span className="text-xs leading-none font-semibold text-foreground">{data.label}</span>
        </>
      ) : (
        <>
          <LeafIcon weight="BoldDuotone" width={12} height={12} className="block shrink-0 text-muted-foreground" />
          <span className="text-xs leading-none font-semibold text-foreground">{data.label}</span>
        </>
      )}
    </div>
  );
}
