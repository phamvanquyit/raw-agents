import FaceScanSquare from "@solar-icons/react/faces/FaceScanSquare";
import type { AgentListItem } from "src/common/types";
import { AgentCardGrid } from "./AgentCardGrid";
import { AgentsSectionHeader } from "./AgentsSectionHeader";

interface UngroupedAgentsSectionProps {
  agents: AgentListItem[];
  onNavigate: (id: string) => void;
}

export function UngroupedAgentsSection({ agents, onNavigate }: UngroupedAgentsSectionProps) {
  if (agents.length === 0) return null;

  return (
    <section>
      <AgentsSectionHeader
        icon={
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FaceScanSquare width={16} height={16} />
          </div>
        }
        title="Ungrouped"
      />
      <AgentCardGrid agents={agents} onNavigate={onNavigate} />
    </section>
  );
}
