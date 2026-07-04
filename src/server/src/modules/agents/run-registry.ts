/**
 * runRegistry — in-memory registry of active AI streaming runs.
 *
 * Design:
 *   - Each run is keyed by conversationId
 *   - Run lifecycle is INDEPENDENT of the HTTP connection (F5-resilient)
 *   - Multiple SSE clients (tabs) can subscribe to the same run
 *   - Stop endpoint calls cancel() to abort the background AI task
 */

import type { AgentStreamEvent } from "./agentRunner.js";

type RunSubscriber = (event: AgentStreamEvent) => void;

interface ActiveRun {
  abort: AbortController;
  agentId: string;
  conversationId: string;
  subscribers: Set<RunSubscriber>;
}

class RunRegistry {
  private runs = new Map<string, ActiveRun>();

  /** Register a new run. Returns the AbortController for the AI stream. */
  create(conversationId: string, agentId: string): AbortController {
    // Cancel any existing run for same conversation first
    const existing = this.runs.get(conversationId);
    if (existing) existing.abort.abort();

    const abort = new AbortController();
    this.runs.set(conversationId, {
      abort,
      agentId,
      conversationId,
      subscribers: new Set(),
    });
    return abort;
  }

  /** Subscribe to events from a run. Returns an unsubscribe function. */
  subscribe(conversationId: string, cb: RunSubscriber): () => void {
    const run = this.runs.get(conversationId);
    if (!run) return () => {};
    run.subscribers.add(cb);
    return () => run.subscribers.delete(cb);
  }

  /** Fan-out an event to all SSE subscribers for this run. */
  emit(conversationId: string, event: AgentStreamEvent) {
    const run = this.runs.get(conversationId);
    if (!run) return;
    for (const sub of run.subscribers) {
      try {
        sub(event);
      } catch {
        // dead subscriber — ignore
      }
    }
  }

  /** Abort the background AI task (called by stop endpoint). */
  cancel(conversationId: string): boolean {
    const run = this.runs.get(conversationId);
    if (!run) return false;
    run.abort.abort();
    return true;
  }

  /** Remove the run when finished. */
  remove(conversationId: string) {
    this.runs.delete(conversationId);
  }

  has(conversationId: string): boolean {
    return this.runs.has(conversationId);
  }
}

export const runRegistry = new RunRegistry();
