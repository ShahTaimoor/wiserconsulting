/**
 * The "back to the section list" button of the admin application page: the rules, kept apart from React so they can be tested as plain
 * functions. The button shows only once the section list (the "Jump to" panel) has been scrolled past; pressing it scrolls the panel into
 * view and puts the keyboard focus on its first control.
 */

/** Room left above the panel when it is scrolled to: the same 5rem the page's other anchors keep (Tailwind scroll-mt-20). */
export const SECTION_SCROLL_MARGIN_PX = 80;

/** What an IntersectionObserver reports about the panel. */
export interface PanelPosition {
  /** The panel is at least partly on screen. */
  isIntersecting: boolean;
  /** The panel's bottom edge, in pixels from the top of the window. */
  bottom: number;
}

/**
 * True when the panel has been scrolled past: it is entirely above the top of the window. A panel that is on screen, or one that is
 * still further down the page (not reached yet), is not "past", so the button stays hidden in both cases.
 */
export function isPastPanel({ isIntersecting, bottom }: PanelPosition): boolean {
  return !isIntersecting && bottom <= 0;
}

/**
 * Smooth scrolling, unless the visitor asked for less motion: then the page jumps. It is "instant" and not "auto" on purpose: the site sets
 * scroll-behavior: smooth on <html> (the scroll-smooth class), and "auto" would follow that and glide anyway.
 */
export function scrollBehaviorFor(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "instant" : "smooth";
}

/** The first thing in the panel that can take focus (a link or a button), or null. */
export function firstControlOf(panel: Pick<HTMLElement, "querySelector">): HTMLElement | null {
  return panel.querySelector<HTMLElement>("a[href], button:not([disabled])");
}

/** The part of an element the scroll helper uses (so a test can pass a small fake). */
export type ScrollTarget = Pick<HTMLElement, "querySelector" | "scrollIntoView" | "focus">;

/**
 * Scrolls the panel to the top of the window (its CSS scroll margin keeps it clear of anything above) and moves the keyboard focus to its
 * first control, or to the panel itself when it has none. The focus does not scroll the page a second time: the scroll above already did.
 */
export function scrollToPanel(panel: ScrollTarget, { reducedMotion }: { reducedMotion: boolean }): void {
  panel.scrollIntoView({ behavior: scrollBehaviorFor(reducedMotion), block: "start" });
  (firstControlOf(panel) ?? panel).focus({ preventScroll: true });
}

/** Whether the visitor asked for less motion (false where the browser cannot say). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
