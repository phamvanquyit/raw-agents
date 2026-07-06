-- Delete all builtin tool rows from agent_tools
DELETE FROM agent_tools WHERE is_builtin = 1;

-- Also clean up any orphaned tool assignments referencing deleted tools
DELETE FROM agent_tool_assignments WHERE tool_id NOT IN (SELECT id FROM agent_tools)
