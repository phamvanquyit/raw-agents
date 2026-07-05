import type { Agent } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import RenderIf from "src/components/ui/RenderIf";

export interface AgentCardProps {
  agent: Agent;
  onNavigate: (id: string) => void;
}

export default function AgentCard({ agent, onNavigate }: AgentCardProps) {
  const modelName = agent.aiModel ? agent.aiModel.split("/").pop() : null;
  const toolCount = agent.toolCount ?? 0;

  return (
    <div
      className="group relative bg-surface border border-border rounded-xl p-4 cursor-pointer transition-all duration-200 hover:border-primary-200 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
      onClick={() => onNavigate(agent.id)}
    >
      {/* Icon + Name (centered) */}
      <div className="flex flex-col items-center gap-2 mb-3">
        <div className="pt-2">
          <AppLogo size={56} />
        </div>
        <span className="text-base font-semibold text-main truncate max-w-full text-center">{agent.name}</span>
      </div>

      {/* Description */}
      <RenderIf condition={!!agent.description}>
        <p className="text-xs text-muted leading-snug line-clamp-2 m-0 mb-5 text-center">{agent.description}</p>
      </RenderIf>

      <RenderIf condition={!agent.description}>
        <p className="text-xs text-muted italic m-0 mb-5 text-center">No description</p>
      </RenderIf>

      {/* Meta info — label:value rows */}
      <div className="flex flex-col gap-3 pt-5 border-t border-border">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted shrink-0">Model</span>
          <RenderIf condition={!!modelName} fallback={<span className="text-xs text-muted italic">—</span>}>
            <span className="text-xs font-medium text-muted truncate">{modelName}</span>
          </RenderIf>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted shrink-0">Tools</span>
          <span className="text-xs text-muted">
            {toolCount} {toolCount === 1 ? "tool" : "tools"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted shrink-0">Visibility</span>
          {agent.isPublic ? <span className="text-xs font-medium text-[#4a6e34]">Published</span> : <span className="text-xs text-muted">Private</span>}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted shrink-0">Creator</span>
          <span className="text-xs text-muted truncate">{agent?.creatorName || "-"}</span>
        </div>
      </div>
    </div>
  );
}
