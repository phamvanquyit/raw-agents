/**
 * useChatAgent.ts
 *
 * AI chat via SSE — POST to assistant endpoint, read streaming response.
 *
 * Flow per conversation turn:
 *   1. Client POSTs to /api/assistants/{type}/stream with messages
 *   2. Server returns SSE: chunk | tool-call | tool-result | done | error
 *   3. All tools execute server-side — no FE execution needed
 */

import type React from "react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useAppSelector } from "../../../store/store";
import { store } from "../../../store/store";
import type { ChatAgentMessage } from "../common/types";
import { formatToolName, nextId } from "../common/utils";
import { useAutoScroll } from "./useAutoScroll";

// ── Status type ───────────────────────────────────────────────────────────────
export type ChatStatus = "ready" | "submitted" | "streaming" | "done" | "error";

// ── Tool action event ─────────────────────────────────────────────────────────
export type ToolActionEvent =
  | { type: "tool-call"; toolName: string; toolLabel: string; input: unknown }
  | { type: "tool-result"; toolName: string; output: unknown };

// ── SSE event types from server ───────────────────────────────────────────────
interface SseChunkEvent {
  type: "chunk";
  text: string;
}
interface SseToolCallEvent {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  toolLabel: string;
  input: unknown;
}
interface SseToolResultEvent {
  type: "tool-result";
  toolCallId?: string;
  toolName: string;
  result: unknown;
}
interface SseDoneEvent {
  type: "done";
}
interface SseErrorEvent {
  type: "error";
  error: string;
}

type SseEvent = SseChunkEvent | SseToolCallEvent | SseToolResultEvent | SseDoneEvent | SseErrorEvent;

// ── Hook options ─────────────────────────────────────────────────────────────
export interface UseChatAgentOptions {
  propProviderId?: string;
  propModel?: string;
  externalMessages: ChatAgentMessage[];
  systemPrompt?: string;
  /** SSE endpoint URL — e.g. "/api/assistants/coding/stream" */
  streamUrl: string;
  /** Extra body fields to include in the POST request */
  streamBody?: Record<string, unknown>;
  maxSteps?: number;
  onFinish?: (messages: ChatAgentMessage[]) => void;
  onClear?: () => void;
  onChangeAiProvider?: (id: string) => void;
  onChangeModel?: (model: string) => void;
  onToolAction?: (event: ToolActionEvent) => void;
}

// ── Hook return value ─────────────────────────────────────────────────────────
export interface UseChatAgentReturn {
  messages: ChatAgentMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatAgentMessage[]>>;
  status: ChatStatus;
  generating: boolean;
  providerId: string | null;
  model: string;
  hasMessages: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: (node: HTMLElement | null) => void;
  scrollToBottom: () => void;
  forceFollow: () => void;
  handleSend: (text: string) => Promise<void>;
  handleCancel: () => void;
  handleClear: () => void;
  handleProviderChange: (id: string) => void;
  handleModelChange: (model: string) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useChatAgent({
  propProviderId,
  propModel,
  externalMessages,
  systemPrompt = "",
  streamUrl,
  streamBody,
  maxSteps = 12,
  onFinish,
  onClear,
  onChangeAiProvider,
  onChangeModel,
  onToolAction,
}: UseChatAgentOptions): UseChatAgentReturn {
  const providerItems = useAppSelector((s) => s.llmProviders.items);
  const providersLoaded = useAppSelector((s) => s.llmProviders.items.length > 0 || s.llmProviders.total === 0);
  void providersLoaded; // used implicitly

  const [internalProviderId, setInternalProviderId] = useState<string | null>(propProviderId || null);
  const [internalModel, setInternalModel] = useState<string>(propModel || "");

  useEffect(() => {
    if (propProviderId) setInternalProviderId(propProviderId);
  }, [propProviderId]);
  useEffect(() => {
    if (propModel) setInternalModel(propModel);
  }, [propModel]);

  const providerId = internalProviderId;
  const model = internalModel;

  const [messages, setMessages] = useState<ChatAgentMessage[]>(externalMessages);
  const [internalStatus, setInternalStatus] = useState<ChatStatus>("ready");
  const status = internalStatus;
  const generating = status === "submitted" || status === "streaming";

  const prevExtRef = useRef<ChatAgentMessage[]>(externalMessages);
  useEffect(() => {
    if (prevExtRef.current !== externalMessages && internalStatus === "ready") {
      prevExtRef.current = externalMessages;
      setMessages(externalMessages);
    }
  }, [externalMessages, internalStatus]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const onFinishRef = useRef(onFinish);
  const onToolActionRef = useRef(onToolAction);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);
  useEffect(() => {
    onToolActionRef.current = onToolAction;
  }, [onToolAction]);

  useEffect(() => {
    if (propProviderId) return;
    if (!providersLoaded || providerItems.length === 0) return;
    if (internalProviderId) return;
    setInternalProviderId(providerItems[0].id);
  }, [providersLoaded, providerItems, propProviderId, internalProviderId]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  const { scrollRef: scrollContainerRef, scrollToBottom, forceFollow } = useAutoScroll();

  const hasMessages = messages.length > 0;

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setInternalStatus("ready");
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || generating) return;
      if (!internalProviderId || !model) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: ChatAgentMessage = {
        id: nextId("u"),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      const assistantId = nextId("a");
      const assistantMsg: ChatAgentMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        timestamp: new Date(),
      };

      const historySnapshot = messages;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInternalStatus("submitted");

      const aiHistory = historySnapshot
        .filter((m) => m.role === "user" || m.role === "assistant")
        .filter((m) => m.content.trim() !== "")
        .slice(-10)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const newMsgs: ChatAgentMessage[] = [userMsg, assistantMsg];
      let assistantText = "";
      let currentAssistantId = assistantId;
      let toolsStarted = false;

      try {
        const response = await fetch(streamUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId: internalProviderId,
            modelId: model,
            systemPrompt,
            messages: [...aiHistory, { role: "user", content: text }],
            maxSteps,
            ...streamBody,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const errText = await response.text();
          throw new Error(errText || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            let event: SseEvent;
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            switch (event.type) {
              case "chunk": {
                setInternalStatus("streaming");

                if (toolsStarted) {
                  toolsStarted = false;
                  assistantText = event.text;
                  const newId = nextId("a");
                  currentAssistantId = newId;
                  const bubble: ChatAgentMessage = {
                    id: newId,
                    role: "assistant",
                    content: event.text,
                    streaming: true,
                    timestamp: new Date(),
                  };
                  newMsgs.push(bubble);
                  setMessages((prev) => [...prev, bubble]);
                } else {
                  assistantText += event.text;
                  setMessages((prev) => prev.map((m) => (m.id === currentAssistantId ? { ...m, content: assistantText, streaming: true } : m)));
                  const idx = newMsgs.findIndex((m) => m.id === currentAssistantId);
                  if (idx !== -1) newMsgs[idx] = { ...newMsgs[idx], content: assistantText, streaming: true };
                }
                break;
              }

              case "tool-call": {
                toolsStarted = true;

                // Freeze current text bubble or remove empty one
                if (assistantText.trim()) {
                  const freezeId = currentAssistantId;
                  setMessages((prev) => prev.map((m) => (m.id === freezeId ? { ...m, streaming: false } : m)));
                  const idx = newMsgs.findIndex((m) => m.id === freezeId);
                  if (idx !== -1) newMsgs[idx] = { ...newMsgs[idx], streaming: false };
                  assistantText = "";
                } else {
                  const emptyId = currentAssistantId;
                  setMessages((prev) => prev.filter((m) => m.id !== emptyId));
                  const emptyIdx = newMsgs.findIndex((m) => m.id === emptyId);
                  if (emptyIdx !== -1) newMsgs.splice(emptyIdx, 1);
                }

                const toolsState = store.getState().tools;
                const rawLabel =
                  event.toolLabel ||
                  toolsState.builtins.find((b) => b.toolName === event.toolName)?.toolLabel ||
                  (toolsState.items as any[]).find((t) => t.name === event.toolName)?.label ||
                  event.toolName;
                const tLabel = rawLabel.includes(" ") ? rawLabel : formatToolName(rawLabel);

                const tcMsgId = nextId("tc");
                const toolMsg: ChatAgentMessage = {
                  id: tcMsgId,
                  role: "tool-call",
                  content: event.toolName,
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  toolLabel: tLabel,
                  toolInput: event.input,
                  timestamp: new Date(),
                };
                newMsgs.push(toolMsg);
                setMessages((prev) => [...prev, toolMsg]);
                onToolActionRef.current?.({ type: "tool-call", toolName: event.toolName, toolLabel: tLabel, input: event.input });
                break;
              }

              case "tool-result": {
                const rawOutput = event.result;
                const resultStr = typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput);
                setMessages((prev) => {
                  let matchIdx = -1;
                  if (event.toolCallId) {
                    matchIdx = prev.findIndex((m) => m.role === "tool-call" && m.toolCallId === event.toolCallId && !m.toolOutput);
                  }
                  if (matchIdx === -1) {
                    const revIdx = [...prev].reverse().findIndex((m) => m.role === "tool-call" && m.toolName === event.toolName && !m.toolOutput);
                    matchIdx = revIdx === -1 ? -1 : prev.length - 1 - revIdx;
                  }
                  if (matchIdx === -1) return prev;
                  return prev.map((m, i) => (i === matchIdx ? { ...m, toolOutput: resultStr } : m));
                });
                onToolActionRef.current?.({ type: "tool-result", toolName: event.toolName, output: rawOutput });
                break;
              }

              case "done": {
                // Finalize
                setMessages((prev) =>
                  prev
                    .map((m) => (m.role === "assistant" && m.streaming ? { ...m, streaming: false } : m))
                    .filter((m) => !(m.role === "assistant" && !m.content.trim())),
                );
                for (let i = newMsgs.length - 1; i >= 0; i--) {
                  const m = newMsgs[i];
                  if (m.role === "assistant" && !m.content.trim()) {
                    newMsgs.splice(i, 1);
                  } else if ((m as any).streaming) {
                    (m as any).streaming = false;
                  }
                }
                setInternalStatus("ready");
                onFinishRef.current?.([...historySnapshot, ...newMsgs]);
                break;
              }

              case "error": {
                setMessages((prev) =>
                  prev
                    .map((m) => (m.role === "assistant" && m.streaming ? { ...m, streaming: false } : m))
                    .filter((m) => !(m.role === "assistant" && !m.content.trim())),
                );
                for (let i = newMsgs.length - 1; i >= 0; i--) {
                  const m = newMsgs[i];
                  if (m.role === "assistant" && !m.content.trim()) {
                    newMsgs.splice(i, 1);
                  } else if ((m as any).streaming) {
                    (m as any).streaming = false;
                  }
                }
                const errMsg: ChatAgentMessage = { id: nextId("err"), role: "error", content: event.error, timestamp: new Date() };
                newMsgs.push(errMsg);
                setMessages((prev) => [...prev, errMsg]);
                setInternalStatus("error");
                onFinishRef.current?.([...historySnapshot, ...newMsgs]);
                break;
              }
            }
          }
        }

        // If stream ended without explicit done event, finalize
        if (internalStatus !== "ready" && internalStatus !== "error") {
          setMessages((prev) =>
            prev
              .map((m) => (m.role === "assistant" && m.streaming ? { ...m, streaming: false } : m))
              .filter((m) => !(m.role === "assistant" && !m.content.trim())),
          );
          setInternalStatus("ready");
          onFinishRef.current?.([...historySnapshot, ...newMsgs]);
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          setInternalStatus("ready");
          return;
        }
        const errMsg: ChatAgentMessage = {
          id: nextId("err"),
          role: "error",
          content: err instanceof Error ? err.message : String(err),
          timestamp: new Date(),
        };
        newMsgs.push(errMsg);
        setMessages((prev) => [...prev, errMsg]);
        setInternalStatus("error");
        onFinishRef.current?.([...historySnapshot, ...newMsgs]);
      } finally {
        abortRef.current = null;
      }
    },
    [generating, internalProviderId, model, messages, systemPrompt, streamUrl, streamBody, maxSteps],
  );

  const handleClear = useCallback(() => {
    setMessages([]);
    setInternalStatus("ready");
    onFinish?.([]);
    onClear?.();
  }, [onFinish, onClear]);

  const handleProviderChange = useCallback(
    (id: string) => {
      setInternalProviderId(id);
      setInternalModel("");
      onChangeAiProvider?.(id);
    },
    [onChangeAiProvider],
  );

  const handleModelChange = useCallback(
    (m: string) => {
      setInternalModel(m);
      onChangeModel?.(m);
    },
    [onChangeModel],
  );

  return {
    messages,
    setMessages,
    status,
    generating,
    providerId,
    model,
    hasMessages,
    messagesEndRef,
    scrollContainerRef,
    scrollToBottom,
    forceFollow,
    handleSend,
    handleCancel,
    handleClear,
    handleProviderChange,
    handleModelChange,
  };
}
