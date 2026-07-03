// ─── Call Agent Group Node ────────────────────────────────────────────────────
// Special node that groups the "call_agent" tool with all callable agents.
// Connected agents are listed inside the box; unconnected are dimmed and clickable.
// Has a left handle to connect to the central agent config node as a tool assignment.

import { Bolt } from "@solar-icons/react";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { AppLogo } from "src/components/AppLogo";

export type CallAgentGroupAgentItem = {
  id: string;
  name: string;
  isConnected: boolean;
};

export type CallAgentGroupNodeData = {
  isAssigned: boolean; // whether call_agent tool is assigned to the current agent
  agents: CallAgentGroupAgentItem[];
  connectedCount: number;
  onToggleAgent: (agentId: string, connect: boolean) => void;
};

export type CallAgentGroupNodeType = Node<CallAgentGroupNodeData, "callAgentGroup">;

export function CallAgentGroupNode({ data }: NodeProps<CallAgentGroupNodeType>) {
  const connected = data.agents.filter((a) => a.isConnected);
  const available = data.agents.filter((a) => !a.isConnected);

  return (
    <div
      className={`relative rounded-lg border bg-surface min-w-[180px] transition-all duration-200 ${
        data.isAssigned ? "border-[#9c9af2]/25 shadow-[0_0_20px_rgba(156,154,242,0.06)]" : "border-border opacity-50"
      }`}
    >
      {/* Handle — left side (connects to the central agent node as tool assignment) */}
      <Handle
        type="source"
        position={Position.Left}
        className="!w-2 !h-2 !bg-surface-raised !border-2 !border-white/20 transition-all duration-150 hover:!bg-[#9c9af2] hover:!border-[#9c9af2] hover:!w-3 hover:!h-3"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/6">
        <div className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0 bg-[rgba(156,154,242,0.12)]">
          <Bolt width={14} height={14} style={{ color: "#9c9af2" }} />
        </div>
        <span className="text-xs font-semibold text-main">Call Agent</span>
        {data.connectedCount > 0 && <span className="text-[10px] text-muted ml-auto tabular-nums">{data.connectedCount}</span>}
      </div>

      {/* Connected agents */}
      {connected.length > 0 && (
        <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
          {connected.map((ag) => (
            <div key={ag.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md group hover:bg-white/4 transition-colors">
              <AppLogo size={13} fill="#9c9af2" strokeWidth={1} />
              <span className="text-2xs font-medium text-main flex-1 whitespace-nowrap">{ag.name}</span>
              <button
                type="button"
                onClick={() => data.onToggleAgent(ag.id, false)}
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition-all text-sm leading-none cursor-pointer bg-transparent border-none p-0 font-[inherit]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Available (unconnected) agents */}
      {available.length > 0 && (
        <div className={`flex flex-col gap-0.5 px-1.5 py-1.5 ${connected.length > 0 ? "border-t border-white/4" : ""}`}>
          {available.map((ag) => (
            <button
              key={ag.id}
              type="button"
              className="flex items-center gap-2 px-2 py-1.5 rounded-md opacity-30 hover:opacity-65 cursor-pointer transition-all bg-transparent border-none font-[inherit] text-left w-full"
              onClick={() => data.onToggleAgent(ag.id, true)}
            >
              <AppLogo size={13} fill="#8b8d94" strokeWidth={1} />
              <span className="text-2xs font-medium text-soft flex-1 whitespace-nowrap">{ag.name}</span>
              <span className="text-[10px] text-muted leading-none">+</span>
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {data.agents.length === 0 && <div className="px-3 py-3 text-2xs text-muted text-center">No agents available</div>}
    </div>
  );
}
