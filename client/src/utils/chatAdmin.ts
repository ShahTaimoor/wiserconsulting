/**
 * The plain logic of the admin chat inbox: what the numbers look like, how new messages are merged into the ones already on screen, what
 * the list query is, who sent a message, the words for the errors. No React and no network, so it can be unit tested with `node --test`.
 *
 * Message text is plain text. Nothing here (or in the components that use it) turns it into HTML: it is always drawn as a React text node.
 */

// ---------------------------------------------------------------------------
// Shapes of what the server (docs/tourist-visa-handover.md, section 14.22) sends
// ---------------------------------------------------------------------------

export type ChatStatus = "open" | "answered" | "closed";
export type InboxTab = "all" | "open" | "answered" | "closed" | "unread";

export interface ChatMessage {
  id: string;
  sender: "client" | "staff";
  /** null when the stored text could not be read. */
  text: string | null;
  createdAt: string;
  /** The conversation's running number over both sides: the cursor to poll with. */
  seq: number;
  /** Staff messages only: who on the team wrote it. */
  staff?: { id: string; name: string } | null;
}

export interface InboxRow {
  id: string;
  user: { id: string; name: string; email: string | null };
  topic: string | null;
  status: ChatStatus;
  unreadForStaff: number;
  lastMessageAt: string | null;
  lastMessageBy: "client" | "staff" | null;
  preview: string | null;
}

export interface ConversationMeta {
  id: string;
  status: ChatStatus;
  topic: string | null;
  phone: string | null;
  unreadForStaff: number;
  messageCount: number;
  lastMessageAt: string | null;
  lastMessageBy: "client" | "staff" | null;
  createdAt: string | null;
}

export interface ConversationUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

// ---------------------------------------------------------------------------
// The unread number
// ---------------------------------------------------------------------------

/** What the badge shows: nothing at 0 (the badge is not drawn), the number up to 99, then "99+". */
export function formatUnread(count: unknown): string {
  const n = typeof count === "number" && Number.isFinite(count) ? Math.floor(count) : 0;
  if (n <= 0) return "";
  return n > 99 ? "99+" : String(n);
}

/** The spoken form of the badge: "1 unread message", "3 unread messages", "more than 99 unread messages". */
export function unreadLabel(count: unknown): string {
  const n = typeof count === "number" && Number.isFinite(count) ? Math.floor(count) : 0;
  if (n <= 0) return "";
  if (n > 99) return "More than 99 unread messages";
  return n === 1 ? "1 unread message" : `${n} unread messages`;
}

/** A number from the server, or 0 when it is not one (a badge must never show "NaN"). */
export function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// ---------------------------------------------------------------------------
// Merging new messages into the ones on screen
// ---------------------------------------------------------------------------

/** The highest `seq` on screen (0 for none). */
export function lastSeq(messages: ReadonlyArray<Pick<ChatMessage, "seq">>): number {
  let top = 0;
  for (const message of messages) if (message.seq > top) top = message.seq;
  return top;
}

/**
 * The messages on screen plus the ones that just arrived: each message once (by id), in order of `seq`. A message that is already there is
 * replaced by the newer copy. When nothing is new (and nothing changed) the SAME array comes back, so the screen is not redrawn for nothing.
 */
export function mergeMessages(current: ReadonlyArray<ChatMessage>, incoming: ReadonlyArray<ChatMessage>): ChatMessage[] {
  if (incoming.length === 0) return current as ChatMessage[];
  const byId = new Map<string, ChatMessage>();
  for (const message of current) byId.set(message.id, message);
  let changed = false;
  for (const message of incoming) {
    const known = byId.get(message.id);
    if (!known || known.text !== message.text || known.seq !== message.seq) changed = true;
    byId.set(message.id, message);
  }
  if (!changed) return current as ChatMessage[];
  return [...byId.values()].sort((a, b) => a.seq - b.seq || (a.createdAt < b.createdAt ? -1 : 1));
}

/** How many messages of the list are not on screen yet (to say "1 new message" in the live region). */
export function newMessagesCount(before: ReadonlyArray<ChatMessage>, after: ReadonlyArray<ChatMessage>): number {
  const known = new Set(before.map((m) => m.id));
  return after.filter((m) => !known.has(m.id)).length;
}

/**
 * Polls ask for a few numbers BEFORE the last one on screen as well: two messages sent at the same moment may be stored out of order, and
 * a poll that asked only for "after the highest" could miss the slower one. The overlap is harmless because messages are merged by id.
 */
export const POLL_OVERLAP = 3;
export function afterForPoll(messages: ReadonlyArray<Pick<ChatMessage, "seq">>): number {
  return Math.max(0, lastSeq(messages) - POLL_OVERLAP);
}

// ---------------------------------------------------------------------------
// The list: tabs, search, query
// ---------------------------------------------------------------------------

export const INBOX_TABS: ReadonlyArray<{ id: InboxTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "open", label: "Open" },
  { id: "answered", label: "Answered" },
  { id: "closed", label: "Closed" },
];

export const SEARCH_MAX = 100;

/** What was typed in the search box, made safe to send: no line breaks, single spaces, at most 100 characters. */
export function cleanSearch(text: unknown): string {
  if (typeof text !== "string") return "";
  return Array.from(text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim()).slice(0, SEARCH_MAX).join("");
}

/** The query string of GET /api/chat/admin/conversations (without the "?"). Unknown tabs fall back to "all". */
export function buildInboxQuery({ tab = "all", search = "", page = 1, limit = 20 }: { tab?: InboxTab | string; search?: string; page?: number; limit?: number } = {}): string {
  const params = new URLSearchParams();
  if (tab === "open" || tab === "answered" || tab === "closed") params.set("status", tab);
  else if (tab === "unread") params.set("unread", "1");
  const q = cleanSearch(search);
  if (q) params.set("q", q);
  if (Number.isInteger(page) && page > 1) params.set("page", String(page));
  params.set("limit", String(Number.isInteger(limit) && limit >= 1 && limit <= 50 ? limit : 20));
  return params.toString();
}

/** The query of one conversation's messages. `after` and `before` are only sent when they are whole numbers. */
export function buildMessagesQuery({ after, before, limit }: { after?: number; before?: number; limit?: number } = {}): string {
  const params = new URLSearchParams();
  if (Number.isInteger(after) && (after as number) >= 0) params.set("after", String(after));
  else if (Number.isInteger(before) && (before as number) >= 0) params.set("before", String(before));
  if (Number.isInteger(limit) && (limit as number) >= 1 && (limit as number) <= 100) params.set("limit", String(limit));
  return params.toString();
}

/** A signature of the list that changes when anything a row shows changes: a poll that gives the same signature does not redraw. */
export function inboxSignature(rows: ReadonlyArray<InboxRow>, total: number): string {
  return `${total}|${rows.map((r) => `${r.id}:${r.status}:${r.unreadForStaff}:${r.lastMessageAt}:${r.lastMessageBy}:${r.preview ?? ""}`).join(",")}`;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const TEAM_NAME = "Wiser Consulting team";

/** Who sent a message, as a label: the client's name, or the team (and which member of it, when the server says). */
export function senderLabel(message: Pick<ChatMessage, "sender" | "staff">, clientName: string | null | undefined): string {
  if (message.sender === "client") return typeof clientName === "string" && clientName.trim() !== "" ? clientName.trim() : "Client";
  const who = message.staff && typeof message.staff.name === "string" ? message.staff.name.trim() : "";
  return who ? `${TEAM_NAME} (${who})` : TEAM_NAME;
}

export function statusChip(status: unknown): { label: string; tone: "blue" | "green" | "gray" } {
  if (status === "answered") return { label: "Answered", tone: "green" };
  if (status === "closed") return { label: "Closed", tone: "gray" };
  return { label: "Open", tone: "blue" };
}

/** The message text for the screen: the words, or a fixed sentence when the server could not read it. Never HTML. */
export function messageText(text: string | null | undefined): string {
  return typeof text === "string" ? text : "This message could not be read.";
}

/**
 * The time of a message or a row. Today: "14:05". Yesterday: "Yesterday". This week: the day's name. Older: "3 Nov" (with the year when
 * it is not this year). `now` is passed in so the answer can be tested.
 */
export function formatChatTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(then)) / 86_400_000);
  if (days === 0) return then.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return then.toLocaleDateString("en-GB", { weekday: "long" });
  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString("en-GB", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** The full date and time, for a tooltip. */
export function formatChatFullTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso);
  return Number.isNaN(then.getTime()) ? "" : then.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** The words for an error from the chat API, from its HTTP status and code. Fixed sentences: nothing from the server is shown. */
export function describeChatError(status: number, code?: string | null): string {
  if (status === 401) return "Your session has ended. Please sign in again.";
  if (status === 403) return "You do not have permission to use the inbox.";
  if (status === 404 && code === "FEATURE_CLOSED") return "Chat is switched off.";
  if (status === 404) return "This conversation no longer exists.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status === 503 || code === "CHAT_UNAVAILABLE") return "Chat is not available right now.";
  if (code === "MESSAGE_EMPTY") return "Please write a message first.";
  if (code === "MESSAGE_TOO_LONG") return "That message is too long.";
  if (code === "CONVERSATION_FULL") return "This conversation is full.";
  if (status === 0) return "Could not reach the server. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------------
// The reply box
// ---------------------------------------------------------------------------

export const STAFF_MESSAGE_MAX = 4000;

/** The text as the server will count it: line breaks made "\n" and the ends trimmed. */
export function replyLength(text: string): number {
  return Array.from(text.replace(/\r\n?/g, "\n").trim()).length;
}

/** Can the reply be sent now? Not while sending, not when empty or over the limit. */
export function canSendReply(text: string, sending: boolean, max: number = STAFF_MESSAGE_MAX): boolean {
  if (sending) return false;
  const length = replyLength(text);
  return length > 0 && length <= max;
}

/** Enter sends; Shift+Enter (and Alt, Ctrl+Enter is also accepted as "send") is a new line. Not while an input method is composing. */
export function keyAction(event: { key: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; isComposing?: boolean }): "send" | "newline" | "none" {
  if (event.key !== "Enter" || event.isComposing) return "none";
  if (event.shiftKey || event.altKey) return "newline";
  return "send";
}

/** Whether to mark the open conversation read now: the tab is visible, something above the marked number is on screen, and the screen is showing it. */
export function shouldMarkRead({ visible, shownSeq, markedSeq, hasUnread }: { visible: boolean; shownSeq: number; markedSeq: number; hasUnread: boolean }): boolean {
  return visible && hasUnread && shownSeq > markedSeq;
}

/** A new random id for one send (a resend of the same message reuses it, so the server never stores it twice). */
export function newClientMessageId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}
