import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  type UniqueIdentifier,
  closestCenter,
  closestCorners,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { message } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentTool } from "src/common/types";
import { useAppDispatch } from "src/store/store";
import type { ToolFolderWithTools } from "../common/toolFoldersSlice";
import { fetchToolFolders, reorderToolFolders, reorderToolFoldersLocal } from "../common/toolFoldersSlice";
import { fetchTools, reorderTools, reorderToolsLocal } from "../common/toolsSlice";
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

type Items = Record<string, string[]>;

function sortFolders(folders: ToolFolderWithTools[]) {
  return [...folders].sort((a, b) => {
    const byOrder = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (byOrder !== 0) return byOrder;
    return a.name.localeCompare(b.name);
  });
}

function buildItems(tools: AgentTool[], folders: ToolFolderWithTools[]): Items {
  const sortedFolders = sortFolders(folders);
  const folderIds = new Set(sortedFolders.map((f) => f.id));
  const bySortOrder = (ids: string[], byId: Map<string, AgentTool>) =>
    [...ids].sort((a, b) => {
      const byOrder = (byId.get(a)?.sortOrder ?? 0) - (byId.get(b)?.sortOrder ?? 0);
      if (byOrder !== 0) return byOrder;
      return (byId.get(a)?.label ?? "").localeCompare(byId.get(b)?.label ?? "");
    });

  const customTools = tools.filter((t) => !t.id.startsWith("builtin:"));
  const byId = new Map(customTools.map((t) => [t.id, t]));

  const items: Items = { [UNGROUPED_COLUMN_ID]: [] };
  for (const folder of sortedFolders) {
    items[folder.id] = [];
  }

  for (const tool of customTools) {
    if (tool.folderId && folderIds.has(tool.folderId)) {
      items[tool.folderId].push(tool.id);
    } else {
      items[UNGROUPED_COLUMN_ID].push(tool.id);
    }
  }

  for (const key of Object.keys(items)) {
    items[key] = bySortOrder(items[key], byId);
  }
  return items;
}

function sameOrder(a: string[] = [], b: string[] = []) {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

function containerToFolderId(containerId: string): string | null {
  return containerId === UNGROUPED_COLUMN_ID ? null : containerId;
}

export function ToolsKanbanBoard({ tools, folders, onToolClick, onToolCreated, onEditFolder, onDeleteFolder }: ToolsKanbanBoardProps) {
  const dispatch = useAppDispatch();
  const [items, setItems] = useState<Items>(() => buildItems(tools, folders));
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<ToolFolderWithTools | null>(null);
  const didDragRef = useRef(false);
  const isDraggingRef = useRef(false);
  const clonedItemsRef = useRef<Items | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  const toolsById = useMemo(() => {
    const map = new Map<string, AgentTool>();
    for (const tool of tools) {
      if (!tool.id.startsWith("builtin:")) map.set(tool.id, tool);
    }
    return map;
  }, [tools]);

  const sortedFolders = useMemo(() => sortFolders(folders), [folders]);
  const folderIds = useMemo(() => sortedFolders.map((f) => f.id), [sortedFolders]);

  useEffect(() => {
    if (isDraggingRef.current) return;
    setItems(buildItems(tools, folders));
  }, [tools, folders]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const findContainer = useCallback(
    (id: UniqueIdentifier): string | undefined => {
      const sid = String(id);
      if (sid in items) return sid;
      if (sid === UNGROUPED_COLUMN_ID) return UNGROUPED_COLUMN_ID;
      if (sid.startsWith("column:")) {
        const folderId = sid.slice("column:".length);
        if (folderId in items) return folderId;
      }
      return Object.keys(items).find((key) => items[key].includes(sid));
    },
    [items],
  );

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      if (activeFolder || args.active.data.current?.type === "folder") {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === "folder"),
        });
      }

      if (args.active.data.current?.type === "tool") {
        const pointerIntersections = pointerWithin(args);
        const intersections = pointerIntersections.length > 0 ? pointerIntersections : rectIntersection(args);
        let overId = getFirstCollision(intersections, "id");

        if (overId != null) {
          if (overId in items) {
            const containerItems = items[overId];
            if (containerItems.length > 0) {
              overId = closestCorners({
                ...args,
                droppableContainers: args.droppableContainers.filter((c) => c.id !== overId && containerItems.includes(String(c.id))),
              })[0]?.id;
            }
          } else if (String(overId).startsWith("column:")) {
            const folderId = String(overId).slice("column:".length);
            const containerItems = items[folderId] ?? [];
            if (containerItems.length > 0) {
              overId =
                closestCorners({
                  ...args,
                  droppableContainers: args.droppableContainers.filter((c) => containerItems.includes(String(c.id))),
                })[0]?.id ?? overId;
            } else {
              overId = folderId;
            }
          }

          lastOverId.current = overId;
          return [{ id: overId }];
        }

        if (recentlyMovedToNewContainer.current) {
          lastOverId.current = args.active.id;
        }
        return lastOverId.current ? [{ id: lastOverId.current }] : [];
      }

      return closestCenter(args);
    },
    [activeFolder, items],
  );

  const handleDragStart = ({ active }: DragStartEvent) => {
    didDragRef.current = true;
    isDraggingRef.current = true;
    if (active.data.current?.type === "folder") {
      setActiveFolder(folders.find((f) => f.id === active.id) ?? null);
      setActiveToolId(null);
      return;
    }
    clonedItemsRef.current = items;
    setActiveToolId(String(active.id));
    setActiveFolder(null);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (active.data.current?.type !== "tool" || !over) return;

    const overId = String(over.id);
    const activeId = String(active.id);
    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);

    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setItems((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const activeIndex = activeItems.indexOf(activeId);
      if (activeIndex < 0) return prev;

      let newIndex: number;
      if (overId in prev || overId.startsWith("column:") || overId === UNGROUPED_COLUMN_ID) {
        newIndex = overItems.length + 1;
      } else {
        const overIndex = overItems.indexOf(overId);
        const isBelowOverItem = over && active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height;
        const modifier = isBelowOverItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      }

      recentlyMovedToNewContainer.current = true;

      return {
        ...prev,
        [activeContainer]: activeItems.filter((id) => id !== activeId),
        [overContainer]: [...overItems.slice(0, newIndex), activeItems[activeIndex], ...overItems.slice(newIndex, overItems.length)],
      };
    });
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    const activeType = active.data.current?.type;
    recentlyMovedToNewContainer.current = false;

    if (activeType === "folder") {
      isDraggingRef.current = false;
      setActiveFolder(null);
      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId || !folderIds.includes(overId)) return;

      const oldIndex = folderIds.indexOf(activeId);
      const newIndex = folderIds.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

      const nextIds = arrayMove(folderIds, oldIndex, newIndex);
      dispatch(reorderToolFoldersLocal(nextIds));
      try {
        await dispatch(reorderToolFolders(nextIds)).unwrap();
      } catch {
        message.error("Failed to reorder folders");
        dispatch(fetchToolFolders());
      }
      return;
    }

    const activeId = String(active.id);
    const cloned = clonedItemsRef.current;
    // After onDragOver moves, active already lives in the target container
    const currentContainer = findContainer(activeId);
    const overContainer = over ? (findContainer(String(over.id)) ?? currentContainer) : currentContainer;

    if (!currentContainer || !overContainer || !over) {
      if (cloned) setItems(cloned);
      clonedItemsRef.current = null;
      isDraggingRef.current = false;
      setActiveToolId(null);
      return;
    }

    let nextItems = items;
    const overIndex = items[overContainer].indexOf(String(over.id));
    const activeIndex = items[overContainer].indexOf(activeId);

    if (activeIndex >= 0 && overIndex >= 0 && activeIndex !== overIndex) {
      nextItems = {
        ...items,
        [overContainer]: arrayMove(items[overContainer], activeIndex, overIndex),
      };
      setItems(nextItems);
    }

    const changedContainers = Object.keys(nextItems).filter((key) => !sameOrder(cloned?.[key], nextItems[key]));

    for (const containerId of changedContainers) {
      dispatch(
        reorderToolsLocal({
          folderId: containerToFolderId(containerId),
          toolIds: nextItems[containerId] ?? [],
        }),
      );
    }

    clonedItemsRef.current = null;
    isDraggingRef.current = false;
    setActiveToolId(null);

    if (changedContainers.length === 0) return;

    try {
      await Promise.all(
        changedContainers.map((containerId) =>
          dispatch(
            reorderTools({
              folderId: containerToFolderId(containerId),
              toolIds: nextItems[containerId] ?? [],
            }),
          ).unwrap(),
        ),
      );
    } catch {
      if (cloned) setItems(cloned);
      dispatch(fetchTools());
      message.error("Failed to reorder tools");
    }
  };

  const handleDragCancel = () => {
    if (clonedItemsRef.current) setItems(clonedItemsRef.current);
    clonedItemsRef.current = null;
    isDraggingRef.current = false;
    setActiveToolId(null);
    setActiveFolder(null);
    recentlyMovedToNewContainer.current = false;
  };

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [items]);

  const handleToolClick = (toolId: string) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    onToolClick(toolId);
  };

  const activeTool = activeToolId ? (toolsById.get(activeToolId) ?? null) : null;
  const showUngrouped = (items[UNGROUPED_COLUMN_ID]?.length ?? 0) > 0;

  const toolsFor = (containerId: string) => (items[containerId] ?? []).map((id) => toolsById.get(id)).filter((t): t is AgentTool => !!t);

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
            tools={toolsFor(UNGROUPED_COLUMN_ID)}
            folderId={null}
            onToolClick={handleToolClick}
            onToolCreated={onToolCreated}
            tone="ungrouped"
          />
        ) : null}
        <SortableContext items={folderIds} strategy={horizontalListSortingStrategy}>
          {sortedFolders.map((folder) => (
            <SortableToolKanbanColumn
              key={folder.id}
              id={folder.id}
              title={folder.name}
              tools={toolsFor(folder.id)}
              folderId={folder.id}
              onToolClick={handleToolClick}
              onToolCreated={onToolCreated}
              onEdit={() => onEditFolder(folder)}
              onDelete={() => onDeleteFolder(folder.id)}
            />
          ))}
        </SortableContext>
        <AddFolderButton />
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTool ? (
          <div className="w-[276px] cursor-grabbing">
            <div className="rotate-[2.5deg] scale-[1.04] origin-center" style={{ filter: "drop-shadow(0 16px 32px rgba(0,0,0,0.5))" }}>
              <ToolCardView tool={activeTool} className="shadow-none ring-1 ring-[rgba(244,241,234,0.14)]" />
            </div>
          </div>
        ) : null}
        {activeFolder ? (
          <div className="w-[328px] rotate-1 rounded-md bg-muted px-3 py-3 shadow-drop ring-1 ring-ring/35">
            <p className="m-0 text-[13px] font-medium leading-normal text-muted-foreground truncate">{activeFolder.name}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
