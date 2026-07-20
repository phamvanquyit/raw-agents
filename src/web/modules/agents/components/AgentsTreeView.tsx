import { FaceScanSquare, PenNewSquare, UsersGroupTwoRounded } from "@solar-icons/react";
import { Button } from "antd";
import type { Agent } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";
import AgentProfileCard from "./AgentProfileCard";

interface AgentsTreeViewProps {
  teams: TeamWithMembers[];
  ungroupedAgents: Agent[];
  teamAgents: Map<string, Agent[]>;
  onNavigate: (id: string) => void;
  onEditTeam: (team: TeamWithMembers) => void;
}

function AgentCardGrid({ agents, onNavigate }: { agents: Agent[]; onNavigate: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent, index) => (
        <AgentProfileCard key={agent.id} agent={agent} index={index} onOpen={() => onNavigate(agent.id)} />
      ))}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="shrink-0">{icon}</div>
        <h2 className="m-0 truncate text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {actions}
    </div>
  );
}

function TeamSection({
  team,
  agents,
  onNavigate,
  onEditTeam,
}: {
  team: TeamWithMembers;
  agents: Agent[];
  onNavigate: (id: string) => void;
  onEditTeam: (team: TeamWithMembers) => void;
}) {
  return (
    <section className="group/team">
      <SectionHeader
        icon={
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <UsersGroupTwoRounded width={16} height={16} />
          </div>
        }
        title={team.name}
        actions={
          <Button
            type="text"
            size="small"
            onClick={() => onEditTeam(team)}
            className="!px-1.5 opacity-0 transition-opacity duration-150 group-hover/team:opacity-100"
            title="Edit team"
            icon={<PenNewSquare width={15} height={15} />}
          />
        }
      />

      <RenderIf
        condition={agents.length > 0}
        fallback={
          <p className="m-0 rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No agents in this team yet</p>
        }
      >
        <AgentCardGrid agents={agents} onNavigate={onNavigate} />
      </RenderIf>
    </section>
  );
}

function UngroupedSection({ agents, onNavigate }: { agents: Agent[]; onNavigate: (id: string) => void }) {
  if (agents.length === 0) return null;

  return (
    <section>
      <SectionHeader
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

export default function AgentsTreeView({ teams, ungroupedAgents, teamAgents, onNavigate, onEditTeam }: AgentsTreeViewProps) {
  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-10">
      {sortedTeams.map((team) => (
        <TeamSection key={team.id} team={team} agents={teamAgents.get(team.id) ?? []} onNavigate={onNavigate} onEditTeam={onEditTeam} />
      ))}

      <UngroupedSection agents={ungroupedAgents} onNavigate={onNavigate} />

      <RenderIf condition={teams.length === 0 && ungroupedAgents.length === 0}>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-5 py-16">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent text-brand-soft">
            <FaceScanSquare width={28} height={28} />
          </div>
          <p className="mb-1 text-base font-semibold text-foreground">No agents yet</p>
          <p className="m-0 text-sm text-muted-foreground">Create a team or agent to get started.</p>
        </div>
      </RenderIf>
    </div>
  );
}
