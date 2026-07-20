import { Global } from "@solar-icons/react";
import type { Agent } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { UserAvatar } from "src/components/UserAvatar";

function modelLabel(aiModel: string | null): string {
  if (!aiModel) return "No model";
  return aiModel.split("/").pop() || aiModel;
}

export interface AgentCardProps {
  agent: Agent;
  onOpen: () => void;
  index?: number;
}

export function AgentCard({ agent, onOpen, index = 0 }: AgentCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ animationDelay: `${index * 40}ms` }}
      className="group relative flex min-h-56 flex-col items-center justify-center gap-5 overflow-hidden rounded-2xl border border-border-subtle bg-card px-6 py-10 text-center transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-brand/35 hover:bg-secondary cursor-pointer motion-safe:animate-[fadeIn_0.35s_ease-out_both]"
    >
      <RenderIf condition={agent.isPublic}>
        <span title="Published" className="absolute right-3 top-3 z-10 flex size-7 items-center justify-center rounded-md bg-success/15 text-success">
          <Global width={14} height={14} />
        </span>
      </RenderIf>

      <div className={`rounded-full p-[3px] transition-colors duration-200 ${agent.isPublic ? "bg-brand/30" : "bg-border group-hover:bg-brand/25"}`}>
        <div className="rounded-full bg-card p-0.5">
          <UserAvatar avatar={agent.avatar} name={agent.name} size={88} />
        </div>
      </div>

      <div className="flex min-w-0 w-full flex-col items-center gap-1.5">
        <span className="w-full truncate text-lg font-semibold text-foreground">{agent.name}</span>
        <span className="truncate font-mono text-sm text-muted-foreground">{modelLabel(agent.aiModel)}</span>
      </div>
    </button>
  );
}
