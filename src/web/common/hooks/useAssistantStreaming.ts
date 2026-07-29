/**
 * Ephemeral assistant streaming (prompt / coding panels).
 * Local message history only — no conversation DB / run-registry.
 *
 * Message cycles mirror the model loop:
 *   thinking → (text)? → tool-call → thinking → …
 * Each thinking / assistant segment becomes its own bubble so multi-round
 * reasoning is never concatenated into one block.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { authorizedFetch } from "src/common/api";
import type { ContextUsagePayload } from "src/components/chat/common/sse";
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

const OMITTED_GENERATE_CODE = "[omitted — see <current_code> for the latest draft]";
const OMITTED_WRITE_CONTENT = "[omitted — see <current_draft> / latest write_site_file for this file]";
const OMITTED_WRITE_OUTPUT = "[omitted — see latest write_site_file tool result for current_draft]";

/** Keep full generate_code / write_site_file payloads only for the latest call; redact older drafts. */
function compactLargeToolInputs(messages: ChatAgentMessage[]): ChatAgentMessage[] {
  let lastGenerateIdx = -1;
  /** Latest write_site_file index per file name */
  const lastWriteByFile = new Map<string, number>();
  let lastWriteIdx = -1;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "tool-call") continue;
    if (m.toolName === "generate_code") lastGenerateIdx = i;
    if (m.toolName === "write_site_file") {
      lastWriteIdx = i;
      const input = m.toolInput && typeof m.toolInput === "object" && !Array.isArray(m.toolInput) ? (m.toolInput as Record<string, unknown>) : {};
      const file = typeof input.file === "string" ? input.file : "";
      if (file) lastWriteByFile.set(file, i);
    }
  }

  return messages.map((m, i) => {
    if (m.role !== "tool-call") return m;
    const input = m.toolInput && typeof m.toolInput === "object" && !Array.isArray(m.toolInput) ? (m.toolInput as Record<string, unknown>) : {};

    if (m.toolName === "generate_code" && i < lastGenerateIdx && "code" in input) {
      const { code: _code, ...rest } = input;
      return { ...m, toolInput: { ...rest, code: OMITTED_GENERATE_CODE } };
    }

    if (m.toolName === "write_site_file") {
      const file = typeof input.file === "string" ? input.file : "";
      const isLatestForFile = file ? lastWriteByFile.get(file) === i : i === lastWriteIdx;
      let next = m;
      if (!isLatestForFile && "content" in input) {
        const { content: _content, ...rest } = input;
        next = { ...next, toolInput: { ...rest, content: OMITTED_WRITE_CONTENT } };
      }
      // Keep only the newest write's current_draft blob in history
      if (i < lastWriteIdx && typeof next.toolOutput === "string" && next.toolOutput.includes("current_draft")) {
        try {
          const parsed = JSON.parse(next.toolOutput) as Record<string, unknown>;
          if ("current_draft" in parsed) {
            const { current_draft: _draft, ...rest } = parsed;
            next = { ...next, toolOutput: JSON.stringify({ ...rest, current_draft: OMITTED_WRITE_OUTPUT }) };
          }
        } catch {
          /* keep raw */
        }
      }
      return next;
    }

    return m;
  });
}

function buildAiHistory(messages: ChatAgentMessage[]) {
  const history = messages
    .filter((m) => ["user", "assistant", "tool-call"].includes(m.role))
    .filter((m) => m.role === "tool-call" || m.content.trim() !== "")
    .slice(-20);

  return compactLargeToolInputs(history).map((m) => {
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
    .map((m) => {
      if (m.role === "assistant" && m.streaming) {
        // Thinking-only bubble → standalone completed thinking
        if (!m.content.trim() && m.meta?.thinking) {
          const thinking = String(m.meta.thinking);
          const duration = (m.meta.thinkingDuration as number | undefined) ?? 0;
          return {
            ...m,
            role: "thinking" as const,
            content: thinking,
            streaming: false,
            meta: { thinking, thinkingDuration: duration },
          };
        }
        return { ...m, streaming: false };
      }
      return m;
    })
    .filter((m) => !(m.role === "assistant" && !m.content.trim() && !m.meta?.thinking));
}

function toolCallLine(m: ChatAgentMessage): string | null {
  if (m.role !== "tool-call") return null;
  const name = m.toolName ?? "";
  const input = m.toolInput && typeof m.toolInput === "object" && !Array.isArray(m.toolInput) ? (m.toolInput as Record<string, unknown>) : {};

  if (name === "write_site_file") {
    const file = typeof input.file === "string" ? input.file : "draft file";
    return `Updated \`${file}\``;
  }
  if (name === "check_site") {
    let ok: boolean | undefined;
    if (typeof m.toolOutput === "string") {
      try {
        const parsed = JSON.parse(m.toolOutput) as { ok?: boolean };
        if (typeof parsed.ok === "boolean") ok = parsed.ok;
      } catch {
        /* ignore */
      }
    }
    if (ok === true) return "Validated draft (check_site ok)";
    if (ok === false) return "Validated draft (check_site failed)";
    return "Validated draft";
  }
  if (name === "read_site_files") {
    const file = typeof input.file === "string" ? input.file : "";
    if (file) return `Read \`${file}\``;
    const tree = typeof input.tree === "string" ? input.tree : "draft";
    return `Read ${tree} site files`;
  }
  if (name === "preview_site") return "Previewed site HTML";
  if (name === "datatable") return "Looked up datatable";
  if (name === "kv_store") return "Looked up KV store";
  if (name === "secrets") return "Looked up secrets";
  if (name === "browser") return "Used browser tool";
  if (name === "generate_code") return "Updated job script";
  if (name === "run_current_job") return "Started a job run";

  const label = m.toolLabel ?? formatToolName(name || "tool");
  return `Ran ${label}`;
}

/** When the model only emits thinking + tools, still show a closing summary. */
function ensureTurnSummary(prev: ChatAgentMessage[], turnHadVisibleText: boolean): ChatAgentMessage[] {
  const finalized = finalizeStreamingMessages(prev);
  if (turnHadVisibleText) return finalized;

  let lastUserIdx = -1;
  for (let i = finalized.length - 1; i >= 0; i--) {
    if (finalized[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx === -1) return finalized;

  const turn = finalized.slice(lastUserIdx + 1);
  if (turn.some((m) => m.role === "assistant" && m.content.trim())) return finalized;

  const lines = turn.map(toolCallLine).filter((line): line is string => Boolean(line));
  if (lines.length === 0) return finalized;

  const unique = [...new Set(lines)];
  const body = unique.map((line) => `- ${line}`).join("\n");
  const hasWrite = turn.some((m) => m.role === "tool-call" && m.toolName === "write_site_file");
  const approveHint = hasWrite ? "\n\nClick **Approve** to promote draft → production." : "";

  return [
    ...finalized,
    {
      id: nextId("a"),
      role: "assistant" as const,
      content: `Here's what I did:\n${body}${approveHint}`,
      streaming: false,
      timestamp: new Date(),
    },
  ];
}

function thinkingDurationSec(startedAt: number): number {
  if (!startedAt) return 0;
  return Math.round((Date.now() - startedAt) / 1000);
}

export function useAssistantStreaming({ streamUrl, maxSteps = 6, onToolAction }: UseAssistantStreamingOptions) {
  const [messages, setMessages] = useState<ChatAgentMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [contextUsage, setContextUsage] = useState<ContextUsagePayload | null>(null);
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
    setMessages(finalizeStreamingMessages);
    setGenerating(false);
    thinkingRef.current = "";
    thinkingStartRef.current = 0;
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
      /** True after a tool-call until the next text/thinking segment starts a fresh bubble */
      let needsNewBubble = false;
      /** toolCallIds already painted — early emit + full-args upsert must not double-bubble */
      const seenToolCallIds = new Set<string>();
      /** Any visible reply text this turn (thinking alone does not count) */
      let turnHadVisibleText = false;

      /** Finalize the open assistant/thinking bubble before a tool-call or segment boundary. */
      const finalizeOpenBubble = () => {
        const freezeId = currentAssistantId;
        const thinkingSnapshot = thinkingRef.current;
        const duration = thinkingDurationSec(thinkingStartRef.current);

        if (assistantText.trim()) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== freezeId) return m;
              const meta = thinkingSnapshot ? { ...m.meta, thinking: thinkingSnapshot, thinkingDuration: duration } : m.meta;
              return { ...m, content: assistantText, streaming: false, meta };
            }),
          );
        } else if (thinkingSnapshot) {
          // Pure thinking → role "thinking" so MessageBubble renders CompletedThinking
          setMessages((prev) =>
            prev.map((m) =>
              m.id === freezeId
                ? {
                    id: freezeId,
                    role: "thinking" as const,
                    content: thinkingSnapshot,
                    streaming: false,
                    timestamp: m.timestamp,
                    meta: { thinking: thinkingSnapshot, thinkingDuration: duration },
                  }
                : m,
            ),
          );
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== freezeId));
        }

        thinkingRef.current = "";
        thinkingStartRef.current = 0;
        assistantText = "";
        currentAssistantId = "";
        needsNewBubble = true;
      };

      const ensureAssistantBubble = (seed?: { content?: string; thinking?: string }): string => {
        if (!needsNewBubble && currentAssistantId) return currentAssistantId;
        const newId = nextId("a");
        currentAssistantId = newId;
        needsNewBubble = false;
        const bubble: ChatAgentMessage = {
          id: newId,
          role: "assistant",
          content: seed?.content ?? "",
          streaming: true,
          timestamp: new Date(),
          meta: seed?.thinking ? { thinking: seed.thinking } : undefined,
        };
        setMessages((prev) => [...prev, bubble]);
        return newId;
      };

      try {
        const response = await authorizedFetch(streamUrl, {
          method: "POST",
          body: JSON.stringify({
            providerId,
            modelId: model,
            messages: [...aiHistory, { role: "user", content: text }],
            maxSteps,
            publicOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
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
              turnHadVisibleText = true;
              // Close thinking timer when the model starts writing
              if (thinkingRef.current && thinkingStartRef.current) {
                const duration = thinkingDurationSec(thinkingStartRef.current);
                const targetId = currentAssistantId;
                if (targetId) {
                  setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, meta: { ...m.meta, thinkingDuration: duration } } : m)));
                }
                thinkingStartRef.current = 0;
              }

              if (needsNewBubble || !currentAssistantId) {
                assistantText = delta;
                thinkingRef.current = "";
                thinkingStartRef.current = 0;
                ensureAssistantBubble({ content: delta });
              } else {
                assistantText += delta;
                const targetId = currentAssistantId;
                setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, content: assistantText, streaming: true } : m)));
              }
            },
            onThinkingDelta: (delta) => {
              // New model step after tools (or missing bubble) → fresh thinking block
              if (needsNewBubble || !currentAssistantId) {
                thinkingRef.current = delta;
                thinkingStartRef.current = Date.now();
                assistantText = "";
                ensureAssistantBubble({ thinking: delta });
                return;
              }

              if (!thinkingRef.current) {
                thinkingStartRef.current = Date.now();
              }
              thinkingRef.current += delta;
              const thinking = thinkingRef.current;
              const targetId = currentAssistantId;
              setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, meta: { ...m.meta, thinking } } : m)));
            },
            onToolCall: (event) => {
              const tLabel = event.toolLabel
                ? event.toolLabel.includes(" ")
                  ? event.toolLabel
                  : formatToolName(event.toolLabel)
                : formatToolName(event.toolName);

              const alreadySeen = event.toolCallId ? seenToolCallIds.has(event.toolCallId) : false;
              if (event.toolCallId) seenToolCallIds.add(event.toolCallId);

              if (alreadySeen) {
                // Full-args upsert of an already-painted bubble
                setMessages((prev) =>
                  prev.map((m) =>
                    m.role === "tool-call" && m.toolCallId === event.toolCallId
                      ? {
                          ...m,
                          content: event.toolName,
                          toolName: event.toolName,
                          toolLabel: tLabel,
                          toolInput: event.input !== undefined ? event.input : m.toolInput,
                        }
                      : m,
                  ),
                );
                if (event.input !== undefined) {
                  onToolActionRef.current?.({ type: "tool-call", toolName: event.toolName, toolLabel: tLabel, input: event.input });
                }
                return;
              }

              finalizeOpenBubble();
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
            onContextUsage: (usage) => {
              setContextUsage(usage);
            },
            onDone: () => {
              setMessages((prev) => ensureTurnSummary(prev, turnHadVisibleText));
              setGenerating(false);
              thinkingRef.current = "";
              thinkingStartRef.current = 0;
            },
            onError: (error) => {
              if (error === "Connection lost") {
                setMessages((prev) => ensureTurnSummary(prev, turnHadVisibleText));
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
          setMessages(finalizeStreamingMessages);
          setGenerating(false);
          thinkingRef.current = "";
          thinkingStartRef.current = 0;
          return;
        }

        // Stream ended without explicit done — finalize bubbles
        setMessages((prev) => ensureTurnSummary(prev, turnHadVisibleText));
        setGenerating(false);
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
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

  return { messages, generating, contextUsage, send, cancel };
}
