import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";

import { authReducer } from "src/common/authSlice";
import { agentsReducer } from "src/modules/agents/common/agentsSlice";
import { chatReducer } from "src/modules/chat/common/chatSlice";
import { llmProvidersReducer } from "src/modules/llm-providers/common/llmProvidersSlice";
import { teamsReducer } from "src/modules/teams/common/teamsSlice";
import { toolsReducer } from "src/modules/tools/common/toolsSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    llmProviders: llmProvidersReducer,
    agents: agentsReducer,
    tools: toolsReducer,
    teams: teamsReducer,
    chat: chatReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// ─── Typed hooks — dùng thay cho useDispatch/useSelector thông thường ─────────
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = <T>(selector: (state: RootState) => T): T => useSelector(selector);
