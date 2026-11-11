/**
 * Asks the server whether the Tourist Visa feature is open, and remembers the answer for a short while.
 *
 * The server's TOURIST_VISA_ENABLED switch is the single source of truth. The client asks GET /api/tourist-visa/status
 * (no sign-in, answers { open } even while the feature is closed) and treats ANYTHING but a clear "open" as closed:
 * a network error, a timeout, a 404 or 500, a body that is not exactly the expected shape. A wrong guess therefore
 * can only hide the feature, never show it.
 *
 * Pure logic with its dependencies passed in (the fetch, the clock), so it can be unit tested with `node --test`.
 */

/** What the server said. "unknown" is only ever the state before the first answer arrives. */
export type ServerOpenAnswer = "open" | "closed";
export type ServerOpenState = ServerOpenAnswer | "unknown";

/** The raw result of asking: the HTTP status and the parsed body (or null). It may reject on a network error. */
export type StatusFetcher = (signal: AbortSignal) => Promise<{ status: number; json: unknown }>;

/** "open" only for a 200 whose body is an object with `open` exactly true. Everything else is "closed". */
export function readStatusAnswer(status: number, json: unknown): ServerOpenAnswer {
  if (status !== 200) return "closed";
  if (json === null || typeof json !== "object" || Array.isArray(json)) return "closed";
  return (json as { open?: unknown }).open === true ? "open" : "closed";
}

export interface OpenCheckerOptions {
  fetchStatus: StatusFetcher;
  /** The clock, in milliseconds. */
  now?: () => number;
  /** How long a clear answer is remembered. */
  ttlMs?: number;
  /** How long a failed ask (an error or a timeout) is remembered: short, so a recovered server is noticed soon. */
  errorTtlMs?: number;
  /** How long to wait for the server before giving up (the answer is then "closed"). */
  timeoutMs?: number;
}

export interface OpenChecker {
  /** Asks (or reuses a fresh answer, or the ask already under way) and resolves to "open" or "closed". Never rejects. */
  check: () => Promise<ServerOpenAnswer>;
  /** The remembered answer if it is still fresh, otherwise "unknown". Never asks. */
  peek: () => ServerOpenState;
  /** Forgets everything (for tests). */
  reset: () => void;
}

export const DEFAULT_TTL_MS = 30_000;
export const DEFAULT_ERROR_TTL_MS = 5_000;
export const DEFAULT_TIMEOUT_MS = 5_000;

export function createOpenChecker({
  fetchStatus,
  now = () => Date.now(),
  ttlMs = DEFAULT_TTL_MS,
  errorTtlMs = DEFAULT_ERROR_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: OpenCheckerOptions): OpenChecker {
  let remembered: { answer: ServerOpenAnswer; until: number } | null = null;
  let inFlight: Promise<ServerOpenAnswer> | null = null;

  const fresh = () => (remembered !== null && now() < remembered.until ? remembered.answer : null);

  async function ask(): Promise<ServerOpenAnswer> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("timeout"));
      }, timeoutMs);
    });
    try {
      // Racing the timer as well as aborting means even a fetcher that ignores the signal cannot hold us up.
      const { status, json } = await Promise.race([fetchStatus(controller.signal), timedOut]);
      const answer = readStatusAnswer(status, json);
      remembered = { answer, until: now() + ttlMs };
      return answer;
    } catch {
      remembered = { answer: "closed", until: now() + errorTtlMs };
      return "closed";
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  return {
    check() {
      const known = fresh();
      if (known !== null) return Promise.resolve(known);
      if (inFlight) return inFlight;
      inFlight = ask().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    peek() {
      return fresh() ?? "unknown";
    },
    reset() {
      remembered = null;
      inFlight = null;
    },
  };
}
