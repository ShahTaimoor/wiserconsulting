"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, Search } from "lucide-react";
import { SheetMessage, sheetInput } from "@/components/admin/Sheet";
import { ConversationList } from "@/components/admin/chat/ConversationList";
import { ConversationView } from "@/components/admin/chat/ConversationView";
import { LegacyMessages } from "@/components/admin/chat/LegacyMessages";
import { UnreadBadge } from "@/components/admin/chat/UnreadBadge";
import { useChatUnread } from "@/hooks/useChatAdmin";
import { usePoller } from "@/hooks/usePoller";
import { ChatApiError, fetchInbox, type InboxPage } from "@/services/chatAdminService";
import { INBOX_TABS, buildInboxQuery, cleanSearch, describeChatError, inboxSignature, safeCount, unreadLabel, type InboxRow, type InboxTab } from "@/utils/chatAdmin";
import type { PollResult } from "@/utils/chatPolling";

const PAGE_SIZE = 20;

/** The rows of the first page of a poll merged into the rows already on screen (later pages are kept), newest activity first. */
function mergeRows(current: InboxRow[], firstPage: InboxRow[], keepLater: boolean): InboxRow[] {
  if (!keepLater) return firstPage;
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of firstPage) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "") || b.id.localeCompare(a.id));
}

/**
 * The admin Contact inbox (shown only while chat is switched on): the conversations on the left, the open one on the right (two panes from
 * 1024 px; on a phone the list, and a conversation opens full screen with a back button). The open conversation is in the address
 * (?c=<id>), so the link in the staff email lands on it and the back button works. A second tab, "Earlier form messages", keeps the old
 * contact submissions, read only.
 */
export function ChatInbox({ initialId = null }: { initialId?: string | null }) {
  const router = useRouter();
  const search = useSearchParams();
  const selectedId = search.get("c") || initialId;
  const view = search.get("view") === "legacy" ? "legacy" : "chats";
  // A conversation open on a phone is full screen (the page title and the tabs are hidden then).
  const fullScreen = Boolean(selectedId) && view === "chats";

  const [tab, setTab] = useState<InboxTab>("all");
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const lastRowOpened = useRef<string | null>(null);
  const totalRef = useRef(0);
  const rowsRef = useRef<InboxRow[]>([]);
  const pagesRef = useRef(1);
  rowsRef.current = rows;
  pagesRef.current = pages;
  totalRef.current = total;

  const unread = useChatUnread(true);
  const announce = useCallback((text: string) => setAnnouncement((previous) => (previous === text ? `${text} ` : text)), []);

  // The search box waits a moment after the last key before it asks the server.
  useEffect(() => {
    const handle = setTimeout(() => setQuery(cleanSearch(searchText)), 350);
    return () => clearTimeout(handle);
  }, [searchText]);

  // ---------------------------------------------------------------- the list
  const load = useCallback(async () => {
    setState("loading");
    try {
      const page: InboxPage = await fetchInbox(buildInboxQuery({ tab, search: query, page: 1, limit: PAGE_SIZE }));
      setRows(page.items);
      setTotal(page.total);
      setPages(1);
      setState("ready");
    } catch (error) {
      setErrorText(describeChatError(error instanceof ChatApiError ? error.status : 0, error instanceof ChatApiError ? error.code : null));
      setState("error");
    }
  }, [tab, query]);

  useEffect(() => {
    if (view === "chats") void load();
  }, [load, view]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = pagesRef.current + 1;
      const page = await fetchInbox(buildInboxQuery({ tab, search: query, page: next, limit: PAGE_SIZE }));
      setRows((current) => {
        const known = new Set(current.map((r) => r.id));
        return [...current, ...page.items.filter((r) => !known.has(r.id))];
      });
      setTotal(page.total);
      setPages(next);
    } catch (error) {
      setErrorText(describeChatError(error instanceof ChatApiError ? error.status : 0, error instanceof ChatApiError ? error.code : null));
    } finally {
      setLoadingMore(false);
    }
  };

  // Poll the first page every 20 seconds (slower when nothing changes, only while the tab is visible).
  usePoller(
    async (): Promise<PollResult> => {
      try {
        const page = await fetchInbox(buildInboxQuery({ tab, search: query, page: 1, limit: PAGE_SIZE }));
        const merged = mergeRows(rowsRef.current, page.items, pagesRef.current > 1);
        // Nothing a row shows has changed: do not redraw, and let the poller slow down.
        if (inboxSignature(merged, page.total) === inboxSignature(rowsRef.current, totalRef.current)) return "same";
        setRows(merged);
        setTotal(page.total);
        return "changed";
      } catch (error) {
        const status = error instanceof ChatApiError ? error.status : 0;
        if (status === 401 || status === 403 || status === 404) {
          setErrorText(describeChatError(status, error instanceof ChatApiError ? error.code : null));
          setState("error");
          return "stop";
        }
        return "same";
      }
    },
    { enabled: view === "chats" && state === "ready", baseMs: 20_000, maxMs: 60_000 }
  );

  // Say it (politely, for a screen reader) when the total of unread messages goes up.
  const previousUnread = useRef(0);
  useEffect(() => {
    if (unread.state !== "ok") return;
    if (unread.unread > previousUnread.current) announce(`${unreadLabel(unread.unread)} in ${unread.conversations === 1 ? "1 conversation" : `${unread.conversations} conversations`}.`);
    previousUnread.current = unread.unread;
  }, [unread.unread, unread.conversations, unread.state, announce]);

  // ---------------------------------------------------------------- opening, closing, changes
  const open = (id: string) => {
    lastRowOpened.current = id;
    router.push(`/admin/contacts?c=${encodeURIComponent(id)}`, { scroll: false });
  };
  const back = () => {
    router.push("/admin/contacts", { scroll: false });
    const id = lastRowOpened.current;
    // Put the keyboard focus back on the row that was open.
    setTimeout(() => document.querySelector<HTMLButtonElement>(`button[data-conversation="${id}"]`)?.focus(), 50);
  };
  const onChanged = useCallback((patch: { id: string; unreadForStaff?: number; status?: InboxRow["status"] }) => {
    setRows((current) => current.map((row) => (row.id === patch.id ? { ...row, ...(patch.unreadForStaff !== undefined ? { unreadForStaff: patch.unreadForStaff } : {}), ...(patch.status ? { status: patch.status } : {}) } : row)));
  }, []);
  const onDeleted = (id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
    setTotal((count) => Math.max(0, count - 1));
    router.push("/admin/contacts", { scroll: false });
  };

  const setView = (next: "chats" | "legacy") => router.push(next === "legacy" ? "/admin/contacts?view=legacy" : "/admin/contacts", { scroll: false });

  const emptyText =
    query !== "" ? "No conversation matches that search." : tab === "unread" ? "No unread messages. You are up to date." : tab === "all" ? "No conversations yet. When a visitor writes to you, it will appear here." : `No ${tab} conversations.`;

  return (
    <div className="w-full min-w-0 max-w-full">
      {/* On a phone a conversation takes the whole screen: the page title and the tabs step aside until the back button is used. */}
      <div className={`${fullScreen ? "hidden lg:block" : ""} mb-4`}>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Contact</h1>
        <p className="mt-0.5 text-sm text-slate-500">Chat with visitors, and the older messages from the contact form</p>
      </div>
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>

      <div role="tablist" aria-label="Contact" className={`${fullScreen ? "hidden lg:inline-flex" : "inline-flex"} mb-3 rounded-lg border border-slate-300 bg-slate-100 p-0.5`}>
        {([
          ["chats", "Chats"],
          ["legacy", "Earlier form messages"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${view === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-700 hover:text-slate-900"}`}
          >
            {label}
            {id === "chats" && <UnreadBadge count={safeCount(unread.unread)} />}
          </button>
        ))}
      </div>

      {view === "legacy" ? (
        <LegacyMessages />
      ) : (
        <div className={`grid min-h-[420px] grid-cols-1 gap-3 lg:h-[calc(100dvh-16rem)] lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] ${selectedId ? "h-[calc(100dvh-8.5rem)]" : "h-[calc(100dvh-19rem)]"}`}>
          {/* The list */}
          <section aria-label="Conversations" className={`${selectedId ? "hidden lg:flex" : "flex"} min-h-0 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white`}>
            <div className="space-y-2 border-b border-slate-200 bg-slate-50 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
                <label htmlFor="chat-search" className="sr-only">
                  Search conversations by name, email or topic
                </label>
                <input
                  id="chat-search"
                  type="search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search name, email or topic"
                  maxLength={100}
                  className={`${sheetInput} w-full pl-8`}
                />
              </div>
              <p className="text-[11px] text-slate-600">Message text is stored encrypted, so it cannot be searched.</p>
              <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
                {INBOX_TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={tab === item.id}
                    onClick={() => setTab(item.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${tab === item.id ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {state === "loading" && <p role="status" className="px-4 py-10 text-center text-sm text-slate-600">Loading conversations...</p>}
            {state === "error" && (
              <div className="p-4">
                <SheetMessage>
                  <span className="flex flex-wrap items-center justify-between gap-2" role="alert">
                    <span>{errorText}</span>
                    <button type="button" onClick={() => void load()} className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
                      Try again
                    </button>
                  </span>
                </SheetMessage>
              </div>
            )}
            {state === "ready" && (
              <ConversationList rows={rows} selectedId={selectedId} onSelect={open} emptyText={emptyText} hasMore={rows.length < total} loadingMore={loadingMore} onLoadMore={() => void loadMore()} />
            )}
            {state === "ready" && rows.length > 0 && (
              <p className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                Showing {rows.length} of {total}
              </p>
            )}
          </section>

          {/* The open conversation */}
          <section aria-label="Open conversation" className={`${selectedId ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white`}>
            {selectedId ? (
              <ConversationView key={selectedId} id={selectedId} onBack={back} onChanged={onChanged} onDeleted={onDeleted} announce={announce} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-slate-600">
                <MessageSquare className="h-8 w-8 text-slate-500" aria-hidden />
                <p className="text-sm">Choose a conversation to read it and reply.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

