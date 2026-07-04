import { eq } from "drizzle-orm";
import { type NewLlmProvider, getDb, llmProviders } from "../../common/db/client.js";

export function getProvider(id: string) {
  return getDb().select().from(llmProviders).where(eq(llmProviders.id, id)).get();
}

export function createProvider(body: Pick<NewLlmProvider, "provider" | "label" | "apiKey" | "customBaseUrl" | "models">) {
  const now = new Date();
  const row: NewLlmProvider = { ...body, createdAt: now, updatedAt: now };
  const [created] = getDb().insert(llmProviders).values(row).returning().all();
  return created;
}

export function updateProvider(id: string, body: Partial<Pick<NewLlmProvider, "provider" | "label" | "apiKey" | "customBaseUrl" | "models">>) {
  const db = getDb();
  db.update(llmProviders)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(llmProviders.id, id))
    .run();
  return db.select().from(llmProviders).where(eq(llmProviders.id, id)).get();
}

export function deleteProvider(id: string) {
  getDb().delete(llmProviders).where(eq(llmProviders.id, id)).run();
}
