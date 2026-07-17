/**
 * Ephemeral assistant streaming (prompt / coding panels).
 * Local message history only — no conversation DB / run-registry.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { parseSseStream } from "src/components/chat/common/sse";
import type { ChatAgentMessage } from "src/components/chat/common/types";
import { formatToolName, nextId } from "src/components/chat/common/utils";

export type ToolActionEvent =
  | { type: "tool-call"; toolName: string; toolLabel: string; input: unknown }
  | { type: "tool-result"; toolName: string; output: unknown };

export interface UseAssistantStreamingOptions {
  streamUrl: string;
  maxSteps?: number;
  onToolAction?: (event: ToolActionEvent) => void;
}

function buildAiHistory(messages: ChatAgentMessage[]) {
  return messages
    .filter((m) => ["user", "assistant", "tool-call"].includes(m.role))
    .filter((m) => m.role === "tool-call" || m.content.trim() !== "")
    .slice(-20)
    .map((m) => {
      if (m.role === "tool-call") {
        return {
          role: "tool-call" as const,
          content: "",
          toolCallId: m.toolCallId,
          toolName: m.toolName,
          toolInput: m.toolInput,
          toolOutput: m.toolOutput,
        };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    });
}

function finalizeStreamingMessages(prev: ChatAgentMessage[]) {
  return prev
    .map((m) => (m.role === "assistant" && m.streaming ? { ...m, streaming: false } : m))
    .filter((m) => !(m.role === "assistant" && !m.content.trim() && !m.meta?.thinking));
}

export function useAssistantStreaming({ streamUrl, maxSteps = 6, onToolAction }: UseAssistantStreamingOptions) {
  const [messages, setMessages] = useState<ChatAgentMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  const thinkingRef = useRef("");
  const thinkingStartRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const onToolActionRef = useRef(onToolAction);
  onToolActionRef.current = onToolAction;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
  }, []);

  const send = useCallback(
    async (text: string, options: { providerId: string; model: string }) => {
      const { providerId, model } = options;
      if (!text.trim() || generating) return;
      if (!providerId || !model) return;

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
      setGenerating(true);
      thinkingRef.current = "";
      thinkingStartRef.current = 0;

      const aiHistory = buildAiHistory(historySnapshot);

      let assistantText = "";
      let currentAssistantId = assistantId;
      let toolsStarted = false;

      try {
        const response = await fetch(streamUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId,
            modelId: model,
            messages: [...aiHistory, { role: "user", content: text }],
            maxSteps,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const errText = await response.text();
          throw new Error(errText || `HTTP ${response.status}`);
        }

        const result = await parseSseStream(
          response.body,
          {
            onTextDelta: (delta) => {
              if (thinkingRef.current && thinkingStartRef.current) {
                const duration = Math.round((Date.now() - thinkingStartRef.current) / 1000);
                const targetId = currentAssistantId;
                setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, meta: { ...m.meta, thinkingDuration: duration } } : m)));
                thinkingStartRef.current = 0;
              }

              if (toolsStarted) {
                toolsStarted = false;
                assistantText = delta;
                thinkingRef.current = "";
                thinkingStartRef.current = 0;
                const newId = nextId("a");
                currentAssistantId = newId;
                const bubble: ChatAgentMessage = {
                  id: newId,
                  role: "assistant",
                  content: delta,
                  streaming: true,
                  timestamp: new Date(),
                };
                setMessages((prev) => [...prev, bubble]);
              } else {
                assistantText += delta;
                setMessages((prev) => prev.map((m) => (m.id === currentAssistantId ? { ...m, content: assistantText, streaming: true } : m)));
              }
            },
            onThinkingDelta: (delta) => {
              if (!thinkingRef.current) {
                thinkingStartRef.current = Date.now();
              }
              thinkingRef.current += delta;
              const thinking = thinkingRef.current;
              const targetId = currentAssistantId;
              setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, meta: { ...m.meta, thinking } } : m)));
            },
            onToolCall: (event) => {
              toolsStarted = true;

              if (assistantText.trim()) {
                const freezeId = currentAssistantId;
                setMessages((prev) => prev.map((m) => (m.id === freezeId ? { ...m, streaming: false } : m)));
                assistantText = "";
                currentAssistantId = nextId("a");
              } else {
                const emptyId = currentAssistantId;
                setMessages((prev) => {
                  const target = prev.find((m) => m.id === emptyId);
                  if (target?.meta?.thinking) {
                    return prev.map((m) => (m.id === emptyId ? { ...m, streaming: false } : m));
                  }
                  return prev.filter((m) => m.id !== emptyId);
                });
              }

              const tLabel = event.toolLabel
                ? event.toolLabel.includes(" ")
                  ? event.toolLabel
                  : formatToolName(event.toolLabel)
                : formatToolName(event.toolName);

              const toolMsg: ChatAgentMessage = {
                id: nextId("tc"),
                role: "tool-call",
                content: event.toolName,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                toolLabel: tLabel,
                toolInput: event.input,
                timestamp: new Date(),
              };
              setMessages((prev) => [...prev, toolMsg]);
              onToolActionRef.current?.({ type: "tool-call", toolName: event.toolName, toolLabel: tLabel, input: event.input });
            },
            onToolResult: (event) => {
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
            },
            onDone: () => {
              setMessages(finalizeStreamingMessages);
              setGenerating(false);
              thinkingRef.current = "";
              thinkingStartRef.current = 0;
            },
            onError: (error) => {
              if (error === "Connection lost") {
                setMessages(finalizeStreamingMessages);
                setGenerating(false);
                thinkingRef.current = "";
                thinkingStartRef.current = 0;
                return;
              }
              setMessages((prev) => [
                ...finalizeStreamingMessages(prev),
                {
                  id: nextId("err"),
                  role: "error",
                  content: error,
                  timestamp: new Date(),
                },
              ]);
              setGenerating(false);
              thinkingRef.current = "";
              thinkingStartRef.current = 0;
            },
          },
          { signal: controller.signal },
        );

        if (result === "aborted") {
          setGenerating(false);
          return;
        }

        // Stream ended without explicit done — finalize bubbles
        setMessages(finalizeStreamingMessages);
        setGenerating(false);
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          setGenerating(false);
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: nextId("err"),
            role: "error",
            content: err instanceof Error ? err.message : String(err),
            timestamp: new Date(),
          },
        ]);
        setGenerating(false);
      } finally {
        abortRef.current = null;
      }
    },
    [generating, messages, streamUrl, maxSteps],
  );

  return { messages, generating, send, cancel };
}
