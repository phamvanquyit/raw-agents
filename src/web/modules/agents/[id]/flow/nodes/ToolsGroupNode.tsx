// ─── Tools Group Node ─────────────────────────────────────────────────────────
// Group box containing all tools. Connected tools are highlighted;
// unconnected are dimmed and clickable to toggle assignment.
// Has a left handle to connect to the central agent config node.

import { Bolt } from "@solar-icons/react";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";

export type ToolsGroupToolItem = {
  id: string;
  label: string;
  name: string;
  isConnected: boolean;
};

export type ToolsGroupNodeData = {
  tools: ToolsGroupToolItem[];
  connectedCount: number;
  onToggleTool: (toolId: string, connect: boolean) => void;
};

export type ToolsGroupNodeType = Node<ToolsGroupNodeData, "toolsGroup">;

export function ToolsGroupNode({ data }: NodeProps<ToolsGroupNodeType>) {
  const connected = data.tools.filter((t) => t.isConnected);
  const available = data.tools.filter((t) => !t.isConnected);

  return (
    <div className="relative rounded-lg border border-primary/20 bg-card min-w-[180px]">
      {/* Handle — left side (connects to the central agent node) */}
      <Handle
        type="source"
        position={Position.Left}
        className="!w-2 !h-2 !bg-muted !border-2 !border-white/20 transition-all duration-150 hover:!bg-primary hover:!border-primary hover:!w-3 hover:!h-3"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/6">
        <div className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0 bg-edge-tool/12">
          <Bolt width={14} height={14} className="text-edge-tool" />
        </div>
        <span className="text-xs font-semibold text-foreground">Tools</span>
        {data.connectedCount > 0 && <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">{data.connectedCount}</span>}
      </div>

      {/* Connected tools */}
      {connected.length > 0 && (
        <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
          {connected.map((tool) => (
            <div key={tool.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md group hover:bg-accent transition-colors">
              <div
                className={`w-[18px] h-[18px] rounded-[4px] flex items-center justify-center shrink-0 ${
                  tool.id.startsWith("builtin:") ? "bg-edge-tool/15" : "bg-edge-call-agent/15"
                }`}
              >
                <Bolt width={10} height={10} className={tool.id.startsWith("builtin:") ? "text-edge-tool" : "text-edge-call-agent"} />
              </div>
              <span className="text-2xs font-medium text-foreground flex-1 whitespace-nowrap">{tool.label || tool.name}</span>
              <button
                type="button"
                onClick={() => data.onToggleTool(tool.id, false)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all text-sm leading-none cursor-pointer bg-transparent border-none p-0 font-[inherit]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Available (unconnected) tools */}
      {available.length > 0 && (
        <div className={`flex flex-col gap-0.5 px-1.5 py-1.5 ${connected.length > 0 ? "border-t border-white/4" : ""}`}>
          {available.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className="flex items-center gap-2 px-2 py-1.5 rounded-md opacity-30 hover:opacity-65 cursor-pointer transition-all bg-transparent border-none font-[inherit] text-left w-full"
              onClick={() => data.onToggleTool(tool.id, true)}
            >
              <div className="w-[18px] h-[18px] rounded-[4px] flex items-center justify-center shrink-0 bg-muted">
                <Bolt width={10} height={10} className="text-muted-foreground" />
              </div>
              <span className="text-2xs font-medium text-muted-foreground flex-1 whitespace-nowrap">{tool.label || tool.name}</span>
              <span className="text-[10px] text-muted-foreground leading-none">+</span>
            </button>
          ))}
        </div>
      )}

      {data.tools.length === 0 && <div className="px-3 py-3 text-2xs text-muted-foreground text-center">No tools available</div>}
    </div>
  );
}
