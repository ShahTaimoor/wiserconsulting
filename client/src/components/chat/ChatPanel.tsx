"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, WifiOff, X } from "lucide-react";
import { MessageList } from "@/components/chat/MessageList";
import { usePoller } from "@/hooks/usePoller";
import { setSessionExpired } from "@/hooks/useChatVisitor";
import { ChatApiError } from "@/services/chatAdminService";
import { fetchMyConversation, markMyRead, sendMyMessage, type MyConversation } from "@/services/chatVisitorService";
import {
  afterForPoll,
  buildMessagesQuery,
  canSendReply,
  keyAction,
  lastSeq,
  mergeMessages,
  messageText,
  newMessagesCount,
  replyLength,
  statusChip,
  type ChatMessage,
} from "@/utils/chatAdmin";
import type { PollResult } from "@/utils/chatPolling";
import { chatSignInHref } from "@/utils/safeRedirect";
import {
  CLIENT_MESSAGE_MAX,
  SUBJECT_MAX,
  cleanPhone,
  cleanSubject,
  describeSendError,
  hoursLines,
  readDraft,
  sendIdFor,
  writeDraft,
  type ChatHours,
} from "@/utils/chatWidget";

export const NOTICE = "Please don't share passport or bank details here. Upload documents in your application.";

interface ChatPanelProps {
  titleId: string;
  hours: ChatHours | null;
  signedIn: boolean;
  /** The token ran out (a 401): the sign-in prompt is shown again. */
  expired: boolean;
  pathname: string;
  offline: boolean;
  onClose: () => void;
  /** The unread count of the team's replies, as the panel sees it (0 once they are on screen and marked read). */
  onUnread: (count: number) => void;
  announce: (text: string) => void;
}

const chipClass = { blue: "bg-blue-100 text-blue-900", green: "bg-emerald-100 text-emerald-900", gray: "bg-slate-200 text-slate-800" } as const;

/**
 * The body of the chat panel: the header with the reply hours, the notice, and then one of three things: the sign-in prompt (a logged-out
 * visitor, or a session that has ended), the first-message form (a visitor with no conversation yet), or the conversation.
 *
 * Message text is only ever drawn as a React text node (line breaks kept by the style, long words broken): never as HTML.
 */
export function ChatPanel({ titleId, hours, signedIn, expired, pathname, offline, onClose, onUnread, announce }: ChatPanelProps) {
  const lines = hoursLines(hours);
  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-slate-900">
      <header className="flex items-start gap-3 bg-emerald-700 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} tabIndex={-1} className="text-base font-bold outline-none">
            Wiser Consulting team
          </h2>
          <p className="mt-0.5 text-xs text-emerald-50">{lines.usual}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the chat" className="rounded-md p-1.5 text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>
      {lines.outside && (
        <p role="note" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">
          {lines.back ? `${lines.back}. ` : ""}You can still leave a message: we will answer when we are back.
        </p>
      )}
      {offline && (
        <p role="alert" className="flex items-center gap-2 border-b border-slate-300 bg-slate-100 px-4 py-2 text-xs text-slate-800">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden /> You are offline. Your message will not be sent until you are back online.
        </p>
      )}
      <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-700">{NOTICE}</p>
      {signedIn && !expired ? (
        <Conversation offline={offline} onUnread={onUnread} announce={announce} />
      ) : (
        <SignInPrompt pathname={pathname} expired={expired} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A visitor who is not signed in (or whose session ended)
// ---------------------------------------------------------------------------

function SignInPrompt({ pathname, expired }: { pathname: string; expired: boolean }) {
  const first = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  return (
    <div className="flex flex-1 flex-col justify-center gap-4 px-5 py-8 text-center">
      <p className="text-sm text-slate-800">{expired ? "Your session has ended. Please sign in again to carry on chatting. Your unsent message is kept." : "Please sign in to chat with us. It only takes a moment, and you will come back to this page with the chat open."}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link ref={first} href={chatSignInHref("login", pathname)} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">
          Sign in
        </Link>
        <Link href={chatSignInHref("register", pathname)} className="rounded-lg border border-slate-400 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">
          Create an account
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A signed-in visitor: the first-message form, or the conversation
// ---------------------------------------------------------------------------

function Conversation({ offline, onUnread, announce }: { offline: boolean; onUnread: (count: number) => void; announce: (text: string) => void }) {
  const [conversation, setConversation] = useState<MyConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error" | "unavailable">("loading");
  const [errorText, setErrorText] = useState("");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState<{ subject?: string; phone?: string }>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [newBelow, setNewBelow] = useState(false);
  const [visibleTick, setVisibleTick] = useState(0);

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const markedSeq = useRef(0);
  const marking = useRef(false);
  const pending = useRef<{ text: string; id: string } | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const atBottom = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftLoaded = useRef(false);

  // ---------------------------------------------------------------- the draft (kept for this tab only)
  useEffect(() => {
    const draft = readDraft(typeof sessionStorage === "undefined" ? null : sessionStorage);
    setBody(draft.body);
    setSubject(draft.subject);
    setPhone(draft.phone);
    draftLoaded.current = true;
  }, []);
  useEffect(() => {
    if (!draftLoaded.current) return;
    writeDraft(typeof sessionStorage === "undefined" ? null : sessionStorage, { body, subject, phone });
  }, [body, subject, phone]);

  // ---------------------------------------------------------------- loading
  const fail = useCallback((error: unknown): "stop" | "same" => {
    const status = error instanceof ChatApiError ? error.status : 0;
    const code = error instanceof ChatApiError ? error.code : null;
    if (status === 401) {
      setSessionExpired(true);
      return "stop";
    }
    if (status === 404 || status === 503) {
      setErrorText(describeSendError(status, code));
      setState("unavailable");
      return "stop";
    }
    return "same";
  }, []);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const page = await fetchMyConversation(buildMessagesQuery({ limit: 50 }));
      setConversation(page.conversation);
      setMessages(page.messages);
      setHasMore(page.hasMore);
      setState("ready");
    } catch (error) {
      const result = fail(error);
      if (result === "same") {
        setErrorText(describeSendError(error instanceof ChatApiError ? error.status : 0, error instanceof ChatApiError ? error.code : null));
        setState("error");
      }
    }
  }, [fail]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state === "ready") textareaRef.current?.focus();
  }, [state === "ready"]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- polling while the panel is open: only what is new, only while the tab is visible
  usePoller(
    async (): Promise<PollResult> => {
      try {
        const page = await fetchMyConversation(buildMessagesQuery({ after: afterForPoll(messagesRef.current), limit: 100 }));
        const before = messagesRef.current;
        const merged = mergeMessages(before, page.messages);
        let changed = merged !== before;
        if (merged !== before) {
          setMessages(merged);
          const fresh = merged.filter((m) => !before.some((b) => b.id === m.id) && m.sender === "staff");
          if (fresh.length > 0) announce(`New message from the team: ${messageText(fresh[fresh.length - 1].text).slice(0, 200)}`);
        }
        setConversation((current) => {
          const next = page.conversation;
          if (!next) return current;
          if (current && current.status === next.status && current.unreadForClient === next.unreadForClient && current.messageCount === next.messageCount) return current;
          changed = true;
          return next;
        });
        return changed ? "changed" : "same";
      } catch (error) {
        return fail(error);
      }
    },
    { enabled: state === "ready" && !offline, baseMs: 15_000, maxMs: 60_000 }
  );

  // ---------------------------------------------------------------- reading: the newest team message is on screen and the tab is visible
  const shownSeq = lastSeq(messages);
  const unreadForClient = conversation?.unreadForClient ?? 0;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setVisibleTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  useEffect(() => {
    onUnread(unreadForClient);
  }, [unreadForClient, onUnread]);
  useEffect(() => {
    if (state !== "ready" || marking.current || offline) return;
    const visible = document.visibilityState === "visible";
    if (!visible || unreadForClient <= 0 || shownSeq <= markedSeq.current) return;
    marking.current = true;
    const upTo = shownSeq;
    markMyRead(upTo)
      .then((answer) => {
        markedSeq.current = upTo;
        setConversation((current) => (current ? { ...current, unreadForClient: answer.unreadForClient } : current));
      })
      .catch((error) => {
        if (error instanceof ChatApiError && error.status === 401) setSessionExpired(true);
      })
      .finally(() => {
        marking.current = false;
      });
  }, [state, shownSeq, unreadForClient, offline, visibleTick]);

  // ---------------------------------------------------------------- scrolling: stay at the bottom only if the reader was there
  const scrollToBottom = () => {
    const box = logRef.current;
    if (box) box.scrollTop = box.scrollHeight;
    setNewBelow(false);
  };
  const newestId = messages.length ? messages[messages.length - 1].id : "";
  useEffect(() => {
    if (state !== "ready") return;
    if (atBottom.current) scrollToBottom();
    else setNewBelow(true);
  }, [newestId, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    const box = logRef.current;
    if (!box) return;
    atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    if (atBottom.current) setNewBelow(false);
  };

  const loadOlder = async () => {
    try {
      const first = Math.min(...messagesRef.current.map((m) => m.seq));
      const page = await fetchMyConversation(buildMessagesQuery({ before: first, limit: 50 }));
      setMessages((current) => mergeMessages(current, page.messages));
      setHasMore(page.hasMore);
    } catch (error) {
      fail(error);
    }
  };

  // ---------------------------------------------------------------- sending
  const first = conversation === null;
  const send = async () => {
    if (offline || !canSendReply(body, sending, CLIENT_MESSAGE_MAX)) return;
    const text = body.replace(/\r\n?/g, "\n").trim();
    let subjectValue = "";
    let phoneValue = "";
    if (first) {
      const s = cleanSubject(subject);
      const p = cleanPhone(phone);
      if (s.error || p.error) {
        setFieldError({ subject: s.error ?? undefined, phone: p.error ?? undefined });
        return;
      }
      setFieldError({});
      subjectValue = s.value;
      phoneValue = p.value;
    }
    // A resend of the same words keeps the id of the attempt that failed, so the server can never store the message twice.
    pending.current = sendIdFor(pending.current, text);
    setSending(true);
    setSendError("");
    try {
      const answer = await sendMyMessage({ body: text, clientMessageId: pending.current.id, ...(subjectValue ? { subject: subjectValue } : {}), ...(phoneValue ? { phone: phoneValue } : {}) });
      pending.current = null;
      setMessages((current) => mergeMessages(current, [answer.message]));
      setConversation(answer.conversation);
      setBody("");
      setSubject("");
      setPhone("");
      atBottom.current = true;
      announce("Your message was sent.");
    } catch (error) {
      const status = error instanceof ChatApiError ? error.status : 0;
      if (status === 401) setSessionExpired(true);
      setSendError(describeSendError(status, error instanceof ChatApiError ? error.code : null));
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (keyAction({ key: event.key, shiftKey: event.shiftKey, altKey: event.altKey, isComposing: event.nativeEvent.isComposing }) === "send") {
      event.preventDefault();
      void send();
    }
  };

  // ---------------------------------------------------------------- drawing
  if (state === "loading") {
    return (
      <div role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-700">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading...
      </div>
    );
  }
  if (state === "error" || state === "unavailable") {
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-slate-800">{errorText}</p>
        {state === "error" && (
          <button type="button" onClick={() => void load()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">
            Try again
          </button>
        )}
      </div>
    );
  }

  const chip = conversation ? statusChip(conversation.status) : null;
  const length = replyLength(body);
  const overLimit = length > CLIENT_MESSAGE_MAX;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {conversation && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-1.5 text-xs text-slate-700">
          <span>Your conversation</span>
          {chip && <span className={`rounded px-2 py-0.5 font-semibold ${chipClass[chip.tone]}`}>{chip.label}</span>}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div ref={logRef} onScroll={onScroll} role="log" aria-label="Messages" aria-live="off" tabIndex={0} className="absolute inset-0 overflow-y-auto bg-slate-50 px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700">
          {hasMore && (
            <div className="mb-3 text-center">
              <button type="button" onClick={() => void loadOlder()} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                Load earlier messages
              </button>
            </div>
          )}
          {messages.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-700">Hello! How can we help you? Write your first message below. You can add a topic and a phone number if you like.</p>
          ) : (
            <MessageList messages={messages} />
          )}
        </div>
        {newBelow && (
          <button type="button" onClick={scrollToBottom} className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
            New messages
          </button>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="border-t border-slate-200 bg-white p-3"
      >
        {conversation?.status === "closed" && <p className="mb-2 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-800">This conversation is closed. If you write to us again, it will be re-opened.</p>}
        {first && (
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="chat-subject" className="mb-0.5 block text-xs font-semibold text-slate-800">
                Topic (optional)
              </label>
              <input id="chat-subject" type="text" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={SUBJECT_MAX * 2} disabled={sending} aria-invalid={Boolean(fieldError.subject)} aria-describedby={fieldError.subject ? "chat-subject-error" : undefined} className="block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 disabled:bg-slate-100" />
              {fieldError.subject && <p id="chat-subject-error" role="alert" className="mt-0.5 text-xs text-red-700">{fieldError.subject}</p>}
            </div>
            <div>
              <label htmlFor="chat-phone" className="mb-0.5 block text-xs font-semibold text-slate-800">
                Phone number (optional)
              </label>
              <input id="chat-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} disabled={sending} aria-invalid={Boolean(fieldError.phone)} aria-describedby={fieldError.phone ? "chat-phone-error" : undefined} className="block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 disabled:bg-slate-100" />
              {fieldError.phone && <p id="chat-phone-error" role="alert" className="mt-0.5 text-xs text-red-700">{fieldError.phone}</p>}
            </div>
          </div>
        )}
        <label htmlFor="chat-message" className="sr-only">
          Your message
        </label>
        <textarea
          id="chat-message"
          ref={textareaRef}
          value={body}
          rows={3}
          disabled={sending}
          onChange={(event) => {
            setBody(event.target.value);
            if (sendError) setSendError("");
          }}
          onKeyDown={onKeyDown}
          aria-describedby={`chat-help${sendError ? " chat-send-error" : ""}`}
          aria-invalid={overLimit || Boolean(sendError)}
          placeholder="Write your message..."
          className="block w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 disabled:bg-slate-100"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p id="chat-help" className="text-[11px] text-slate-700">
            Enter sends. Shift+Enter starts a new line.{" "}
            <span className={overLimit ? "font-semibold text-red-700" : ""}>
              {length} / {CLIENT_MESSAGE_MAX}
            </span>
          </p>
          <button type="submit" disabled={offline || !canSendReply(body, sending, CLIENT_MESSAGE_MAX)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
        {sendError && (
          <p id="chat-send-error" role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            {sendError} Your message is still here: press Send to try again.
          </p>
        )}
      </form>
    </div>
  );
}
