"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { UnreadBadge } from "@/components/admin/chat/UnreadBadge";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { getVisitorUnreadStore, refreshChatStatus, syncVisitorUser, useSessionExpired, useVisitorUnread } from "@/hooks/useChatVisitor";
import { OPEN_CHAT_EVENT, bubbleView, panelIsModal, pollPlan, wantsPanelOpen, withoutChatParam, type ChatHours } from "@/utils/chatWidget";
import { announceOverlayOpen, subscribeOverlays } from "@/utils/overlays";

const PULSE_DONE_KEY = "wiser-chat-pulse-done";

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/** True on a phone: the panel is a full-height sheet there and a card on a larger screen. */
function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}

/** The window's height, kept up to date (0 until it is known): the panel is modal in a window too short to keep it clear of the navbar. */
function useViewportHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const update = () => setHeight(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return height;
}

interface ChatWidgetProps {
  pathname: string;
  hours: ChatHours | null;
  signedIn: boolean;
  /** Changes when a different person signs in or out, so the shared "session ended" and unread state start afresh. */
  userKey: string;
}

/**
 * The round chat bubble (bottom right) and the panel it opens. It is only mounted where the bubble is allowed (utils/chatWidget.ts), and
 * only when the server says chat is on.
 *
 *  - The bubble is a real button; its name carries the unread count; it pulses gently until the panel has been opened once in this
 *    session, and never when the visitor asks for reduced motion (globals.css).
 *  - The panel is a dialog: the keyboard focus moves in when it opens, Escape closes it, and the focus goes back to the bubble. On a phone it
 *    is a full-height sheet that holds the focus; on a larger screen it is a card of about 380 px that leaves the page usable.
 *  - Polling: nothing for a logged-out visitor; while the panel is closed, a light check of the unread count every 30 seconds (slowing when
 *    quiet); while it is open, the conversation every 15 seconds. Only while the tab is visible.
 */
export function ChatWidget({ pathname, hours, signedIn, userKey }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [panelUnread, setPanelUnread] = useState(0);
  const [pulse, setPulse] = useState(false);
  const expired = useSessionExpired();
  const online = useOnline();
  const phone = useIsPhone();
  const viewportHeight = useViewportHeight();
  const modal = panelIsModal({ phone, viewportHeight });
  const bubbleRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const panelId = `${titleId}-panel`;

  // A different person (or nobody): the "session ended" mark and the unread count start afresh.
  useEffect(() => {
    syncVisitorUser(userKey);
  }, [userKey]);

  const plan = pollPlan({ signedIn, chatOn: true, onChatPage: true, isAdmin: false, panelOpen: open, sessionExpired: expired, offline: !online });
  const snapshot = useVisitorUnread(plan === "badge");
  const unread = open ? panelUnread : snapshot.state === "ok" ? snapshot.unread : 0;

  const announce = useCallback((text: string) => setAnnouncement((previous) => (previous === text ? `${text} ` : text)), []);
  const onUnread = useCallback((count: number) => setPanelUnread(count), []);

  // ---------------------------------------------------------------- opening: the bubble, the "Chat with us" button of the Contact page, ?chat=open
  const openPanel = useCallback(() => {
    announceOverlayOpen("chat"); // the avatar menu and the phone menu close: one floating layer at a time
    setOpen(true);
    setPulse(false);
    try {
      sessionStorage.setItem(PULSE_DONE_KEY, "1");
    } catch {
      /* a blocked storage only means the pulse may start again */
    }
    void refreshChatStatus(true);
  }, []);

  useEffect(() => {
    try {
      setPulse(sessionStorage.getItem(PULSE_DONE_KEY) !== "1");
    } catch {
      setPulse(true);
    }
    if (wantsPanelOpen(window.location.search)) {
      openPanel();
      // Remove the parameter, so a reload does not open the panel again.
      window.history.replaceState(window.history.state, "", withoutChatParam(window.location.pathname, window.location.search, window.location.hash));
    }
    const onRequest = () => openPanel();
    window.addEventListener(OPEN_CHAT_EVENT, onRequest);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onRequest);
  }, [openPanel]);

  // The focus goes back to the bubble once it is drawn again (on a phone the bubble is not drawn while the sheet is open, so it cannot take focus before).
  const restoreFocus = useRef(false);
  const closePanel = useCallback(() => {
    restoreFocus.current = true;
    setOpen(false);
    setPanelUnread(0);
    getVisitorUnreadStore().refresh();
  }, []);
  useEffect(() => {
    if (!open && restoreFocus.current) {
      restoreFocus.current = false;
      bubbleRef.current?.focus();
    }
  }, [open]);

  // The avatar menu or the phone menu opened: this panel closes, and does NOT take the focus back (the layer that just opened has it).
  const openRef = useRef(false);
  openRef.current = open;
  useEffect(
    () =>
      subscribeOverlays("chat", () => {
        if (!openRef.current) return;
        restoreFocus.current = false;
        setOpen(false);
        setPanelUnread(0);
        getVisitorUnreadStore().refresh();
      }),
    [],
  );

  // While the panel is open the hours are asked again now and then (cheap, public), so "we are back at ..." stays true.
  useEffect(() => {
    if (!open) return undefined;
    const handle = setInterval(() => {
      if (document.visibilityState === "visible") void refreshChatStatus(true);
    }, 60_000);
    return () => clearInterval(handle);
  }, [open]);

  // A phone sheet fills the screen: the page behind does not scroll.
  useEffect(() => {
    if (!(open && phone)) return undefined;
    const saved = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = saved;
    };
  }, [open, phone]);

  // Focus: into the panel when it opens (the panel itself first; the message box or the sign-in link takes it when it is ready).
  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  const onPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closePanel();
      return;
    }
    // On a phone, and in a window so short that the card covers the navbar, the panel is modal: Tab stays inside it.
    if (event.key === "Tab" && modal && panelRef.current) {
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex="0"]'));
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }
  };

  const view = bubbleView({ open, unread });

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal={modal ? true : undefined}
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={onPanelKeyDown}
          // Above the navbar on every screen size (z-chat-panel, see the stacking scale in globals.css). On a phone a full-height sheet; from 640 px a card
          // that sits above the bubble: bottom = bubble inset + 56 + 16, height = min(640, window - inset - 56 - 16 - 12), so its header and close
          // button can never be off-screen (utils/chatWidget.ts panelHeightPx says the same in numbers, and a test keeps the two in step).
          className="fixed inset-0 z-(--z-chat-panel) flex flex-col overflow-hidden bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] outline-none sm:inset-auto sm:bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.5rem)] sm:right-[max(1rem,env(safe-area-inset-right))] sm:h-[min(640px,calc(100dvh-max(1rem,env(safe-area-inset-bottom))-5.25rem))] sm:w-[380px] sm:rounded-2xl sm:border sm:border-slate-300 sm:pb-0 sm:pt-0 sm:shadow-2xl"
        >
          <ChatPanel titleId={titleId} hours={hours} signedIn={signedIn} expired={expired} pathname={pathname} offline={!online} onClose={closePanel} onUnread={onUnread} announce={announce} />
        </div>
      )}

      <button
        ref={bubbleRef}
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        aria-label={view.label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        className={`${view.hiddenOnPhone ? "hidden sm:flex" : "flex"} fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-(--z-chat-bubble) h-14 w-14 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg ring-2 ring-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 ${pulse && !open && unread === 0 ? "chat-bubble-pulse" : ""}`}
      >
        {view.icon === "close" ? <X className="h-7 w-7" aria-hidden /> : <MessageCircle className="h-7 w-7" aria-hidden />}
        {!open && (
          <span className="pointer-events-none absolute -right-1 -top-2">
            <UnreadBadge count={unread} />
          </span>
        )}
      </button>
    </>
  );
}
