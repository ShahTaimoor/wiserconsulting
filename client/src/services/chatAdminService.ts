/**
 * The admin side of the Contact chat: every call to /api/chat/admin/... and the public /api/chat/status.
 * The shapes are those of docs/tourist-visa-handover.md, section 14.22. Every call needs the signed-in administrator's token (read from
 * the browser's storage like the other admin screens); the server checks the role again on each request.
 *
 * An error from the server is turned into a ChatApiError with only the HTTP status and the chat's error code: the server's own message is
 * never shown, and nothing the person typed comes back.
 */

import type { ChatMessage, ChatStatus, ConversationMeta, ConversationUser, InboxRow } from "@/utils/chatAdmin";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export class ChatApiError extends Error {
  status: number;
  code: string | null;
  constructor(status: number, code: string | null) {
    super(`chat request failed (${status}${code ? ` ${code}` : ""})`);
    this.name = "ChatApiError";
    this.status = status;
    this.code = code;
  }
}

function tokenOrThrow(): string {
  let token: string | null = null;
  try {
    token = localStorage.getItem("token");
  } catch {
    token = null;
  }
  if (!token) throw new ChatApiError(401, null);
  return token;
}

async function call<T>(path: string, { method = "GET", body, signal, auth = true }: { method?: string; body?: unknown; signal?: AbortSignal; auth?: boolean } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/chat${path}`, {
      method,
      signal,
      cache: "no-store",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(auth ? { Authorization: `Bearer ${tokenOrThrow()}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof ChatApiError) throw error;
    if (error && typeof error === "object" && (error as { name?: string }).name === "AbortError") throw error;
    throw new ChatApiError(0, null);
  }
  if (response.status === 204) return undefined as T;
  let json: { data?: T; code?: string } | null = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok) throw new ChatApiError(response.status, json && typeof json.code === "string" ? json.code : null);
  return (json ? json.data : undefined) as T;
}

export interface ChatStatusAnswer {
  enabled: boolean;
  /** The server's length limits (see utils/chatLimits.ts); the caller checks them, nothing is trusted here. */
  limits?: unknown;
}

/** GET /api/chat/status: public. `limits` is the raw value of data.limits (for rememberChatLimits), only when chat is on. */
export async function fetchChatStatus(signal?: AbortSignal): Promise<{ status: number; enabled: boolean; limits?: unknown }> {
  try {
    const data = await call<ChatStatusAnswer>("/status", { signal, auth: false });
    const enabled = Boolean(data && data.enabled === true);
    return { status: 200, enabled, ...(enabled ? { limits: data.limits } : {}) };
  } catch (error) {
    if (error instanceof ChatApiError) return { status: error.status, enabled: false };
    throw error;
  }
}

export interface UnreadTotals {
  unread: number;
  conversations: number;
}
export const fetchAdminUnread = (signal?: AbortSignal) => call<UnreadTotals>("/admin/unread", { signal });

export interface InboxPage {
  items: InboxRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export const fetchInbox = (query: string, signal?: AbortSignal) => call<InboxPage>(`/admin/conversations${query ? `?${query}` : ""}`, { signal });

export interface ConversationPage {
  conversation: ConversationMeta;
  user: ConversationUser;
  messages: ChatMessage[];
  hasMore: boolean;
}
export const fetchConversation = (id: string, query: string, signal?: AbortSignal) =>
  call<ConversationPage>(`/admin/conversations/${encodeURIComponent(id)}${query ? `?${query}` : ""}`, { signal });

export const sendReply = (id: string, body: string, clientMessageId: string) =>
  call<{ message: ChatMessage; conversation: { id: string; status: ChatStatus } }>(`/admin/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", body: { body, clientMessageId } });

export const markConversationRead = (id: string, upToSeq: number) =>
  call<{ unreadForStaff: number }>(`/admin/conversations/${encodeURIComponent(id)}/read`, { method: "POST", body: { upToSeq } });

export const changeConversationStatus = (id: string, status: "open" | "closed") =>
  call<{ id: string; status: ChatStatus }>(`/admin/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } });

export const deleteConversation = (id: string) => call<void>(`/admin/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });

// ---------------------------------------------------------------------------
// The old contact form messages (read only): the list the old screen used
// ---------------------------------------------------------------------------

export interface LegacyMessage {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  status: "new" | "read" | "responded" | "archived";
  createdAt: string;
  adminReply?: { message: string; repliedAt: string };
}

export interface LegacyPage {
  items: LegacyMessage[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
}

/**
 * GET /api/contacts?page=&limit=&status=&search=. The list already carries each message in full, so the read-only tab shows a message from
 * the list and never calls GET /api/contacts/:id (which, on the server, marks a message as read).
 */
export async function fetchLegacyMessages({ page, search, status }: { page: number; search: string; status: string }, signal?: AbortSignal): Promise<LegacyPage> {
  const params = new URLSearchParams({ page: String(page), limit: "10" });
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  let response: Response;
  try {
    response = await fetch(`${API_URL}/contacts?${params.toString()}`, { signal, cache: "no-store", headers: { Authorization: `Bearer ${tokenOrThrow()}` } });
  } catch (error) {
    if (error instanceof ChatApiError) throw error;
    if (error && typeof error === "object" && (error as { name?: string }).name === "AbortError") throw error;
    throw new ChatApiError(0, null);
  }
  if (!response.ok) throw new ChatApiError(response.status, null);
  const json = (await response.json()) as { data?: LegacyMessage[]; meta?: { totalItems?: number; totalPages?: number; currentPage?: number } };
  return {
    items: Array.isArray(json.data) ? json.data : [],
    totalItems: json.meta?.totalItems ?? 0,
    totalPages: json.meta?.totalPages ?? 1,
    currentPage: json.meta?.currentPage ?? page,
  };
}
