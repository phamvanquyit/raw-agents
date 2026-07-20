import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AgentTool } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { cn } from "src/lib/utils";

export function ToolCardView({
  tool,
  onClick,
  className,
  style,
  innerRef,
  listeners,
  attributes,
}: {
  tool: AgentTool;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  innerRef?: (node: HTMLElement | null) => void;
  listeners?: React.HTMLAttributes<HTMLDivElement>;
  attributes?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const paramCount = Object.keys((tool.parameters as { properties?: Record<string, unknown> })?.properties ?? {}).length;
  const showInactive = !tool.isActive;

  return (
    <div
      ref={innerRef}
      style={style}
      className={cn(
        "group rounded-xl bg-card px-3 py-2.5 text-left transition-colors duration-150",
        onClick && "cursor-pointer hover:bg-accent hover:shadow-whisper",
        className,
      )}
      onClick={onClick}
      {...listeners}
      {...attributes}
    >
      <p className="m-0 h-[3em] text-[13px] font-medium leading-normal text-foreground line-clamp-2 group-hover:text-primary transition-colors">{tool.label}</p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground tabular-nums font-medium">
          {paramCount > 0 ? `${paramCount} param${paramCount === 1 ? "" : "s"}` : "No params"}
        </span>
        <RenderIf condition={showInactive}>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-card text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-muted" />
            Inactive
          </span>
        </RenderIf>
      </div>
    </div>
  );
}

export function ToolKanbanCard({
  tool,
  onClick,
}: {
  tool: AgentTool;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tool.id,
    data: { type: "tool", toolId: tool.id, folderId: tool.folderId ?? null },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <ToolCardView
      tool={tool}
      onClick={isDragging ? undefined : onClick}
      innerRef={setNodeRef}
      listeners={listeners}
      attributes={attributes}
      style={style}
      className={cn("touch-none cursor-grab active:cursor-grabbing", isDragging && "opacity-40 z-10")}
    />
  );
}
