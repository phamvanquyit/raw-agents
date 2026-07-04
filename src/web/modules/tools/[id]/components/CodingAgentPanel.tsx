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
  const abortRef = useRef<AbortController | null>(null);
  const onToolActionRef = useRef(onToolAction);
  useEffect(() => {
    onToolActionRef.current = onToolAction;
  }, [onToolAction]);

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

      // Build AI history (last 10 user/assistant messages)
      const aiHistory = historySnapshot
        .filter((m) => m.role === "user" || m.role === "assistant")
        .filter((m) => m.content.trim() !== "")
        .slice(-10)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

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
                  setMessages((prev) => [...prev, bubble]);
                } else {
                  assistantText += event.text;
                  setMessages((prev) => prev.map((m) => (m.id === currentAssistantId ? { ...m, content: assistantText, streaming: true } : m)));
                }
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
                  setMessages((prev) => prev.filter((m) => m.id !== emptyId));
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
                    .filter((m) => !(m.role === "assistant" && !m.content.trim())),
                );
                setGenerating(false);
                break;
              }

              case "error": {
                setMessages((prev) =>
                  prev
                    .map((m) => (m.role === "assistant" && m.streaming ? { ...m, streaming: false } : m))
                    .filter((m) => !(m.role === "assistant" && !m.content.trim())),
                );
                const errMsg: ChatAgentMessage = {
                  id: nextId("err"),
                  role: "error",
                  content: event.error,
                  timestamp: new Date(),
                };
                setMessages((prev) => [...prev, errMsg]);
                setGenerating(false);
                break;
              }
            }
          }
        }

        // Stream ended without explicit done → finalize
        setMessages((prev) =>
          prev
            .map((m) => (m.role === "assistant" && m.streaming ? { ...m, streaming: false } : m))
            .filter((m) => !(m.role === "assistant" && !m.content.trim())),
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
    <>
      {/* Drag handle */}
      <div
        onMouseDown={startDrag}
        className={[
          "w-[3px] shrink-0 h-full cursor-col-resize z-10 transition-colors duration-150",
          isDragging ? "bg-primary/50" : "bg-transparent hover:bg-primary/25",
        ].join(" ")}
      />

      {/* Chat panel */}
      <div className="shrink-0 flex flex-col border-border bg-surface overflow-hidden" style={{ width }}>
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
    </>
  );
}
