// ─── Tools Page ──────────────────────────────────────────────────────────────
// Route: /tools — Full-height Trello-style kanban of custom tool folders.

import { Magnifier } from "@solar-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgentTool } from "src/common/types";
import { Input } from "src/components/ui/input";
import { toast } from "src/components/ui/toast";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { deleteToolFolder, fetchToolFolders } from "./common/toolFoldersSlice";
import type { ToolFolderWithTools } from "./common/toolFoldersSlice";
import { fetchTools } from "./common/toolsSlice";
import { FolderDialog } from "./components/FolderDialog";
import { ToolsKanbanBoard } from "./components/ToolsKanbanBoard";

export default function ToolsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const tools = useAppSelector((s) => s.tools.items) as AgentTool[];
  const folders = useAppSelector((s) => s.toolFolders.folders) as ToolFolderWithTools[];

  const [search, setSearch] = useState("");
  const [editingFolder, setEditingFolder] = useState<ToolFolderWithTools | null>(null);

  useEffect(() => {
    dispatch(fetchTools());
    dispatch(fetchToolFolders());
  }, [dispatch]);

  const customTools = useMemo(() => tools.filter((t) => !t.id.startsWith("builtin:")), [tools]);

  const filteredTools = useMemo(() => {
    if (!search.trim()) return customTools;
    const q = search.trim().toLowerCase();
    return customTools.filter(
      (t) => (t.label ?? "").toLowerCase().includes(q) || (t.name ?? "").toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q),
    );
  }, [customTools, search]);

  const handleToolClick = (toolId: string) => {
    navigate(`/tools/${toolId}`);
  };

  const handleEditFolder = (folder: ToolFolderWithTools) => {
    setEditingFolder(folder);
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await dispatch(deleteToolFolder(folderId)).unwrap();
      toast.success("Folder deleted");
      await dispatch(fetchTools());
    } catch {
      toast.error("Failed to delete folder");
    }
  };

  return (
    <>
      <div className="h-full min-h-0 flex flex-col overflow-hidden">
        <div className="shrink-0 flex flex-col gap-5 px-8 pt-6 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Tools</h1>
            <p className="m-0 mt-1.5 text-sm text-muted-foreground">
              Manage your custom tools
              <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
                {customTools.length}
              </span>
            </p>
          </div>
          <div className="relative w-full sm:w-[240px] shrink-0">
            <Magnifier width={15} height={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-[1]" />
            <Input placeholder="Search tools…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        <div className="flex-1 min-h-0 min-w-0">
          <ToolsKanbanBoard
            tools={filteredTools}
            folders={folders}
            onToolClick={handleToolClick}
            onToolCreated={handleToolClick}
            onEditFolder={handleEditFolder}
            onDeleteFolder={handleDeleteFolder}
          />
        </div>
      </div>

      <FolderDialog open={!!editingFolder} onClose={() => setEditingFolder(null)} folder={editingFolder} />
    </>
  );
}
