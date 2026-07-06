import type { AgentTool } from "src/common/types";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolEditTarget = AgentTool | null | "new";

export function toolEditKey(target: ToolEditTarget): string {
  if (target === null) return "";
  if (target === "new") return "new";
  return target.id;
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface IToolsState extends IBaseState {
  filter: { page: number; limit: number; sorts?: string; search?: string };
}

const initialState: IToolsState = {
  total: 0,
  items: [] as AgentTool[],
  selected: [],
  filter: { page: 1, limit: 1000, sorts: "-createdAt" },
};

// ─── Slice ────────────────────────────────────────────────────────────────────

const { actions: _actions, reducer: toolsReducer } = new BaseReducer<IToolsState>({
  name: "tools",
  basePath: "/api/tools",
  initialState,
}).createSlice();

export const {
  fetchItems: fetchTools,
  createItem: createTool,
  updateItem: updateTool,
  deleteItem: deleteTool,
  updateFilter: updateToolsFilter,
  upsertLocal: upsertToolLocal,
  removeLocal: removeToolLocal,
} = _actions as any;

export { toolsReducer };
export default toolsReducer;
