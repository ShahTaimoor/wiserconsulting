"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/admin/Sheet";
import { ConfirmDialog } from "@/components/tourist-visa/ConfirmDialog";
import { usePoller } from "@/hooks/usePoller";
import { getChatUnreadStore } from "@/hooks/useChatAdmin";
import { useChatLimits } from "@/hooks/useChatLimits";
import {
  ChatApiError,
  changeConversationStatus,
  deleteConversation,
  fetchConversation,
  markConversationRead,
  sendReply,
} from "@/services/chatAdminService";
import {
  afterForPoll,
  buildMessagesQuery,
  canSendReply,
  describeChatError,
  formatChatFullTime,
  formatChatTime,
  keyAction,
  lastSeq,
  mergeMessages,
  messageText,
  newClientMessageId,
  newMessagesCount,
  replyLength,
  senderLabel,
  shouldMarkRead,
  statusChip,
  type ChatMessage,
  type ConversationMeta,
  type ConversationUser,
} from "@/utils/chatAdmin";
import type { PollResult } from "@/utils/chatPolling";

interface ConversationViewProps {
  id: string;
  onBack: () => void;
  /** The list should show this change (unread count, status, last message) without waiting for its own poll. */
  onChanged: (patch: { id: string; unreadForStaff?: number; status?: ConversationMeta["status"] }) => void;
  onDeleted: (id: string) => void;
  /** For the live region of the page. */
  announce: (text: string) => void;
}

const overlapNote = "Enter sends. Shift+Enter starts a new line.";

/**
 * One conversation: who it is, the messages in order, the reply box, and the buttons to close, re-open or delete it.
 *
 * - Message text is always drawn as a React text node with its line breaks kept (never as HTML).
 * - New messages arrive by polling (every 15 seconds, slower when quiet, only while the tab is visible); only what is new is fetched, and
 *   a message already on screen is never added twice.
 * - The conversation is marked read once its newest message is on screen and the tab is visible.
 */
export function ConversationView({ id, onBack, onChanged, onDeleted, announce }: ConversationViewProps) {
  // The longest reply as the server states it (GET /api/chat/status, read when the inbox opened); today's number until then.
  const limits = useChatLimits();
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [user, setUser] = useState<ConversationUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error" | "gone">("loading");
  const [errorText, setErrorText] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const [visibleTick, setVisibleTick] = useState(0);

  const messagesRef = useRef<ChatMessage[]>([]);
  const userRef = useRef<ConversationUser | null>(null);
  const markedSeq = useRef(0);
  const marking = useRef(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const atBottom = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pending = useRef<{ text: string; id: string } | null>(null);
  messagesRef.current = messages;
  userRef.current = user;

  // ---------------------------------------------------------------- loading
  const load = useCallback(async () => {
    setState("loading");
    try {
      const page = await fetchConversation(id, buildMessagesQuery({ limit: 50 }));
      setMeta(page.conversation);
      setUser(page.user);
      setMessages(page.messages);
      setHasMore(page.hasMore);
      setState("ready");
    } catch (error) {
      const status = error instanceof ChatApiError ? error.status : 0;
      setErrorText(describeChatError(status, error instanceof ChatApiError ? error.code : null));
      setState(status === 404 ? "gone" : "error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // The heading takes the keyboard focus when a conversation is opened, so a screen reader says whose conversation it is.
  useEffect(() => {
    if (state === "ready") headingRef.current?.focus({ preventScroll: true });
  }, [state === "ready"]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOlder = async () => {
    if (loadingOlder || messagesRef.current.length === 0) return;
    setLoadingOlder(true);
    try {
      const first = Math.min(...messagesRef.current.map((m) => m.seq));
      const page = await fetchConversation(id, buildMessagesQuery({ before: first, limit: 50 }));
      setMessages((current) => mergeMessages(current, page.messages));
      setHasMore(page.hasMore);
    } catch (error) {
      toast.error(describeChatError(error instanceof ChatApiError ? error.status : 0, error instanceof ChatApiError ? error.code : null));
    } finally {
      setLoadingOlder(false);
    }
  };

  // ---------------------------------------------------------------- polling: only what is new, duplicates ignored
  const poke = usePoller(
    async (): Promise<PollResult> => {
      try {
        const page = await fetchConversation(id, buildMessagesQuery({ after: afterForPoll(messagesRef.current), limit: 100 }));
        const before = messagesRef.current;
        const merged = mergeMessages(before, page.messages);
        const fresh = newMessagesCount(before, merged);
        let changed = merged !== before;
        if (merged !== before) setMessages(merged);
        setMeta((current) => {
          if (current && current.status === page.conversation.status && current.unreadForStaff === page.conversation.unreadForStaff && current.messageCount === page.conversation.messageCount) return current;
          changed = true;
          return page.conversation;
        });
        if (fresh > 0) {
          const fromClient = merged.filter((m) => !before.some((b) => b.id === m.id) && m.sender === "client").length;
          if (fromClient > 0) announce(`${fromClient === 1 ? "New message" : `${fromClient} new messages`} from ${userRef.current?.name ?? "the client"}.`);
        }
        return changed ? "changed" : "same";
      } catch (error) {
        const status = error instanceof ChatApiError ? error.status : 0;
        if (status === 404) {
          setErrorText(describeChatError(404));
          setState("gone");
          return "stop";
        }
        if (status === 401 || status === 403) return "stop";
        return "same";
      }
    },
    { enabled: state === "ready", baseMs: 15_000, maxMs: 60_000 }
  );

  // ---------------------------------------------------------------- reading
  const shownSeq = lastSeq(messages);
  const hasUnread = (meta?.unreadForStaff ?? 0) > 0;
  useEffect(() => {
    if (state !== "ready" || marking.current) return;
    const visible = typeof document === "undefined" || document.visibilityState === "visible";
    if (!shouldMarkRead({ visible, shownSeq, markedSeq: markedSeq.current, hasUnread })) return;
    marking.current = true;
    const upTo = shownSeq;
    markConversationRead(id, upTo)
      .then((answer) => {
        markedSeq.current = upTo;
        setMeta((current) => (current ? { ...current, unreadForStaff: answer.unreadForStaff } : current));
        onChanged({ id, unreadForStaff: answer.unreadForStaff });
        getChatUnreadStore().refresh();
      })
      .catch(() => {
        /* tried again at the next change */
      })
      .finally(() => {
        marking.current = false;
      });
  }, [state, shownSeq, hasUnread, id, onChanged, visibleTick]);

  // When the tab becomes visible again, look again at once (the poller does) and let the effect above mark the thread read.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setVisibleTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // ---------------------------------------------------------------- scrolling: stay at the bottom only if the reader was there
  const scrollToBottom = () => {
    const box = logRef.current;
    if (box) box.scrollTop = box.scrollHeight;
    setNewBelow(false);
  };
  const messageCount = messages.length;
  const newestId = messages.length ? messages[messages.length - 1].id : "";
  useEffect(() => {
    if (state !== "ready") return;
    if (atBottom.current) scrollToBottom();
    else setNewBelow(true);
  }, [newestId, state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (state === "ready") scrollToBottom();
  }, [state === "ready"]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const box = logRef.current;
    if (!box) return;
    atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    if (atBottom.current) setNewBelow(false);
  };

  // ---------------------------------------------------------------- sending
  const send = async () => {
    const text = draft.replace(/\r\n?/g, "\n").trim();
    if (!canSendReply(draft, sending, limits.staffMessage)) return;
    // A resend of the same words after a failure keeps its id, so the server can never store it twice.
    if (!pending.current || pending.current.text !== text) pending.current = { text, id: newClientMessageId() };
    setSending(true);
    setSendError("");
    try {
      const answer = await sendReply(id, text, pending.current.id);
      pending.current = null;
      setMessages((current) => mergeMessages(current, [answer.message]));
      setMeta((current) => (current ? { ...current, status: answer.conversation.status } : current));
      onChanged({ id, status: answer.conversation.status });
      setDraft("");
      atBottom.current = true;
      announce("Reply sent.");
      poke();
      getChatUnreadStore().refresh();
    } catch (error) {
      setSendError(describeChatError(error instanceof ChatApiError ? error.status : 0, error instanceof ChatApiError ? error.code : null));
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const action = keyAction({ key: event.key, shiftKey: event.shiftKey, altKey: event.altKey, isComposing: event.nativeEvent.isComposing });
    if (action === "send") {
      event.preventDefault();
      void send();
    }
  };

  // ---------------------------------------------------------------- close, re-open, delete
  const toggleClosed = async () => {
    if (!meta || busy) return;
    const target = meta.status === "closed" ? "open" : "closed";
    setBusy(true);
    try {
      const answer = await changeConversationStatus(id, target);
      setMeta((current) => (current ? { ...current, status: answer.status } : current));
      onChanged({ id, status: answer.status });
      toast.success(target === "closed" ? "Conversation closed" : "Conversation re-opened");
      announce(target === "closed" ? "Conversation closed." : "Conversation re-opened.");
    } catch (error) {
      toast.error(describeChatError(error instanceof ChatApiError ? error.status : 0, error instanceof ChatApiError ? error.code : null));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setConfirmDelete(false);
    setBusy(true);
    try {
      await deleteConversation(id);
      toast.success("Conversation deleted");
      getChatUnreadStore().refresh();
      onDeleted(id);
    } catch (error) {
      setBusy(false);
      toast.error(describeChatError(error instanceof ChatApiError ? error.status : 0, error instanceof ChatApiError ? error.code : null));
    }
  };

  // ---------------------------------------------------------------- drawing
  if (state === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-600" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading conversation...
      </div>
    );
  }
  if (state === "error" || state === "gone" || !meta || !user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <p className="text-sm text-slate-700">{errorText || describeChatError(0)}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
            Back to the list
          </button>
          {state === "error" && (
            <button type="button" onClick={() => void load()} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const chip = statusChip(meta.status);
  const length = replyLength(draft);
  const overLimit = length > limits.staffMessage;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start gap-2">
          <button type="button" onClick={onBack} aria-label="Back to the list of conversations" className="mt-0.5 rounded-md border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:hidden">
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          <h2 ref={headingRef} tabIndex={-1} className="flex min-w-0 flex-1 basis-[8rem] flex-wrap items-center gap-2 text-base font-bold text-slate-900 outline-none">
            <span className="break-words [overflow-wrap:anywhere]">{user.name}</span>
            <Pill tone={chip.tone}>{chip.label}</Pill>
          </h2>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void toggleClosed()}
              disabled={busy}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50"
            >
              {meta.status === "closed" ? "Re-open" : "Close conversation"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
            </button>
          </div>
        </div>
        <dl className="mt-2 grid gap-x-4 gap-y-0.5 text-xs text-slate-700 sm:grid-cols-2">
          {user.email && (
            <div className="flex gap-1">
              <dt className="font-semibold">Email:</dt>
              <dd className="min-w-0 break-all [overflow-wrap:anywhere]">{user.email}</dd>
            </div>
          )}
          {(meta.phone || user.phone) && (
            <div className="flex gap-1">
              <dt className="font-semibold">Phone:</dt>
              <dd className="min-w-0 break-all">{meta.phone || user.phone}</dd>
            </div>
          )}
          {meta.topic && (
            <div className="flex gap-1 sm:col-span-2">
              <dt className="font-semibold">Topic:</dt>
              <dd className="min-w-0 break-words [overflow-wrap:anywhere]">{meta.topic}</dd>
            </div>
          )}
        </dl>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={logRef} onScroll={onScroll} role="log" aria-label={`Messages with ${user.name}`} aria-live="off" tabIndex={0} className="absolute inset-0 overflow-y-auto bg-slate-50 px-3 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:px-4">
          {hasMore && (
            <div className="mb-3 text-center">
              <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50">
                {loadingOlder ? "Loading..." : "Load earlier messages"}
              </button>
            </div>
          )}
          <ol className="space-y-3">
            {messages.map((message) => {
              const mine = message.sender === "staff";
              return (
                <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 shadow-sm sm:max-w-[75%] ${mine ? "rounded-br-sm bg-emerald-700 text-white" : "rounded-bl-sm border border-slate-200 bg-white text-slate-900"}`}>
                    <p className={`mb-0.5 text-[11px] font-semibold ${mine ? "text-emerald-50" : "text-slate-700"}`}>{senderLabel(message, user.name)}</p>
                    {/* Plain text only: a React text node, line breaks kept, long words broken. Never HTML. */}
                    <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{messageText(message.text)}</p>
                    <time dateTime={message.createdAt} title={formatChatFullTime(message.createdAt)} className={`mt-1 block text-right text-[11px] ${mine ? "text-emerald-100" : "text-slate-600"}`}>
                      {formatChatTime(message.createdAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
          {messageCount === 0 && <p className="py-10 text-center text-sm text-slate-600">No messages yet.</p>}
        </div>
        {newBelow && (
          <button type="button" onClick={scrollToBottom} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
            New messages
          </button>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="border-t border-slate-200 bg-white p-3 sm:p-4"
      >
        <label htmlFor={`reply-${id}`} className="sr-only">
          Reply to {user.name}
        </label>
        <textarea
          id={`reply-${id}`}
          ref={textareaRef}
          value={draft}
          rows={3}
          disabled={sending}
          onChange={(event) => {
            setDraft(event.target.value);
            if (sendError) setSendError("");
          }}
          onKeyDown={onKeyDown}
          aria-describedby={`reply-help-${id}${sendError ? ` reply-error-${id}` : ""}`}
          aria-invalid={overLimit || Boolean(sendError)}
          placeholder="Write a reply..."
          className="block w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:bg-slate-100"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p id={`reply-help-${id}`} className="text-xs text-slate-600">
            {overlapNote}{" "}
            <span className={overLimit ? "font-semibold text-red-700" : ""}>
              {length} / {limits.staffMessage}
            </span>
          </p>
          <button
            type="submit"
            disabled={!canSendReply(draft, sending, limits.staffMessage)}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {sending ? "Sending..." : "Send reply"}
          </button>
        </div>
        {sendError && (
          <p id={`reply-error-${id}`} role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {sendError} Your message is still here: send it again when you are ready.
          </p>
        )}
      </form>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this conversation?"
        description={`This permanently deletes the whole conversation with ${user.name} and every message in it. It cannot be undone.`}
        cancelLabel="Keep it"
        confirmLabel="Delete permanently"
        tone="destructive"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void doDelete()}
      />
    </div>
  );
}
