-- Per-user memory: facts (short key-value) + docs (long documents)
-- Facts: always injected into system prompt
-- Docs: only titles injected, full content loaded on-demand via tool

-- ── Facts table ──
CREATE TABLE IF NOT EXISTS agent_user_facts (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agent_user_facts_lookup
  ON agent_user_facts(agent_id, owner_id);

-- ── Migrate existing memory_content → facts ──
-- Split each line of memory_content into individual facts
-- For simplicity, migrate as a single fact containing all content
INSERT OR IGNORE INTO agent_user_facts (id, agent_id, owner_id, content, created_at)
  SELECT lower(hex(randomblob(16))), id, 'user', memory_content, unixepoch()
  FROM agents
  WHERE memory_content IS NOT NULL AND memory_content != '';

-- ── Add owner_id to agent_notes ──
ALTER TABLE agent_notes ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'user';

-- ── Drop memory_content from agents ──
ALTER TABLE agents DROP COLUMN memory_content;
