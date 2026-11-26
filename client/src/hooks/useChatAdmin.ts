"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createOpenChecker, type ServerOpenState } from "@/utils/touristVisaOpen";
import { createUnreadStore, type UnreadSnapshot } from "@/utils/chatPolling";
import { fetchAdminUnread, fetchChatStatus } from "@/services/chatAdminService";

/**
 * Is the chat switched on? The server's CHAT_ENABLED switch is the single source of truth (GET /api/chat/status). This reuses the checker of
 * the Tourist Visa switch: it remembers an answer for a short while, shares one ask between every component, and treats anything but a clear
 * "enabled" (an error, a timeout, a 404) as "closed", so a wrong guess can only fall back to the old Contact screen.
 */
export const chatEnabledChecker = createOpenChecker({
  fetchStatus: async (signal) => {
    const answer = await fetchChatStatus(signal);
    return { status: answer.status, json: { open: answer.enabled } };
  },
});

/** "unknown" until the answer arrives, then "open" (chat is on) or "closed". */
export function useChatEnabled(): ServerOpenState {
  const [state, setState] = useState<ServerOpenState>(() => chatEnabledChecker.peek());
  useEffect(() => {
    let alive = true;
    void chatEnabledChecker.check().then((answer) => {
      if (alive) setState(answer);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

// ---------------------------------------------------------------------------
// The unread total: ONE poller for the whole browser tab, shared by the sidebar, the header and the inbox
// ---------------------------------------------------------------------------

const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";

let store: ReturnType<typeof createUnreadStore> | null = null;
let listening = false;

/** The shared store (made on first use, in the browser only). Exported so the inbox can ask for a fresh count after reading or replying. */
export function getChatUnreadStore() {
  if (!store) {
    store = createUnreadStore({ fetchUnread: () => fetchAdminUnread(), isVisible, baseMs: 30_000, maxMs: 120_000 });
  }
  if (!listening && typeof document !== "undefined") {
    listening = true;
    document.addEventListener("visibilitychange", () => store?.visibilityChanged());
  }
  return store;
}

const EMPTY: UnreadSnapshot = { unread: 0, conversations: 0, state: "idle" };
const noop = () => () => {};

/**
 * The total unread count for the badge. While `enabled` is false nothing is subscribed (so nothing is polled). The poller runs while at
 * least one component is subscribed, only while the tab is visible, every 30 seconds, slowing down when nothing changes.
 */
export function useChatUnread(enabled: boolean): UnreadSnapshot {
  return useSyncExternalStore(
    (listener) => (enabled ? getChatUnreadStore().subscribe(listener) : noop()),
    () => (enabled ? getChatUnreadStore().getSnapshot() : EMPTY),
    () => EMPTY
  );
}
