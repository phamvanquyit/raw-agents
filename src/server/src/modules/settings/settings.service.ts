import { inArray } from "drizzle-orm";
import { appSettings, getDb } from "../../common/db/client.js";

/** Load only the requested setting keys. Never returns jwt_secret. */
export function loadSettingsByKeys(keys: string[]): Record<string, string> {
  const safeKeys = keys.filter((k) => k !== "jwt_secret");
  if (safeKeys.length === 0) return {};
  const rows = getDb().select().from(appSettings).where(inArray(appSettings.key, safeKeys)).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function saveSettings(body: Record<string, string>) {
  const db = getDb();
  const now = new Date();
  for (const [key, value] of Object.entries(body)) {
    db.insert(appSettings)
      .values({ key, value: String(value), updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: String(value), updatedAt: now } })
      .run();
  }
}
