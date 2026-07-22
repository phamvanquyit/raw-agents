import { createAsyncThunk } from "@reduxjs/toolkit";
import { apiClient } from "src/common/api";
import type { LlmProvider } from "src/common/types";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

// ─── Provider metadata ────────────────────────────────────────────────────────

export const PROVIDER_META: Record<string, { id: string; label: string; keyPlaceholder: string; defaultBase: string }> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    keyPlaceholder: "sk-...",
    defaultBase: "https://api.openai.com/v1",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    keyPlaceholder: "sk-or-...",
    defaultBase: "https://openrouter.ai/api/v1",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    keyPlaceholder: "sk-ant-...",
    defaultBase: "https://api.anthropic.com",
  },
  google: {
    id: "google",
    label: "Google Gemini",
    keyPlaceholder: "AIza...",
    defaultBase: "",
  },
  ollama: {
    id: "ollama",
    label: "Ollama",
    keyPlaceholder: "(not required)",
    defaultBase: "http://localhost:11434",
  },
  custom: {
    id: "custom",
    label: "Custom",
    keyPlaceholder: "...",
    defaultBase: "",
  },
};

export const PROVIDER_OPTIONS = Object.entries(PROVIDER_META).map(([value, m]) => ({ value, label: m.label }));

export function generateLabel(provider: string, existingItems: LlmProvider[]): string {
  const base = PROVIDER_META[provider]?.label ?? provider;
  const taken = new Set(existingItems.map((i) => i.label));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface ILlmProvidersState extends IBaseState {
  filter: {
    page?: number;
    limit?: number;
    sorts?: string;
    search?: string;
  };
}

const initialState: ILlmProvidersState = {
  total: 0,
  items: [] as LlmProvider[],
  selected: [],
  filter: {},
};

// ─── Extra actions ────────────────────────────────────────────────────────────

// refreshModels: POST /api/providers/:id/refresh-models → update item in state
const refreshModels = createAsyncThunk("llmProviders/refreshModels", async (id: string, { rejectWithValue }) => {
  try {
    const updated = (await apiClient.post(`/api/providers/${id}/refresh-models`)) as LlmProvider;
    return updated;
  } catch (err: any) {
    return rejectWithValue(err?.message ?? "Failed to refresh models");
  }
});

// ─── Slice ────────────────────────────────────────────────────────────────────

const llmProvidersBaseReducer = new BaseReducer<ILlmProvidersState>({
  name: "llmProviders",
  basePath: "/api/providers",
  initialState,
  extraReducers: (builder) => {
    builder.addCase(refreshModels.fulfilled, (state, action) => {
      const updated = action.payload as LlmProvider;
      const index = state.items.findIndex((item) => item.id === updated.id);
      if (index >= 0) {
        state.items.splice(index, 1, Object.assign(state.items[index], updated));
      }
    });
  },
});

const { actions: _actions, reducer: llmProvidersReducer } = llmProvidersBaseReducer.createSlice();

export const {
  fetchItems: fetchLlmProviders,
  getItem: getLlmProvider,
  createItem: createLlmProvider,
  updateItem: updateLlmProvider,
  deleteItem: deleteLlmProvider,
  reset: resetLlmProviders,
  updateFilter: updateLlmProvidersFilter,
  updateSelected: updateLlmProvidersSelected,
  upsertLocal: upsertLlmProviderLocal,
  removeLocal: removeLlmProviderLocal,
} = _actions as any;

export { refreshModels, llmProvidersReducer };
export default llmProvidersReducer;
