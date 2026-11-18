"use client";

import { useEffect, useState } from "react";
import { isPastPanel } from "@/utils/scrollBack";

/**
 * True while `panel` has been scrolled past (it is entirely above the top of the window). The panel is watched with an IntersectionObserver,
 * which works whichever element scrolls and costs nothing while the page is not moving. With no panel (it is not on the page, or the browser
 * has no IntersectionObserver) the answer is false, so the caller shows nothing.
 */
export function useScrolledPast(panel: HTMLElement | null): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    if (!panel || typeof IntersectionObserver === "undefined") {
      setPast(false);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const latest = entries[entries.length - 1];
        if (latest) setPast(isPastPanel({ isIntersecting: latest.isIntersecting, bottom: latest.boundingClientRect.bottom }));
      },
      { threshold: 0 }
    );
    observer.observe(panel);
    return () => {
      observer.disconnect();
      setPast(false);
    };
  }, [panel]);

  return past;
}
