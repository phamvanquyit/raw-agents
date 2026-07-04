import type { AgentTool } from "src/common/types";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolEditTarget = AgentTool | null | "new";

export function toolEditKey(target: ToolEditTarget): string {
  if (target === null) return "";
  if (target === "new") return "new";
  return target.id;
}

export interface BuiltinToolMetadata {
  toolName: string;
  toolLabel: string;
  description: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface IToolsState extends IBaseState {
  filter: { page: number; limit: number; sorts?: string; search?: string };
  builtins: BuiltinToolMetadata[];
}

const initialState: IToolsState = {
  total: 0,
  items: [] as AgentTool[],
  selected: [],
  filter: { page: 1, limit: 1000, sorts: "-createdAt" },
  builtins: [],
};

// ─── Slice ────────────────────────────────────────────────────────────────────

const { actions: _actions, reducer: toolsReducer } = new BaseReducer<IToolsState>({
  name: "tools",
  basePath: "/api/tools",
  initialState,

  // syncBuiltins: extract builtin metadata but keep them in items
  extraActions: {
    syncBuiltins(state: IToolsState) {
      state.builtins = (state.items as any[])
        .filter((t) => t.isBuiltin)
        .map((t) => ({
          toolName: t.name ?? t.toolName,
          toolLabel: t.label ?? t.toolLabel,
          description: t.description ?? "",
        }));
      // Note: builtins stay in items — needed for agent tool assignment UI
    },
  },
}).createSlice();

export const {
  fetchItems: fetchToolsRaw,
  createItem: createTool,
  updateItem: updateTool,
  deleteItem: deleteTool,
  updateFilter: updateToolsFilter,
  upsertLocal: upsertToolLocal,
  removeLocal: removeToolLocal,
  syncBuiltins,
} = _actions as any;

/** fetchTools = fetchItems then extract builtins */
export const fetchTools = (params?: Record<string, any>) => async (dispatch: any) => {
  await dispatch(fetchToolsRaw(params ?? {}));
  dispatch(syncBuiltins());
};

export { toolsReducer };
export default toolsReducer;
