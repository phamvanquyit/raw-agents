import { AltArrowLeft } from "@solar-icons/react";
import { NavLink, useParams } from "react-router-dom";
import type { Agent } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import { TABS } from "../../common/constants";

interface AgentSidebarProps {
  agent: Agent;
  onClose: () => void;
}

export function AgentSidebar({ agent, onClose }: AgentSidebarProps) {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="flex flex-col h-full">
      {/* Back button */}
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-2 px-4 py-3 text-[13px] text-soft font-medium cursor-pointer transition-colors duration-150 hover:text-main hover:bg-surface-raised border-b border-border"
      >
        <AltArrowLeft size={15} />
        <span>Back to Agents</span>
      </button>

      {/* Agent preview zone */}
      <div className="py-5 px-4 border-b border-border">
        <div className="flex flex-col justify-center items-center gap-3 w-full">
          <AppLogo size={120} className="mx-auto" />

          <div className="text-center w-full">
            <div className="text-md font-bold text-primary">{agent.name}</div>
            {agent.aiModel && <div className="text-[10px] text-muted truncate mt-1">{agent.aiModel.split("/").pop()}</div>}
          </div>
        </div>
      </div>

      {/* Nav zone — route-based links */}
      <div className="flex-1 min-h-0 overflow-y-auto py-3 px-3 flex flex-col gap-0.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.id}
              to={`/agents/${id}/${tab.id}`}
              className={({ isActive }) =>
                [
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] transition-all duration-150 cursor-pointer border no-underline",
                  isActive
                    ? "border-border bg-surface-raised text-main font-medium"
                    : "border-transparent text-soft font-normal hover:text-main hover:bg-surface-raised/60",
                ].join(" ")
              }
            >
              <Icon width={15} height={15} className="text-muted" />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
