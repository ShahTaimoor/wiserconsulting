// Run with: npm run test:unit   (from client/). Node strips the TypeScript types itself.
//
// The floating navbar: the pure logic (links, the current page, compacting, the avatar menu by kind of person, initials, the highlight's box)
// and the real component rendered with react-dom/server (loadTsx) with its store, router, hooks and icons replaced by fakes. Made-up data only.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { NAV_LINKS, COMPACT_AFTER_PX, activeNavHref, isCompact, avatarMenuItems, userInitials, navbarCompactText, highlightBox } from "./navbar.ts";
import { ENTRY_TEXT, navbarButtonText, touristVisaEntryHref } from "./safeRedirect.ts";
import { loadTsx, React } from "./loadTsx.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");
const read = (file) => fs.readFileSync(path.join(SRC, file), "utf8");

// ---------------------------------------------------------------------------
// The pure logic
// ---------------------------------------------------------------------------

test("LINKS: the same four pages as the footer's Quick Links, in order", () => {
  assert.deepEqual(NAV_LINKS.map((link) => [link.label, link.href]), [["Home", "/"], ["About", "/about"], ["Services", "/services"], ["Contact", "/contact"]]);
  assert.ok(Object.isFrozen(NAV_LINKS));
});

test("ACTIVE LINK: Home only on /, the others on their page and below it, nothing on any other page, and bad input is nothing", () => {
  assert.equal(activeNavHref("/"), "/");
  assert.equal(activeNavHref(""), null, "an empty path is no page");
  assert.equal(activeNavHref("/about"), "/about");
  assert.equal(activeNavHref("/about/"), "/about", "a trailing slash is the same page");
  assert.equal(activeNavHref("/about/team"), "/about");
  assert.equal(activeNavHref("/services"), "/services");
  assert.equal(activeNavHref("/services/student-visa"), "/services");
  assert.equal(activeNavHref("/contact"), "/contact");
  for (const other of ["/aboutx", "/about-us", "/servicesx", "/privacy", "/terms", "/tourist-visa", "/tourist-visa/2A", "/login", "/admin/products", "/x/about"]) assert.equal(activeNavHref(other), null, other);
  for (const odd of [null, undefined, 0, 42, {}, [], true, () => "/about"]) assert.equal(activeNavHref(odd), null);
  assert.equal(activeNavHref("/ABOUT"), null, "paths are case-sensitive, like the router");
});

test("COMPACTING: the one bar compacts once the page has scrolled more than 20 px, and only for a real number", () => {
  assert.equal(COMPACT_AFTER_PX, 20);
  assert.equal(isCompact(0), false);
  assert.equal(isCompact(20), false);
  assert.equal(isCompact(20.5), true);
  assert.equal(isCompact(500), true);
  for (const odd of [undefined, null, "300", NaN, Infinity, {}, []]) assert.equal(isCompact(odd), false, String(odd));
});

test("AVATAR MENU: nothing signed out; Comments and Log out for a customer; the Admin link too for an administrator (number, string or word role)", () => {
  assert.deepEqual(avatarMenuItems(null), []);
  assert.deepEqual(avatarMenuItems(undefined), []);
  assert.deepEqual(avatarMenuItems({ role: 0 }).map((item) => item.id), ["comments", "logout"]);
  assert.deepEqual(avatarMenuItems({ role: 0 }).map((item) => item.label), ["Comments", "Log out"]);
  assert.deepEqual(avatarMenuItems({}).map((item) => item.id), ["comments", "logout"], "a person with no role is a customer");
  for (const role of [1, "1", "admin"]) {
    const items = avatarMenuItems({ role });
    assert.deepEqual(items.map((item) => item.id), ["comments", "admin", "logout"], `role ${role}`);
    assert.equal(items[1].href, "/admin/products", "the admin link goes where it always went");
    assert.equal(items[1].label, "Admin dashboard");
  }
  for (const role of [2, "2", "user", "Admin", "0"]) assert.deepEqual(avatarMenuItems({ role }).map((item) => item.id), ["comments", "logout"], `role ${JSON.stringify(role)} is not an administrator`);
  assert.equal(avatarMenuItems({ role: 0 }).some((item) => item.href), false, "only the Admin item is a link");
});

test("INITIALS: the first letters of the first and last word, in capitals; a single name gives one letter; nothing usable gives empty text", () => {
  assert.equal(userInitials("Una Longname Tester"), "UT");
  assert.equal(userInitials("sam staff"), "SS");
  assert.equal(userInitials("  Sam  "), "S");
  assert.equal(userInitials("Mary-Jane O'Neil"), "MO");
  assert.equal(userInitials("(Admin) Person"), "AP");
  assert.equal(userInitials("Ñandú Pérez"), "ÑP");
  assert.equal(userInitials("  "), "");
  assert.equal(userInitials("--- ..."), "");
  for (const odd of [null, undefined, 5, {}, []]) assert.equal(userInitials(odd), "");
});

test("COMPACT BUTTON (phone): Apply while the form is open, Fill Form otherwise; only a clear true gives Apply", () => {
  assert.equal(navbarCompactText(true), "Apply");
  assert.equal(navbarCompactText(false), "Fill Form");
  for (const odd of [undefined, null, 0, 1, "true", {}]) assert.equal(navbarCompactText(odd), "Fill Form");
});

test("HIGHLIGHT BOX: where the sliding highlight sits, relative to the row of links; nothing when there is no link or no size", () => {
  assert.deepEqual(highlightBox({ left: 150, width: 64 }, { left: 100 }), { x: 50, width: 64 });
  assert.deepEqual(highlightBox({ left: 100.126, width: 60.004 }, { left: 100 }), { x: 0.13, width: 60 });
  assert.equal(highlightBox(null, { left: 0 }), null);
  assert.equal(highlightBox({ left: 1, width: 10 }, null), null);
  assert.equal(highlightBox({ left: 1, width: 0 }, { left: 0 }), null, "a hidden row has no width");
  assert.equal(highlightBox({ left: NaN, width: 10 }, { left: 0 }), null);
  assert.equal(highlightBox({ left: 1, width: Infinity }, { left: 0 }), null);
});

// ---------------------------------------------------------------------------
// The real Navbar
// ---------------------------------------------------------------------------

const nodeRequire = createRequire(import.meta.url);
const realJsx = nodeRequire("react/jsx-runtime");
const fakeLink = ({ href, children, ...rest }) => React.createElement("a", { href, ...rest }, children);
const icon = () => null;
const USER = { _id: "u1", name: "Una Longname Tester", email: "una.tester@example.com", role: 0 };
const ADMIN = { ...USER, name: "Admin Person", role: 1 };

const state = { availability: "loading", user: null, pathname: "/" };
const calls = { push: [], assessment: [], comments: [], dispatch: [] };
const buttons = [];
const passThrough = (tag) => ({ children, asChild, ...props }) => React.createElement(tag, props, children);
const watchedJsx = (name) => (type, props, key) => {
  if (type === "button" && props && typeof props.children === "string" && [ENTRY_TEXT.navbar, ENTRY_TEXT.navbarClosed, "Apply"].includes(props.children)) buttons.push(props);
  return realJsx[name](type, props, key);
};
const fakes = () => ({
  "next/link": { __esModule: true, default: fakeLink },
  "next/navigation": { usePathname: () => state.pathname, useRouter: () => ({ push: (url) => calls.push.push(url) }) },
  "react/jsx-runtime": { ...realJsx, jsx: watchedJsx("jsx"), jsxs: watchedJsx("jsxs") },
  "lucide-react": new Proxy({}, { get: (_target, name) => (name === "__esModule" ? true : icon) }),
  "@/redux/hooks": { useAppSelector: (select) => select({ auth: { user: state.user }, formSubmission: { adminComments: [], currentSubmission: null } }), useAppDispatch: () => (action) => calls.dispatch.push(action) },
  "@/redux/slices/auth/authSlice": { logout: () => ({ type: "logout" }) },
  "@/redux/slices/formSubmission/formSubmissionSlice": { fetchAdminComments: () => ({ type: "comments" }) },
  "@/context/SettingsContext": { useSettings: () => ({ settings: { websiteTitle: "Test Site", logoUrl: "", emailAddress: "test@example.com", phoneNumber: "+44 0000 000000" }, loading: false }) },
  "@/utils/assessmentForm": { requestAssessmentForm: (pathname) => calls.assessment.push(pathname) },
  "@/utils/commentsPanel": { requestCommentsPanel: (pathname) => calls.comments.push(pathname), useCommentsViewed: () => false },
  "@/components/ui/dropdown-menu": { DropdownMenu: passThrough("div"), DropdownMenuContent: passThrough("div"), DropdownMenuItem: passThrough("div"), DropdownMenuLabel: passThrough("div"), DropdownMenuSeparator: passThrough("hr"), DropdownMenuTrigger: passThrough("div") },
  "@/hooks/useTouristVisaOpen": { useTouristVisaAvailability: () => state.availability },
});

/** The real Navbar, server-rendered. `mounted` is true (as after the page has loaded) so a signed-in person's parts are drawn; `sheet` and `compact` force those two states. */
const navbar = (availability, user, { sheet = false, compact = false, pathname = "/" } = {}) => {
  Object.assign(state, { availability, user, pathname });
  buttons.length = 0;
  for (const key of Object.keys(calls)) calls[key].length = 0;
  // The Navbar's first three useState calls: sheetOpen, compact, mounted.
  const forced = [sheet, compact, true];
  let call = 0;
  const { module } = loadTsx("components/Navbar.tsx", { mocks: fakes(), reactOverrides: { useState: (initial) => React.useState(call < forced.length ? forced[call++] : initial) } });
  return { html: renderToStaticMarkup(React.createElement(module.default)), buttons: buttons.slice() };
};
const count = (html, text) => html.split(text).length - 1;
const anchors = (html) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1], href: (/href="([^"]*)"/.exec(m[1]) || [])[1], text: m[2].replace(/<[^>]*>/g, "").trim() }));
const sheetOf = (html) => html.slice(html.indexOf('role="dialog"'));
const mainNav = (html) => html.slice(html.indexOf('<nav aria-label="Main"'), html.indexOf("</nav>") + 6);

test("NAVBAR LAYOUT: one floating bar (a header holding one main nav), a skip link first, the four links, and no second bar", () => {
  const { html } = navbar("closed", null);
  assert.ok(html.indexOf('href="#main-content"') >= 0 && html.indexOf('href="#main-content"') < html.indexOf("<header"), "the skip link comes before the bar");
  assert.equal(count(html, "<header"), 1, "one header");
  assert.equal(count(html, 'aria-label="Main"'), 1, "one main navigation");
  assert.equal(count(html, "fixed inset-x-0 top-0"), 1, "one fixed bar");
  assert.match(html, /backdrop-blur-xl/, "glass");
  assert.match(html, /rounded-full border border-white\/70/, "a rounded pill with a hairline border");
  const links = anchors(mainNav(html));
  assert.deepEqual(links.filter((a) => NAV_LINKS.some((l) => l.label === a.text)).map((a) => [a.text, a.href]), NAV_LINKS.map((l) => [l.label, l.href]));
  // The phone number and the name are not in the bar.
  assert.equal(mainNav(html).includes("+44 0000 000000"), false, "no phone number in the bar");
  const avatar = /<button[^>]*aria-label="Account menu for[^>]*>([\s\S]*?)<\/button>/.exec(navbar("closed", USER).html);
  assert.equal(avatar[1].replace(/<[^>]*>/g, "").trim(), "UT", "the avatar shows the initials, not the name (the name is its accessible label)");
});

test("NAVBAR COMPACTING: the same bar, lower and with a deeper shadow after scrolling (height and shadow classes change; nothing else is added)", () => {
  const top = navbar("closed", null).html;
  const scrolled = navbar("closed", null, { compact: true }).html;
  assert.match(top, /h-\[68px\]/);
  assert.match(scrolled, /h-14 shadow-\[0_16px_40px/);
  assert.equal(top.includes("h-14 shadow"), false);
  assert.equal(count(scrolled, "<nav "), 1, "still one bar when scrolled");
  assert.match(top, /pt-3/);
  assert.match(scrolled, /pt-2/);
  assert.match(top, /motion-reduce:transition-none/, "the compacting transition stops for reduced motion");
});

test("NAVBAR CURRENT PAGE: aria-current on the current link only, and none on a page that is not in the bar", () => {
  const current = (pathname) => anchors(mainNav(navbar("closed", null, { pathname }).html)).filter((a) => /aria-current="page"/.test(a.attrs)).map((a) => a.text);
  assert.deepEqual(current("/"), ["Home"]);
  assert.deepEqual(current("/about"), ["About"]);
  assert.deepEqual(current("/services/x"), ["Services"]);
  assert.deepEqual(current("/contact"), ["Contact"]);
  assert.deepEqual(current("/privacy"), []);
  assert.deepEqual(current("/tourist-visa"), []);
});

test("NAVBAR BUTTON WORDS: Apply for UK Tourist Visa while the form is open (bar and sheet; Apply on the phone's compact button), Fill Form otherwise", () => {
  for (const user of [null, USER, ADMIN]) {
    const open = navbar("open", user, { sheet: true }).html;
    assert.equal(count(open, "Apply for UK Tourist Visa"), 3, "the desktop button, the compact button's name, and the sheet's button");
    assert.match(open, /aria-label="Apply for UK Tourist Visa"[^>]*>Apply<\/button>/, "the compact button says Apply and keeps the full words as its name");
    assert.equal(count(open, "Fill Form"), 0);
    for (const availability of ["closed", "loading"]) {
      const closed = navbar(availability, user, { sheet: true }).html;
      assert.equal(count(closed, "Fill Form"), 4, `${availability}: the desktop button, the compact button (its name and its words) and the sheet's button`);
      assert.equal(count(closed, "Apply for UK Tourist Visa"), 0, availability);
      assert.equal(count(closed, ">Apply<"), 0, availability);
    }
  }
  assert.equal(navbar("closed", USER).html, navbar("loading", USER).html, "closed and loading are the same bar");
});

test("NAVBAR BUTTON GOES: the application when signed in (admins too), the sign-up page carrying next when not, the old popup while closed", () => {
  const press = (availability, user, which = 0) => {
    const { buttons: found } = navbar(availability, user);
    assert.equal(found.length, 2, "the desktop button and the compact one");
    found[which].onClick();
    return { push: calls.push.slice(), assessment: calls.assessment.slice() };
  };
  for (const which of [0, 1]) {
    assert.deepEqual(press("open", null, which), { push: ["/register?next=/tourist-visa"], assessment: [] });
    assert.deepEqual(press("open", USER, which), { push: ["/tourist-visa"], assessment: [] });
    assert.deepEqual(press("open", ADMIN, which), { push: ["/tourist-visa"], assessment: [] }, "an admin is sent to the application, as before");
    for (const availability of ["closed", "loading"]) assert.deepEqual(press(availability, USER, which), { push: [], assessment: ["/"] }, availability);
  }
  assert.equal(navbarButtonText(true), ENTRY_TEXT.navbar);
  assert.equal(touristVisaEntryHref(true), "/tourist-visa");
  assert.equal(touristVisaEntryHref(false), "/register?next=/tourist-visa");
});

test("NAVBAR ACCOUNT: signed out has a Sign in link and no avatar; signed in has ONE round avatar menu with the person's name only as its label", () => {
  const out = mainNav(navbar("closed", null).html);
  assert.ok(anchors(out).some((a) => a.text === "Sign in" && a.href === "/login"));
  assert.equal(out.includes("Account menu"), false);
  for (const user of [USER, ADMIN]) {
    const inn = mainNav(navbar("closed", user).html);
    assert.equal(count(inn, "Account menu for"), 1, "one avatar");
    assert.ok(inn.includes(`aria-label="Account menu for ${user.name}"`));
    assert.equal(anchors(inn).some((a) => a.text === "Sign in"), false, "no Sign in once signed in");
    assert.ok(inn.includes(">UT<") || inn.includes(">AP<"), "the initials are in the avatar");
  }
});

test("NAVBAR AVATAR MENU: Comments and Log out for a customer, with the Admin dashboard link too for an administrator, in that order", () => {
  const order = (html) => ["Comments", "Admin dashboard", "Log out"].map((word) => [word, html.indexOf(word)]).filter(([, at]) => at >= 0).sort((x, y) => x[1] - y[1]).map(([word]) => word);
  const menuOf = (html) => html.slice(html.indexOf("</nav>"), html.indexOf("</header>") > 0 ? html.length : html.length);
  const customer = navbar("closed", USER).html;
  const admin = navbar("closed", ADMIN).html;
  assert.deepEqual(order(customer), ["Comments", "Log out"]);
  assert.deepEqual(order(admin), ["Comments", "Admin dashboard", "Log out"]);
  assert.ok(anchors(admin).some((a) => a.text.includes("Admin dashboard") && a.href === "/admin/products"));
  assert.equal(anchors(customer).some((a) => a.text.includes("Admin dashboard")), false, "a customer never sees the admin link");
  assert.equal(menuOf(customer).includes("Admin dashboard"), false);
});

test("NAVBAR PHONE: a compact pill (logo, Apply, menu button); the sheet is closed until the button is pressed and then a labelled dialog with the links, account, phone, email and the full-width button", () => {
  const closed = navbar("open", null).html;
  assert.equal(closed.includes('role="dialog"'), false, "no sheet while closed");
  assert.match(closed, /aria-label="Open menu"[^>]*aria-expanded="false"/);
  assert.match(closed, /h-11 w-11/, "the menu button is 44 px");
  const open = navbar("open", null, { sheet: true }).html;
  assert.match(open, /aria-expanded="true"/);
  const sheet = sheetOf(open);
  assert.match(sheet, /role="dialog" aria-modal="true" aria-label="Menu"/);
  assert.match(sheet, /aria-label="Close menu"/);
  assert.match(sheet, /animate-in fade-in-0 slide-in-from-top-3 duration-200 motion-reduce:animate-none/, "the sheet opens with a small motion that stops for reduced motion");
  assert.match(sheet, /z-\(--z-nav-sheet\)/);
  assert.deepEqual(anchors(sheet).filter((a) => NAV_LINKS.some((l) => l.label === a.text)).map((a) => a.href), NAV_LINKS.map((l) => l.href));
  assert.ok(anchors(sheet).some((a) => a.href === "tel:+440000000000" && a.text.includes("+44 0000 000000")), "the phone number is a call link in the sheet");
  assert.ok(anchors(sheet).some((a) => a.href === "mailto:test@example.com"));
  assert.ok(anchors(sheet).some((a) => a.text === "Sign in" && a.href === "/login") && anchors(sheet).some((a) => a.text === "Create account" && a.href === "/register"));
  const lastButton = [...sheet.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].pop();
  assert.equal(lastButton[1].replace(/<[^>]*>/g, "").trim(), "Apply for UK Tourist Visa", "the full-width primary button is last (at the bottom)");
  assert.match(lastButton[0], /w-full/);
  // Tap targets: every link and button of the sheet is at least 44 px tall (min-h-14 = 56 px, h-11 = 44, h-14 = 56).
  for (const tag of [...sheet.matchAll(/<(?:a|button)\b[^>]*class="([^"]*)"/g)].map((m) => m[1])) assert.match(tag, /\b(?:min-h-14|min-h-11|h-11|h-14)\b/, `tap target: ${tag.slice(0, 60)}`);
});

test("NAVBAR PHONE (signed in): the sheet has the person's name and email, Comments, the Admin link only for administrators, and Log out", () => {
  const customer = sheetOf(navbar("closed", USER, { sheet: true }).html);
  assert.ok(customer.includes("Una Longname Tester") && customer.includes("una.tester@example.com"));
  assert.ok(customer.includes("Comments") && customer.includes("Log out"));
  assert.equal(customer.includes("Admin dashboard"), false);
  assert.equal(customer.includes("Create account"), false, "no sign-up link once signed in");
  const admin = sheetOf(navbar("closed", ADMIN, { sheet: true }).html);
  assert.ok(anchors(admin).some((a) => a.href === "/admin/products" && a.text.includes("Admin dashboard")));
});

test("NAVBAR ACCESSIBILITY: visible focus rings on every control, 44 px phone targets, and stacking by the named scale only", () => {
  const html = navbar("open", USER, { sheet: true }).html;
  assert.match(html, /focus-visible:ring-2 focus-visible:ring-emerald-600/);
  for (const classes of [...html.matchAll(/<(?:a|button)\b[^>]*class="([^"]*)"/g)].map((m) => m[1])) {
    if (/\bsr-only\b/.test(classes)) continue; // the skip link shows itself on focus
    assert.match(classes, /focus-visible:ring-2/, `a focus ring: ${classes.slice(0, 70)}`);
  }
  const source = read("components/Navbar.tsx");
  assert.match(source, /z-\(--z-navbar\)/);
  assert.match(source, /z-\(--z-nav-sheet\)/);
  assert.match(source, /z-\(--z-popover\)/);
  assert.equal(/\bz-\[\d+\]|\bz-(?:[3-9]\d|\d{3,})\b/.test(source), false, "no raw layer numbers in the Navbar (only z-10 inside the row of links, which is local)");
});

test("NAVBAR: nothing is hidden behind the bar: the layout leaves 80 px (the bar's bottom edge) above the page, and the old dark backdrop is gone", () => {
  const layout = read("app/ClientLayout.tsx");
  assert.match(layout, /mt-20/, "the pages start below the 80 px bar");
  assert.match(layout, /id="main-content"/, "the skip link has its target");
  assert.equal(read("app/tourist-visa/layout.tsx").includes("NavbarBackdrop"), false, "the dark band behind the old bar is gone");
  // The bar's bottom edge: top gap (12 px) + height (68 px) = 80 px, which is the pages' top margin.
  const navbarSource = read("components/Navbar.tsx");
  assert.match(navbarSource, /h-\[68px\]/);
  assert.match(navbarSource, /"pt-3"/);
  assert.equal(12 + 68, 80);
});

test("NAVBAR PRIMARY BUTTON SHAPE: the orange buttons (desktop, the phone's compact one, the sheet's full-width one) are rounded rectangles; the avatar and the bar stay round", () => {
  for (const [availability, wording] of [["open", "Apply for UK Tourist Visa"], ["closed", "Fill Form"]]) {
    const html = navbar(availability, USER, { sheet: true }).html;
    const orange = [...html.matchAll(/<button\b[^>]*class="([^"]*bg-orange-300[^"]*)"/g)].map((m) => m[1]);
    assert.equal(orange.length, 3, `${availability} (${wording}): the desktop button, the compact one and the sheet's`);
    for (const classes of orange) {
      assert.match(classes, /rounded-\[12px\]/, `a rounded rectangle (12 px): ${classes.slice(0, 60)}`);
      assert.equal(/\brounded-full\b/.test(classes), false, "not a pill");
      assert.match(classes, /hover:bg-orange-200/, "the hover colour is kept");
      assert.match(classes, /focus-visible:ring-2/, "the focus ring is kept");
    }
  }
  const html = navbar("open", USER).html;
  assert.match(/<button[^>]*aria-label="Account menu for[^>]*class="([^"]*)"|class="([^"]*)"[^>]*aria-label="Account menu for/.exec(html).slice(1).join(" "), /\brounded-full\b/, "the avatar stays round");
  assert.match(html, /<nav aria-label="Main"[^>]*class="[^"]*\brounded-full\b/, "the bar stays a pill");
  assert.match(html, /absolute left-0 top-1\/2 h-9 rounded-full/, "the sliding highlight stays round");
});

test("NAVBAR NO WRAPPING: the words in the bar never wrap onto two lines (Sign in, the primary button, the links)", () => {
  const html = navbar("open", null).html;
  const classesOf = (text) => new RegExp(`<(?:a|button)\\b[^>]*class="([^"]*)"[^>]*>${text}</(?:a|button)>`).exec(html)[1];
  assert.match(classesOf("Sign in"), /\bwhitespace-nowrap\b/, "Sign in stays on one line at 768 px");
  assert.match(classesOf("Sign in"), /\bshrink-0\b/);
  assert.match(classesOf("Apply for UK Tourist Visa"), /\bwhitespace-nowrap\b/);
  assert.match(classesOf("Home"), /\bh-10\b/, "the links are one line high");
});
