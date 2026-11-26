/**
 * The visitor's side of the Contact chat: every call to /api/chat/... that a signed-in visitor makes (and the public /api/chat/status).
 * The shapes are those of docs/tourist-visa-handover.md, section 14.22. The conversation is ALWAYS the signed-in user's own: no call here
 * takes a conversation id. The token is read from the browser's storage like every other call of the site.
 *
 * An error from the server becomes a ChatApiError with only the HTTP status and the chat's error code; the server's own message is never
 * shown and nothing the person typed comes back.
 */

import { ChatApiError } from "@/services/chatAdminService";
import type { ChatMessage, ChatStatus } from "@/utils/chatAdmin";
import type { ChatHours } from "@/utils/chatWidget";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

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

async function call<T>(path: string, { method = "GET", body, signal, auth = true }: { method?: string; body?: unknown; signal?: AbortSignal; auth?: boolean } = {}): Promise<{ status: number; data: T }> {
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
  let json: { data?: T; code?: string } | null = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok) throw new ChatApiError(response.status, json && typeof json.code === "string" ? json.code : null);
  return { status: response.status, data: (json ? json.data : undefined) as T };
}

/** GET /api/chat/status: public. Resolves { status, json } with the raw answer so the caller decides what it means (anything but a clear "enabled" is "off"). */
export async function fetchChatPublicStatus(signal?: AbortSignal): Promise<{ status: number; json: unknown }> {
  try {
    const response = await fetch(`${API_URL}/chat/status`, { signal, cache: "no-store" });
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return { status: response.status, json };
  } catch (error) {
    if (error && typeof error === "object" && (error as { name?: string }).name === "AbortError") throw error;
    return { status: 0, json: null };
  }
}

export interface MyConversation {
  status: ChatStatus;
  subject: string | null;
  unreadForClient: number;
  lastMessageAt: string | null;
  messageCount: number;
}

export interface MyConversationPage {
  conversation: MyConversation | null;
  messages: ChatMessage[];
  hasMore: boolean;
}

/** GET /api/chat/conversation: the visitor's own conversation (null before the first message). `query` is built by buildMessagesQuery. */
export async function fetchMyConversation(query: string, signal?: AbortSignal): Promise<MyConversationPage> {
  return (await call<MyConversationPage>(`/conversation${query ? `?${query}` : ""}`, { signal })).data;
}

/** GET /api/chat/unread: just the number for the bubble. */
export async function fetchMyUnread(signal?: AbortSignal): Promise<{ unread: number; status: ChatStatus | null }> {
  return (await call<{ unread: number; status: ChatStatus | null }>("/unread", { signal })).data;
}

export interface SendInput {
  body: string;
  clientMessageId: string;
  subject?: string;
  phone?: string;
}

/** POST /api/chat/messages. A resend with the same clientMessageId returns the first message (the server stores it once). */
export async function sendMyMessage(input: SendInput): Promise<{ message: ChatMessage; conversation: MyConversation; duplicate: boolean }> {
  const answer = await call<{ message: ChatMessage; conversation: MyConversation }>("/messages", { method: "POST", body: input });
  return { ...answer.data, duplicate: answer.status === 200 };
}

/** POST /api/chat/read: the visitor has seen the team's messages up to `upToSeq`. */
export async function markMyRead(upToSeq: number): Promise<{ unreadForClient: number }> {
  return (await call<{ unreadForClient: number }>("/read", { method: "POST", body: { upToSeq } })).data;
}

export type { ChatHours };
