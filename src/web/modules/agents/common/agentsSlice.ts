import { createAsyncThunk } from "@reduxjs/toolkit";
import { apiClient } from "src/common/api";
import type { Agent } from "src/common/types";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

// ─── State ────────────────────────────────────────────────────────────────────

export interface IAgentsState extends IBaseState {
  filter: {
    page?: number;
    limit?: number;
    sorts?: string;
    search?: string;
  };
}

const initialState: IAgentsState = {
  total: 0,
  items: [] as Agent[],
  selected: [],
  filter: {},
};

// ─── Extra actions ────────────────────────────────────────────────────────────

export const cloneAgent = createAsyncThunk("agents/clone", async (id: string, { rejectWithValue }) => {
  try {
    return (await apiClient.post(`/api/agents/${id}/clone`)) as Agent;
  } catch (err: any) {
    return rejectWithValue(err?.message ?? "Failed to clone agent");
  }
});

// ─── Slice ────────────────────────────────────────────────────────────────────

const { actions: _actions, reducer: agentsReducer } = new BaseReducer<IAgentsState>({
  name: "agents",
  basePath: "/api/agents",
  initialState,
  extraReducers: (builder) => {
    builder.addCase(cloneAgent.fulfilled, (state, action) => {
      const info = action.payload as Agent;
      const index = state.items.findIndex((item) => item.id === info.id);
      if (index >= 0) {
        state.items.splice(index, 1, Object.assign(state.items[index], info));
      } else {
        state.items.unshift(info);
      }
    });
  },
}).createSlice();

export const {
  fetchItems: fetchAgents,
  getItem: fetchOneAgent,
  createItem: createAgent,
  updateItem: updateAgent,
  deleteItem: deleteAgent,
  updateFilter: updateAgentsFilter,
  upsertLocal: upsertAgentLocal,
  removeLocal: removeAgentLocal,
} = _actions as any;

export { agentsReducer };
export default agentsReducer;
