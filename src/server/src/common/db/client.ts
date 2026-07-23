import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { getDataDir } from "../utils/data-dir.js";
import * as schema from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Singleton ────────────────────────────────────────────────────────────────
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _raw: Database | null = null;

export function getDb(dataDir?: string): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) return _db;

  const dir = dataDir ?? getDataDir();
  mkdirSync(dir, { recursive: true });

  const dbPath = join(dir, "data.db");
  _raw = new Database(dbPath);

  // WAL mode for better concurrent read performance
  _raw.exec("PRAGMA journal_mode = WAL;");
  _raw.exec("PRAGMA foreign_keys = ON;");

  _db = drizzle(_raw, { schema });
  runMigrations(_raw);
  ensureDatatableColumnName(_raw);
  return _db;
}

export function closeDb(): void {
  _raw?.close();
  _raw = null;
  _db = null;
}

/** Raw bun:sqlite handle — for json_extract and parameterized dynamic SQL. */
export function getRawDb(): Database {
  if (!_raw) getDb();
  if (!_raw) throw new Error("Database not initialized");
  return _raw;
}

/** @internal — used by test-helpers to inject an in-memory DB */
export function _setTestDb(db: ReturnType<typeof drizzle<typeof schema>>, raw: Database): void {
  _db = db;
  _raw = raw;
}

/** @internal — used by test-helpers to reset the singleton */
export function _resetDb(): void {
  _raw = null;
  _db = null;
}

// ─── Migration runner ─────────────────────────────────────────────────────────
function runMigrations(raw: Database): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS __migrations (
      name TEXT PRIMARY KEY,
      ran_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  const migrationsDir = join(__dirname, "migrations");
  if (!existsSync(migrationsDir)) return;

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const ran = raw.query("SELECT name FROM __migrations WHERE name = ?").get(file);
    if (ran) continue;

    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      raw.exec(stmt);
    }

    raw.query("INSERT INTO __migrations (name) VALUES (?)").run(file);
  }
}

/** One-shot: collapse datatable_columns.key+label → name for DBs created before the rename. */
function ensureDatatableColumnName(raw: Database): void {
  const table = raw.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'datatable_columns'").get() as
    | { name: string }
    | null
    | undefined;
  if (!table) return;

  const cols = raw.query("PRAGMA table_info('datatable_columns')").all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("key") || names.has("name")) return;

  raw.exec("PRAGMA foreign_keys = OFF;");
  raw.exec(`
    CREATE TABLE datatable_columns_new (
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
    INSERT INTO datatable_columns_new (id, table_id, name, type, options, required, sort_order, created_at)
    SELECT id, table_id, key, type, options, required, sort_order, created_at
    FROM datatable_columns;
    DROP TABLE datatable_columns;
    ALTER TABLE datatable_columns_new RENAME TO datatable_columns;
    CREATE INDEX IF NOT EXISTS idx_datatable_columns_table ON datatable_columns(table_id);
  `);
  raw.exec("PRAGMA foreign_keys = ON;");
}

// ─── Re-export schema ─────────────────────────────────────────────────────────
export * from "./schema.js";
