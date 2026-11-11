/**
 * Safe handling of the `?next=` parameter used after login.
 *
 * `next` comes from the address bar, so it is untrusted. Only a plain
 * same-site path is accepted: "/tourist-visa", "/tourist-visa/2A?x=1". Anything
 * else (absolute URLs, "//host", backslashes, control characters, dot segments,
 * encoded versions of those, the login pages themselves) returns null and the
 * caller falls back to its normal destination.
 *
 * Plain functions, no imports and no TypeScript-only syntax, so the unit tests
 * can run them with `node --test`.
 */

// RFC 3986 characters allowed in a path, query or fragment. Anything outside this
// list (spaces, tabs, newlines, backslash, unicode look-alikes of "/") is refused.
const ALLOWED = /^[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]+$/;

// Pages that must never be a post-login destination: sending a just-signed-in user
// back to /login would loop.
const AUTH_PATHS = ["/login", "/login-01", "/register", "/signup", "/auth-success"];

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

/**
 * Where to go once signed in: a valid `next` wins, otherwise the existing
 * defaults (admins to the admin panel, everyone else to the home page).
 */
export function postLoginDestination(isAdmin: boolean, rawNext: unknown): string {
  return safeNextPath(rawNext) ?? (isAdmin ? "/admin/users" : "/");
}

/** The login URL that brings a visitor back to `currentPath` after signing in. */
export function loginUrlWithNext(currentPath: string): string {
  return `/login?next=${encodeURIComponent(currentPath)}`;
}
