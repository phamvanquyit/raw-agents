import { Hono } from "hono";
import { llmProviders } from "../../common/db/client.js";
import { listQuery } from "../../common/db/list-query.util.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { fetchModelsForProvider } from "./fetchModels.js";
import { createProvider, deleteProvider, getProvider, updateProvider } from "./llm-providers.service.js";

const app = new Hono();

function maskApiKey(key?: string) {
  if (!key) return "";
  if (key.length > 8) return `${key.slice(0, 4)}••••${key.slice(-4)}`;
  return "••••••••";
}

// GET /api/providers?page=1&limit=50&sorts=-createdAt
// Exclude `models` array and full apiKey from list response to keep payload small
app.get("/", (c) => {
  const result = listQuery({ table: llmProviders }, c.req.query());
  return c.json({
    ...result,
    items: result.items.map(({ id, label, provider, models, apiKey }) => ({
      id,
      label,
      provider,
      countModels: (models ?? []).length,
      maskedApiKey: maskApiKey(apiKey),
    })),
  });
});

// GET /api/providers/:id/models → models list for a single provider
app.get("/:id/models", (c) => {
  const row = getProvider(c.req.param("id"));
  if (!row) throw new BadRequestException("Provider not found");
  return c.json(row.models ?? []);
});

// GET /api/providers/:id → full provider detail (includes apiKey, models, etc.)
app.get("/:id", (c) => {
  const row = getProvider(c.req.param("id"));
  if (!row) throw new BadRequestException("Provider not found");
  return c.json(row);
});

// POST /api/providers
// → Fetch models trước, nếu OK thì lưu provider + models vào DB
app.post("/", async (c) => {
  const body = await c.req.json();
  const { provider, apiKey = "", customBaseUrl = "" } = body;

  // Fetch models từ provider để verify
  try {
    const models = await fetchModelsForProvider({ provider, apiKey, customBaseUrl });
    const isAnthropicOk = provider === "anthropic";
    if (models.length === 0 && !isAnthropicOk) {
      throw new BadRequestException("No models found. Check your API key and Base URL.");
    }
    // Lưu provider cùng danh sách models
    const row = createProvider({ ...body, models });
    return c.json(row, 201);
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new BadRequestException(`Could not connect to provider: ${msg}`);
  }
});

// PUT /api/providers/:id
app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(updateProvider(c.req.param("id"), body));
});

// POST /api/providers/:id/refresh-models
// → Re-fetch models cho provider đã lưu, cập nhật lại DB
app.post("/:id/refresh-models", async (c) => {
  const id = c.req.param("id");
  const existing = getProvider(id);
  if (!existing) throw new BadRequestException("Provider not found");

  try {
    const models = await fetchModelsForProvider({
      provider: existing.provider,
      apiKey: existing.apiKey,
      customBaseUrl: existing.customBaseUrl,
    });
    const updated = updateProvider(id, { models });
    return c.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new BadRequestException(`Failed to fetch models: ${msg}`);
  }
});

// DELETE /api/providers/:id
app.delete("/:id", (c) => {
  deleteProvider(c.req.param("id"));
  return c.json({ ok: true });
});

export default app;
