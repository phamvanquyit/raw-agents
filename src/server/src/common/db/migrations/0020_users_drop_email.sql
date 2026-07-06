-- Drop email column from users table (no longer used)
-- SQLite cannot DROP a UNIQUE column directly, so we recreate the table.

CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO users_new (id, username, name, avatar, password_hash, role, is_active, created_at, updated_at)
  SELECT id, username, name, avatar, password_hash, role, is_active, created_at, updated_at FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;
