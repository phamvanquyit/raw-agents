-- Add 'thinking' to the role CHECK constraint on agent_messages.
-- SQLite doesn't support ALTER CONSTRAINT, so we recreate the table.

CREATE TABLE IF NOT EXISTS agent_messages_new (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE CASCADE,
  chat_agent_id   TEXT,
  role            TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','assistant','tool','thinking')),
  content         TEXT NOT NULL,
  metadata        TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO agent_messages_new SELECT * FROM agent_messages;

DROP TABLE agent_messages;

ALTER TABLE agent_messages_new RENAME TO agent_messages
