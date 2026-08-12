import PenNewSquare from "@solar-icons/react/messages/PenNewSquare";
import AddCircle from "@solar-icons/react/ui/AddCircle";
import UsersGroupTwoRounded from "@solar-icons/react/users/UsersGroupTwoRounded";
import { Button } from "antd";
import type { AgentListItem } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";
import { AgentCardGrid } from "./AgentCardGrid";
import { AgentsSectionHeader } from "./AgentsSectionHeader";
import { NewAgentDialog } from "./NewAgentDialog";

interface TeamAgentsSectionProps {
  team: TeamWithMembers;
  agents: AgentListItem[];
  onNavigate: (id: string) => void;
  onEditTeam: (team: TeamWithMembers) => void;
}

export function TeamAgentsSection({ team, agents, onNavigate, onEditTeam }: TeamAgentsSectionProps) {
  return (
    <section className="group/team">
      <AgentsSectionHeader
        icon={
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <UsersGroupTwoRounded width={16} height={16} />
          </div>
        }
        title={team.name}
        actions={
          <div className="flex items-center gap-0.5">
            <NewAgentDialog defaultTeamId={team.id}>
              <Button
                type="text"
                size="small"
                className="!px-1.5 opacity-0 transition-opacity duration-150 group-hover/team:opacity-100"
                title="Add agent to team"
                icon={<AddCircle width={15} height={15} />}
              />
            </NewAgentDialog>
            <Button
              type="text"
              size="small"
              onClick={() => onEditTeam(team)}
              className="!px-1.5 opacity-0 transition-opacity duration-150 group-hover/team:opacity-100"
              title="Edit team"
              icon={<PenNewSquare width={15} height={15} />}
            />
          </div>
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
