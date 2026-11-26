import { formatUnread, unreadLabel } from "@/utils/chatAdmin";

/**
 * The yellow unread badge (like WhatsApp): a number, "99+" from 100, and nothing at all at 0. The colours and the glow are in globals.css
 * (`.chat-unread-badge`): a dark ring so it shows on a white sidebar, and a glow that only moves when reduced motion is not requested.
 * The number is for the eyes; a screen reader hears the full sentence ("3 unread messages") from the hidden text next to it.
 */
export function UnreadBadge({ count, className = "" }: { count: number; className?: string }) {
  const text = formatUnread(count);
  if (!text) return null;
  return (
    <>
      <span aria-hidden="true" data-testid="unread-badge" className={`chat-unread-badge inline-flex h-[1.35rem] min-w-[1.35rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold leading-none tabular-nums ${className}`}>
        {text}
      </span>
      <span className="sr-only">{`, ${unreadLabel(count)}`}</span>
    </>
  );
}
