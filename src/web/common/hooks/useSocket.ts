/**
 * useSocket — mounts the WebSocket connection and wires up store updates.
 *
 * Call ONCE at the app root (App.tsx).
 * Một listener duy nhất xử lý tất cả events qua type + payload.
 */

import { useEffect } from "react";
import type { Agent, AgentConversation, AgentTool } from "src/common/types";
import { removeAgentLocal, upsertAgentLocal } from "src/modules/agents/common/agentsSlice";
import { removeConversationLocal, upsertConversationLocal } from "src/modules/chat/common/chatSlice";
import { removeTeamLocal, upsertTeamLocal } from "src/modules/teams/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";
import { removeToolLocal, upsertToolLocal } from "src/modules/tools/common/toolsSlice";
import { store } from "src/store/store";
import { wsClient } from "../api/wsClient";
import type { WsEvent } from "../api/wsClient";

function handleEvent(event: WsEvent) {
  const { type, payload } = event;

  switch (type) {
    // ── Agents ──────────────────────────────────────────────────────────────
    case "agents:created":
    case "agents:updated": {
      store.dispatch(upsertAgentLocal(payload as Agent));
      break;
    }
    case "agents:deleted": {
      store.dispatch(removeAgentLocal((payload as { id: string }).id));
      break;
    }

    // ── Conversations ────────────────────────────────────────────────────────
    case "conversations:created":
    case "conversations:updated": {
      const conv = payload as AgentConversation;
      // Skip public conversations — they belong to public users and should not
      // appear in the admin conversation list.
      if (conv.trigger === "public") break;
      store.dispatch(upsertConversationLocal(conv));
      break;
    }
    case "conversations:deleted": {
      store.dispatch(removeConversationLocal((payload as { id: string }).id));
      break;
    }

    // ── Teams ────────────────────────────────────────────────────────────────
    case "teams:created":
    case "teams:updated": {
      store.dispatch(upsertTeamLocal(payload as TeamWithMembers));
      break;
    }
    case "teams:deleted": {
      store.dispatch(removeTeamLocal((payload as { id: string }).id));
      break;
    }

    // ── Tools ─────────────────────────────────────────────────────────────────
    case "tools:created":
    case "tools:updated": {
      store.dispatch(upsertToolLocal(payload as AgentTool));
      break;
    }
    case "tools:deleted": {
      store.dispatch(removeToolLocal((payload as { id: string }).id));
      break;
    }

    default:
      break;
  }
}

export function useSocket() {
  useEffect(() => {
    wsClient.connect();
    // Single listener — route by type inside handleEvent
    const unsub = wsClient.onAny(handleEvent);
    return unsub;
  }, []);
}
