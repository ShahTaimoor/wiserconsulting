/**
 * Polling for the admin chat inbox. No websockets: a poll asks the server for what is new, now and then, and only while the browser tab is
 * visible. When nothing changes it asks less and less often; anything that changes (or something the person does) brings it back to the
 * normal pace. A poll that is refused for good (signed out, chat switched off, the thing deleted) stops the poller.
 *
 * The clock, the timers and "is the tab visible" are passed in, so all of it can be unit tested with `node --test` and fake timers.
 */

export type PollResult = "changed" | "same" | "stop";

export interface PollerOptions {
  /** One poll. Returns what happened; a thrown error counts as "same" (and so slows the pace). */
  run: () => Promise<PollResult>;
  /** The normal pace, in milliseconds. */
  baseMs: number;
  /** The slowest pace it backs off to. */
  maxMs: number;
  /** How many quiet polls in a row before the pace slows (and again for every further such number). */
  quietBeforeBackoff?: number;
  isVisible?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/** The wait before the next poll after `quiet` quiet polls in a row: the normal pace, then doubled for every further run of quiet polls, up to the slowest. */
export function backoffDelay(baseMs: number, maxMs: number, quiet: number, quietBeforeBackoff = 5): number {
  if (!(quiet >= quietBeforeBackoff)) return baseMs;
  const steps = 1 + Math.floor((quiet - quietBeforeBackoff) / quietBeforeBackoff);
  return Math.min(maxMs, baseMs * 2 ** steps);
}

export interface Poller {
  /** Starts polling. By default the first poll is made at once; `immediate: false` waits the normal pace first (the caller has just loaded). */
  start: (options?: { immediate?: boolean }) => void;
  stop: () => void;
  /** Something happened (a reply was sent, a conversation was opened): go back to the normal pace and poll now. */
  poke: () => void;
  /** Tell the poller the tab was hidden or shown. */
  visibilityChanged: () => void;
  isRunning: () => boolean;
}

export function createPoller(options: PollerOptions): Poller {
  const { run, baseMs, maxMs, quietBeforeBackoff = 5 } = options;
  const isVisible = options.isVisible ?? (() => true);
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let running = false;
  let inFlight = false;
  let timer: unknown = null;
  let waitingForVisible = false;
  let quiet = 0;
  let generation = 0;

  const cancelTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const schedule = () => {
    cancelTimer();
    if (!running) return;
    if (!isVisible()) {
      waitingForVisible = true; // nothing is scheduled while the tab is hidden; showing it polls at once
      return;
    }
    timer = setTimer(() => {
      timer = null;
      void tick();
    }, backoffDelay(baseMs, maxMs, quiet, quietBeforeBackoff));
  };

  const tick = async () => {
    if (!running || inFlight) return;
    if (!isVisible()) {
      waitingForVisible = true;
      return;
    }
    waitingForVisible = false;
    inFlight = true;
    const mine = generation;
    let result: PollResult = "same";
    try {
      result = await run();
    } catch {
      result = "same";
    }
    inFlight = false;
    if (mine !== generation || !running) return;
    if (result === "stop") {
      running = false;
      cancelTimer();
      return;
    }
    quiet = result === "changed" ? 0 : quiet + 1;
    schedule();
  };

  return {
    start({ immediate = true }: { immediate?: boolean } = {}) {
      if (running) return;
      running = true;
      generation += 1;
      quiet = 0;
      if (immediate) void tick();
      else schedule();
    },
    stop() {
      running = false;
      generation += 1;
      waitingForVisible = false;
      cancelTimer();
    },
    poke() {
      if (!running) return;
      quiet = 0;
      cancelTimer();
      if (inFlight) return; // the poll under way will schedule the next one at the normal pace
      void tick();
    },
    visibilityChanged() {
      if (!running) return;
      if (isVisible()) {
        if (waitingForVisible || timer === null) {
          cancelTimer();
          void tick();
        }
      } else {
        cancelTimer();
        waitingForVisible = true;
      }
    },
    isRunning: () => running,
  };
}

// ---------------------------------------------------------------------------
// The unread total (the badge on the sidebar): ONE poller for the whole tab
// ---------------------------------------------------------------------------

export interface UnreadSnapshot {
  unread: number;
  conversations: number;
  /** "idle" before the first answer, "ok" while it works, "stopped" after a refusal (signed out, chat off). */
  state: "idle" | "ok" | "stopped";
}

export interface UnreadStoreOptions {
  /** Asks the server. Rejects with an error that has a numeric `status` for an HTTP refusal. */
  fetchUnread: () => Promise<{ unread: number; conversations: number }>;
  baseMs?: number;
  maxMs?: number;
  isVisible?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/** An HTTP status that ends the polling for good: signed out, not allowed, or chat switched off. */
export function isFinalRefusal(error: unknown): boolean {
  const status = error && typeof error === "object" ? (error as { status?: unknown }).status : undefined;
  return status === 401 || status === 403 || status === 404;
}

/**
 * The shared unread total. Anything may subscribe (the sidebar, the header, the inbox); the poller runs while at least one does, so a second
 * subscriber never makes a second poller. `refresh()` asks again now (after reading or replying).
 */
export function createUnreadStore(options: UnreadStoreOptions) {
  const { fetchUnread } = options;
  let snapshot: UnreadSnapshot = { unread: 0, conversations: 0, state: "idle" };
  const listeners = new Set<() => void>();

  const set = (next: UnreadSnapshot) => {
    if (next.unread === snapshot.unread && next.conversations === snapshot.conversations && next.state === snapshot.state) return false;
    snapshot = next;
    listeners.forEach((fn) => fn());
    return true;
  };

  const poller = createPoller({
    baseMs: options.baseMs ?? 30_000,
    maxMs: options.maxMs ?? 120_000,
    isVisible: options.isVisible,
    setTimer: options.setTimer,
    clearTimer: options.clearTimer,
    run: async () => {
      try {
        const answer = await fetchUnread();
        const changed = set({ unread: Math.max(0, Math.floor(answer.unread) || 0), conversations: Math.max(0, Math.floor(answer.conversations) || 0), state: "ok" });
        return changed ? "changed" : "same";
      } catch (error) {
        if (isFinalRefusal(error)) {
          set({ unread: 0, conversations: 0, state: "stopped" });
          return "stop";
        }
        return "same";
      }
    },
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) poller.start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) poller.stop();
      };
    },
    refresh: () => poller.poke(),
    visibilityChanged: () => poller.visibilityChanged(),
    /** Starts over after a stop (for example after signing in again). */
    restart() {
      poller.stop();
      set({ unread: 0, conversations: 0, state: "idle" });
      if (listeners.size > 0) poller.start();
    },
    subscriberCount: () => listeners.size,
    isRunning: () => poller.isRunning(),
  };
}
