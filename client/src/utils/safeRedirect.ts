/**
 * Safe handling of the `?next=` parameter used after signing in or up.
 *
 * `next` comes from the address bar, so it is untrusted. Only a plain
 * same-site path is accepted: "/tourist-visa", "/tourist-visa/2A?x=1". Anything
 * else (absolute URLs, "//host", backslashes, control characters, dot segments,
 * encoded versions of those, the login pages themselves) returns null and the
 * caller falls back to its normal destination. Step 8i narrowed the rule to the
 * Tourist Visa application alone (touristVisaNextPath, the one function that
 * every page uses) and added the entry points' links and words.
 *
 * Plain functions, no imports and no TypeScript-only syntax, so the unit tests
 * can run them with `node --test`.
 */

// RFC 3986 characters allowed in a path, query or fragment. Anything outside this
// list (spaces, tabs, newlines, backslash, unicode look-alikes of "/") is refused.
const ALLOWED = /^[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]+$/;

// Pages that must never be a post-login destination: sending a just-signed-in user
// back to /login would loop.
const AUTH_PATHS = ["/login", "/login-01", "/register", "/signup"];

const MAX_LENGTH = 512;

/** Decodes percent-escapes repeatedly (up to 3 times) so double-encoded tricks are caught. */
function decodeFully(value: string): string | null {
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null; // malformed escape such as "%E0%A4%A"
    }
    if (next === current) return current;
    current = next;
  }
  return current;
}

function pathnameOf(value: string): string {
  const end = value.search(/[?#]/);
  return end === -1 ? value : value.slice(0, end);
}

// Control characters (browsers strip tab, CR and LF inside URLs, which turns "/<tab>/host"
// into "//host"), line and paragraph separators, bidi overrides and zero-width characters.
// A plain space is not in this list: "%20" in a query value decodes to one and is harmless.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/;

function hasUnsafeShape(candidate: string): boolean {
  // Must be a single leading slash followed by something that is not "/" or "\".
  if (candidate[0] !== "/") return true;
  if (candidate.length > 1 && (candidate[1] === "/" || candidate[1] === "\\")) return true;
  if (candidate.includes("\\")) return true;
  if (INVISIBLE.test(candidate)) return true;

  const path = pathnameOf(candidate);
  if (path.includes("//")) return true;
  if (path.split("/").some((segment) => segment === "." || segment === "..")) return true;
  return false;
}

function isAuthPath(path: string): boolean {
  const lower = path.toLowerCase().replace(/\/+$/, "") || "/";
  return AUTH_PATHS.some((p) => lower === p || lower.startsWith(`${p}/`));
}

/**
 * Returns `raw` if it is a safe same-site path, otherwise null.
 * The returned value is the input unchanged (not decoded).
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > MAX_LENGTH) return null;
  if (!ALLOWED.test(raw)) return null;
  if (hasUnsafeShape(raw)) return null;

  // The same checks on what a server or proxy might decode the value to.
  const decoded = decodeFully(raw);
  if (decoded === null) return null;
  if (decoded !== raw && hasUnsafeShape(decoded)) return null;

  if (isAuthPath(pathnameOf(raw)) || isAuthPath(pathnameOf(decoded))) return null;

  // Belt and braces: resolved against a base, it must stay on that base's origin.
  try {
    const base = "https://same-site.invalid";
    if (new URL(raw, base).origin !== base) return null;
  } catch {
    return null;
  }

  return raw;
}

// ---------------------------------------------------------------------------
// The one rule for `?next=` on the sign-up and login pages (step 8i)
// ---------------------------------------------------------------------------

/** The only place a visitor can be sent after signing in or up: the Tourist Visa application. */
export const TOURIST_VISA_PATH = "/tourist-visa";

// A percent-encoded slash (%2F), backslash (%5C), dot (%2E) or percent sign (%25, a second layer of encoding), in any case, anywhere in the value.
const ENCODED_TRICKS = /%(?:2f|5c|2e|25)/i;

/**
 * THE RULE for `next`. It is untrusted (it comes from the address bar), so it is accepted only when it is a same-site relative path that
 * is exactly "/tourist-visa" or "/tourist-visa" followed by "/", "?" or "#" (and anything after that which is itself a safe path):
 *  - everything safeNextPath refuses is refused (absolute URLs, "//host", backslashes, control and invisible characters, dot segments, the
 *    login and sign-up pages, malformed or double-encoded escapes, values over 512 characters);
 *  - and, on top of that, the text must START with "/tourist-visa" exactly as written (lower case, nothing encoded: "/Tourist-Visa",
 *    "/%74ourist-visa", "/tourist-visa.evil.com", "/tourist-visaX" and "/tourist-visa%2F.." are all refused), and no percent-encoded
 *    slash, backslash, dot or percent sign is allowed anywhere in it.
 * Returns the value unchanged, or null (the caller then uses its normal default). This is the only function that reads a `next`.
 */
export function touristVisaNextPath(raw: unknown): string | null {
  const safe = safeNextPath(raw);
  if (safe === null) return null;
  if (ENCODED_TRICKS.test(safe)) return null;
  if (!safe.startsWith(TOURIST_VISA_PATH)) return null;
  const after = safe.charAt(TOURIST_VISA_PATH.length);
  if (after !== "" && after !== "/" && after !== "?" && after !== "#") return null;
  // "..;" and ".;" are dot segments to some servers (a ";" starts a path parameter there): refuse them too.
  if (pathnameOf(safe).split("/").some((segment) => [".", ".."].includes(segment.split(";")[0]))) return null;
  return safe;
}

/** The accepted `next` of an address-bar query string ("?next=%2Ftourist-visa"), or null. Only the first `next` is looked at. */
export function nextFromSearch(search: unknown): string | null {
  if (typeof search !== "string" || search.length > 2048) return null;
  return touristVisaNextPath(new URLSearchParams(search).get("next"));
}

/** Where to go once signed in or up: the accepted `next` of the query string, otherwise `fallback` (the page's own default). */
export function nextDestination(search: unknown, fallback: string): string {
  return nextFromSearch(search) ?? fallback;
}

/** "?next=/tourist-visa" for an accepted next (slashes left as they are, everything else encoded), or "" when there is none. */
export function nextQuery(next: string | null): string {
  const safe = touristVisaNextPath(next);
  return safe === null ? "" : `?next=${encodeURIComponent(safe).replace(/%2F/g, "/")}`;
}

/**
 * Where to go once signed in: a valid `next` (see touristVisaNextPath) wins, otherwise the existing
 * defaults (admins to the admin panel, everyone else to the home page).
 */
export function postLoginDestination(isAdmin: boolean, rawNext: unknown): string {
  return touristVisaNextPath(rawNext) ?? (isAdmin ? "/admin/users" : "/");
}

// ---------------------------------------------------------------------------
// The entry points to the application (step 8i): what they say and where they go
// ---------------------------------------------------------------------------

/** The words of the two entry points (the footer link and the button in the assessment popup). */
export const ENTRY_TEXT = Object.freeze({
  footer: "Apply for a UK tourist visa online",
  popup: "Continue to your full application",
});

/**
 * Where an entry point goes. A person who is signed in goes straight to the application; a person who is not goes to the sign-up page
 * with ?next=/tourist-visa, which sends them on to the application once they have an account. A fixed value: no personal data is ever in it.
 */
export function touristVisaEntryHref(signedIn: boolean): string {
  return signedIn ? TOURIST_VISA_PATH : `/register${nextQuery(TOURIST_VISA_PATH)}`;
}

/**
 * The `next` the sign-up and login pages carry (to the other page's link, and to the redirect after success): only while the form is OPEN
 * (the existing status hooks say "open"). Closed, still loading or failed: null, and the pages behave exactly as before.
 */
export function carriedNext(open: boolean, search: unknown): string | null {
  return open ? nextFromSearch(search) : null;
}

/**
 * Whether the assessment popup offers "Continue to your full application": only when the form is open, the assessment has just been sent,
 * and it was for a tourist visa to the United Kingdom (the application is for that visa only).
 */
export function shouldOfferFullApplication(input: { open: boolean; success: unknown; visaType: unknown; destinationCountry: unknown }): boolean {
  return input.open === true && Boolean(input.success) && input.visaType === "Tourist Visa" && input.destinationCountry === "United Kingdom";
}

/** The login URL that brings a visitor back to `currentPath` after signing in. */
export function loginUrlWithNext(currentPath: string): string {
  return `/login?next=${encodeURIComponent(currentPath)}`;
}
