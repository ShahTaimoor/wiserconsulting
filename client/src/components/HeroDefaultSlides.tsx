"use client";

import { useEffect, useState } from "react";

/**
 * The homepage banner shown while the admin has not uploaded any banner picture (Admin > Settings > Homepage Banner):
 * a slow slideshow of the pictures in /public/hero (Europe, Italy, France). A picture that is not there is skipped, and with none
 * of them the dark background of the hero shows, as before. Uploading a banner in the admin replaces all of this.
 */
const DEFAULT_SLIDES = [
  { src: "/hero/europe.jpg", label: "Europe" },
  { src: "/hero/italy.jpg", label: "Italy" },
  { src: "/hero/france.jpg", label: "France" },
];
const SLIDE_MS = 6500;

export default function HeroDefaultSlides() {
  const [available, setAvailable] = useState<string[]>([]);
  const [active, setActive] = useState(0);

  // Keep only the pictures that really load.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      DEFAULT_SLIDES.map(
        (slide) =>
          new Promise<string | null>((resolve) => {
            const image = new Image();
            image.onload = () => resolve(slide.src);
            image.onerror = () => resolve(null);
            image.src = slide.src;
          }),
      ),
    ).then((found) => {
      if (!cancelled) setAvailable(found.filter((src): src is string => src !== null));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (available.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((index) => (index + 1) % available.length), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [available]);

  if (available.length === 0) return null;

  return (
    <div aria-hidden="true" className="absolute inset-0 z-0 overflow-hidden">
      {available.map((src, index) => (
        // eslint-disable-next-line @next/next/no-img-element -- local static pictures, shown full-bleed
        <img
          key={src}
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1600ms] ease-in-out ${
            index === active % available.length ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
    </div>
  );
}
