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

export const UNSAVED_CHANGES_MESSAGE = "You have unsaved changes in this section. Leave without saving?";

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
