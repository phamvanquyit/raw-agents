-- Remove deprecated builtin:fetch_webpage assignments
DELETE FROM agent_tool_assignments WHERE tool_id = 'builtin:fetch_webpage';
