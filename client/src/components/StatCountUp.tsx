"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "framer-motion";

/**
 * Shows an admin-written statistic such as "10,000+", "98%" or "6+" and counts up to it once when it scrolls into view.
 * Text that is not a plain number with a suffix (for example "24/7") is shown as it is. Reduced-motion users get the final text at once.
 */
export function StatCountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const match = /^(\d[\d,]*)(\D*)$/.exec(value.trim());
  const target = match ? Number(match[1].replace(/,/g, "")) : null;
  const suffix = match ? match[2] : "";
  const useCommas = match ? match[1].includes(",") : false;
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    if (!inView || target === null || suffix.includes("/")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const controls = animate(0, target, { duration: 1.4, ease: "easeOut", onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [inView, target, suffix]);

  if (target === null || suffix.includes("/") || shown === null) {
    return <span ref={ref}>{value}</span>;
  }
  const text = useCommas ? shown.toLocaleString("en-US") : String(shown);
  return <span ref={ref}>{text}{suffix}</span>;
}
