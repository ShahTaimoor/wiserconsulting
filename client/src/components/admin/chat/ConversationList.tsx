"use client";

import { useRef } from "react";
import { Pill } from "@/components/admin/Sheet";
import { UnreadBadge } from "@/components/admin/chat/UnreadBadge";
import { formatChatFullTime, formatChatTime, statusChip, unreadLabel, type InboxRow } from "@/utils/chatAdmin";

interface ConversationListProps {
  rows: InboxRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyText: string;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

/**
 * The list of conversations, newest activity first. Every row is a real button: Tab reaches the list, the Up and Down arrow keys move from
 * row to row, Enter or Space opens one. A row says who, the topic, the start of the last message, when, the status, and (in the yellow
 * badge) how many messages from the client have not been read. Message text is drawn as text, never as HTML.
 */
export function ConversationList({ rows, selectedId, onSelect, emptyText, hasMore, loadingMore, onLoadMore }: ConversationListProps) {
  const listRef = useRef<HTMLUListElement | null>(null);

  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-row]") ?? []);
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = at;
    if (event.key === "ArrowDown") next = Math.min(buttons.length - 1, at + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, at - 1);
    else if (event.key === "Home") next = 0;
    else next = buttons.length - 1;
    if (next !== at) {
      event.preventDefault();
      buttons[next].focus();
    }
  };

  if (rows.length === 0) {
    return <p className="px-4 py-12 text-center text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ul ref={listRef} onKeyDown={onKeyDown} aria-label="Conversations" className="divide-y divide-slate-200">
        {rows.map((row) => {
          const chip = statusChip(row.status);
          const selected = row.id === selectedId;
          const name = row.user.name || "Unknown";
          const sentence = [name, row.topic ? `topic ${row.topic}` : "", `status ${chip.label}`, unreadLabel(row.unreadForStaff)].filter(Boolean).join(", ");
          return (
            <li key={row.id}>
              <button
                type="button"
                data-row
                data-conversation={row.id}
                aria-current={selected ? "true" : undefined}
                aria-label={sentence}
                onClick={() => onSelect(row.id)}
                className={`flex w-full flex-col gap-1 px-3 py-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${selected ? "bg-emerald-50" : "bg-white hover:bg-slate-50"}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className={`min-w-0 truncate text-sm ${row.unreadForStaff > 0 ? "font-bold text-slate-900" : "font-semibold text-slate-800"}`}>{name}</span>
                  <time dateTime={row.lastMessageAt ?? undefined} title={formatChatFullTime(row.lastMessageAt)} className="shrink-0 text-xs text-slate-600">
                    {formatChatTime(row.lastMessageAt)}
                  </time>
                </span>
                {row.topic && <span className="truncate text-xs font-medium text-slate-700">{row.topic}</span>}
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-slate-600">
                    {row.lastMessageBy === "staff" && <span className="font-semibold">You: </span>}
                    {row.preview ?? "No preview"}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Pill tone={chip.tone}>{chip.label}</Pill>
                    <UnreadBadge count={row.unreadForStaff} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <div className="border-t border-slate-200 p-3 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
