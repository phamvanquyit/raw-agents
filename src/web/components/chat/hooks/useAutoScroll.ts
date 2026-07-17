import { useCallback, useEffect, useRef } from "react";

/**
 * useAutoScroll — universal auto-scroll for chat containers.
 *
 * Watches DOM mutations (streaming text, new messages, tool renders) via
 * MutationObserver and auto-scrolls to bottom — BUT only when the user
 * hasn't scrolled up to read history.
 *
 * Key design:
 * - `userScrolledUpRef` is the single source of truth for "should we scroll?"
 * - It is ONLY toggled by user-initiated scroll events (not programmatic ones).
 * - We use a `programmaticScrollRef` flag to distinguish user vs. programmatic
 *   scrolls, preventing the scroll handler from mis-reading our own scrollTop
 *   assignments as "user scrolled back to bottom".
 * - Mutations are debounced via rAF (1 scroll per frame max).
 * - `scrollToBottom()` is soft by default (respects user scroll-up).
 *   Pass `{ force: true }` for send / button click.
 */
export function useAutoScroll(opts?: {
  threshold?: number;
  onScrolledUpChange?: (scrolledUp: boolean) => void;
}) {
  const threshold = opts?.threshold ?? 80;
  const onScrolledUpChangeRef = useRef(opts?.onScrolledUpChange);
  onScrolledUpChangeRef.current = opts?.onScrolledUpChange;

  const elRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const scrollListenerRef = useRef<(() => void) | null>(null);

  // The authoritative flag: true = user has scrolled away, don't auto-scroll.
  const userScrolledUpRef = useRef(false);

  // Suppresses scroll-handler updates caused by our own programmatic scrolls.
  const programmaticScrollRef = useRef(false);

  // rAF handle for debouncing mutations.
  const rafIdRef = useRef<number | null>(null);

  // ── Helper ───────────────────────────────────────────────────────────────
  const checkNearBottom = (el: HTMLElement): boolean => el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

  const setScrolledUp = useCallback((value: boolean) => {
    if (userScrolledUpRef.current === value) return;
    userScrolledUpRef.current = value;
    onScrolledUpChangeRef.current?.(value);
  }, []);

  // ── Setup / teardown ─────────────────────────────────────────────────────
  const setup = useCallback(
    (el: HTMLElement) => {
      const handleScroll = () => {
        // Ignore scroll events caused by our own programmatic scrollTop changes.
        if (programmaticScrollRef.current) return;

        // This is a genuine user scroll — update the flag.
        setScrolledUp(!checkNearBottom(el));
      };

      const scrollToEl = () => {
        programmaticScrollRef.current = true;
        el.scrollTop = el.scrollHeight;
        // Reset the flag after the browser has processed the scroll.
        // Using rAF ensures the scroll event from our assignment
        // fires (and is ignored) before we flip this back.
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      };

      const onMutation = () => {
        // User is reading history — do nothing.
        if (userScrolledUpRef.current) return;

        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
        }

        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;

          // Re-check: user may have scrolled up between mutation and rAF.
          if (userScrolledUpRef.current) return;

          scrollToEl();
        });
      };

      const observer = new MutationObserver(onMutation);
      observer.observe(el, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      el.addEventListener("scroll", handleScroll, { passive: true });

      // Initial scroll — always go to bottom on mount.
      setScrolledUp(false);
      requestAnimationFrame(() => {
        scrollToEl();
        setTimeout(() => {
          if (!userScrolledUpRef.current) scrollToEl();
        }, 150);
      });

      observerRef.current = observer;
      scrollListenerRef.current = handleScroll;
    },
    [threshold, setScrolledUp],
  );

  const teardown = useCallback((el: HTMLElement) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (scrollListenerRef.current) {
      el.removeEventListener("scroll", scrollListenerRef.current);
      scrollListenerRef.current = null;
    }
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  // ── Callback ref ─────────────────────────────────────────────────────────
  const scrollRef = useCallback(
    (node: HTMLElement | null) => {
      if (elRef.current) teardown(elRef.current);
      elRef.current = node;
      if (node) setup(node);
    },
    [setup, teardown],
  );

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (elRef.current) {
        teardown(elRef.current);
        elRef.current = null;
      }
    };
  }, [teardown]);

  // ── Imperative API ──────────────────────────────────────────────────────
  const scrollToBottom = useCallback(
    (opts?: { force?: boolean }) => {
      const el = elRef.current;
      if (!el) return;
      if (!opts?.force && userScrolledUpRef.current) return;

      setScrolledUp(false);
      programmaticScrollRef.current = true;
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    },
    [setScrolledUp],
  );

  const forceFollow = useCallback(() => {
    setScrolledUp(false);
  }, [setScrolledUp]);

  return { scrollRef, scrollToBottom, forceFollow };
}
