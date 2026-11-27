/**
 * The plain logic of the visitor's chat bubble and panel: which pages show the bubble, what the status answer means, the reply-hours words,
 * the words of the bubble's label, the rules for the first message, the id that makes a resend safe, the words for the errors, and the
 * decisions about what to poll. No React and no network, so it can be unit tested with `node --test`.
 *
 * The merging of messages, the unread number and the error words that the admin inbox already has (utils/chatAdmin.ts) are reused, not copied.
 */

import { CHAT_PAGES } from "./safeRedirect.ts";
import { describeChatError, newClientMessageId, unreadLabel } from "./chatAdmin.ts";

// ---------------------------------------------------------------------------
// Which pages show the bubble
// ---------------------------------------------------------------------------

/** "/about/" and "/about" are the same page; an empty path is the home page. Anything else is returned as it is. */
export function normalisePath(pathname: unknown): string {
  if (typeof pathname !== "string" || pathname === "") return "/";
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** Only the six public pages of the allow-list: home, about, services, contact, privacy and terms. (A page that is not named here never gets the bubble.) */
export function isChatPage(pathname: unknown): boolean {
  // Not text (no path known): not a page of the list. (An empty text is the home page.)
  return typeof pathname === "string" && CHAT_PAGES.includes(normalisePath(pathname));
}

export type ChatSwitch = "unknown" | "on" | "off";

/**
 * Is the bubble drawn? Only on an allow-listed page, only when the server says chat is on, and never for an administrator. While the answer
 * is not known (or could not be read) nothing is drawn and no space is kept.
 */
export function shouldShowBubble({ pathname, chat, isAdmin }: { pathname: unknown; chat: ChatSwitch; isAdmin: boolean }): boolean {
  return chat === "on" && !isAdmin && isChatPage(pathname);
}

// ---------------------------------------------------------------------------
// The status answer and the reply hours
// ---------------------------------------------------------------------------

export interface ChatHours {
  openNow?: boolean;
  nextOpenAt?: string | null;
  closesAt?: string | null;
  text?: string;
  backText?: string | null;
  timezone?: string;
}

export interface ChatStatusReading {
  state: "on" | "off";
  hours: ChatHours | null;
}

/** "on" only for a 200 whose data says enabled is exactly true. A network error, a 404, a 500 or an odd body is "off". */
export function readChatStatus(status: number, json: unknown): ChatStatusReading {
  const off: ChatStatusReading = { state: "off", hours: null };
  if (status !== 200 || json === null || typeof json !== "object" || Array.isArray(json)) return off;
  const data = (json as { data?: unknown }).data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return off;
  const { enabled, hours } = data as { enabled?: unknown; hours?: unknown };
  if (enabled !== true) return off;
  const clean: ChatHours | null = hours && typeof hours === "object" && !Array.isArray(hours) ? (hours as ChatHours) : null;
  return { state: "on", hours: clean };
}

export const FALLBACK_HOURS_TEXT = "We usually reply between 12 PM and 9 PM (Pakistan time)";

/** The sentences under the panel's title: the usual hours, and (only outside them) when the team is back. Text from the server only, as text. */
export function hoursLines(hours: ChatHours | null | undefined): { usual: string; back: string | null; outside: boolean } {
  const usual = hours && typeof hours.text === "string" && hours.text.trim() !== "" ? hours.text.trim() : FALLBACK_HOURS_TEXT;
  const outside = Boolean(hours) && hours?.openNow === false;
  const back = outside && typeof hours?.backText === "string" && hours.backText.trim() !== "" ? hours.backText.trim() : null;
  return { usual, back, outside };
}

// ---------------------------------------------------------------------------
// The bubble
// ---------------------------------------------------------------------------

/** The bubble's accessible name: "Chat with us", with the count of unread replies when there are some. */
export function bubbleLabel(unread: unknown): string {
  const spoken = unreadLabel(unread);
  return spoken ? `Chat with us, ${spoken.charAt(0).toLowerCase()}${spoken.slice(1)}` : "Chat with us";
}

// ---------------------------------------------------------------------------
// The panel's size and the bubble's look while the panel is open
// ---------------------------------------------------------------------------

/** The round bubble is 56 px, 16 px from the corner; the card sits 16 px above it; at the top the card keeps a 12 px gap to the window's edge. */
export const BUBBLE_SIZE_PX = 56;
export const BUBBLE_INSET_PX = 16;
export const PANEL_GAP_PX = 16;
export const PANEL_TOP_GAP_PX = 12;
export const PANEL_MAX_HEIGHT_PX = 640;

/** Where the card's bottom edge is, counted from the bottom of the window: just above the bubble. */
export function panelBottomPx(): number {
  return BUBBLE_INSET_PX + BUBBLE_SIZE_PX + PANEL_GAP_PX;
}

/**
 * The height of the desktop card for a window of this height: at most 640 px, and never more than the window minus the bubble, the gaps and the
 * top gap, so the card's header and close button stay on screen (and below the top edge by the gap). 0 for a window that cannot hold it.
 * The Tailwind classes of ChatWidget are written from the same numbers (a test checks they agree).
 */
export function panelHeightPx(viewportHeight: unknown): number {
  const height = typeof viewportHeight === "number" && Number.isFinite(viewportHeight) ? Math.floor(viewportHeight) : 0;
  return Math.max(0, Math.min(PANEL_MAX_HEIGHT_PX, height - panelBottomPx() - PANEL_TOP_GAP_PX));
}

/** The distance from the top of the window to the card's top edge (the card is anchored at its bottom). */
export function panelTopPx(viewportHeight: unknown): number {
  const height = typeof viewportHeight === "number" && Number.isFinite(viewportHeight) ? Math.floor(viewportHeight) : 0;
  return height - panelBottomPx() - panelHeightPx(height);
}

/** The floating navbar's bottom edge (12 px gap + 68 px bar). A card whose top is above this line covers the right end of the bar. */
export const NAVBAR_BOTTOM_PX = 80;

/**
 * Is the open panel modal? On a phone it is a full-screen sheet, so yes. On a larger screen it is a card that leaves the page usable, EXCEPT in a
 * window so short that the card reaches up over the navbar (its top is above the bar's bottom edge, which is every window under 808 px tall):
 * there the controls under the card cannot be clicked, so the keyboard must not reach them either. The panel then holds the focus (Tab stays
 * inside it) until it is closed with Escape or its X, exactly as the phone sheet does.
 */
export function panelIsModal({ phone, viewportHeight }: { phone: boolean; viewportHeight: unknown }): boolean {
  if (phone) return true;
  const height = typeof viewportHeight === "number" && Number.isFinite(viewportHeight) ? viewportHeight : 0;
  return height > 0 && panelTopPx(height) < NAVBAR_BOTTOM_PX;
}

/**
 * The bubble while the panel is open becomes a close button (an X, named "Close the chat"); on a phone the sheet covers the bubble, so it is
 * not drawn there (the sheet has its own close button). While the panel is closed it is the chat icon with the unread count in its name.
 */
export function bubbleView({ open, unread }: { open: boolean; unread: unknown }): { icon: "chat" | "close"; label: string; hiddenOnPhone: boolean } {
  return open ? { icon: "close", label: "Close the chat", hiddenOnPhone: true } : { icon: "chat", label: bubbleLabel(unread), hiddenOnPhone: false };
}

/** Which of the two things is polled: the light unread check while the panel is closed, or the conversation while it is open. Never for a logged-out visitor. */
export function pollPlan({ signedIn, chatOn, onChatPage, isAdmin, panelOpen, sessionExpired, offline }: { signedIn: boolean; chatOn: boolean; onChatPage: boolean; isAdmin: boolean; panelOpen: boolean; sessionExpired: boolean; offline: boolean }): "none" | "badge" | "conversation" {
  if (!signedIn || !chatOn || !onChatPage || isAdmin || sessionExpired) return "none";
  if (panelOpen) return offline ? "none" : "conversation";
  return "badge";
}

// ---------------------------------------------------------------------------
// The box and the first message
// ---------------------------------------------------------------------------

/** What the server accepts in one message (config/contactChat.js). It is not in the status answer, so it is written here. */
export const CLIENT_MESSAGE_MAX = 2000;
export const SUBJECT_MAX = 80;

export function cleanSubject(raw: unknown): { value: string; error: string | null } {
  const value = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "";
  return Array.from(value).length > SUBJECT_MAX ? { value, error: `The topic can be at most ${SUBJECT_MAX} characters.` } : { value, error: null };
}

/** The same rule as the server: plus, digits, spaces, brackets and hyphens, 5 to 15 digits; empty is fine. */
export function cleanPhone(raw: unknown): { value: string; error: string | null } {
  const value = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (value === "") return { value, error: null };
  const digits = value.replace(/\D/g, "");
  const fine = value.length <= 25 && /^[+()\d][\d ()+-]*$/.test(value) && digits.length >= 5 && digits.length <= 15;
  return fine ? { value, error: null } : { value, error: "Please enter a valid phone number, or leave it empty." };
}

/**
 * The id of a send. A resend of the SAME words keeps the id of the attempt that failed (so the server can never store the message twice);
 * different words get a new id. After a success the caller forgets the pending attempt.
 */
export function sendIdFor(pending: { text: string; id: string } | null, text: string, makeId: () => string = newClientMessageId): { text: string; id: string } {
  return pending && pending.text === text ? pending : { text, id: makeId() };
}

/** The words for a failed send (or read): fixed sentences chosen by the status and the code; nothing from the server is shown. */
export function describeSendError(status: number, code?: string | null): string {
  if (code === "TOO_MANY_MESSAGES") return "You are sending messages very quickly. Please wait a minute and try again.";
  if (code === "FIRST_MESSAGE_ONLY") return "The topic and phone number can only be sent with your first message.";
  if (code === "INVALID_PHONE") return "Please enter a valid phone number, or leave it empty.";
  if (code === "SUBJECT_TOO_LONG") return `The topic can be at most ${SUBJECT_MAX} characters.`;
  if (code === "CONVERSATION_FULL") return "This conversation is full. Please call us instead.";
  if (status === 404 && code === "FEATURE_CLOSED") return "Chat is not available right now. Please call us instead.";
  if (status === 404) return "Something went wrong. Please try again.";
  return describeChatError(status, code);
}

// ---------------------------------------------------------------------------
// The draft (kept for this browser tab only)
// ---------------------------------------------------------------------------

export const DRAFT_KEY = "wiser-chat-draft";

interface TextStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface Draft {
  body: string;
  subject: string;
  phone: string;
}

/** The unsent text, from the tab's storage. Anything missing, broken or too long is an empty draft. Never throws. */
export function readDraft(storage: TextStorage | null | undefined): Draft {
  const empty: Draft = { body: "", subject: "", phone: "" };
  try {
    const raw = storage ? storage.getItem(DRAFT_KEY) : null;
    if (!raw || raw.length > 30_000) return empty;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
    return { body: text(parsed.body, 20_000), subject: text(parsed.subject, 400), phone: text(parsed.phone, 100) };
  } catch {
    return empty;
  }
}

/** Saves the draft (or forgets it when there is nothing in it). Never throws: a full or blocked storage just means no draft is kept. */
export function writeDraft(storage: TextStorage | null | undefined, draft: Draft): void {
  try {
    if (!storage) return;
    if (!draft.body && !draft.subject && !draft.phone) storage.removeItem(DRAFT_KEY);
    else storage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* nothing to do */
  }
}

// ---------------------------------------------------------------------------
// Opening the panel: the event, and ?chat=open in the address
// ---------------------------------------------------------------------------

export const OPEN_CHAT_EVENT = "open-chat-panel";

/** Asks the bubble (wherever it is mounted) to open the panel: used by the "Chat with us" button of the Contact page. */
export function requestChat(target: { dispatchEvent: (event: Event) => boolean } | null = typeof window === "undefined" ? null : window): void {
  target?.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}

/** Does the address ask for the panel to be open (?chat=open)? Only that exact value. */
export function wantsPanelOpen(search: unknown): boolean {
  return typeof search === "string" && search.length <= 2048 && new URLSearchParams(search).get("chat") === "open";
}

/** The address without the chat=open parameter (every other parameter and the #fragment are kept), so a reload does not open the panel again. */
export function withoutChatParam(path: string, search: string, hash = ""): string {
  const params = new URLSearchParams(search);
  params.delete("chat");
  const rest = params.toString();
  return `${path}${rest ? `?${rest}` : ""}${hash}`;
}
