// ─── MCP Servers Node ─────────────────────────────────────────────────────────
// Single card node (like Tools). Click opens a popover listing MCP tools
// grouped by server, each with a Switch. Connected tools fan out as children.

import { CloseCircle, PlugCircle } from "@solar-icons/react";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { Popover, Switch } from "antd";
import { useMemo, useState } from "react";

export type McpToolToggleItem = {
  id: string;
  label: string;
  connected: boolean;
};

export type McpServerGroup = {
  id: string;
  name: string;
  tools: McpToolToggleItem[];
};

export type McpServersNodeData = {
  groups: McpServerGroup[];
  width?: number;
  onToggleTool: (toolId: string, enable: boolean) => void;
};

export type McpServersNodeType = Node<McpServersNodeData, "mcpServers">;

const MCP_COLOR = "var(--edge-mcp)";

export function McpServersNode({ data }: NodeProps<McpServersNodeType>) {
  const [open, setOpen] = useState(false);

  const { connectedCount, totalCount, serverCount } = useMemo(() => {
    const all = data.groups.flatMap((g) => g.tools);
    return {
      connectedCount: all.filter((t) => t.connected).length,
      totalCount: all.length,
      serverCount: data.groups.length,
    };
  }, [data.groups]);

  const hasConnection = connectedCount > 0;

  return (
    <div className="relative" style={data.width ? { width: data.width } : undefined}>
      {hasConnection && (
        <Handle
          id="to-config"
          type="source"
          position={Position.Left}
          className="!w-2 !h-2 !bg-muted !border-2 transition-all duration-150 !left-1.5"
          style={{ borderColor: "color-mix(in srgb, var(--edge-mcp) 60%, transparent)" }}
        />
      )}

      {/* Fan-out to connected server branch nodes */}
      {hasConnection && <Handle id="to-servers" type="source" position={Position.Right} className="!w-1.5 !h-1.5 !bg-transparent !border-0 !opacity-0 !right-0" />}

      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement={hasConnection ? "bottom" : "right"}
        arrow={{ pointAtCenter: true }}
        styles={{
          root: { width: 340 },
          container: {
            width: 340,
            padding: 0,
            overflow: "hidden",
            borderRadius: 12,
            border: "1px solid color-mix(in srgb, var(--edge-mcp) 45%, transparent)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)",
            background: "var(--popover)",
          },
        }}
        content={
          <div className="nodrag nowheel nopan w-[340px]">
            <div
              className="flex items-center gap-2.5 px-3.5 py-3 border-b"
              style={{
                background: "linear-gradient(180deg, color-mix(in srgb, var(--edge-mcp) 18%, transparent), color-mix(in srgb, var(--edge-mcp) 8%, transparent))",
                borderBottomColor: "color-mix(in srgb, var(--edge-mcp) 35%, transparent)",
                boxShadow: "inset 0 -1px 0 color-mix(in srgb, var(--edge-mcp) 12%, transparent), 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              <div
                className="w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0 ring-1 ring-edge-mcp/25"
                style={{ background: "color-mix(in srgb, var(--edge-mcp) 22%, transparent)", color: MCP_COLOR }}
              >
                <PlugCircle weight="BoldDuotone" width={15} height={15} />
              </div>
              <div className="min-w-0 flex-1 text-[14px] font-semibold text-foreground truncate">MCP Servers</div>
              <button
                type="button"
                className="nodrag nopan shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/40 transition-colors"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <CloseCircle width={16} height={16} />
              </button>
            </div>

            <div className="max-h-[420px] overflow-y-auto game-scrollbar py-1.5">
              {totalCount === 0 ? (
                <div className="px-3.5 py-6 text-[12px] text-muted-foreground text-center">No MCP tools available</div>
              ) : (
                data.groups.map((group) => (
                  <div key={group.id} className="pb-1">
                    <div className="px-3.5 pt-2.5 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{group.name}</span>
                    </div>

                    {group.tools.map((tool) => (
                      <div key={tool.id} className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-muted/40 transition-colors">
                        <div className="min-w-0 flex-1 text-[13px] font-medium text-foreground truncate">{tool.label}</div>
                        <Switch
                          size="small"
                          checked={tool.connected}
                          onChange={(checked) => data.onToggleTool(tool.id, checked)}
                          aria-label={`Toggle ${group.name} → ${tool.label}`}
                        />
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        }
      >
        <button
          type="button"
          className={`nodrag nopan relative flex items-center gap-2 w-full pl-3.5 pr-2.5 py-2 rounded-md border bg-card cursor-pointer transition-all duration-150 text-left font-[inherit] ${
            hasConnection ? "border-edge-mcp/35 hover:border-edge-mcp/55 hover:bg-edge-mcp/6" : "border-border hover:border-edge-mcp/25 hover:bg-muted/40"
          }`}
        >
          <div
            className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0"
            style={{ background: "color-mix(in srgb, var(--edge-mcp) 12%, transparent)", color: MCP_COLOR }}
          >
            <PlugCircle weight="BoldDuotone" width={14} height={14} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-foreground leading-[1.3] truncate">MCP Servers</div>
            <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              {serverCount} servers · {totalCount} tools
              {connectedCount > 0 ? ` · ${connectedCount} on` : ""}
            </div>
          </div>
        </button>
      </Popover>
    </div>
  );
}
