/**
 * wsHub — singleton WebSocket broadcast hub
 *
 * Supports:
 *   - wsHub.broadcast(type, payload) — fan-out to all connected clients
 *   - wsHub.send(clientId, type, payload) — targeted send to one client
 *   - wsHub.emit(type, payload) — alias for broadcast (back-compat)
 *
 * Each connection is assigned a unique clientId on open.
 * State/CRUD events use broadcast. Chat tokens stream over SSE, not WS.
 */

import type { ServerWebSocket } from "bun";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WsEventType =
  | "agents:created"
  | "agents:updated"
  | "agents:deleted"
  | "agents:tools-updated"
  | "conversations:created"
  | "conversations:updated"
  | "conversations:deleted"
  | "messages:created"
  | "messages:updated"
  | "teams:created"
  | "teams:updated"
  | "teams:deleted"
  | "tools:created"
  | "tools:updated"
  | "tools:deleted"
  | "tools:reordered"
  | "tool-folders:created"
  | "tool-folders:updated"
  | "tool-folders:deleted"
  | "tool-folders:reordered"
  | "mcp-servers:created"
  | "mcp-servers:updated"
  | "mcp-servers:deleted"
  | "users:created"
  | "users:updated"
  | "users:deleted"
  | "ping";

export interface WsEvent<T = unknown> {
  type: WsEventType;
  payload: T;
}

// ─── Hub ──────────────────────────────────────────────────────────────────────

class WsHub {
  private clients = new Map<string, ServerWebSocket<unknown>>();

  add(ws: ServerWebSocket<unknown>, clientId: string) {
    this.clients.set(clientId, ws);
  }

  remove(clientId: string) {
    this.clients.delete(clientId);
  }

  /** Broadcast to ALL connected clients */
  broadcast<T>(type: WsEventType, payload: T) {
    if (this.clients.size === 0) return;
    const msg = JSON.stringify({ type, payload } satisfies WsEvent<T>);
    for (const ws of this.clients.values()) {
      try {
        ws.send(msg);
      } catch {
        // ignore dead sockets — will be removed on close
      }
    }
  }

  /** Send to a specific client by clientId */
  send<T>(clientId: string, type: WsEventType, payload: T) {
    const ws = this.clients.get(clientId);
    if (!ws) return false;
    try {
      ws.send(JSON.stringify({ type, payload } satisfies WsEvent<T>));
      return true;
    } catch {
      return false;
    }
  }

  /** Alias for broadcast — back-compat with existing route code */
  emit<T>(type: WsEventType, payload: T) {
    this.broadcast(type, payload);
  }

  get size() {
    return this.clients.size;
  }
}

export const wsHub = new WsHub();
