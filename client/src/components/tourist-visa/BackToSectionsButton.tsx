"use client";

import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrolledPast } from "@/hooks/useScrolledPast";
import { prefersReducedMotion, scrollToPanel } from "@/utils/scrollBack";

/**
 * A round button, fixed in the bottom right corner, that takes the admin back to the section list ("Jump to") of an application. It is
 * not on the page at all (so it cannot be tabbed to) while the list is on screen, or not reached yet, or not on the page (the editor is
 * open). It sits under dialogs and toasts (z-40) and keeps clear of the phone's home bar.
 *
 * `panel` is the section list element. Pressing the button scrolls it into view (smoothly, or with a jump when the visitor prefers less
 * motion) and puts the keyboard focus on its first link.
 */
export function BackToSectionsButton({ panel }: { panel: HTMLElement | null }) {
  const pastPanel = useScrolledPast(panel);
  if (!panel || !pastPanel) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Back to section selection"
      title="Back to section selection"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 h-11 w-11 rounded-full border-border bg-background text-foreground shadow-lg hover:bg-accent sm:right-6"
      onClick={() => scrollToPanel(panel, { reducedMotion: prefersReducedMotion() })}
    >
      <ArrowUp className="h-5 w-5" aria-hidden />
    </Button>
  );
}
