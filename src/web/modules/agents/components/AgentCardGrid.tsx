import type { Agent } from "src/common/types";
import { AgentCard } from "./AgentCard";

interface AgentCardGridProps {
  agents: Agent[];
  onNavigate: (id: string) => void;
}

export function AgentCardGrid({ agents, onNavigate }: AgentCardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent, index) => (
        <AgentCard key={agent.id} agent={agent} index={index} onOpen={() => onNavigate(agent.id)} />
      ))}
    </div>
  );
}
