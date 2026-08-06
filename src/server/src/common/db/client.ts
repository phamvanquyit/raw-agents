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
  ensureMemoryPhase1(_raw);
  ensureMemoryGraph(_raw);
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

/** Idempotent Phase 1 memory columns (safe if a prior ALTER partially applied). */
function ensureMemoryPhase1(raw: Database): void {
  const addColumnIfMissing = (table: string, column: string, ddl: string) => {
    const exists = raw.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { name: string } | null | undefined;
    if (!exists) return;
    const cols = raw.query(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === column)) return;
    raw.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };

  addColumnIfMissing("agent_user_facts", "category", "category TEXT");
  addColumnIfMissing("agent_user_facts", "pinned", "pinned INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("agent_user_facts", "source_conversation_id", "source_conversation_id TEXT");
  addColumnIfMissing("agent_user_facts", "updated_at", "updated_at INTEGER NOT NULL DEFAULT 0");

  const facts = raw.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_user_facts'").get() as { name: string } | null | undefined;
  if (facts) {
    const cols = raw.query("PRAGMA table_info('agent_user_facts')").all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === "updated_at") && cols.some((c) => c.name === "created_at")) {
      raw.exec("UPDATE agent_user_facts SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = 0");
    }
  }

  addColumnIfMissing("agent_conversations", "summary", "summary TEXT");
  addColumnIfMissing("agent_conversations", "summary_updated_at", "summary_updated_at INTEGER");
}

/** Migrate flat facts → memory graph; drop notes + facts tables when present. */
function ensureMemoryGraph(raw: Database): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS memory_nodes (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL DEFAULT 'user',
      content TEXT NOT NULL,
      source_conversation_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS memory_edges (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL DEFAULT 'user',
      from_id TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
      to_id TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
      relation TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (from_id, to_id, relation)
    );
    CREATE INDEX IF NOT EXISTS idx_memory_nodes_agent_owner ON memory_nodes(agent_id, owner_id);
    CREATE INDEX IF NOT EXISTS idx_memory_edges_agent_owner ON memory_edges(agent_id, owner_id);
    CREATE INDEX IF NOT EXISTS idx_memory_edges_from ON memory_edges(from_id);
    CREATE INDEX IF NOT EXISTS idx_memory_edges_to ON memory_edges(to_id);
  `);

  try {
    const cols = raw.query("PRAGMA table_info('memory_nodes')").all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (names.has("pinned")) {
      raw.exec("ALTER TABLE memory_nodes DROP COLUMN pinned");
    }
    if (names.has("label")) {
      raw.exec(`
        UPDATE memory_nodes SET content = CASE
          WHEN trim(COALESCE(content, '')) = '' THEN label
          WHEN trim(content) = trim(label) THEN content
          WHEN instr(content, label) = 1 THEN content
          ELSE label || ': ' || content
        END
      `);
      raw.exec("ALTER TABLE memory_nodes DROP COLUMN label");
    }
    if (names.has("type")) {
      raw.exec("ALTER TABLE memory_nodes DROP COLUMN type");
    }
  } catch {
    /* older SQLite or in-use — ignore */
  }

  const hasFacts = raw.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_user_facts'").get() as { name: string } | null | undefined;
  if (hasFacts) {
    raw.exec(`
      INSERT INTO memory_nodes (
        id, agent_id, owner_id, content, source_conversation_id, created_at, updated_at
      )
      SELECT
        id,
        agent_id,
        owner_id,
        content,
        source_conversation_id,
        created_at,
        CASE
          WHEN updated_at IS NULL OR updated_at = 0 THEN created_at
          ELSE updated_at
        END
      FROM agent_user_facts
      WHERE NOT EXISTS (SELECT 1 FROM memory_nodes n WHERE n.id = agent_user_facts.id);
    `);
    raw.exec("DROP TABLE IF EXISTS agent_user_facts;");
  }

  raw.exec("DROP TABLE IF EXISTS agent_notes;");
}

/** One-shot: collapse datatable_columns.key+label → name for DBs created before the rename. */
function ensureDatatableColumnName(raw: Database): void {
  const table = raw.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'datatable_columns'").get() as { name: string } | null | undefined;
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
