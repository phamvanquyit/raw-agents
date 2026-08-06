import { Clipboard, Global, MenuDots, UsersGroupTwoRounded } from "@solar-icons/react";
import { Dropdown, message } from "antd";
import type { MenuProps } from "antd";
import { useMemo, useState } from "react";
import type { Agent, AgentListItem } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { UserAvatar } from "src/components/UserAvatar";
import { cloneAgent, updateAgent } from "src/modules/agents/common/agentsSlice";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

function modelLabel(aiModel: string | null): string {
  if (!aiModel) return "No model";
  return aiModel.split("/").pop() || aiModel;
}

export interface AgentCardProps {
  agent: AgentListItem;
  onOpen: () => void;
}

export function AgentCard({ agent, onOpen }: AgentCardProps) {
  const dispatch = useAppDispatch();
  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];
  const [menuOpen, setMenuOpen] = useState(false);

  const menuItems: MenuProps["items"] = useMemo(() => {
    const teamChildren: NonNullable<MenuProps["items"]> = [...teams]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((team) => ({
        key: team.id,
        label: team.name,
        disabled: agent.teamId === team.id,
        onClick: () => {
          void (async () => {
            try {
              await dispatch(updateAgent({ id: agent.id, teamId: team.id })).unwrap();
              message.success(`Moved "${agent.name}"to ${team.name}`);
            } catch (err: any) {
              message.error(err?.message ?? "Failed to move agent");
            }
          })();
        },
      }));

    const items: NonNullable<MenuProps["items"]> = [];

    if (agent.isPublic) {
      items.push({
        key: "open-public",
        label: (
          <div className="flex items-center gap-2">
            <Global width={14} height={14} />
            Open public chat
          </div>
        ),
        onClick: () => {
          window.open(`/chat/${agent.id}`, "_blank", "noopener,noreferrer");
        },
      });
    }

    items.push(
      {
        key: "clone",
        label: (
          <div className="flex items-center gap-2">
            <Clipboard width={14} height={14} />
            Clone
          </div>
        ),
        onClick: () => {
          void (async () => {
            try {
              const cloned = (await dispatch(cloneAgent(agent.id)).unwrap()) as Agent;
              message.success(`Cloned as "${cloned.name}"`);
            } catch (err: any) {
              message.error(err?.message ?? "Failed to clone agent");
            }
          })();
        },
      },
      {
        key: "move",
        label: (
          <div className="flex items-center gap-2">
            <UsersGroupTwoRounded width={14} height={14} />
            Move to team
          </div>
        ),
        children: teamChildren,
      },
    );

    return items;
  }, [agent.id, agent.isPublic, agent.name, agent.teamId, dispatch, teams]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex min-h-56 flex-col items-center justify-center gap-5 overflow-hidden rounded-2xl border border-border-subtle bg-card px-6 py-10 text-center transition-[border-color,background-color] duration-200 hover:border-brand/35 hover:bg-secondary cursor-pointer"
    >
      <RenderIf condition={agent.isPublic}>
        <span title="Published" className="absolute left-2 top-2 z-10 flex size-7 items-center justify-center rounded-md bg-success/15 text-success">
          <Global width={14} height={14} />
        </span>
      </RenderIf>

      <div className="absolute right-2 top-2 z-10" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Dropdown trigger={["click"]} placement="bottomRight" open={menuOpen} onOpenChange={setMenuOpen} menu={{ items: menuItems, style: { minWidth: 160 } }}>
          <button
            type="button"
            aria-label="Agent actions"
            title="Agent actions"
            className={`flex size-7 items-center justify-center rounded-md border-none bg-transparent text-muted-foreground transition-[opacity,background-color,color] duration-150 cursor-pointer hover:bg-muted hover:text-foreground focus-visible:opacity-100 ${
              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <MenuDots width={15} height={15} weight="Bold" />
          </button>
        </Dropdown>
      </div>

      <div className={`rounded-full p-[3px] transition-colors duration-200 ${agent.isPublic ? "bg-brand/30" : "bg-border group-hover:bg-brand/25"}`}>
        <div className="rounded-full bg-card p-0.5">
          <UserAvatar avatar={agent.avatar} name={agent.name} size={88} />
        </div>
      </div>

      <div className="flex min-w-0 w-full flex-col items-center gap-1.5">
        <span className="w-full truncate text-lg font-semibold text-foreground">{agent.name}</span>
        <span className="truncate font-mono text-sm text-muted-foreground">{modelLabel(agent.aiModel)}</span>
      </div>
    </div>
  );
}
