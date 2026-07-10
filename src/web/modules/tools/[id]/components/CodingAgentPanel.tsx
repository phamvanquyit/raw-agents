/**
 * CodingAgentPanel.tsx
 *
 * Self-contained AI coding assistant panel with its own SSE streaming logic.
 * No Redux store dependency — state is entirely local.
 * Reuses only the UI sub-components (MessageList, InputArea) for rendering.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { InputArea } from "src/components/chat/_components/InputArea";
import { MessageList } from "src/components/chat/_components/MessageList";
import type { ChatAgentMessage } from "src/components/chat/common/types";
import { formatToolName, nextId } from "src/components/chat/common/utils";
import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";

// ── Constants ─────────────────────────────────────────────────────────────────
const PANEL_DEFAULT = 380;
const PANEL_MIN = 280;
const PANEL_MAX = 560;

// ── SSE event types (server protocol) ─────────────────────────────────────────
type SseEvent =
  | { type: "chunk"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; toolLabel?: string; input: unknown }
  | { type: "tool-result"; toolCallId?: string; toolName: string; result: unknown }
  | { type: "done" }
  | { type: "error"; error: string };

// ── Tool action event (fired to parent) ───────────────────────────────────────
export type ToolActionEvent =
  | { type: "tool-call"; toolName: string; toolLabel: string; input: unknown }
  | { type: "tool-result"; toolName: string; output: unknown };

// ── Props ─────────────────────────────────────────────────────────────────────
interface CodingAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onToolAction: (event: ToolActionEvent) => void;
  onChangeAiProvider: (pid: string) => void;
  onChangeModel: (m: string) => void;
}

export function CodingAgentPanel({ providerId, model, streamUrl, onToolAction, onChangeAiProvider, onChangeModel }: CodingAgentPanelProps) {
  // ── Panel resize ──────────────────────────────────────────────────────────
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startW: 0 });

  const handleDragMouseMove = (e: MouseEvent) => {
    if (!dragRef.current.active) return;
    const dx = dragRef.current.startX - e.clientX;
    setWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, dragRef.current.startW + dx)));
  };

  const handleDragMouseUp = () => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      setIsDragging(false);
      document.removeEventListener("mousemove", handleDragMouseMove);
      document.removeEventListener("mouseup", handleDragMouseUp);
    }
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, startW: width };
    setIsDragging(true);
    document.addEventListener("mousemove", handleDragMouseMove);
    document.addEventListener("mouseup", handleDragMouseUp);
  };

  // ── Chat state (fully local, no store) ────────────────────────────────────
  const [messages, setMessages] = useState<ChatAgentMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  /** Mutable ref to accumulate current thinking text (flushed into message meta) */
  const thinkingRef = useRef("");
  /** Timestamp when thinking started (for calculating duration) */
  const thinkingStartRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const onToolActionRef = useRef(onToolAction);
  useEffect(() => {
    onToolActionRef.current = onToolAction;
  }, [onToolAction]);

  // ── Cleanup on unmount — abort any running stream ──────────────────────
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { scrollRef: scrollContainerRef, scrollToBottom } = useAutoScroll();

  // ── Cancel ────────────────────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
  }, []);

  // ── Send + SSE streaming ──────────────────────────────────────────────────
  const handleSend = useCallback(
    async (text: string) => {
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

      // Build AI history — include tool-call messages so AI retains full context
      const aiHistory = historySnapshot
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
            maxSteps: 12,
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
                // Finalize thinking duration if thinking was active
                if (thinkingRef.current && thinkingStartRef.current) {
                  const duration = Math.round((Date.now() - thinkingStartRef.current) / 1000);
                  const targetId = currentAssistantId;
                  setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, meta: { ...m.meta, thinkingDuration: duration } } : m)));
                  thinkingStartRef.current = 0;
                }

                if (toolsStarted) {
                  toolsStarted = false;
                  assistantText = event.text;
                  // Reset thinking for the new assistant bubble
                  thinkingRef.current = "";
                  thinkingStartRef.current = 0;
                  const newId = nextId("a");
                  currentAssistantId = newId;
                  const bubble: ChatAgentMessage = {
                    id: newId,
                    role: "assistant",
                    content: event.text,
                    streaming: true,
                    timestamp: new Date(),
                  };
                  setMessages((prev) => [...prev, bubble]);
                } else {
                  assistantText += event.text;
                  setMessages((prev) => prev.map((m) => (m.id === currentAssistantId ? { ...m, content: assistantText, streaming: true } : m)));
                }
                break;
              }

              case "thinking": {
                // Record start time on first thinking event
                if (!thinkingRef.current) {
                  thinkingStartRef.current = Date.now();
                }
                thinkingRef.current += event.text;
                // Attach thinking to the current assistant message's meta
                const thinking = thinkingRef.current;
                const targetId = currentAssistantId;
                setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, meta: { ...m.meta, thinking } } : m)));
                break;
              }

              case "tool-call": {
                toolsStarted = true;

                // Freeze current text bubble or remove empty one
                if (assistantText.trim()) {
                  const freezeId = currentAssistantId;
                  setMessages((prev) => prev.map((m) => (m.id === freezeId ? { ...m, streaming: false } : m)));
                  assistantText = "";
                  // Advance ID so the next tool-call won't target the frozen bubble
                  currentAssistantId = nextId("a");
                } else {
                  const emptyId = currentAssistantId;
                  // Keep the bubble if it has thinking content, just freeze it
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
                setMessages((prev) =>
                  prev
                    .map((m) => (m.role === "assistant" && m.streaming ? { ...m, streaming: false } : m))
                    .filter((m) => !(m.role === "assistant" && !m.content.trim() && !m.meta?.thinking)),
                );
                setGenerating(false);
                thinkingRef.current = "";
                thinkingStartRef.current = 0;
                break;
              }

              case "error": {
                setMessages((prev) =>
                  prev
                    .map((m) => (m.role === "assistant" && m.streaming ? { ...m, streaming: false } : m))
                    .filter((m) => !(m.role === "assistant" && !m.content.trim() && !m.meta?.thinking)),
                );
                const errMsg: ChatAgentMessage = {
                  id: nextId("err"),
                  role: "error",
                  content: event.error,
                  timestamp: new Date(),
                };
                setMessages((prev) => [...prev, errMsg]);
                setGenerating(false);
                thinkingRef.current = "";
                thinkingStartRef.current = 0;
                break;
              }
            }
          }
        }

        // Stream ended without explicit done → finalize
        setMessages((prev) =>
          prev
            .map((m) => (m.role === "assistant" && m.streaming ? { ...m, streaming: false } : m))
            .filter((m) => !(m.role === "assistant" && !m.content.trim() && !m.meta?.thinking)),
        );
        setGenerating(false);
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          setGenerating(false);
          return;
        }
        const errMsg: ChatAgentMessage = {
          id: nextId("err"),
          role: "error",
          content: err instanceof Error ? err.message : String(err),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errMsg]);
        setGenerating(false);
      } finally {
        abortRef.current = null;
      }
    },
    [generating, providerId, model, messages, streamUrl],
  );

  return (
    <div className="flex h-full min-h-0 shrink-0">
      {/* Drag handle */}
      <div
        onMouseDown={startDrag}
        className={[
          "w-[3px] shrink-0 h-full cursor-col-resize z-10 transition-colors duration-150",
          isDragging ? "bg-primary/50" : "bg-transparent hover:bg-primary/25",
        ].join(" ")}
      />

      {/* Chat panel */}
      <div className="flex flex-col h-full min-h-0 border-border bg-surface overflow-hidden" style={{ width }}>
        <MessageList
          messages={messages}
          generating={generating}
          assistantLabel="AI Assistant"
          emptyStateContent={<p className="text-xs text-muted leading-relaxed max-w-50 m-0">Describe your request to get coding assistance.</p>}
          messagesEndRef={messagesEndRef}
          scrollContainerRef={scrollContainerRef}
          className="selectable"
        />

        <InputArea
          generating={generating}
          placeholder="Describe request... (Enter to send)"
          onSend={(text) => {
            scrollToBottom();
            void handleSend(text);
          }}
          onCancel={handleCancel}
          providerId={providerId}
          model={model}
          onProviderChange={onChangeAiProvider}
          onModelChange={onChangeModel}
        />
      </div>
    </div>
  );
}
