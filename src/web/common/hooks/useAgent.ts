/**
 * useAgent.ts
 *
 * React hooks + streaming helpers for running agents.
 * All AI logic is on server — this file manages WS streaming + React state.
 *
 * Exports:
 *   - useAgentRunner   → stream chat via WS (initial send)
 *   - useAgentAutoRun  → trigger autonomous work session
 *   - connectChatSSE   → subscribe to SSE stream for a running conversation (F5 reconnect / multi-tab)
 *   - ChatMessage      → shared type
 */

import { useCallback, useRef, useState } from "react";
import type { Agent } from "src/common/types";
import { updateAgent, upsertAgentLocal } from "src/modules/agents/common/agentsSlice";
import { createConversation, fetchConversations } from "src/modules/chat/common/chatSlice";
import { store } from "src/store/store";

// ─── ChatMessage — shared type ────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolLabel?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  streaming?: boolean;
  createdAt: Date;
}

// ─── Stream Helpers (internal) ────────────────────────────────────────────────

interface AgentStreamCallbacks {
  onChunk: (chunk: string) => void;
  onThinking: (chunk: string) => void;
  onToolCall: (call: { toolCallId?: string; toolName: string; toolLabel?: string; input: unknown }) => void;
  onToolResult: (call: { toolCallId?: string; toolName: string; result: unknown }) => void;
  onDone: (text: string) => void;
  onError: (err: string) => void;
  abortSignal?: AbortSignal;
  password?: string;
  token?: string;
}
/**
 * Stream chat from server-side agent.
 * POST /api/conversations/:id/chat returns SSE directly (like coding-agent).
 * We read the response body as a stream — no race conditions.
 */
async function streamAgentChat(agentId: string, message: string, conversationId: string, callbacks: AgentStreamCallbacks): Promise<void> {
  const { onChunk, onThinking, onToolCall, onToolResult, onDone, onError, abortSignal, password, token } = callbacks;

  if (abortSignal?.aborted) return;

  const BASE_URL: string = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/conversations/${conversationId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, message, password, token }),
      signal: abortSignal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError((err as Error).message ?? "Network error");
    return;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "Request failed");
    onError(text);
    return;
  }

  // Read SSE events from response body stream
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines: "data: {...}\n\n"
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr);
          switch (event.type) {
            case "text-delta":
              onChunk(event.text);
              break;
            case "thinking-delta":
              onThinking(event.text);
              break;
            case "tool-call":
              onToolCall({
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                toolLabel: event.toolLabel,
                input: event.input,
              });
              break;
            case "tool-result":
              onToolResult({
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                result: event.result,
              });
              break;
            case "done":
              onDone(event.text ?? "");
              return;
            case "error":
              onError(event.error ?? "Unknown error");
              return;
          }
        } catch {
          // ignore malformed SSE data
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError((err as Error).message ?? "Stream read error");
  }
}

/**
 * Stop a running background stream — POST /api/agents/:id/chat/stop
 */
async function stopAgentChat(agentId: string, conversationId: string): Promise<void> {
  const BASE_URL: string = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";
  try {
    await fetch(`${BASE_URL}/api/agents/${agentId}/chat/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    });
  } catch {
    // best-effort — ignore errors
  }
}

// ─── SSE reconnect helper ─────────────────────────────────────────────────────

interface ChatSSECallbacks {
  onChunk: (chunk: string) => void;
  onThinking: (chunk: string) => void;
  onToolCall: (call: { toolCallId?: string; toolName: string; toolLabel?: string; input: unknown }) => void;
  onToolResult: (call: { toolCallId?: string; toolName: string; result: unknown }) => void;
  onDone: (text: string) => void;
  onError: (err: string) => void;
  abortSignal?: AbortSignal;
}

/**
 * Connect to SSE stream for a running conversation.
 * Used for F5 reconnect or multi-tab: opens EventSource → receives live events.
 *
 * @param conversationId - The conversation to subscribe to.
 * @param callbacks      - Event handlers for stream events.
 * @param options        - For public conversations, pass { fingerprint, agentId }.
 * @returns Cleanup function that closes the EventSource.
 */
export function connectChatSSE(conversationId: string, callbacks: ChatSSECallbacks, options?: { fingerprint?: string; agentId?: string }): () => void {
  const BASE_URL: string = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";

  // Build SSE URL based on context
  let url: string;
  if (options?.fingerprint && options?.agentId) {
    // Public conversation — validates ownership via fingerprint on server
    url = `${BASE_URL}/api/public/agents/${options.agentId}/conversations/${conversationId}/stream?fp=${options.fingerprint}`;
  } else {
    // Admin conversation
    url = `${BASE_URL}/api/conversations/${conversationId}/stream`;
  }

  const eventSource = new EventSource(url);

  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      switch (event.type) {
        case "text-delta":
          callbacks.onChunk(event.text);
          break;
        case "thinking-delta":
          callbacks.onThinking(event.text);
          break;
        case "tool-call":
          callbacks.onToolCall({
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            toolLabel: event.toolLabel,
            input: event.input,
          });
          break;
        case "tool-result":
          callbacks.onToolResult({
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            result: event.result,
          });
          break;
        case "done":
          callbacks.onDone(event.text ?? "");
          eventSource.close();
          break;
        case "error":
          callbacks.onError(event.error ?? "Unknown error");
          eventSource.close();
          break;
      }
    } catch {
      // ignore malformed SSE messages
    }
  };

  eventSource.onerror = () => {
    // Connection closed — normal when task finishes or server unavailable.
    // Don't call onError to avoid confusing "stream ended" with real errors.
    eventSource.close();
  };

  // Abort signal support — close EventSource when caller aborts
  if (callbacks.abortSignal) {
    callbacks.abortSignal.addEventListener("abort", () => eventSource.close(), { once: true });
  }

  return () => eventSource.close();
}

// ─── useAgentRunner ───────────────────────────────────────────────────────────
// FE only manages streaming state + UI callbacks.
// Server handles: history load, message save, conversation status.

interface RunOptions {
  agent: Agent;
  conversationId: string;
  userMessage: string;
  onChunk: (chunk: string) => void;
  onThinking?: (chunk: string) => void;
  onToolCall: (call: { toolCallId?: string; toolName: string; toolLabel?: string; input: unknown }) => void;
  onToolResult: (call: { toolCallId?: string; toolName: string; result: unknown }) => void;
  /** Called when server is done — messages already saved by server */
  onDone: (text: string) => void;
  onError: (err: string) => void;
  password?: string;
  token?: string;
}

export function useAgentRunner() {
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<number>(0);
  // Track current run's agent + conversation for stop endpoint
  const agentIdRef = useRef<string>("");
  const conversationIdRef = useRef<string>("");

  const run = useCallback(async (options: RunOptions) => {
    const { agent, conversationId, userMessage, onChunk, onThinking, onToolCall, onToolResult, onDone, onError, password, token } = options;

    agentIdRef.current = agent.id;
    conversationIdRef.current = conversationId;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const currentRunId = ++runIdRef.current;

    setRunning(true);

    try {
      await streamAgentChat(agent.id, userMessage, conversationId, {
        onChunk,
        onThinking: onThinking ?? (() => {}),
        onToolCall,
        onToolResult,
        onDone,
        onError,
        abortSignal: abort.signal,
        password,
        token,
      });
    } finally {
      if (runIdRef.current === currentRunId) {
        setRunning(false);
      }
    }
  }, []);

  const cancel = useCallback(() => {
    // 1. Tell server to abort the background AI task
    if (agentIdRef.current && conversationIdRef.current) {
      stopAgentChat(agentIdRef.current, conversationIdRef.current).catch(() => {});
    }
    // 2. Signal the WS stream listener to clean up
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  return { run, running, cancel };
}

// ─── useAgentAutoRun ──────────────────────────────────────────────────────────
// Trigger one autonomous "work session" for an agent.
// Server saves messages + updates conversation status automatically.

const DEFAULT_START_MESSAGE = "Start working. Please complete your task and report the results.";

export function useAgentAutoRun() {
  const { run } = useAgentRunner();
  const runningAgents = useRef<Set<string>>(new Set());

  const trigger = useCallback(
    async (agent: Agent) => {
      if (runningAgents.current.has(agent.id)) return;
      runningAgents.current.add(agent.id);
      store.dispatch(upsertAgentLocal({ id: agent.id, runStatus: "running" }));

      const userMessage = agent.startMessage?.trim() || DEFAULT_START_MESSAGE;

      // Create conversation — server will save messages + update status
      // Create conversation via Redux
      const conv = await store.dispatch(createConversation({ agentId: agent.id, title: "Auto run", trigger: "cron" })).unwrap();
      const conversationId = conv.id;

      run({
        agent,
        conversationId,
        userMessage,

        onChunk: () => {},

        onToolCall: ({ toolName, toolLabel }) => {
          console.debug(`[AutoRun] ${agent.name} → tool: ${toolLabel ?? toolName}`);
        },

        onToolResult: ({ toolName, result }) => {
          console.debug(`[AutoRun] ${agent.name} ← result:`, toolName, result);
        },

        onDone: async () => {
          // Server already saved assistant message + updated conversation status
          await store.dispatch(updateAgent({ id: agent.id, lastRunAt: new Date() }));
          store.dispatch(upsertAgentLocal({ id: agent.id, runStatus: "idle" }));
          runningAgents.current.delete(agent.id);
          void store.dispatch(fetchConversations(agent.id));
          console.info(`[AutoRun] ${agent.name} done → idle`);
        },

        onError: async (err) => {
          console.error(`[AutoRun] ${agent.name} error:`, err);
          // Server already updated conversation to failed status
          await store.dispatch(updateAgent({ id: agent.id, lastRunAt: new Date() }));
          store.dispatch(upsertAgentLocal({ id: agent.id, runStatus: "idle" }));
          runningAgents.current.delete(agent.id);
          void store.dispatch(fetchConversations(agent.id));
        },
      });
    },
    [run],
  );

  return { trigger };
}
