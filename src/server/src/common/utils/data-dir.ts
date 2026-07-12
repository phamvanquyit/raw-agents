import { join } from "node:path";

/** App data directory (SQLite, tool envs, screenshots, …). */
export function getDataDir(): string {
  return process.env.DATA_DIR ?? join(process.env.HOME ?? "~", ".raw-agents");
}
