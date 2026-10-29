"use client";

import { useCallback, useEffect, useRef } from "react";
import { isLeavingClick, UNSAVED_CHANGES_MESSAGE } from "@/utils/navigationGuard";

/**
 * Warns before the user loses unsaved changes.
 *
 *  - Closing the tab, reloading or typing another address: the browser's own prompt.
 *  - Clicking any link that would leave the page (the Back link, the Navbar, the
 *    dashboard): a confirm dialog, and the navigation is cancelled if they decline.
 *
 * The browser's Back button is not covered: the Next.js App Router has no supported
 * way to cancel it, and pushing history entries to trap it breaks the router.
 *
 * `allowNavigation()` lets the next navigation through without asking. Call it right
 * after a successful save, before moving on.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const allowed = useRef(false);

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
      if (leaving && !window.confirm(UNSAVED_CHANGES_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture phase, so this runs before Next.js's link handler and can cancel it.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const allowNavigation = useCallback(() => {
    allowed.current = true;
  }, []);

  return { allowNavigation };
}
