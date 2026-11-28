/**
 * The lengths the chat server enforces (backend/config/contactChat.js), as the client uses them.
 *
 * The server states them in GET /api/chat/status (data.limits). Until that answer is read, and whenever it does not carry a usable number (an
 * older server, a failed call, an odd value), the client uses the DEFAULTS below, which are today's numbers. A test (chatLimits.test.mjs) reads
 * the backend config and fails if these defaults ever differ from it, so the two cannot drift apart unnoticed.
 *
 * No React here: a tiny shared store, so the visitor widget and the admin inbox (separate screens) read the same answer.
 */

export interface ChatLimits {
  /** The longest message a visitor can send, in characters. */
  clientMessage: number;
  /** The longest reply staff can send. */
  staffMessage: number;
  /** The longest topic (subject) of a first message. */
  subject: number;
  /** The longest phone number text. */
  phone: number;
}

export const DEFAULT_CHAT_LIMITS: Readonly<ChatLimits> = Object.freeze({ clientMessage: 2000, staffMessage: 4000, subject: 80, phone: 25 });

/** A number is usable when it is a whole number from 1 to 100000 (a sane size for a text length). */
const usable = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100_000;

/** The limits from the status answer's `limits` object. Each field is checked on its own: a missing or odd one falls back to its default. */
export function readChatLimits(raw: unknown): ChatLimits {
  const source = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const pick = (key: keyof ChatLimits): number => (usable(source[key]) ? (source[key] as number) : DEFAULT_CHAT_LIMITS[key]);
  return { clientMessage: pick("clientMessage"), staffMessage: pick("staffMessage"), subject: pick("subject"), phone: pick("phone") };
}

// ---------------------------------------------------------------------------
// The shared store
// ---------------------------------------------------------------------------

let current: ChatLimits = { ...DEFAULT_CHAT_LIMITS };
const listeners = new Set<() => void>();

const same = (a: ChatLimits, b: ChatLimits) => a.clientMessage === b.clientMessage && a.staffMessage === b.staffMessage && a.subject === b.subject && a.phone === b.phone;

/** What the screens use now: the server's numbers once they were read, today's numbers before that. */
export function getChatLimits(): ChatLimits {
  return current;
}

/** Remember the limits of a status answer (the raw `limits` value; anything unusable is replaced by the defaults, field by field). */
export function rememberChatLimits(raw: unknown): void {
  const next = readChatLimits(raw);
  if (same(current, next)) return;
  current = next;
  listeners.forEach((listener) => listener());
}

export function subscribeChatLimits(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Back to the defaults (used when the chat is off, and by tests). */
export function resetChatLimits(): void {
  rememberChatLimits(undefined);
}
