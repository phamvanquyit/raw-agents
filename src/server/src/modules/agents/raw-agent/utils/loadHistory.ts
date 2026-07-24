import { eq, sql } from "drizzle-orm";
import { agentMessages, getDb } from "../../../../common/db/client.js";
import type { MessageParam } from "./agentRunner.js";

/**
 * Load full conversation history including tool calls and tool results.
 *
 * Reconstructs the message sequence that LangGraph expects:
 *   - user → HumanMessage
 *   - assistant (before tool calls) → AIMessage with tool_calls[]
 *   - tool result → ToolMessage with tool_call_id
 *   - assistant (final answer) → AIMessage (plain text)
 *
 * Returns the full transcript. Compaction/summarization can be added later
 * when context pressure needs it.
 */
export function loadHistory(conversationId: string): MessageParam[] {
  const rows = getDb().select().from(agentMessages).where(eq(agentMessages.conversationId, conversationId)).orderBy(sql`rowid`).all();

  const result: MessageParam[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (row.role === "user") {
      result.push({ role: "user", content: row.content });
      continue;
    }

    // Thinking messages are informational only — not sent to the AI
    if (row.role === "thinking") continue;

    if (row.role === "assistant") {
      // Look ahead to see if the next messages are tool calls
      const toolCalls: Array<{ id: string; name: string; args: unknown }> = [];
      let j = i + 1;
      while (j < rows.length && rows[j].role === "tool") {
        const meta = rows[j].metadata as Record<string, unknown> | null;
        if (meta?.toolCallId && meta?.toolName) {
          toolCalls.push({
            id: meta.toolCallId as string,
            name: meta.toolName as string,
            args: meta.toolInput ?? {},
          });
        }
        j++;
      }

      if (toolCalls.length > 0) {
        result.push({ role: "assistant", content: row.content || "", toolCalls });
      } else {
        result.push({ role: "assistant", content: row.content });
      }
      continue;
    }

    if (row.role === "tool") {
      const meta = row.metadata as Record<string, unknown> | null;
      if (meta?.toolCallId && meta?.toolName) {
        // Use toolOutput (stringified result) if available, fall back to result or content
        const output = (meta.toolOutput as string) ?? (meta.result != null ? JSON.stringify(meta.result) : row.content);
        result.push({
          role: "tool-result",
          toolCallId: meta.toolCallId as string,
          toolName: meta.toolName as string,
          result: output,
        });
      }
    }
  }

  return result;
}
