import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AddCircle, Folder, MenuDots, PenNewSquare, TrashBinTrash } from "@solar-icons/react";
import { Button, Dropdown, Form, Input, Modal, Popover, message } from "antd";
import type { InputRef, MenuProps } from "antd";
import type { CSSProperties, HTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";
import type { AgentTool } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { cn } from "src/lib/utils";
import { useAppDispatch } from "src/store/store";
import { createToolFolder } from "../common/toolFoldersSlice";
import { AddToolPopover } from "./AddToolDialog";
import { ToolKanbanCard } from "./ToolKanbanCard";

export const UNGROUPED_COLUMN_ID = "ungrouped";

export type ColumnTone = "folder" | "ungrouped";

const TONE_ICON: Record<ColumnTone, string> = {
  folder: "text-edge-tool",
  ungrouped: "text-muted-foreground",
};

function FolderColumnMenu({ title, onEdit, onDelete }: { title: string; onEdit?: () => void; onDelete?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const menuItems: MenuProps["items"] = [
    {
      key: "edit",
      label: (
        <div className="flex items-center gap-2">
          <PenNewSquare width={14} height={14} />
          Edit
        </div>
      ),
      onClick: () => onEdit?.(),
    },
    {
      key: "delete",
      danger: true,
      label: (
        <div className="flex items-center gap-2">
          <TrashBinTrash width={14} height={14} />
          Delete
        </div>
      ),
      onClick: () => {
        Modal.confirm({
          title: "Delete folder?",
          content: `Delete "${title}"? Tools in this folder will move to Ungrouped.`,
          okText: "Delete",
          okButtonProps: { danger: true },
          cancelText: "Cancel",
          onOk: () => onDelete?.(),
        });
      },
    },
  ];

  return (
    <Dropdown trigger={["click"]} placement="bottomRight" open={menuOpen} onOpenChange={setMenuOpen} menu={{ items: menuItems, style: { minWidth: 160 } }}>
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label="Folder actions"
      >
        <MenuDots width={14} height={14} weight="Bold" />
      </button>
    </Dropdown>
  );
}

type ColumnBodyProps = {
  id: string;
  title: string;
  tools: AgentTool[];
  folderId: string | null;
  onToolClick?: (toolId: string) => void;
  onToolCreated: (toolId: string) => void;
  editable?: boolean;
  tone?: ColumnTone;
  onEdit?: () => void;
  onDelete?: () => void;
  columnRef?: (node: HTMLElement | null) => void;
  droppableRef?: (node: HTMLElement | null) => void;
  isOver?: boolean;
  style?: CSSProperties;
  className?: string;
  headerListeners?: HTMLAttributes<HTMLDivElement>;
  headerAttributes?: HTMLAttributes<HTMLDivElement>;
};

function ColumnBody({
  title,
  tools,
  folderId,
  onToolClick,
  onToolCreated,
  editable = false,
  tone = "folder",
  onEdit,
  onDelete,
  columnRef,
  droppableRef,
  isOver = false,
  style,
  className,
  headerListeners,
  headerAttributes,
}: ColumnBodyProps) {
  const toolIds = tools.map((t) => t.id);

  return (
    <div
      ref={columnRef}
      style={{ maxHeight: "calc(100% - 1.5rem)", ...style }}
      className={cn(
        "relative flex w-[328px] shrink-0 flex-col rounded-xl bg-muted overflow-hidden",
        isOver && "ring-1 ring-inset ring-ring/40 bg-accent",
        className,
      )}
    >
      <div
        className={cn("flex items-center gap-2 px-3 pt-3 pb-2.5 shrink-0", headerListeners && "cursor-grab active:cursor-grabbing touch-none")}
        {...headerListeners}
        {...headerAttributes}
      >
        <Folder width={14} height={14} className={cn("shrink-0", TONE_ICON[tone])} />
        <h3 className="m-0 flex-1 min-w-0 text-[13px] font-medium leading-normal text-muted-foreground truncate">{title}</h3>
        <RenderIf condition={editable}>
          <div className="shrink-0" onPointerDown={(e) => e.stopPropagation()}>
            <FolderColumnMenu title={title} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </RenderIf>
      </div>

      <div ref={droppableRef} className="flex-1 min-h-0 overflow-y-auto px-2.5 py-px flex flex-col gap-2">
        <SortableContext items={toolIds} strategy={verticalListSortingStrategy}>
          {tools.map((tool) => (
            <ToolKanbanCard key={tool.id} tool={tool} onClick={onToolClick ? () => onToolClick(tool.id) : undefined} />
          ))}
        </SortableContext>
      </div>

      <div className="shrink-0 px-2.5 py-2.5">
        <AddToolPopover onCreated={onToolCreated} defaultFolderId={folderId}>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-muted-foreground transition-colors cursor-pointer"
          >
            <AddCircle width={14} height={14} className="shrink-0" />
            Add a tool
          </button>
        </AddToolPopover>
      </div>
    </div>
  );
}

export function ToolKanbanColumn({
  id,
  title,
  tools,
  folderId,
  onToolClick,
  onToolCreated,
  editable = false,
  tone = "folder",
  onEdit,
  onDelete,
}: {
  id: string;
  title: string;
  tools: AgentTool[];
  folderId: string | null;
  onToolClick?: (toolId: string) => void;
  onToolCreated: (toolId: string) => void;
  editable?: boolean;
  tone?: ColumnTone;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "column", folderId },
  });

  return (
    <ColumnBody
      id={id}
      title={title}
      tools={tools}
      folderId={folderId}
      onToolClick={onToolClick}
      onToolCreated={onToolCreated}
      editable={editable}
      tone={tone}
      onEdit={onEdit}
      onDelete={onDelete}
      droppableRef={setNodeRef}
      isOver={isOver}
    />
  );
}

export function columnDroppableId(folderId: string): string {
  return `column:${folderId}`;
}

export function SortableToolKanbanColumn({
  id,
  title,
  tools,
  folderId,
  onToolClick,
  onToolCreated,
  onEdit,
  onDelete,
}: {
  id: string;
  title: string;
  tools: AgentTool[];
  folderId: string;
  onToolClick?: (toolId: string) => void;
  onToolCreated: (toolId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { setNodeRef: setDroppableRef, isOver: isDroppableOver } = useDroppable({
    id: columnDroppableId(folderId),
    data: { type: "column", folderId },
  });

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
    isOver: isSortableOver,
  } = useSortable({
    id,
    data: { type: "folder", folderId },
  });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <ColumnBody
      id={id}
      title={title}
      tools={tools}
      folderId={folderId}
      onToolClick={onToolClick}
      onToolCreated={onToolCreated}
      editable
      tone="folder"
      onEdit={onEdit}
      onDelete={onDelete}
      columnRef={setSortableRef}
      droppableRef={setDroppableRef}
      isOver={isDroppableOver || isSortableOver}
      style={style}
      className={isDragging ? "opacity-40 z-50" : undefined}
      headerListeners={listeners}
      headerAttributes={attributes}
    />
  );
}

export function AddFolderButton() {
  const dispatch = useAppDispatch();
  const inputRef = useRef<InputRef>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setError("");
      setLoading(false);
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a folder name.");
      return;
    }
    setLoading(true);
    try {
      await dispatch(createToolFolder({ name: trimmed })).unwrap();
      message.success("Folder created");
      setOpen(false);
    } catch {
      setError("Failed to create folder");
      setLoading(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      arrow={false}
      styles={{ root: { width: 300 }, container: { width: 300, padding: 0 } }}
      content={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex flex-col"
        >
          <div className="px-4 pt-4 pb-3">
            <h3 className="text-sm font-semibold text-foreground m-0">New Folder</h3>
          </div>
          <div className="flex flex-col gap-3.5 px-4 pb-4">
            <Form.Item
              label={
                <span className="text-muted-foreground">
                  Folder Name<span className="text-destructive"> *</span>
                </span>
              }
              className="!mb-0"
              layout="vertical"
            >
              <Input
                ref={inputRef}
                placeholder="e.g. Integrations, Scrapers…"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                autoComplete="off"
              />
            </Form.Item>
            {error ? <div className="text-[11px] font-medium text-destructive">{error}</div> : null}
          </div>
          <div className="flex flex-row gap-2.5 justify-end px-4 py-3 border-t border-border/40">
            <Button type="default" size="small" htmlType="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="primary" size="small" htmlType="submit" loading={loading} disabled={!name.trim()}>
              {loading ? "Creating…" : "Create Folder"}
            </Button>
          </div>
        </form>
      }
    >
      <button
        type="button"
        className="inline-flex h-8 w-[328px] shrink-0 items-center justify-center gap-1.5 self-start rounded-md border border-dashed border-border bg-transparent px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-muted-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <AddCircle width={14} height={14} className="shrink-0" />
        Add folder
      </button>
    </Popover>
  );
}
