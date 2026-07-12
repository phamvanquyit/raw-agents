// ─── MCP Server Node ─────────────────────────────────────────────────────────
// Compact parent card. Click opens popover with tool toggles for assignment.

import { AltArrowRight, CloseCircle, PlugCircle } from "@solar-icons/react";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { Popover, PopoverArrow, PopoverClose, PopoverContent, PopoverTrigger } from "src/components/ui/popover";
import { Switch } from "src/components/ui/switch";

export type McpToolToggleItem = {
  id: string;
  label: string;
  connected: boolean;
};

export type McpServerNodeData = {
  name: string;
  tools: McpToolToggleItem[];
  width?: number;
  onToggleTool: (toolId: string, connected: boolean) => void;
  onToggleAll: (toolIds: string[], enable: boolean) => void;
};

export type McpServerNodeType = Node<McpServerNodeData, "mcpServer">;

const MCP_ORANGE = "#FF8A3D";

export function McpServerNode({ data }: NodeProps<McpServerNodeType>) {
  const connectedCount = data.tools.filter((t) => t.connected).length;
  const hasConnection = connectedCount > 0;
  const allOn = data.tools.length > 0 && connectedCount === data.tools.length;

  const handleToggleAll = () => {
    data.onToggleAll(
      data.tools.map((t) => t.id),
      !allOn,
    );
  };

  return (
    <div className="relative" style={data.width ? { width: data.width } : undefined}>
      {hasConnection && (
        <Handle
          type="source"
          position={Position.Left}
          className="!w-2 !h-2 !bg-surface-raised !border-2 transition-all duration-150"
          style={{ borderColor: "rgba(255, 138, 61, 0.6)" }}
        />
      )}

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`nodrag nopan relative flex items-center gap-2 w-full px-3 py-2 rounded-md border bg-surface cursor-pointer transition-all duration-150 text-left font-[inherit] ${
              hasConnection
                ? "border-[rgba(255,138,61,0.35)] hover:border-[rgba(255,138,61,0.55)] hover:bg-[rgba(255,138,61,0.06)]"
                : "border-border hover:border-[rgba(255,138,61,0.25)] hover:bg-surface-raised/40"
            }`}
          >
            <div
              className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0"
              style={{ background: "rgba(255, 138, 61, 0.12)", color: MCP_ORANGE }}
            >
              <PlugCircle weight="BoldDuotone" width={14} height={14} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-main leading-[1.3] truncate">{data.name}</div>
              <div className="text-[10px] text-muted leading-tight mt-0.5">
                {data.tools.length} tools
                {connectedCount > 0 ? ` · ${connectedCount} on` : ""}
              </div>
            </div>

            <AltArrowRight width={14} height={14} className="text-muted shrink-0" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          side="right"
          align="start"
          sideOffset={12}
          className="nodrag nowheel nopan w-[340px] p-0 overflow-visible border-[rgba(255,138,61,0.55)]"
        >
          <PopoverArrow style={{ fill: MCP_ORANGE }} width={18} height={10} />
          <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-[rgba(255,138,61,0.25)]" style={{ background: "rgba(255, 138, 61, 0.12)" }}>
            <div
              className="w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0"
              style={{ background: "rgba(255, 138, 61, 0.2)", color: MCP_ORANGE }}
            >
              <PlugCircle weight="BoldDuotone" width={15} height={15} />
            </div>
            <div className="min-w-0 flex-1 text-[14px] font-semibold text-main truncate">{data.name}</div>
            <PopoverClose asChild>
              <button
                type="button"
                className="nodrag nopan shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-main hover:bg-white/5 transition-colors"
                aria-label="Close"
              >
                <CloseCircle width={16} height={16} />
              </button>
            </PopoverClose>
          </div>

          <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-border/30">
            <span className="text-[11px] text-muted">
              {connectedCount}/{data.tools.length} enabled
            </span>
            <button
              type="button"
              className="nodrag nopan text-[11px] font-semibold cursor-pointer bg-transparent border-none font-[inherit] transition-colors"
              style={{ color: MCP_ORANGE }}
              onClick={handleToggleAll}
            >
              {allOn ? "Disable all" : "Enable all"}
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto game-scrollbar py-1.5">
            {data.tools.map((tool) => (
              <div key={tool.id} className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-surface-raised/40 transition-colors">
                <div className="min-w-0 flex-1 text-[13px] font-medium text-main truncate">{tool.label}</div>
                <Switch checked={tool.connected} onCheckedChange={(checked) => data.onToggleTool(tool.id, checked)} aria-label={`Toggle ${tool.label}`} />
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
