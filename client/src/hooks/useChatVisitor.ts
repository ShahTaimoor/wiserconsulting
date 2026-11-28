"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createUnreadStore, type UnreadSnapshot } from "@/utils/chatPolling";
import { ChatApiError } from "@/services/chatAdminService";
import { fetchChatPublicStatus, fetchMyUnread } from "@/services/chatVisitorService";
import { readChatStatus, type ChatHours } from "@/utils/chatWidget";
import { rememberChatLimits } from "@/utils/chatLimits";

// ---------------------------------------------------------------------------
// Is chat on, and the reply hours: one shared answer for the whole page load
// ---------------------------------------------------------------------------

export interface VisitorChatStatus {
  state: "unknown" | "on" | "off";
  hours: ChatHours | null;
}

const UNKNOWN: VisitorChatStatus = { state: "unknown", hours: null };
const STATUS_TTL_MS = 30_000;
const STATUS_ERROR_TTL_MS = 5_000;

let current: VisitorChatStatus = UNKNOWN;
let fetchedAt = 0;
let ttl = STATUS_TTL_MS;
let inFlight: Promise<void> | null = null;
const statusListeners = new Set<() => void>();

const sameStatus = (a: VisitorChatStatus, b: VisitorChatStatus) => a.state === b.state && JSON.stringify(a.hours) === JSON.stringify(b.hours);

/**
 * Asks GET /api/chat/status (public) unless a fresh answer is remembered. Anything but a clear "enabled" (an error, a timeout, a 404, an odd
 * body) is "off", so a wrong guess can only hide the bubble, never show a chat that is not there. Never rejects.
 */
export function refreshChatStatus(force = false): Promise<void> {
  if (!force && Date.now() - fetchedAt < ttl) return Promise.resolve();
  if (inFlight) return inFlight;
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), 5_000) : null;
  inFlight = fetchChatPublicStatus(controller?.signal)
    .catch(() => ({ status: 0, json: null }))
    .then(({ status, json }) => {
      const reading = readChatStatus(status, json);
      // The server's length limits are shared with the rest of the chat screens (today's numbers when the answer has none or the chat is off).
      rememberChatLimits(reading.state === "on" ? reading.limits : undefined);
      ttl = status === 200 ? STATUS_TTL_MS : STATUS_ERROR_TTL_MS;
      fetchedAt = Date.now();
      const next: VisitorChatStatus = { state: reading.state, hours: reading.hours };
      if (!sameStatus(current, next)) {
        current = next;
        statusListeners.forEach((fn) => fn());
      }
    })
    .finally(() => {
      if (timer) clearTimeout(timer);
      inFlight = null;
    });
  return inFlight;
}

/** Is chat on? "unknown" until the first answer; then "on" or "off". Also the hours (as of the last answer). */
export function useChatStatus(): VisitorChatStatus {
  useEffect(() => {
    void refreshChatStatus();
  }, []);
  return useSyncExternalStore(
    (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    () => current,
    () => UNKNOWN
  );
}

// ---------------------------------------------------------------------------
// "Your session has ended": a 401 from any chat call (the token ran out), shared by the bubble and the panel
// ---------------------------------------------------------------------------

let expired = false;
const expiredListeners = new Set<() => void>();

export function setSessionExpired(value: boolean) {
  if (expired === value) return;
  expired = value;
  expiredListeners.forEach((fn) => fn());
}

export function useSessionExpired(): boolean {
  return useSyncExternalStore(
    (listener) => {
      expiredListeners.add(listener);
      return () => expiredListeners.delete(listener);
    },
    () => expired,
    () => false
  );
}

// ---------------------------------------------------------------------------
// The unread count on the bubble: ONE light poller for the page, every 30 seconds, only while the tab is visible
// ---------------------------------------------------------------------------

const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";
let store: ReturnType<typeof createUnreadStore> | null = null;
let listening = false;

export function getVisitorUnreadStore() {
  if (!store) {
    store = createUnreadStore({
      fetchUnread: async () => {
        try {
          const answer = await fetchMyUnread();
          return { unread: answer.unread, conversations: answer.unread > 0 ? 1 : 0 };
        } catch (error) {
          if (error instanceof ChatApiError && error.status === 401) setSessionExpired(true);
          throw error;
        }
      },
      isVisible,
      baseMs: 30_000,
      maxMs: 120_000,
    });
  }
  if (!listening && typeof document !== "undefined") {
    listening = true;
    document.addEventListener("visibilitychange", () => store?.visibilityChanged());
  }
  return store;
}

let lastUserKey: string | null = null;

/**
 * Called with who is signed in. When it CHANGES (somebody signs in or out), the "session ended" mark is cleared and the unread poller starts
 * afresh (it had stopped for good after a refusal). The first call only remembers.
 */
export function syncVisitorUser(userKey: string) {
  if (lastUserKey === userKey) return;
  const firstTime = lastUserKey === null;
  lastUserKey = userKey;
  if (firstTime) return;
  setSessionExpired(false);
  store?.restart();
}

const EMPTY: UnreadSnapshot = { unread: 0, conversations: 0, state: "idle" };
const noop = () => () => {};

/** The unread count for the bubble. While `enabled` is false nothing is subscribed, so nothing is polled (a logged-out visitor, a closed switch, an open panel). */
export function useVisitorUnread(enabled: boolean): UnreadSnapshot {
  return useSyncExternalStore(
    (listener) => (enabled ? getVisitorUnreadStore().subscribe(listener) : noop()),
    () => (enabled ? getVisitorUnreadStore().getSnapshot() : EMPTY),
    () => EMPTY
  );
}
