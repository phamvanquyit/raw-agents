-- Add created_by column to agents table (FK → users.id)
ALTER TABLE agents ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL;
