/**
 * The plain logic of the public Navbar: the links, which one is the current page, when the bar compacts, what the avatar menu holds for each
 * kind of person, and the initials in the avatar. No React and no network, so it can be unit tested with `node --test`.
 *
 * The words and the place of the primary (orange) button are NOT here: they are `navbarButtonText` and `touristVisaEntryHref` in
 * utils/safeRedirect.ts, and the Navbar still uses those.
 */

import { isAdminRole } from "./authRole.ts";

/** The links of the bar and of the phone menu. The same four pages as the footer's Quick Links. */
export const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = Object.freeze([
  Object.freeze({ href: "/", label: "Home" }),
  Object.freeze({ href: "/about", label: "About" }),
  Object.freeze({ href: "/services", label: "Services" }),
  Object.freeze({ href: "/contact", label: "Contact" }),
]);

/**
 * Which link is the current page: Home only on "/", the others on their own page and anything below it ("/about" and "/about/team", but not
 * "/aboutx"). A trailing slash does not matter. Any other page (privacy, terms, the Tourist Visa pages) has no current link: null.
 */
export function activeNavHref(pathname: unknown): string | null {
  if (typeof pathname !== "string" || pathname === "") return null;
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "/";
  for (const link of NAV_LINKS) {
    if (link.href === "/") continue;
    if (path === link.href || path.startsWith(`${link.href}/`)) return link.href;
  }
  return null;
}

/** The bar compacts (slightly lower and with a deeper shadow) once the page is scrolled more than this many pixels. */
export const COMPACT_AFTER_PX = 20;

export function isCompact(scrollY: unknown): boolean {
  return typeof scrollY === "number" && Number.isFinite(scrollY) && scrollY > COMPACT_AFTER_PX;
}

export type AvatarItemId = "comments" | "admin" | "logout";

export interface AvatarItem {
  id: AvatarItemId;
  label: string;
  /** Only the Admin item is a link. */
  href?: string;
}

/**
 * What the avatar menu (and the signed-in part of the phone menu) holds, in order: Comments for every signed-in person (as the old bar had),
 * the Admin link for administrators only, and Log out last. A signed-out visitor has no avatar menu: an empty list (the bar shows "Sign in").
 */
export function avatarMenuItems(user: { role?: string | number } | null | undefined): AvatarItem[] {
  if (!user) return [];
  const items: AvatarItem[] = [{ id: "comments", label: "Comments" }];
  if (isAdminRole(user.role)) items.push({ id: "admin", label: "Admin dashboard", href: "/admin/products" });
  items.push({ id: "logout", label: "Log out" });
  return items;
}

/** One or two capital letters for the round avatar: the first letters of the first and the last word of the name. "" when there is no usable name. */
export function userInitials(name: unknown): string {
  if (typeof name !== "string") return "";
  const words = name.trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  if (words.length === 0) return "";
  const letter = (word: string) => (Array.from(word.replace(/^[^\p{L}\p{N}]+/u, ""))[0] ?? "").toUpperCase();
  const first = letter(words[0]);
  const last = words.length > 1 ? letter(words[words.length - 1]) : "";
  return `${first}${last}`;
}

/** The short words on the phone's compact orange button: "Apply" while the form is open, today's "Fill Form" otherwise (the full words stay its accessible name). */
export function navbarCompactText(open: boolean): string {
  return open === true ? "Apply" : "Fill Form";
}

/** The position of the sliding highlight under the links: where the current link sits inside the row of links. null while there is no current link or nothing is measured. */
export function highlightBox(link: { left: number; width: number } | null | undefined, row: { left: number } | null | undefined): { x: number; width: number } | null {
  if (!link || !row) return null;
  const values = [link.left, link.width, row.left];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value)) || link.width <= 0) return null;
  return { x: Math.round((link.left - row.left) * 100) / 100, width: Math.round(link.width * 100) / 100 };
}
