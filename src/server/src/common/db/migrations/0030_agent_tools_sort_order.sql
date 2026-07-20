-- Persist tool order within a folder (or ungrouped)
ALTER TABLE agent_tools ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
