import { AddCircle, UsersGroupTwoRounded } from "@solar-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import { Button } from "src/components/ui/button";
import { toast } from "src/components/ui/toast";
import { fetchAgents } from "src/modules/agents/common/agentsSlice";
import AgentsTreeView from "src/modules/agents/components/AgentsTreeView";
import { NewAgentPopover } from "src/modules/agents/components/NewAgentDialog";
import { deleteTeam, fetchTeams } from "src/modules/teams/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";
import { TeamDialog } from "src/modules/teams/components/TeamDialog";
import { useAppDispatch, useAppSelector } from "src/store/store";

export default function AgentsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const agents = useAppSelector((s) => s.agents.items) as Agent[];
  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];

  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
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
    const teamMap = new Map<string, Agent[]>();
    for (const team of teams) {
      teamMap.set(team.id, []);
    }

    const ungrouped: Agent[] = [];

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

  const handleOpenCreateTeam = () => {
    setEditingTeam(null);
    setTeamDialogOpen(true);
  };

  const handleOpenEditTeam = (team: TeamWithMembers) => {
    setEditingTeam(team);
    setTeamDialogOpen(true);
  };

  const handleCloseTeamDialog = () => {
    setTeamDialogOpen(false);
    setEditingTeam(null);
  };

  const handleDeleteTeam = async (id: string) => {
    try {
      await dispatch(deleteTeam(id)).unwrap();
      toast.success("Team deleted");
    } catch {
      toast.error("Failed to delete team");
    }
  };

  return (
    <>
      <PageShell>
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Agents</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Organize agents by team
              <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {agents.length} agents · {teams.length} teams
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="md" icon={<UsersGroupTwoRounded width={16} height={16} />} onClick={handleOpenCreateTeam}>
              New Team
            </Button>
            <NewAgentPopover>
              <Button variant="primary" size="md" icon={<AddCircle width={16} height={16} />}>
                New Agent
              </Button>
            </NewAgentPopover>
          </div>
        </div>

        <AgentsTreeView
          teams={teams}
          ungroupedAgents={ungroupedAgents}
          teamAgents={teamAgents}
          onNavigate={handleNavigate}
          onEditTeam={handleOpenEditTeam}
          onDeleteTeam={handleDeleteTeam}
        />
      </PageShell>

      <TeamDialog open={teamDialogOpen} onClose={handleCloseTeamDialog} team={editingTeam} />
    </>
  );
}
