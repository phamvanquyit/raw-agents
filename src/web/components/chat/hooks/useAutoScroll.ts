import { useCallback, useEffect, useRef } from "react";

/**
 * useAutoScroll — universal auto-scroll for chat containers.
 *
 * Watches DOM mutations + content/container resize and auto-scrolls to bottom
 * — BUT only when the user hasn't scrolled up to read history.
 *
 * Key design:
 * - `userScrolledUpRef` is the single source of truth for "should we scroll?"
 * - Intentional scroll-up is detected via wheel / touch (not scrollTop heuristics —
 *   layout/stream height changes also move scrollTop and must not lock follow).
 * - Returning to the bottom (scroll or wheel down) clears the flag.
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
  const wheelListenerRef = useRef<((e: WheelEvent) => void) | null>(null);
  const touchStartYRef = useRef(0);
  const touchListenerRef = useRef<{ start: (e: TouchEvent) => void; move: (e: TouchEvent) => void } | null>(null);

  // The authoritative flag: true = user has scrolled away, don't auto-scroll.
  const userScrolledUpRef = useRef(false);

  // Suppresses scroll-handler updates caused by our own programmatic scrolls.
  const programmaticScrollRef = useRef(false);

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
      const handleScroll = () => {
        if (programmaticScrollRef.current) return;
        // Only resume follow when user (or layout) returns to bottom.
        // Do NOT infer scroll-up from scrollTop — stream/layout moves it too.
        if (checkNearBottom(el)) setScrolledUp(false);
      };

      const handleWheel = (e: WheelEvent) => {
        if (e.deltaY < 0) {
          // Defer: ignore rubber-band ticks that leave us still near bottom.
          requestAnimationFrame(() => {
            if (!checkNearBottom(el)) setScrolledUp(true);
          });
        } else if (checkNearBottom(el)) {
          setScrolledUp(false);
        }
      };

      const handleTouchStart = (e: TouchEvent) => {
        touchStartYRef.current = e.touches[0]?.clientY ?? 0;
      };

      const handleTouchMove = (e: TouchEvent) => {
        const y = e.touches[0]?.clientY ?? 0;
        const dy = y - touchStartYRef.current;
        // Finger moving down ⇒ content scrolls up
        if (dy > 8) {
          requestAnimationFrame(() => {
            if (!checkNearBottom(el)) setScrolledUp(true);
          });
        } else if (dy < -8 && checkNearBottom(el)) {
          setScrolledUp(false);
        }
      };

      const scrollToEl = () => {
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        // Already glued to bottom — skip write (avoids micro-jitter on no-op mutations).
        if (distance < 1) return;

        programmaticScrollRef.current = true;
        el.scrollTop = el.scrollHeight;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            programmaticScrollRef.current = false;
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
          // Inner content wrapper may be swapped (empty ↔ messages) — keep observing it.
          const child = el.firstElementChild;
          if (child instanceof HTMLElement && resizeObserverRef.current) {
            try {
              resizeObserverRef.current.observe(child);
            } catch {
              /* already observing */
            }
          }
          scrollToEl();
        });
      };

      const observer = new MutationObserver(scheduleFollow);
      observer.observe(el, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      const resizeObserver = new ResizeObserver(scheduleFollow);
      resizeObserver.observe(el);
      if (el.firstElementChild instanceof HTMLElement) {
        resizeObserver.observe(el.firstElementChild);
      }

      el.addEventListener("scroll", handleScroll, { passive: true });
      el.addEventListener("wheel", handleWheel, { passive: true });
      el.addEventListener("touchstart", handleTouchStart, { passive: true });
      el.addEventListener("touchmove", handleTouchMove, { passive: true });

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
      wheelListenerRef.current = handleWheel;
      touchListenerRef.current = { start: handleTouchStart, move: handleTouchMove };
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
    if (wheelListenerRef.current) {
      el.removeEventListener("wheel", wheelListenerRef.current);
      wheelListenerRef.current = null;
    }
    if (touchListenerRef.current) {
      el.removeEventListener("touchstart", touchListenerRef.current.start);
      el.removeEventListener("touchmove", touchListenerRef.current.move);
      touchListenerRef.current = null;
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
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
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
