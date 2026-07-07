-- Drop FK constraint on tool_id in agent_tool_assignments
-- so that builtin tools (e.g. "builtin:get_current_time") can be assigned
-- without needing a row in agent_tools.
-- SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so we recreate the table.

CREATE TABLE agent_tool_assignments_new (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO agent_tool_assignments_new (id, agent_id, tool_id, created_at)
  SELECT id, agent_id, tool_id, created_at FROM agent_tool_assignments;

DROP TABLE agent_tool_assignments;

ALTER TABLE agent_tool_assignments_new RENAME TO agent_tool_assignments
