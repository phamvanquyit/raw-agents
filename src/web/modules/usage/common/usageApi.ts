import { apiClient } from "src/common/api";

export type UsageCategory = {
  id: "system_prompt" | "tools" | "conversation" | string;
  label: string;
  tokens: number;
};

export type ContextUsage = {
  agentId: string;
  conversationId: string | null;
  model: string | null;
  providerId: string | null;
  categories: UsageCategory[];
  systemPromptTokens: number;
  toolDefTokens: number;
  conversationTokens: number;
  estimatedTotal: number;
};

export type TokenUsageRow = {
  id: string;
  agentId: string | null;
  agentName?: string | null;
  conversationId: string | null;
  ownerId: string;
  providerId: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  systemPromptTokens: number;
  toolDefTokens: number;
  conversationTokens: number;
  estimatedTotal: number;
  createdAt: string | Date;
};

export type UsageSummary = {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  systemPromptTokens: number;
  toolDefTokens: number;
  conversationTokens: number;
  estimatedTotal: number;
  categories: UsageCategory[];
};

export type UsageListParams = {
  agentId?: string;
  model?: string;
  conversationId?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
};

const BASE = "/api/usage";

export const usageApi = {
  list: (params?: UsageListParams) => {
    const q = new URLSearchParams();
    if (params?.agentId) q.set("agentId", params.agentId);
    if (params?.model) q.set("model", params.model);
    if (params?.conversationId) q.set("conversationId", params.conversationId);
    if (params?.from != null) q.set("from", String(params.from));
    if (params?.to != null) q.set("to", String(params.to));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const qs = q.toString();
    return apiClient.get<{ items: TokenUsageRow[]; total: number; limit: number; offset: number }>(`${BASE}${qs ? `?${qs}` : ""}`);
  },
  models: () => apiClient.get<{ items: string[] }>(`${BASE}/models`),
  summary: (params?: { agentId?: string; model?: string; from?: number; to?: number }) => {
    const q = new URLSearchParams();
    if (params?.agentId) q.set("agentId", params.agentId);
    if (params?.model) q.set("model", params.model);
    if (params?.from != null) q.set("from", String(params.from));
    if (params?.to != null) q.set("to", String(params.to));
    const qs = q.toString();
    return apiClient.get<UsageSummary>(`${BASE}/summary${qs ? `?${qs}` : ""}`);
  },
  context: (agentId: string, conversationId?: string | null) => {
    const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
    return apiClient.get<ContextUsage>(`${BASE}/context/${agentId}${q}`);
  },
};

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
