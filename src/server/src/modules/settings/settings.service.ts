import { appSettings, getDb } from "../../common/db/client.js";

export function loadSettings() {
  const rows = getDb().select().from(appSettings).all();
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
