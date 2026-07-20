-- call_agent is no longer an assignable builtin (tool-per-agent via callableAgentIds)
DELETE FROM agent_tool_assignments WHERE tool_id = 'builtin:call_agent';
