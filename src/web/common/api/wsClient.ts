/**
 * wsClient — singleton WebSocket connection to the Raw Agents server.
 *
 * Features:
 *  - Auto-reconnect with exponential back-off (max 30s)
 *  - Typed event subscription via `wsClient.on(type, handler)`
 *  - wsClient.send(type, payload) — send message to server
 *  - CRUD sync events (agents, conversations, tools, …)
 *  - clientId received from server on connect (for targeted events)
 *  - Heartbeat ping every 25s to keep connection alive through proxies
 *
 * Chat tokens stream over SSE, not WebSocket.
 */

// ─── Types (mirrored from server wsHub — keep in sync) ───────────────────────

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
  | "mcp-servers:created"
  | "mcp-servers:updated"
  | "mcp-servers:deleted"
  | "ping"
  | "client:id";

export interface WsEvent<T = unknown> {
  type: WsEventType;
  payload: T;
}

// ─── Listener registry ────────────────────────────────────────────────────────

type AnyHandler = (payload: unknown) => void;
const listeners = new Map<WsEventType | "*", Set<AnyHandler>>();

function notify(event: WsEvent) {
  const specific = listeners.get(event.type);
  if (specific) {
    for (const fn of specific) fn(event.payload);
  }
  const wildcard = listeners.get("*");
  if (wildcard) {
    for (const fn of wildcard) fn(event);
  }
}

// ─── Connection state ─────────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let retryDelay = 1_000;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let destroyed = false;

/** clientId assigned by server on connect — used to correlate targeted events */
let clientId: string | null = null;

function getWsUrl(): string {
  const apiUrl = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";

  if (apiUrl) {
    // Production: convert http(s) base URL to ws(s)
    return `${apiUrl.replace(/^https?/, (m) => (m === "https" ? "wss" : "ws"))}/ws`;
  }

  // Dev: Vite proxies /ws → server. Use same-origin so proxy works.
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

function connect() {
  if (destroyed) return;

  const url = getWsUrl();
  ws = new WebSocket(url);

  ws.onopen = () => {
    retryDelay = 1_000; // reset back-off

    // Heartbeat ping every 25s
    pingInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping", payload: null }));
      }
    }, 25_000);
  };

  ws.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data as string) as WsEvent;

      // Handle clientId assignment from server
      if ((event as { type: string }).type === "client:id") {
        clientId = (event.payload as { clientId: string }).clientId;
        // Also notify listeners so waitForClientId() resolves on reconnect
        notify(event);
        return;
      }

      notify(event);
    } catch {
      // ignore malformed messages
    }
  };

  ws.onclose = () => {
    clearPing();
    clientId = null;
    if (destroyed) return;
    retryTimeout = setTimeout(() => {
      retryDelay = Math.min(retryDelay * 2, 30_000);
      connect();
    }, retryDelay);
  };

  ws.onerror = () => {
    // onclose fires right after; we let that handle reconnect
  };
}

function clearPing() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const wsClient = {
  /** Subscribe to a specific event type */
  on<T>(type: WsEventType, handler: (payload: T) => void): () => void {
    let set = listeners.get(type);
    if (!set) {
      set = new Set();
      listeners.set(type, set);
    }
    set.add(handler as AnyHandler);
    return () => listeners.get(type)?.delete(handler as AnyHandler);
  },

  /** Subscribe to ALL events (payload is the full WsEvent) */
  onAny(handler: (event: WsEvent) => void): () => void {
    let set = listeners.get("*");
    if (!set) {
      set = new Set();
      listeners.set("*", set);
    }
    set.add(handler as AnyHandler);
    return () => listeners.get("*")?.delete(handler as AnyHandler);
  },

  /** Send a message to the server */
  send(type: string, payload: unknown) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    } else {
      console.warn("[wsClient] Cannot send — not connected");
    }
  },

  /** Get the current clientId assigned by the server */
  getClientId() {
    return clientId;
  },

  /** Wait until clientId is available (resolves immediately if already set) */
  waitForClientId(): Promise<string> {
    if (clientId) return Promise.resolve(clientId);
    return new Promise((resolve) => {
      const unsub = wsClient.on<{ clientId: string }>("client:id", (payload) => {
        unsub();
        resolve(payload.clientId);
      });
    });
  },

  /** Manually start the connection (called once at app boot) */
  connect,

  /** Tear down — call only when unmounting the whole app */
  destroy() {
    destroyed = true;
    clearPing();
    if (retryTimeout) clearTimeout(retryTimeout);
    ws?.close();
  },

  get readyState() {
    return ws?.readyState ?? WebSocket.CLOSED;
  },
};
