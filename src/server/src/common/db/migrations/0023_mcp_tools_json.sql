-- Store MCP tool catalog on mcp_servers.tools (JSON).
-- Agent enable/disable uses virtual tool_id: mcp:{serverId}:{toolName}.
-- Remove MCP materialization from agent_tools.

ALTER TABLE mcp_servers ADD COLUMN tools TEXT NOT NULL DEFAULT '[]';

-- Migrate existing MCP tool rows into mcp_servers.tools
UPDATE mcp_servers
SET tools = (
  SELECT COALESCE(
    (
      SELECT json_group_array(
        json_object(
          'name', mcp_tool_name,
          'description', COALESCE(description, ''),
          'inputSchema', json(parameters)
        )
      )
      FROM agent_tools
      WHERE agent_tools.mcp_server_id = mcp_servers.id
        AND agent_tools.mcp_tool_name IS NOT NULL
    ),
    '[]'
  )
);

-- Remap assignments from UUID tool rows → virtual mcp: ids
UPDATE agent_tool_assignments
SET tool_id = (
  SELECT 'mcp:' || mcp_server_id || ':' || mcp_tool_name
  FROM agent_tools
  WHERE agent_tools.id = agent_tool_assignments.tool_id
)
WHERE EXISTS (
  SELECT 1 FROM agent_tools
  WHERE agent_tools.id = agent_tool_assignments.tool_id
    AND agent_tools.mcp_server_id IS NOT NULL
    AND agent_tools.mcp_tool_name IS NOT NULL
);

DELETE FROM agent_tools WHERE mcp_server_id IS NOT NULL;

-- Drop mcp_server_id / mcp_tool_name from agent_tools (SQLite recreate)
CREATE TABLE agent_tools_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT,
  parameters TEXT NOT NULL DEFAULT '{"type":"object","properties":{},"required":[]}',
  code_content TEXT NOT NULL,
  draft_code TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO agent_tools_new (id, name, label, description, icon, parameters, code_content, draft_code, is_active, created_at)
  SELECT id, name, label, description, icon, parameters, code_content, draft_code, is_active, created_at FROM agent_tools;

DROP TABLE agent_tools;

ALTER TABLE agent_tools_new RENAME TO agent_tools;
