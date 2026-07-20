import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  PointerSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useRef, useState } from "react";
import type { AgentTool } from "src/common/types";
import { toast } from "src/components/ui/toast";
import { useAppDispatch } from "src/store/store";
import type { ToolFolderWithTools } from "../common/toolFoldersSlice";
import { fetchToolFolders, reorderToolFolders, reorderToolFoldersLocal } from "../common/toolFoldersSlice";
import { updateTool, upsertToolLocal } from "../common/toolsSlice";
import { ToolCardView } from "./ToolKanbanCard";
import { AddFolderButton, SortableToolKanbanColumn, ToolKanbanColumn, UNGROUPED_COLUMN_ID } from "./ToolKanbanColumn";

interface ToolsKanbanBoardProps {
  tools: AgentTool[];
  folders: ToolFolderWithTools[];
  onToolClick: (toolId: string) => void;
  onToolCreated: (toolId: string) => void;
  onEditFolder: (folder: ToolFolderWithTools) => void;
  onDeleteFolder: (folderId: string) => void;
}

type DropTarget = {
  folderId: string | null;
  index: number;
};

const collisionDetection: CollisionDetection = (args) => {
  const activeType = args.active.data.current?.type;
  if (activeType === "folder") {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === "folder"),
    });
  }

  if (activeType === "tool") {
    const toolContainers = args.droppableContainers.filter((c) => {
      const type = c.data.current?.type;
      return type === "tool" || type === "column" || type === "folder";
    });
    const pointerHits = pointerWithin({ ...args, droppableContainers: toolContainers });
    if (pointerHits.length > 0) {
      const toolHit = pointerHits.find((hit) => {
        const container = toolContainers.find((c) => c.id === hit.id);
        return container?.data.current?.type === "tool";
      });
      if (toolHit) return [toolHit];
      return pointerHits;
    }
    return closestCenter({ ...args, droppableContainers: toolContainers });
  }

  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  return closestCenter(args);
};

const toolDropAnimation: DropAnimation = {
  duration: 180,
  easing: "ease",
  keyframes({ transform }) {
    return [
      { opacity: 1, transform: CSS.Transform.toString(transform.initial) },
      { opacity: 0, transform: CSS.Transform.toString(transform.initial) },
    ];
  },
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0",
      },
    },
  }),
};

export function ToolsKanbanBoard({ tools, folders, onToolClick, onToolCreated, onEditFolder, onDeleteFolder }: ToolsKanbanBoardProps) {
  const dispatch = useAppDispatch();
  const [activeTool, setActiveTool] = useState<AgentTool | null>(null);
  const [activeFolder, setActiveFolder] = useState<ToolFolderWithTools | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [placeholderHeight, setPlaceholderHeight] = useState(88);
  const didDragRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const columns = useMemo(() => {
    const customTools = tools.filter((t) => !t.id.startsWith("builtin:"));
    const sortedFolders = [...folders].sort((a, b) => {
      const byOrder = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (byOrder !== 0) return byOrder;
      return a.name.localeCompare(b.name);
    });
    const folderIds = new Set(sortedFolders.map((f) => f.id));

    const byFolder = new Map<string, AgentTool[]>();
    for (const folder of sortedFolders) {
      byFolder.set(folder.id, []);
    }
    const ungrouped: AgentTool[] = [];

    for (const tool of customTools) {
      if (tool.folderId && folderIds.has(tool.folderId)) {
        byFolder.get(tool.folderId)?.push(tool);
      } else {
        ungrouped.push(tool);
      }
    }

    for (const list of byFolder.values()) {
      list.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
    }
    ungrouped.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));

    return {
      folders: sortedFolders.map((folder) => ({
        folder,
        tools: byFolder.get(folder.id) ?? [],
      })),
      ungrouped,
    };
  }, [tools, folders]);

  const folderIds = useMemo(() => columns.folders.map(({ folder }) => folder.id), [columns.folders]);

  const displayColumns = useMemo(() => {
    if (!activeTool) return columns;
    const withoutActive = (list: AgentTool[]) => list.filter((t) => t.id !== activeTool.id);
    return {
      folders: columns.folders.map(({ folder, tools: folderTools }) => ({
        folder,
        tools: withoutActive(folderTools),
      })),
      ungrouped: withoutActive(columns.ungrouped),
    };
  }, [columns, activeTool]);

  const toolsByFolderId = useMemo(() => {
    const map = new Map<string | null, AgentTool[]>();
    map.set(null, displayColumns.ungrouped);
    for (const { folder, tools: folderTools } of displayColumns.folders) {
      map.set(folder.id, folderTools);
    }
    return map;
  }, [displayColumns]);

  const resolveTargetFolderId = (overId: string): string | null | undefined => {
    if (overId === UNGROUPED_COLUMN_ID) return null;
    if (folders.some((f) => f.id === overId)) return overId;
    const overTool = tools.find((t) => t.id === overId);
    if (!overTool || overTool.id.startsWith("builtin:")) return undefined;
    return overTool.folderId ?? null;
  };

  const resolveDropTarget = (overId: string, activeId: string, overRect: { top: number; height: number }, activeCenterY: number | null): DropTarget | null => {
    if (overId === activeId) return null;

    if (overId === UNGROUPED_COLUMN_ID) {
      return { folderId: null, index: toolsByFolderId.get(null)?.length ?? 0 };
    }

    if (folders.some((f) => f.id === overId)) {
      return { folderId: overId, index: toolsByFolderId.get(overId)?.length ?? 0 };
    }

    const overTool = tools.find((t) => t.id === overId);
    if (!overTool || overTool.id.startsWith("builtin:")) return null;

    const folderId = overTool.folderId ?? null;
    const list = toolsByFolderId.get(folderId) ?? [];
    const idx = list.findIndex((t) => t.id === overId);
    if (idx < 0) return { folderId, index: list.length };

    if (activeCenterY == null) return { folderId, index: idx };
    const mid = overRect.top + overRect.height / 2;
    return { folderId, index: activeCenterY < mid ? idx : idx + 1 };
  };

  const handleDragStart = (event: DragStartEvent) => {
    const type = event.active.data.current?.type;
    if (type === "folder") {
      const folder = folders.find((f) => f.id === event.active.id) ?? null;
      setActiveFolder(folder);
      setActiveTool(null);
      setDropTarget(null);
      didDragRef.current = true;
      return;
    }

    const tool = tools.find((t) => t.id === event.active.id);
    if (!tool || tool.id.startsWith("builtin:")) return;
    didDragRef.current = true;
    setActiveTool(tool);
    setActiveFolder(null);
    const initial = event.active.rect.current.initial;
    setPlaceholderHeight(initial?.height ? Math.round(initial.height) : 88);

    const sourceFolderId = tool.folderId ?? null;
    const sourceList = (sourceFolderId == null ? columns.ungrouped : columns.folders.find((c) => c.folder.id === sourceFolderId)?.tools) ?? [];
    const sourceIndex = sourceList.findIndex((t) => t.id === tool.id);
    setDropTarget({
      folderId: sourceFolderId,
      index: Math.max(0, sourceIndex),
    });
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (active.data.current?.type !== "tool") return;
    if (!over) {
      setDropTarget(null);
      return;
    }

    const translated = active.rect.current.translated;
    const activeCenterY = translated ? translated.top + translated.height / 2 : null;
    const next = resolveDropTarget(String(over.id), String(active.id), over.rect, activeCenterY);
    if (!next) return;
    setDropTarget((prev) => {
      if (prev && prev.folderId === next.folderId && prev.index === next.index) return prev;
      return next;
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeType = active.data.current?.type;
    const currentDrop = dropTarget;
    setActiveTool(null);
    setActiveFolder(null);
    setDropTarget(null);

    if (!over) return;

    if (activeType === "folder") {
      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) return;
      if (!folderIds.includes(overId)) return;

      const oldIndex = folderIds.indexOf(activeId);
      const newIndex = folderIds.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

      const nextIds = arrayMove(folderIds, oldIndex, newIndex);
      dispatch(reorderToolFoldersLocal(nextIds));
      try {
        await dispatch(reorderToolFolders(nextIds)).unwrap();
      } catch {
        toast.error("Failed to reorder folders");
        dispatch(fetchToolFolders());
      }
      return;
    }

    const toolId = String(active.id);
    if (toolId.startsWith("builtin:")) return;

    const tool = tools.find((t) => t.id === toolId);
    if (!tool) return;

    const targetFolderId = currentDrop?.folderId ?? resolveTargetFolderId(String(over.id));
    if (targetFolderId === undefined) return;

    const currentFolderId = tool.folderId ?? null;
    if (currentFolderId === targetFolderId) return;

    dispatch(upsertToolLocal({ ...tool, folderId: targetFolderId }));
    try {
      await dispatch(updateTool({ id: toolId, folderId: targetFolderId })).unwrap();
    } catch {
      dispatch(upsertToolLocal({ ...tool, folderId: currentFolderId }));
      toast.error("Failed to move tool");
    }
  };

  const handleDragCancel = () => {
    setActiveTool(null);
    setActiveFolder(null);
    setDropTarget(null);
  };

  const handleToolClick = (toolId: string) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    onToolClick(toolId);
  };

  const showUngrouped = displayColumns.ungrouped.length > 0 || activeTool?.folderId === null || dropTarget?.folderId === null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="h-full flex gap-3 overflow-x-auto overflow-y-hidden px-8 pb-6 items-start [scrollbar-width:auto] [scrollbar-color:var(--color-scrollbar-thumb)_transparent] [&::-webkit-scrollbar]:h-2.5">
        {showUngrouped ? (
          <ToolKanbanColumn
            id={UNGROUPED_COLUMN_ID}
            title="Ungrouped"
            tools={displayColumns.ungrouped}
            folderId={null}
            onToolClick={handleToolClick}
            onToolCreated={onToolCreated}
            tone="ungrouped"
            placeholderIndex={dropTarget?.folderId === null ? dropTarget.index : null}
            placeholderHeight={placeholderHeight}
          />
        ) : null}
        <SortableContext items={folderIds} strategy={horizontalListSortingStrategy}>
          {displayColumns.folders.map(({ folder, tools: folderTools }) => (
            <SortableToolKanbanColumn
              key={folder.id}
              id={folder.id}
              title={folder.name}
              tools={folderTools}
              folderId={folder.id}
              onToolClick={handleToolClick}
              onToolCreated={onToolCreated}
              onEdit={() => onEditFolder(folder)}
              onDelete={() => onDeleteFolder(folder.id)}
              placeholderIndex={dropTarget?.folderId === folder.id ? dropTarget.index : null}
              placeholderHeight={placeholderHeight}
            />
          ))}
        </SortableContext>
        <AddFolderButton />
      </div>

      <DragOverlay dropAnimation={activeTool ? toolDropAnimation : null}>
        {activeTool ? (
          <div className="w-[276px] cursor-grabbing">
            <div className="rotate-[2.5deg] scale-[1.04] origin-center" style={{ filter: "drop-shadow(0 16px 32px rgba(0,0,0,0.5))" }}>
              <ToolCardView tool={activeTool} className="shadow-none ring-1 ring-[rgba(244,241,234,0.14)]" />
            </div>
          </div>
        ) : null}
        {activeFolder ? (
          <div className="w-[300px] rotate-1 rounded-md bg-muted px-3 py-3 shadow-drop ring-1 ring-ring/35">
            <p className="m-0 text-[13px] font-semibold text-muted-foreground truncate">{activeFolder.name}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
