"use client";

import { useEffect, useState } from "react";
import type { SiteSettings } from "@/services/siteSettingsService";

const SLIDE_MS = 6000;

/** The banner pictures of one screen size, oldest first: its list, or (while it has no list) the older single picture. */
function urlsFor(settings: SiteSettings, device: "Mobile" | "Tablet" | "Desktop"): string[] {
  const list = settings[`hero${device}Images` as "heroMobileImages"] ?? [];
  const urls = list.map((image) => image.url).filter(Boolean);
  if (urls.length > 0) return urls;
  const single = settings[`hero${device}Url` as "heroMobileUrl"];
  return single ? [single] : [];
}

/** Every banner picture of the three sizes, per size, with a size that has none borrowing the nearest size that has some. */
export function heroBannerSets(settings: SiteSettings): { mobile: string[]; tablet: string[]; desktop: string[] } {
  const mobile = urlsFor(settings, "Mobile");
  const tablet = urlsFor(settings, "Tablet");
  const desktop = urlsFor(settings, "Desktop");
  return {
    mobile: mobile.length ? mobile : tablet.length ? tablet : desktop,
    tablet: tablet.length ? tablet : desktop.length ? desktop : mobile,
    desktop: desktop.length ? desktop : tablet.length ? tablet : mobile,
  };
}

/**
 * The homepage banner: the pictures the admin uploaded for each screen size. One picture is shown as it is; several are shown as a
 * slideshow (a slow cross-fade, with dots to pick one). Pictures are matched by position, so the 2nd mobile picture goes with the
 * 2nd desktop picture, and a size with fewer pictures starts over.
 */
export default function HeroBannerSlides({ mobile, tablet, desktop }: { mobile: string[]; tablet: string[]; desktop: string[] }) {
  const count = Math.max(mobile.length, tablet.length, desktop.length);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (active >= count) setActive(0);
  }, [active, count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((index) => (index + 1) % count), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  if (count === 0) return null;
  const pick = (list: string[], index: number) => list[index % list.length];

  return (
    <div className="absolute inset-0 z-0 overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {Array.from({ length: count }, (_, index) => (
        <picture
          key={index}
          aria-hidden={index !== active}
          className={`absolute inset-0 block transition-opacity duration-[1400ms] ease-in-out ${index === active ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <source media="(min-width: 1024px)" srcSet={pick(desktop, index)} />
          <source media="(min-width: 640px)" srcSet={pick(tablet, index)} />
          {/* eslint-disable-next-line @next/next/no-img-element -- storage URLs are not in next.config's image domains */}
          <img src={pick(mobile, index)} alt="" className="h-full w-full object-cover" loading={index === 0 ? "eager" : "lazy"} />
        </picture>
      ))}

      {count > 1 && (
        <div className="absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
          {Array.from({ length: count }, (_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Show picture ${index + 1}`}
              aria-current={index === active}
              className={`h-2 rounded-full transition-all ${index === active ? "w-7 bg-white" : "w-2 bg-white/50 hover:bg-white/80"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
