-- Global cron jobs (Bun/TS scripts)
CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  code         TEXT NOT NULL DEFAULT '',
  cron         TEXT NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 0,
  timeout_ms   INTEGER NOT NULL DEFAULT 300000,
  next_run_at  INTEGER,
  last_run_at  INTEGER,
  lease_owner  TEXT,
  lease_until  INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_jobs_enabled_next_run ON jobs(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_jobs_lease_until ON jobs(lease_until);

CREATE TABLE IF NOT EXISTS job_runs (
  id           TEXT PRIMARY KEY,
  job_id       TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'running',
  trigger      TEXT NOT NULL DEFAULT 'cron',
  logs         TEXT NOT NULL DEFAULT '',
  error        TEXT,
  instance_id  TEXT,
  started_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job_id ON job_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);
