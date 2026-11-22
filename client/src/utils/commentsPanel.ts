// The admin-comments panel lives on the home page (it can re-upload documents from there). The "Comments" button in the navbar asks for it
// with this helper: on the home page it opens at once; from any other page it goes to /?comments=open and the home page opens it on arrival.
// Whether the customer has already looked at the comments (for the red counter) is shared between the navbar and the panel here.
import { useSyncExternalStore } from "react";

export const OPEN_COMMENTS_EVENT = "open-comments-panel";
export const COMMENTS_QUERY = "comments=open";

export function requestCommentsPanel(pathname: string | null, navigate: (url: string) => void) {
  if (pathname === "/") {
    window.dispatchEvent(new Event(OPEN_COMMENTS_EVENT));
  } else {
    navigate(`/?${COMMENTS_QUERY}`);
  }
}

let viewed = false;
const listeners = new Set<() => void>();

export function setCommentsViewed(value: boolean) {
  if (viewed === value) return;
  viewed = value;
  listeners.forEach((listener) => listener());
}

/** true once the customer has opened the comments; false again when new comments arrive. */
export function useCommentsViewed(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => viewed,
    () => false,
  );
}
