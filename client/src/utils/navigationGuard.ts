/**
 * Decides whether a click on a link would take the user away from the current page.
 * Used by the unsaved-changes warning. Pure, so it can be unit tested without a browser.
 */

export interface ClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

export interface AnchorLike {
  href: string;
  target: string;
  hasDownload: boolean;
}

/** The words on the unsaved-changes dialog. Kept here so they are written once and can be tested. */
export const UNSAVED_CHANGES_DIALOG = {
  title: "Leave without saving?",
  description: "You have unsaved changes in this section. If you leave now, they will be lost.",
  stayLabel: "Stay on this page",
  leaveLabel: "Leave without saving",
} as const;

/**
 * What the guard does with a click, given where it stands:
 *  - "allow": let it through (the user already agreed to leave, or the click does not leave the page);
 *  - "ask":   cancel the click and show the dialog;
 *  - "block": cancel the click and do nothing more (the dialog is already open, so a second
 *             click must neither navigate nor open a second dialog).
 */
export type GuardDecision = "allow" | "ask" | "block";

export function decideLeave(state: { allowed: boolean; dialogOpen: boolean; leaving: boolean }): GuardDecision {
  if (state.allowed || !state.leaving) return "allow";
  return state.dialogOpen ? "block" : "ask";
}

/**
 * True when following this link would leave the page the user is on. A click that opens
 * a new tab or window, downloads a file, is only a #fragment jump, or is not a web link
 * (mailto:, tel:) does not leave it.
 */
export function isLeavingClick(click: ClickLike, anchor: AnchorLike, currentUrl: string): boolean {
  if (click.defaultPrevented || click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (anchor.hasDownload) return false;
  if (anchor.target && anchor.target !== "_self") return false;

  let destination: URL;
  let current: URL;
  try {
    destination = new URL(anchor.href, currentUrl);
    current = new URL(currentUrl);
  } catch {
    return false;
  }
  if (destination.protocol !== "http:" && destination.protocol !== "https:") return false;

  const samePage =
    destination.origin === current.origin &&
    destination.pathname === current.pathname &&
    destination.search === current.search;
  return !samePage;
}
