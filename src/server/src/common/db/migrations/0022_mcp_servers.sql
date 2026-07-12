-- MCP Servers table — stores remote MCP server configs (URL + headers)
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  headers TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Add MCP columns to agent_tools — marks which tools came from an MCP server
ALTER TABLE agent_tools ADD COLUMN mcp_server_id TEXT REFERENCES mcp_servers(id) ON DELETE CASCADE;
ALTER TABLE agent_tools ADD COLUMN mcp_tool_name TEXT;
