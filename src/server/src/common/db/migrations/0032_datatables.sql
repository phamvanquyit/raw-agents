CREATE TABLE IF NOT EXISTS datatable_projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS datatable_tables (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES datatable_projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS datatable_columns (
  id          TEXT PRIMARY KEY,
  table_id    TEXT NOT NULL REFERENCES datatable_tables(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  options     TEXT,
  required    INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (table_id, name)
);

CREATE TABLE IF NOT EXISTS datatable_rows (
  id          TEXT PRIMARY KEY,
  table_id    TEXT NOT NULL REFERENCES datatable_tables(id) ON DELETE CASCADE,
  data        TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_datatable_tables_project ON datatable_tables(project_id);
CREATE INDEX IF NOT EXISTS idx_datatable_columns_table ON datatable_columns(table_id);
CREATE INDEX IF NOT EXISTS idx_datatable_rows_table ON datatable_rows(table_id);
