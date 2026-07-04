/**
 * getChatModel.ts (server-side)
 *
 * Resolve BaseChatModel từ agent.aiProvider (UUID) + agent.aiModel.
 * Đọc trực tiếp từ DB — không cần HTTP round-trip.
 *
 * Replaces getLanguageModel.ts (Vercel AI SDK) with LangChain chat models.
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { eq } from "drizzle-orm";
import { getDb, llmProviders } from "../db/client.js";

export async function getChatModel(providerId: string, modelId: string): Promise<BaseChatModel> {
  const db = getDb();
  const p = db.select().from(llmProviders).where(eq(llmProviders.id, providerId)).get();

  if (!p) {
    throw new Error(`Provider "${providerId}" not found in DB`);
  }

  const { provider, apiKey, customBaseUrl } = p;
  const baseURL = customBaseUrl?.trim() || undefined;

  if (provider === "openai" || provider === "custom") {
    // Enable reasoning summary for o-series models (o1, o3-mini, o4-mini)
    const isReasoningModel = /^o[134]/.test(modelId);
    return new ChatOpenAI({
      model: modelId,
      apiKey,
      ...(baseURL ? { configuration: { baseURL } } : {}),
      ...(isReasoningModel
        ? {
            useResponsesApi: true,
            reasoning: { effort: "medium" },
            // NOTE: add `summary: "auto"` to reasoning once org is verified at
            // https://platform.openai.com/settings/organization/general
          }
        : {}),
    });
  }

  if (provider === "ollama") {
    const base = (baseURL ?? "http://localhost:11434").replace(/\/$/, "");
    return new ChatOpenAI({
      model: modelId,
      apiKey: apiKey || "ollama",
      configuration: { baseURL: `${base}/v1` },
    });
  }

  if (provider === "openrouter") {
    return new ChatOpenAI({
      model: modelId,
      apiKey,
      configuration: {
        baseURL: baseURL || "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://raw-agents.dev",
          "X-Title": "RawAgents",
        },
      },
    });
  }

  if (provider === "anthropic") {
    const { ChatAnthropic } = await import("@langchain/anthropic");
    return new ChatAnthropic({
      model: modelId,
      apiKey,
      ...(baseURL ? { clientOptions: { baseURL } } : {}),
    });
  }

  if (provider === "google") {
    const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");
    return new ChatGoogleGenerativeAI({
      model: modelId,
      apiKey,
      ...(baseURL ? { baseUrl: baseURL } : {}),
    });
  }

  // Fallback: OpenAI-compatible with custom baseURL
  if (baseURL) {
    return new ChatOpenAI({
      model: modelId,
      apiKey,
      configuration: { baseURL },
    });
  }

  throw new Error(`Provider type "${provider}" not supported`);
}
