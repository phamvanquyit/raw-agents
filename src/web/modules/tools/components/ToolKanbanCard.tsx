import { useSortable } from "@dnd-kit/sortable";
import type { AgentTool } from "src/common/types";
import RenderIf from "src/components/ui/RenderIf";
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
      <p className="m-0 h-[2.75em] text-[13px] font-semibold leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
        {tool.label}
      </p>

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

export function DropPlaceholder({ height }: { height: number }) {
  return <div aria-hidden className="shrink-0 rounded-md bg-primary/12 ring-1 ring-inset ring-ring/30 transition-[height] duration-150" style={{ height }} />;
}

export function ToolKanbanCard({
  tool,
  onClick,
}: {
  tool: AgentTool;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: tool.id,
    data: { type: "tool", toolId: tool.id, folderId: tool.folderId ?? null },
    animateLayoutChanges: () => false,
  });

  return (
    <ToolCardView
      tool={tool}
      onClick={isDragging ? undefined : onClick}
      innerRef={setNodeRef}
      listeners={listeners}
      attributes={attributes}
      className={cn("touch-none cursor-grab active:cursor-grabbing", isDragging && "opacity-0 pointer-events-none")}
    />
  );
}
