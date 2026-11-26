"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPoller, type Poller, type PollResult } from "@/utils/chatPolling";

/**
 * Runs `run` now and then while the component is on screen and `enabled`, only while the browser tab is visible (see utils/chatPolling.ts).
 * It slows down when `run` keeps answering "same", goes back to the normal pace on "changed" or on `poke()`, and stops for good on "stop".
 * `run` may change on every render: the latest one is always the one called.
 */
export function usePoller(run: () => Promise<PollResult>, { enabled, baseMs, maxMs }: { enabled: boolean; baseMs: number; maxMs: number }) {
  const runRef = useRef(run);
  runRef.current = run;
  const pollerRef = useRef<Poller | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const poller = createPoller({
      baseMs,
      maxMs,
      isVisible: () => document.visibilityState === "visible",
      run: () => runRef.current(),
    });
    pollerRef.current = poller;
    const onVisibility = () => poller.visibilityChanged();
    document.addEventListener("visibilitychange", onVisibility);
    // The first look is the caller's own load; the first POLL comes after the normal wait.
    poller.start({ immediate: false });
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      poller.stop();
      pollerRef.current = null;
    };
  }, [enabled, baseMs, maxMs]);

  return useCallback(() => pollerRef.current?.poke(), []);
}
