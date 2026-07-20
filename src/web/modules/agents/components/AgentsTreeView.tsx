import { AddCircle, AltArrowRight, FaceScanSquare, PenNewSquare, UsersGroupTwoRounded } from "@solar-icons/react";
import type { Agent } from "src/common/types";
import { UserAvatar } from "src/components/UserAvatar";
import RenderIf from "src/components/ui/RenderIf";
import { DeleteConfirmButton } from "src/components/ui/alert-dialog";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { NewAgentPopover } from "src/modules/agents/components/NewAgentDialog";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";

interface AgentsTreeViewProps {
  teams: TeamWithMembers[];
  ungroupedAgents: Agent[];
  teamAgents: Map<string, Agent[]>;
  onNavigate: (id: string) => void;
  onEditTeam: (team: TeamWithMembers) => void;
  onDeleteTeam: (id: string) => void;
}

const LINE = "bg-tertiary-foreground/70";

function TreeRail({ isLast }: { isLast: boolean }) {
  return (
    <div className="relative w-7 shrink-0 self-stretch" aria-hidden>
      <div className={`absolute left-1/2 w-0.5 -translate-x-1/2 ${LINE}`} style={isLast ? { top: 0, height: "50%" } : { top: 0, bottom: -1 }} />
      <div className={`absolute top-1/2 right-0 left-1/2 h-0.5 -translate-y-1/2 ${LINE}`} />
    </div>
  );
}

function AgentTreeRow({ agent, onNavigate }: { agent: Agent; onNavigate: (id: string) => void }) {
  const modelName = agent.aiModel ? agent.aiModel.split("/").pop() : null;

  return (
    <button
      type="button"
      onClick={() => onNavigate(agent.id)}
      className="group flex w-full items-center gap-3 rounded-md py-2.5 pr-3 text-left transition-colors duration-150 hover:bg-muted/50 cursor-pointer"
    >
      <UserAvatar avatar={agent.avatar} name={agent.name} size={28} className="shrink-0" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground">{agent.name}</span>
        <RenderIf condition={agent.isPublic}>
          <Badge variant="secondary" className="rounded-md px-1.5 text-[10px] text-success">
            Published
          </Badge>
        </RenderIf>
      </div>
      <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:block max-w-[180px] text-right">{modelName ?? "—"}</span>
      <AltArrowRight width={14} height={14} className="shrink-0 text-quaternary-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
    </button>
  );
}

function TreeNodeHeader({
  icon,
  title,
  count,
  description,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  description?: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <div className="group flex items-stretch">
      <div className="flex w-7 shrink-0 flex-col items-center">
        <div className="flex size-7 shrink-0 items-center justify-center">{icon}</div>
        <div className={`w-0.5 min-h-0 flex-1 ${LINE}`} aria-hidden />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 py-0.5 pl-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{title}</span>
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">{count}</span>
          </div>
          <RenderIf condition={!!description}>
            <span className="truncate text-xs text-muted-foreground">{description}</span>
          </RenderIf>
        </div>
        {actions}
      </div>
    </div>
  );
}

function TreeChildren({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

function TreeChild({ isLast, children }: { isLast: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-stretch">
      <TreeRail isLast={isLast} />
      <div className="min-w-0 flex-1 pl-3">{children}</div>
    </div>
  );
}

function TeamTreeNode({
  team,
  agents,
  onNavigate,
  onEditTeam,
  onDeleteTeam,
}: {
  team: TeamWithMembers;
  agents: Agent[];
  onNavigate: (id: string) => void;
  onEditTeam: (team: TeamWithMembers) => void;
  onDeleteTeam: (id: string) => void;
}) {
  const rows = agents.length > 0 ? agents : [null];

  return (
    <section>
      <TreeNodeHeader
        icon={
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <UsersGroupTwoRounded width={15} height={15} />
          </div>
        }
        title={team.name}
        count={agents.length}
        description={team.description}
        actions={
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <NewAgentPopover defaultTeamId={team.id}>
              <Button variant="ghost" size="sm" className="!px-1.5" title="Add agent to team">
                <AddCircle width={15} height={15} />
              </Button>
            </NewAgentPopover>
            <Button variant="ghost" size="sm" onClick={() => onEditTeam(team)} className="!px-1.5" title="Edit team">
              <PenNewSquare width={15} height={15} />
            </Button>
            <DeleteConfirmButton
              label="Delete team?"
              description={`Delete "${team.name}"? Agents in this team will be unlinked.`}
              onConfirm={() => onDeleteTeam(team.id)}
              size="sm"
            />
          </div>
        }
      />

      <TreeChildren>
        {rows.map((agent, index) => (
          <TreeChild key={agent?.id ?? "empty"} isLast={index === rows.length - 1}>
            {agent ? (
              <AgentTreeRow agent={agent} onNavigate={onNavigate} />
            ) : (
              <p className="py-2.5 text-xs text-muted-foreground">No agents in this team yet</p>
            )}
          </TreeChild>
        ))}
      </TreeChildren>
    </section>
  );
}

function UngroupedSection({ agents, onNavigate }: { agents: Agent[]; onNavigate: (id: string) => void }) {
  if (agents.length === 0) return null;

  return (
    <section>
      <TreeNodeHeader
        icon={
          <div className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <FaceScanSquare width={15} height={15} />
          </div>
        }
        title="Ungrouped"
        count={agents.length}
      />

      <TreeChildren>
        {agents.map((agent, index) => (
          <TreeChild key={agent.id} isLast={index === agents.length - 1}>
            <AgentTreeRow agent={agent} onNavigate={onNavigate} />
          </TreeChild>
        ))}
      </TreeChildren>
    </section>
  );
}

export default function AgentsTreeView({ teams, ungroupedAgents, teamAgents, onNavigate, onEditTeam, onDeleteTeam }: AgentsTreeViewProps) {
  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-12">
      {sortedTeams.map((team) => (
        <TeamTreeNode
          key={team.id}
          team={team}
          agents={teamAgents.get(team.id) ?? []}
          onNavigate={onNavigate}
          onEditTeam={onEditTeam}
          onDeleteTeam={onDeleteTeam}
        />
      ))}

      <UngroupedSection agents={ungroupedAgents} onNavigate={onNavigate} />

      <RenderIf condition={teams.length === 0 && ungroupedAgents.length === 0}>
        <div className="flex flex-col items-center justify-center rounded-md border border-border/60 px-5 py-16">
          <div className="mb-4 flex size-14 items-center justify-center rounded-md bg-muted">
            <FaceScanSquare width={24} height={24} className="text-muted-foreground" />
          </div>
          <p className="mb-1 text-sm font-semibold text-foreground">No agents yet</p>
          <p className="text-xs text-muted-foreground">Create a team or agent to get started.</p>
        </div>
      </RenderIf>
    </div>
  );
}
