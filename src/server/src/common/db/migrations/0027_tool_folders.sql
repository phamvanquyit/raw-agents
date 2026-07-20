-- Tool Folders — group custom tools for easier browsing
CREATE TABLE IF NOT EXISTS tool_folders (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

ALTER TABLE agent_tools ADD COLUMN folder_id TEXT REFERENCES tool_folders(id) ON DELETE SET NULL;
