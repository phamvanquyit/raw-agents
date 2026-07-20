import type { Agent } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";
import { AgentsEmptyState } from "./AgentsEmptyState";
import { TeamAgentsSection } from "./TeamAgentsSection";
import { UngroupedAgentsSection } from "./UngroupedAgentsSection";

interface AgentsBoardProps {
  teams: TeamWithMembers[];
  ungroupedAgents: Agent[];
  teamAgents: Map<string, Agent[]>;
  onNavigate: (id: string) => void;
  onEditTeam: (team: TeamWithMembers) => void;
}

export function AgentsBoard({ teams, ungroupedAgents, teamAgents, onNavigate, onEditTeam }: AgentsBoardProps) {
  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-10">
      {sortedTeams.map((team) => (
        <TeamAgentsSection key={team.id} team={team} agents={teamAgents.get(team.id) ?? []} onNavigate={onNavigate} onEditTeam={onEditTeam} />
      ))}

      <UngroupedAgentsSection agents={ungroupedAgents} onNavigate={onNavigate} />

      <RenderIf condition={teams.length === 0 && ungroupedAgents.length === 0}>
        <AgentsEmptyState />
      </RenderIf>
    </div>
  );
}
