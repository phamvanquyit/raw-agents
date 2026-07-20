import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AddCircle, Folder, MenuDots, PenNewSquare, TrashBinTrash } from "@solar-icons/react";
import type { CSSProperties, HTMLAttributes } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import type { AgentTool } from "src/common/types";
import RenderIf from "src/components/ui/RenderIf";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "src/components/ui/alert-dialog";
import { Button } from "src/components/ui/button";
import { Field } from "src/components/ui/form-field";
import { Input } from "src/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "src/components/ui/popover";
import { toast } from "src/components/ui/toast";
import { cn } from "src/lib/utils";
import { useAppDispatch } from "src/store/store";
import { createToolFolder } from "../common/toolFoldersSlice";
import { AddToolPopover } from "./AddToolDialog";
import { DropPlaceholder, ToolKanbanCard } from "./ToolKanbanCard";

export const UNGROUPED_COLUMN_ID = "ungrouped";

export type ColumnTone = "folder" | "ungrouped";

const TONE_ICON: Record<ColumnTone, string> = {
  folder: "text-edge-tool",
  ungrouped: "text-muted-foreground",
};

const TONE_COUNT: Record<ColumnTone, string> = {
  folder: "bg-edge-tool/15 text-edge-tool",
  ungrouped: "bg-card text-muted-foreground",
};

function FolderColumnMenu({ title, onEdit, onDelete }: { title: string; onEdit?: () => void; onDelete?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="Folder actions"
          >
            <MenuDots width={14} height={14} />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-[160px] p-1">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onEdit?.();
            }}
            className="flex w-full items-center gap-2 rounded-md border-none bg-transparent px-2.5 py-2 text-left text-[12px] font-medium text-muted-foreground cursor-pointer transition-colors hover:bg-muted hover:text-foreground"
          >
            <PenNewSquare width={13} height={13} className="shrink-0" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setDeleteOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-md border-none bg-transparent px-2.5 py-2 text-left text-[12px] font-medium text-destructive cursor-pointer transition-colors hover:bg-destructive/10"
          >
            <TrashBinTrash width={13} height={13} className="shrink-0" />
            Delete
          </button>
        </PopoverContent>
      </Popover>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <div className="flex flex-col gap-2.5">
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>{`Delete "${title}"? Tools in this folder will move to Ungrouped.`}</AlertDialogDescription>
            <div className="flex flex-row justify-end gap-2">
              <AlertDialogCancel asChild>
                <Button size="sm" variant="secondary">
                  Cancel
                </Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setDeleteOpen(false);
                    onDelete?.();
                  }}
                >
                  Delete
                </Button>
              </AlertDialogAction>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
  placeholderIndex?: number | null;
  placeholderHeight?: number;
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
  placeholderIndex = null,
  placeholderHeight = 88,
}: ColumnBodyProps) {
  const toolIds = tools.map((t) => t.id);
  const showPlaceholder = placeholderIndex != null;

  return (
    <div
      ref={columnRef}
      style={{ maxHeight: "calc(100% - 1.5rem)", ...style }}
      className={cn(
        "relative flex w-[300px] shrink-0 flex-col rounded-xl bg-muted overflow-hidden",
        (isOver || showPlaceholder) && "ring-1 ring-inset ring-ring/40 bg-accent",
        className,
      )}
    >
      <div
        className={cn("flex items-center gap-2 px-3 pt-3 pb-2.5 shrink-0", headerListeners && "cursor-grab active:cursor-grabbing touch-none")}
        {...headerListeners}
        {...headerAttributes}
      >
        <Folder width={14} height={14} className={cn("shrink-0", TONE_ICON[tone])} />
        <h3 className="m-0 flex-1 min-w-0 text-[13px] font-semibold text-muted-foreground truncate">{title}</h3>
        <span className={cn("text-[10px] font-semibold py-0.5 px-1.5 rounded-full tabular-nums", TONE_COUNT[tone])}>{tools.length}</span>
        <RenderIf condition={editable}>
          <div className="shrink-0" onPointerDown={(e) => e.stopPropagation()}>
            <FolderColumnMenu title={title} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </RenderIf>
      </div>

      <div ref={droppableRef} className="flex-1 min-h-0 overflow-y-auto px-2.5 py-px flex flex-col gap-2">
        <SortableContext items={toolIds} strategy={verticalListSortingStrategy}>
          {tools.map((tool, index) => (
            <Fragment key={tool.id}>
              {placeholderIndex === index ? <DropPlaceholder height={placeholderHeight} /> : null}
              <ToolKanbanCard tool={tool} onClick={onToolClick ? () => onToolClick(tool.id) : undefined} />
            </Fragment>
          ))}
          {placeholderIndex === tools.length ? <DropPlaceholder height={placeholderHeight} /> : null}
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
  placeholderIndex = null,
  placeholderHeight = 88,
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
  placeholderIndex?: number | null;
  placeholderHeight?: number;
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
      placeholderIndex={placeholderIndex}
      placeholderHeight={placeholderHeight}
    />
  );
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
  placeholderIndex = null,
  placeholderHeight = 88,
}: {
  id: string;
  title: string;
  tools: AgentTool[];
  folderId: string;
  onToolClick?: (toolId: string) => void;
  onToolCreated: (toolId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  placeholderIndex?: number | null;
  placeholderHeight?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
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
      columnRef={setNodeRef}
      isOver={isOver}
      style={style}
      className={isDragging ? "opacity-40 z-50" : undefined}
      headerListeners={listeners}
      headerAttributes={attributes}
      placeholderIndex={placeholderIndex}
      placeholderHeight={placeholderHeight}
    />
  );
}

export function AddFolderButton() {
  const dispatch = useAppDispatch();
  const inputRef = useRef<HTMLInputElement>(null);
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
      toast.success("Folder created");
      setOpen(false);
    } catch {
      setError("Failed to create folder");
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-[300px] shrink-0 items-center justify-center gap-1.5 self-start rounded-md border border-dashed border-border bg-transparent px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-muted-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <AddCircle width={14} height={14} className="shrink-0" />
          Add folder
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={8} className="w-[300px] p-0">
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
            <Field label="Folder Name" required>
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
            </Field>
            {error ? <div className="text-[11px] font-medium text-destructive">{error}</div> : null}
          </div>
          <div className="flex flex-row gap-2.5 justify-end px-4 py-3 border-t border-border/40">
            <Button variant="secondary" size="sm" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" loading={loading} disabled={!name.trim()}>
              {loading ? "Creating…" : "Create Folder"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
