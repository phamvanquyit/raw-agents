import { useCallback, useEffect, useRef } from "react";

/**
 * useAutoScroll — universal auto-scroll for chat containers.
 *
 * Watches DOM mutations + content/container resize and auto-scrolls to bottom
 * — BUT only when the user hasn't scrolled up to read history.
 *
 * Key design:
 * - `userScrolledUpRef` is the single source of truth for "should we scroll?"
 * - Scrolled-up is only set when scrollTop decreases (user moved up), not when
 *   layout/resize leaves us short of the bottom (textarea grow, stream paint).
 * - Returning to the bottom clears the flag.
 * - `programmaticScrollRef` ignores scroll events from our own scrollTop writes.
 * - Mutations / ResizeObserver are debounced via rAF (1 scroll per frame max).
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
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const scrollListenerRef = useRef<(() => void) | null>(null);

  // The authoritative flag: true = user has scrolled away, don't auto-scroll.
  const userScrolledUpRef = useRef(false);

  // Suppresses scroll-handler updates caused by our own programmatic scrolls.
  const programmaticScrollRef = useRef(false);

  // Track last scrollTop to distinguish "user scrolled up" vs layout shrink.
  const lastScrollTopRef = useRef(0);

  // rAF handle for debouncing mutations/resizes.
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
      lastScrollTopRef.current = el.scrollTop;

      const handleScroll = () => {
        // Ignore scroll events caused by our own programmatic scrollTop changes.
        if (programmaticScrollRef.current) {
          lastScrollTopRef.current = el.scrollTop;
          return;
        }

        const nearBottom = checkNearBottom(el);
        if (nearBottom) {
          // User (or layout) returned to bottom — resume follow.
          setScrolledUp(false);
        } else if (el.scrollTop < lastScrollTopRef.current - 1) {
          // Only mark scrolled-up when scrollTop actually decreased.
          // Layout shrink / content growth without user intent must not lock follow.
          setScrolledUp(true);
        }

        lastScrollTopRef.current = el.scrollTop;
      };

      const scrollToEl = () => {
        programmaticScrollRef.current = true;
        el.scrollTop = el.scrollHeight;
        lastScrollTopRef.current = el.scrollTop;
        // Double rAF: wait until the browser has flushed the scroll event
        // from our assignment before re-enabling the scroll handler.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            programmaticScrollRef.current = false;
            lastScrollTopRef.current = el.scrollTop;
          });
        });
      };

      const scheduleFollow = () => {
        if (userScrolledUpRef.current) return;

        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
        }

        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (userScrolledUpRef.current) return;
          scrollToEl();
        });
      };

      const observer = new MutationObserver(scheduleFollow);
      observer.observe(el, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // Content/container size changes (stream paint, textarea flex resize) often
      // don't fire useful scroll events — pin to bottom while following.
      const resizeObserver = new ResizeObserver(scheduleFollow);
      resizeObserver.observe(el);
      if (el.firstElementChild instanceof HTMLElement) {
        resizeObserver.observe(el.firstElementChild);
      }

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
      resizeObserverRef.current = resizeObserver;
      scrollListenerRef.current = handleScroll;
    },
    [threshold, setScrolledUp],
  );

  const teardown = useCallback((el: HTMLElement) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
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
      lastScrollTopRef.current = el.scrollTop;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
          lastScrollTopRef.current = el.scrollTop;
        });
      });
    },
    [setScrolledUp],
  );

  const forceFollow = useCallback(() => {
    setScrolledUp(false);
  }, [setScrolledUp]);

  return { scrollRef, scrollToBottom, forceFollow };
}
