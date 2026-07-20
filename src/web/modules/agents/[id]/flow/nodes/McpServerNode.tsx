import { AltArrowRight, CloseCircle, PlugCircle } from "@solar-icons/react";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { Popover, Switch } from "antd";
import { useState } from "react";

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

const MCP_ORANGE = "var(--edge-mcp)";

export function McpServerNode({ data }: NodeProps<McpServerNodeType>) {
  const [open, setOpen] = useState(false);
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
          className="!w-2 !h-2 !bg-muted !border-2 transition-all duration-150"
          style={{ borderColor: "color-mix(in srgb, var(--edge-mcp) 60%, transparent)" }}
        />
      )}

      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="rightTop"
        arrow={{ pointAtCenter: true }}
        styles={{
          root: { width: 340 },
          container: { width: 340, padding: 0, overflow: "visible", borderColor: "color-mix(in srgb, var(--edge-mcp) 55%, transparent)" },
        }}
        content={
          <div className="nodrag nowheel nopan w-[340px]">
            <div
              className="flex items-center gap-2.5 px-3.5 py-3 border-b border-edge-mcp/25"
              style={{ background: "color-mix(in srgb, var(--edge-mcp) 12%, transparent)" }}
            >
              <div
                className="w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0"
                style={{ background: "color-mix(in srgb, var(--edge-mcp) 20%, transparent)", color: MCP_ORANGE }}
              >
                <PlugCircle weight="BoldDuotone" width={15} height={15} />
              </div>
              <div className="min-w-0 flex-1 text-[14px] font-semibold text-foreground truncate">{data.name}</div>
              <button
                type="button"
                className="nodrag nopan shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <CloseCircle width={16} height={16} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-border/30">
              <span className="text-[11px] text-muted-foreground">
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
                <div key={tool.id} className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-muted/40 transition-colors">
                  <div className="min-w-0 flex-1 text-[13px] font-medium text-foreground truncate">{tool.label}</div>
                  <Switch checked={tool.connected} onChange={(checked) => data.onToggleTool(tool.id, checked)} aria-label={`Toggle ${tool.label}`} />
                </div>
              ))}
            </div>
          </div>
        }
      >
        <button
          type="button"
          className={`nodrag nopan relative flex items-center gap-2 w-full px-3 py-2 rounded-md border bg-card cursor-pointer transition-all duration-150 text-left font-[inherit] ${
            hasConnection ? "border-edge-mcp/35 hover:border-edge-mcp/55 hover:bg-edge-mcp/6" : "border-border hover:border-edge-mcp/25 hover:bg-muted/40"
          }`}
        >
          <div
            className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0"
            style={{ background: "color-mix(in srgb, var(--edge-mcp) 12%, transparent)", color: MCP_ORANGE }}
          >
            <PlugCircle weight="BoldDuotone" width={14} height={14} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-foreground leading-[1.3] truncate">{data.name}</div>
            <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              {data.tools.length} tools
              {connectedCount > 0 ? ` · ${connectedCount} on` : ""}
            </div>
          </div>

          <AltArrowRight width={14} height={14} className="text-muted-foreground shrink-0" />
        </button>
      </Popover>
    </div>
  );
}
