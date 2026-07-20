import type { Agent } from "src/common/types";
import AgentCard from "./AgentCard";

export interface AgentGroupProps {
  title: string;
  agents: Agent[];
  onNavigate: (id: string) => void;
}

export default function AgentGroup({ title, agents, onNavigate }: AgentGroupProps) {
  return (
    <div className="">
      {/* Group header */}
      <div className="flex items-center gap-2.5 mb-3">
        <h2 className="font-semibold text-foreground m-0">{title}</h2>
        <span className="text-sm font-semibold py-px px-2 rounded-[10px] bg-muted text-muted-foreground">{agents.length}</span>
      </div>

      {/* Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}
