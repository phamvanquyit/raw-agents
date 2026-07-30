import { AddCircle, UsersGroupTwoRounded } from "@solar-icons/react";
import { Button } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgentListItem } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import { fetchAgents } from "src/modules/agents/common/agentsSlice";
import { AgentsBoard } from "src/modules/agents/components/AgentsBoard";
import { NewAgentDialog } from "src/modules/agents/components/NewAgentDialog";
import { fetchTeams } from "src/modules/teams/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";
import { NewTeamDialog } from "src/modules/teams/components/NewTeamDialog";
import { TeamDialog } from "src/modules/teams/components/TeamDialog";
import { useAppDispatch, useAppSelector } from "src/store/store";

export default function AgentsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const agents = useAppSelector((s) => s.agents.items) as AgentListItem[];
  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];

  const [editingTeam, setEditingTeam] = useState<TeamWithMembers | null>(null);

  useEffect(() => {
    dispatch(fetchAgents());
    dispatch(fetchTeams());
  }, [dispatch]);

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    });
  }, [agents]);

  const { teamAgents, ungroupedAgents } = useMemo(() => {
    const teamMap = new Map<string, AgentListItem[]>();
    for (const team of teams) {
      teamMap.set(team.id, []);
    }

    const ungrouped: AgentListItem[] = [];

    for (const agent of sortedAgents) {
      if (agent.teamId && teamMap.has(agent.teamId)) {
        teamMap.get(agent.teamId)?.push(agent);
      } else {
        ungrouped.push(agent);
      }
    }

    return { teamAgents: teamMap, ungroupedAgents: ungrouped };
  }, [sortedAgents, teams]);

  const handleNavigate = (id: string) => {
    navigate(`/agents/${id}`);
  };

  const handleOpenEditTeam = (team: TeamWithMembers) => {
    setEditingTeam(team);
  };

  const handleCloseTeamDialog = () => {
    setEditingTeam(null);
  };

  return (
    <>
      <PageShell>
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Agents</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Organize agents by team</p>
          </div>
          <div className="flex items-center gap-2">
            <NewTeamDialog>
              <Button type="default" icon={<UsersGroupTwoRounded width={16} height={16} />}>
                New Team
              </Button>
            </NewTeamDialog>
            <NewAgentDialog>
              <Button type="primary" icon={<AddCircle width={16} height={16} />}>
                New Agent
              </Button>
            </NewAgentDialog>
          </div>
        </div>

        <AgentsBoard teams={teams} ungroupedAgents={ungroupedAgents} teamAgents={teamAgents} onNavigate={handleNavigate} onEditTeam={handleOpenEditTeam} />
      </PageShell>

      <TeamDialog open={!!editingTeam} onClose={handleCloseTeamDialog} team={editingTeam} />
    </>
  );
}
