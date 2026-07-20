// ─── Tools Page ──────────────────────────────────────────────────────────────
// Route: /tools — Full-height Trello-style kanban of custom tool folders.

import { message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgentTool } from "src/common/types";
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

  const [editingFolder, setEditingFolder] = useState<ToolFolderWithTools | null>(null);

  useEffect(() => {
    dispatch(fetchTools());
    dispatch(fetchToolFolders());
  }, [dispatch]);

  const customTools = useMemo(() => tools.filter((t) => !t.id.startsWith("builtin:")), [tools]);

  const handleToolClick = (toolId: string) => {
    navigate(`/tools/${toolId}`);
  };

  const handleEditFolder = (folder: ToolFolderWithTools) => {
    setEditingFolder(folder);
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await dispatch(deleteToolFolder(folderId)).unwrap();
      message.success("Folder deleted");
      await dispatch(fetchTools());
    } catch {
      message.error("Failed to delete folder");
    }
  };

  return (
    <>
      <div className="h-full min-h-0 flex flex-col overflow-hidden">
        <div className="shrink-0 px-8 pt-6 pb-7">
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Tools</h1>
          <p className="m-0 mt-1.5 text-sm text-muted-foreground">
            Manage your custom tools
            <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
              {customTools.length}
            </span>
          </p>
        </div>

        <div className="flex-1 min-h-0 min-w-0">
          <ToolsKanbanBoard
            tools={customTools}
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
