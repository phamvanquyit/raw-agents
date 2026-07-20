-- Persist kanban column order for tool folders
ALTER TABLE tool_folders ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
