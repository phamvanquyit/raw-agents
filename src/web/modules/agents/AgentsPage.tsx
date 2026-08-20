import AddCircle from "@solar-icons/react/ui/AddCircle";
import UsersGroupTwoRounded from "@solar-icons/react/users/UsersGroupTwoRounded";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgentListItem } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import { RawButton } from "src/components/RawButton";
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
              <RawButton type="default" icon={<UsersGroupTwoRounded width={16} height={16} />}>
                New Team
              </RawButton>
            </NewTeamDialog>
            <NewAgentDialog>
              <RawButton type="primary" icon={<AddCircle width={16} height={16} />}>
                New Agent
              </RawButton>
            </NewAgentDialog>
          </div>
        </div>

        <AgentsBoard teams={teams} agents={agents} onNavigate={handleNavigate} onEditTeam={handleOpenEditTeam} />
      </PageShell>

      <TeamDialog open={!!editingTeam} onClose={handleCloseTeamDialog} team={editingTeam} />
    </>
  );
}
