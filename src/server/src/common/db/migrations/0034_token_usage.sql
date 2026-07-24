CREATE TABLE IF NOT EXISTS token_usage (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE SET NULL,
  owner_id TEXT NOT NULL DEFAULT 'user',
  provider_id TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  system_prompt_tokens INTEGER NOT NULL DEFAULT 0,
  tool_def_tokens INTEGER NOT NULL DEFAULT 0,
  conversation_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_total INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_token_usage_agent ON token_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_conversation ON token_usage(conversation_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created_at);
