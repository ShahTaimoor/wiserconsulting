"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decideLeave, isLeavingClick } from "@/utils/navigationGuard";

/** What the unsaved-changes dialog needs; pass it straight to <UnsavedChangesDialog />. */
export interface LeaveDialogProps {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

/**
 * Warns before the user loses unsaved changes.
 *
 *  - Clicking any link that would leave the page (the Back link, the Navbar, the dashboard):
 *    the click is cancelled and the site's own dialog asks what to do. "Leave" repeats the
 *    click on the same link, so Next.js navigates exactly as it would have. "Stay" (or Escape)
 *    closes the dialog and puts focus back on the link.
 *  - Closing the tab, reloading or typing another address: the browser's own prompt. This one
 *    cannot be replaced; websites are not allowed to restyle or reword the `beforeunload`
 *    prompt, and browsers show a fixed text.
 *
 * The browser's Back button is not covered: the Next.js App Router has no supported
 * way to cancel it, and pushing history entries to trap it breaks the router.
 *
 * `allowNavigation()` lets the next navigation through without asking. Call it right
 * after a successful save, before moving on.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const allowed = useRef(false);
  const dialogOpen = useRef(false);
  const staying = useRef(false);
  const pending = useRef<HTMLAnchorElement | null>(null); // the link whose click was cancelled
  const [open, setOpen] = useState(false);

  const show = useCallback((isOpen: boolean) => {
    dialogOpen.current = isOpen;
    setOpen(isOpen);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    allowed.current = false;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowed.current) return;
      event.preventDefault();
      event.returnValue = ""; // required by some browsers to show the prompt
    };

    const onClick = (event: MouseEvent) => {
      if (allowed.current) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      const leaving = isLeavingClick(
        event,
        { href: anchor.href, target: anchor.target, hasDownload: anchor.hasAttribute("download") },
        window.location.href
      );
      const decision = decideLeave({ allowed: allowed.current, dialogOpen: dialogOpen.current, leaving });
      if (decision === "allow") return;
      event.preventDefault();
      event.stopPropagation();
      if (decision === "ask") {
        pending.current = anchor;
        staying.current = false;
        show(true);
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture phase, so this runs before Next.js's link handler and can cancel it.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, show]);

  const allowNavigation = useCallback(() => {
    allowed.current = true;
  }, []);

  const onStay = useCallback(() => {
    staying.current = true;
    show(false);
  }, [show]);

  const onLeave = useCallback(() => {
    const anchor = pending.current;
    pending.current = null;
    staying.current = false;
    allowed.current = true; // the repeated click below must not be caught again
    show(false);
    if (anchor?.isConnected) anchor.click();
    else if (anchor) window.location.assign(anchor.href);
  }, [show]);

  // Radix returns focus to whatever was focused before the dialog opened, but a link that was
  // clicked with the mouse is not focused in every browser (Safari), so put it back explicitly.
  const onCloseAutoFocus = useCallback((event: Event) => {
    const anchor = pending.current;
    if (staying.current && anchor?.isConnected) {
      event.preventDefault();
      anchor.focus();
    }
    pending.current = null;
  }, []);

  const leaveDialog: LeaveDialogProps = { open, onStay, onLeave, onCloseAutoFocus };
  return { allowNavigation, leaveDialog };
}
