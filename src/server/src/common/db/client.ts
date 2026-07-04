import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Singleton ────────────────────────────────────────────────────────────────
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _raw: Database | null = null;

export function getDb(dataDir?: string): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) return _db;

  const dir = dataDir ?? process.env.DATA_DIR ?? join(process.env.HOME ?? "~", ".raw-agents");
  mkdirSync(dir, { recursive: true });

  const dbPath = join(dir, "data.db");
  _raw = new Database(dbPath);

  // WAL mode for better concurrent read performance
  _raw.exec("PRAGMA journal_mode = WAL;");
  _raw.exec("PRAGMA foreign_keys = ON;");

  _db = drizzle(_raw, { schema });
  runMigrations(_raw);
  return _db;
}

export function closeDb(): void {
  _raw?.close();
  _raw = null;
  _db = null;
}

export function getRawDb(): Database {
  if (!_raw) throw new Error("DB not initialized — call getDb() first");
  return _raw;
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

// ─── Re-export schema ─────────────────────────────────────────────────────────
export * from "./schema.js";
