"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { Pill, SheetMessage, sheetInput } from "@/components/admin/Sheet";
import { ChatApiError, fetchLegacyMessages, type LegacyMessage, type LegacyPage } from "@/services/chatAdminService";
import { cleanSearch, describeChatError, formatChatFullTime, formatChatTime } from "@/utils/chatAdmin";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "read", label: "Read" },
  { value: "responded", label: "Responded" },
  { value: "archived", label: "Archived" },
] as const;

const tone = (status: string) => (status === "responded" ? "green" : status === "read" ? "yellow" : status === "archived" ? "gray" : "blue");
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The messages sent through the old contact form, READ ONLY (the form is being replaced by the chat). Nothing here changes a message: no
 * status buttons, no delete, no reply, and no "Send Email" button (it only opened the staff member's own mail program and recorded nothing).
 * A message is shown from the list the server already sent, so the screen never asks for a single message: on the server that call marks the
 * message as read, which a screen that only reads must not do.
 */
export function LegacyMessages() {
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<LegacyPage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("");
  const [selected, setSelected] = useState<LegacyMessage | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery(cleanSearch(searchText));
      setPage(1);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchText]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      // The server combines the search with the status filter (both must match), so both are sent.
      setData(await fetchLegacyMessages({ page, search: query, status }));
      setState("ready");
    } catch (error) {
      setErrorText(describeChatError(error instanceof ChatApiError ? error.status : 0, error instanceof ChatApiError ? error.code : null));
      setState("error");
    }
  }, [page, query, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <SheetMessage kind="info">
        These messages came from the old contact form. They are kept for reference and cannot be changed here. Replies to them were sent from a mail program and are not recorded in the system.
      </SheetMessage>
      <div className="grid h-[calc(100dvh-21rem)] min-h-[420px] grid-cols-1 gap-3 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <section aria-label="Earlier form messages" className={`${selected ? "hidden lg:flex" : "flex"} min-h-0 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white`}>
          <div className="space-y-2 border-b border-slate-200 bg-slate-50 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
              <label htmlFor="legacy-search" className="sr-only">
                Search the old messages by name, email, phone, topic or message
              </label>
              <input id="legacy-search" type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search name, email, phone, topic or message" maxLength={100} className={`${sheetInput} w-full pl-8`} />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="legacy-status" className="text-xs font-semibold text-slate-700">
                Status
              </label>
              <select
                id="legacy-status"
                value={status}
                disabled={query !== ""}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                className={`${sheetInput} py-1 text-xs disabled:opacity-60`}
              >
                {STATUS_FILTERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {state === "loading" && <p role="status" className="px-4 py-10 text-center text-sm text-slate-600">Loading messages...</p>}
          {state === "error" && (
            <div className="p-4">
              <SheetMessage>
                <span role="alert" className="flex flex-wrap items-center justify-between gap-2">
                  <span>{errorText}</span>
                  <button type="button" onClick={() => void load()} className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
                    Try again
                  </button>
                </span>
              </SheetMessage>
            </div>
          )}
          {state === "ready" && items.length === 0 && <p className="px-4 py-12 text-center text-sm text-slate-600">No messages found.</p>}
          {state === "ready" && items.length > 0 && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ul aria-label="Messages" className="divide-y divide-slate-200">
                {items.map((item) => (
                  <li key={item._id}>
                    <button type="button" aria-current={selected?._id === item._id ? "true" : undefined} onClick={() => setSelected(item)} className={`flex w-full flex-col gap-1 px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${selected?._id === item._id ? "bg-emerald-50" : "bg-white hover:bg-slate-50"}`}>
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{item.name}</span>
                        <time dateTime={item.createdAt} title={formatChatFullTime(item.createdAt)} className="shrink-0 text-xs text-slate-600">
                          {formatChatTime(item.createdAt)}
                        </time>
                      </span>
                      <span className="truncate text-xs font-medium text-slate-700">{item.subject}</span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-xs text-slate-600">{item.email}</span>
                        <Pill tone={tone(item.status)}>{cap(item.status)}</Pill>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state === "ready" && data && data.totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <span>
                Page {data.currentPage} of {data.totalPages} ({data.totalItems} messages)
              </span>
              <span className="flex gap-1.5">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                  Previous
                </button>
                <button type="button" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                  Next
                </button>
              </span>
            </div>
          )}
        </section>

        <section aria-label="Message" className={`${selected ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white`}>
          {selected ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <button type="button" onClick={() => setSelected(null)} className="mb-3 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:hidden">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to the list
              </button>
              <h2 className="flex flex-wrap items-center gap-2 text-base font-bold text-slate-900">
                <span className="break-words [overflow-wrap:anywhere]">{selected.name}</span>
                <Pill tone={tone(selected.status)}>{cap(selected.status)}</Pill>
              </h2>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm text-slate-800 sm:grid-cols-2">
                <div className="flex gap-1">
                  <dt className="font-semibold">Email:</dt>
                  <dd className="break-all">{selected.email}</dd>
                </div>
                {selected.phone && (
                  <div className="flex gap-1">
                    <dt className="font-semibold">Phone:</dt>
                    <dd>{selected.phone}</dd>
                  </div>
                )}
                <div className="flex gap-1 sm:col-span-2">
                  <dt className="font-semibold">Sent:</dt>
                  <dd>{formatChatFullTime(selected.createdAt)}</dd>
                </div>
              </dl>
              <h3 className="mt-4 text-sm font-semibold text-slate-700">Subject</h3>
              <p className="break-words text-slate-900 [overflow-wrap:anywhere]">{selected.subject}</p>
              <h3 className="mt-4 text-sm font-semibold text-slate-700">Message</h3>
              <p className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 [overflow-wrap:anywhere]">{selected.message}</p>
              {selected.adminReply?.message && (
                <>
                  <h3 className="mt-4 text-sm font-semibold text-slate-700">Reply recorded in the system</h3>
                  <p className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-900 [overflow-wrap:anywhere]">{selected.adminReply.message}</p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-600">Choose a message to read it.</div>
          )}
        </section>
      </div>
    </div>
  );
}
