// Run with: npm run test:unit   (from client/). Node strips the TypeScript types itself.
//
// Step 8i: the entry points to the Tourist Visa application. Two kinds of test:
//  - the rule for "next" (one function, many hostile examples) and the small pure decisions around it;
//  - the real components, compiled by loadTsx.mjs and rendered with react-dom/server (and their effects run by hand), with the status hooks,
//    the store and the router replaced by fakes: each entry point hidden when closed, loading or failed and shown when open, the links, the
//    "next" carried from one page to the other and used after success, and an invalid "next" ignored.
// Made-up data only.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import {
  touristVisaNextPath,
  nextFromSearch,
  nextDestination,
  nextQuery,
  postLoginDestination,
  touristVisaEntryHref,
  carriedNext,
  shouldOfferFullApplication,
  ENTRY_TEXT,
  TOURIST_VISA_PATH,
} from "./safeRedirect.ts";
import { availabilityOf } from "./touristVisaChecklist.ts";
import { loadTsx, React } from "./loadTsx.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");
const read = (file) => fs.readFileSync(path.join(SRC, file), "utf8");
const ch = (...codes) => String.fromCharCode(...codes); // so this file stays pure ASCII

// ---------------------------------------------------------------------------
// The rule for "next": one function
// ---------------------------------------------------------------------------

const accepted = (value) => assert.equal(touristVisaNextPath(value), value, `should accept ${JSON.stringify(value)}`);
const rejected = (value) => assert.equal(touristVisaNextPath(value), null, `should reject ${JSON.stringify(value)}`);

test("accepts /tourist-visa exactly, or followed by /, ? or #, and returns it unchanged", () => {
  for (const value of [
    "/tourist-visa",
    "/tourist-visa/",
    "/tourist-visa/2A",
    "/tourist-visa/review",
    "/tourist-visa/2A?x=1",
    "/tourist-visa?x=1&y=a%20b",
    "/tourist-visa#top",
    "/tourist-visa/2A#top",
    "/tourist-visa?next=//not-a-host", // a query value is only data: the path is still /tourist-visa
  ]) {
    accepted(value);
  }
});

test("rejects anything that is not a string, and the empty string", () => {
  for (const value of [null, undefined, "", 0, 42, true, {}, ["/tourist-visa"], () => "/tourist-visa", Symbol("x")]) assert.equal(touristVisaNextPath(value), null);
});

test("rejects absolute URLs, other schemes and addresses without a leading slash", () => {
  for (const value of [
    "https://evil.example/tourist-visa",
    "http://evil.example",
    "HTTPS://EVIL.EXAMPLE",
    "ftp://evil.example",
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:x",
    "mailto:a@example.com",
    "tourist-visa",
    "./tourist-visa",
    "../tourist-visa",
    "evil.example/tourist-visa",
    "?next=/tourist-visa",
    "#/tourist-visa",
  ]) {
    rejected(value);
  }
});

test("rejects protocol-relative URLs", () => {
  for (const value of ["//evil.example", "//evil.example/tourist-visa", "///evil.example", "////tourist-visa", "//", "/tourist-visa//evil.example", "//tourist-visa"]) rejected(value);
});

test("rejects backslashes in any position, which browsers treat as slashes", () => {
  for (const value of ["/\\evil.example", "\\evil.example", "\\\\evil.example", "/\\/evil.example", "/tourist-visa\\..\\admin", "/tourist-visa/\\evil.example", "/tourist-visa\\"]) rejected(value);
});

test("rejects the look-alikes of the prefix: /tourist-visa.evil.com, /tourist-visaX and the like", () => {
  for (const value of [
    "/tourist-visa.evil.com",
    "/tourist-visa.evil.com/x",
    "/tourist-visaX",
    "/tourist-visax",
    "/tourist-visa-x",
    "/tourist-visa_x",
    "/tourist-visa@evil.com",
    "/tourist-visa:80",
    "/tourist-visa;x=1",
    "/tourist-visa'",
    "/tourist-visa!",
    "/tourist-visa~",
    "/tourist-visa+",
    "/tourist-vis",
    "/tourist-",
    "/tourist",
    "/admin/tourist-visa",
    "/x/tourist-visa",
    "/",
    "/admin",
    "/admin/users",
    "/about",
    "/services/tourist-visa",
  ]) {
    rejected(value);
  }
});

test("rejects dot segments and traversal, plain or encoded", () => {
  for (const value of [
    "/tourist-visa/../admin",
    "/tourist-visa/./x",
    "/tourist-visa/..",
    "/tourist-visa/../../admin",
    "/tourist-visa/..;/admin",
    "/tourist-visa/%2e%2e/admin",
    "/tourist-visa/%2E%2E/admin",
    "/tourist-visa/%2e/x",
    "/tourist-visa%2f..%2fadmin",
    "/tourist-visa%2F..%2Fadmin",
    "/tourist-visa/.%2e/admin",
    "/tourist-visa/%2e./admin",
  ]) {
    rejected(value);
  }
});

test("rejects mixed case: the prefix must be lower case exactly as written", () => {
  for (const value of ["/Tourist-Visa", "/TOURIST-VISA", "/Tourist-visa/2A", "/tourist-Visa", "/tourist-VISA/", "/TOURIST-VISA?x=1", "/ToUrIsT-vIsA"]) rejected(value);
});

test("rejects an encoded prefix, an encoded slash or dot, and double and triple encoding", () => {
  for (const value of [
    "/%74ourist-visa", // "t" encoded
    "/tourist%2Dvisa", // the hyphen encoded
    "/tourist-visa%2fx",
    "/tourist-visa%2Fx",
    "/tourist-visa%5cx",
    "/tourist-visa%5Cx",
    "/tourist-visa/%2fevil.example",
    "/tourist-visa/%252f",
    "/tourist-visa/%252F%252Fevil.example",
    "/tourist-visa/%252e%252e/admin",
    "/tourist-visa/%25252e%25252e/admin",
    "/tourist-visa?x=%2F",
    "/tourist-visa?x=%2e",
    "/tourist-visa?x=100%25",
    "/tourist-visa%25",
    "/tourist-visa?x=%2541", // an "A" encoded twice: harmless to read, but a second layer of encoding is never expected here
    "/tourist-visa/%2561bc",
    "/tourist-visa#%2523",
    "/tourist-visa/%",
    "/tourist-visa/%zz",
    "/tourist-visa/%E0%A4%A",
  ]) {
    rejected(value);
  }
});

test("rejects tabs, newlines, spaces and other control and invisible characters, raw or encoded", () => {
  for (const value of [
    "/tourist-visa\t",
    "/tourist-visa\n",
    "/tourist-visa\r\n",
    "/tourist-visa\n/",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r\n/tourist-visa",
    "/tourist-visa/\t/evil.example",
    "/tourist-visa ",
    " /tourist-visa",
    "/ tourist-visa",
    "/tourist visa",
    "/tourist-visa/ x",
    "/tourist-visa%20",
    "/tourist-visa%09",
    "/tourist-visa%0a",
    "/tourist-visa%0D%0ASet-Cookie:x=1",
    "/tourist-visa%00",
    `/tourist-visa${ch(0)}`,
    `/tourist-visa${ch(0x1f)}`,
    `/tourist-visa${ch(0x7f)}`,
    `/tourist-visa${ch(0x85)}`,
    `/tourist-visa${ch(0xa0)}`,
    `/tourist-visa${ch(0x200b)}`,
    `/tourist-visa${ch(0x2028)}`,
    `/tourist-visa${ch(0x202e)}`,
    `/tourist-visa${ch(0xfeff)}`,
    `/${ch(0xff0f)}${ch(0xff0f)}evil.example`, // fullwidth solidus
    `/tourist-visa${ch(0x2215)}x`, // division slash
    `/tourist-vis${ch(0x430)}`, // a Cyrillic letter that looks like "a"
    "/tourist-visa%E2%80%A8",
    "/tourist-visa%E2%80%AE",
  ]) {
    rejected(value);
  }
});

test("rejects the sign-in and sign-up pages, so nobody is sent in a circle", () => {
  for (const value of ["/login", "/login?next=/tourist-visa", "/register", "/register?next=/tourist-visa", "/signup", "/login-01"]) rejected(value);
});

test("rejects very long values, and accepts one just under the limit", () => {
  accepted(`/tourist-visa/${"a".repeat(480)}`);
  rejected(`/tourist-visa/${"a".repeat(600)}`);
  rejected(`/tourist-visa?${"a=1&".repeat(300)}`);
  rejected(`/${"tourist-visa".repeat(60)}`);
});

test("never returns anything but the value it was given, or null", () => {
  for (const input of ["/tourist-visa", "/tourist-visa/2A?x=1", "//evil", "/Tourist-Visa", "https://evil", "/tourist-visa/%2e%2e/x", "/tourist-visa#a"]) {
    const result = touristVisaNextPath(input);
    assert.ok(result === null || result === input, input);
  }
});

test("a list of hostile values, all together, none gets through", () => {
  const hostile = [
    "//evil.example", "///evil.example", "/\\evil.example", "/%2F/evil.example", "/%5Cevil.example", "javascript:alert(1)", "data:text/html,x",
    "/tourist-visa.evil.com", "/tourist-visaX", "/tourist-visa/../admin", "/Tourist-Visa", "/tourist-visa%2f..%2fadmin", "/tourist-visa/%252e%252e/admin",
    "/tourist-visa\t", "/tourist-visa\n", "/\t/evil.example", "http://localhost:3000/tourist-visa", "/login", "/admin/users", "",
  ];
  assert.deepEqual(hostile.filter((value) => touristVisaNextPath(value) !== null), []);
});

// ---------------------------------------------------------------------------
// Reading it from an address bar, and the small decisions around it
// ---------------------------------------------------------------------------

test("nextFromSearch reads the first next of a query string through the rule", () => {
  assert.equal(nextFromSearch("?next=/tourist-visa"), "/tourist-visa");
  assert.equal(nextFromSearch("?next=%2Ftourist-visa"), "/tourist-visa");
  assert.equal(nextFromSearch("next=/tourist-visa"), "/tourist-visa");
  assert.equal(nextFromSearch("?a=1&next=%2Ftourist-visa%2F2A%3Fx%3D1"), "/tourist-visa/2A?x=1");
  assert.equal(nextFromSearch("?next=/tourist-visa%2Fx"), "/tourist-visa/x", "one layer of encoding is just how an address carries a slash");
  assert.equal(nextFromSearch("?next=/tourist-visa%252Fx"), null, "two layers are refused");
  assert.equal(nextFromSearch("?next=/tourist-visa&next=//evil.example"), "/tourist-visa", "only the first next is read");
  assert.equal(nextFromSearch("?next=//evil.example&next=/tourist-visa"), null, "and if that is bad the later one is not tried");
  for (const bad of ["", "?", "?x=1", "?next=", "?next=//evil.example", "?next=https://evil.example", "?next=%2Ftourist-visa%2F..%2Fadmin", "?next=/tourist-visa%250a", "?next=/tourist-visa+x", "?next=%E0%A4%A", "?next=javascript:alert(1)", `?next=/tourist-visa${"a".repeat(600)}`, null, undefined, 42, {}]) {
    assert.equal(nextFromSearch(bad), null, JSON.stringify(bad));
  }
  assert.equal(nextFromSearch(`?x=${"a".repeat(3000)}&next=/tourist-visa`), null, "an over-long query string is not read at all");
});

test("nextDestination is the accepted next, or the page's own default", () => {
  assert.equal(nextDestination("?next=/tourist-visa", "/"), "/tourist-visa");
  assert.equal(nextDestination("?next=/tourist-visa/2A?x=1", "/"), "/tourist-visa/2A?x=1");
  for (const bad of ["", "?next=//evil.example", "?next=/admin", "?next=/tourist-visaX", "?next=/tourist-visa/../admin", undefined]) assert.equal(nextDestination(bad, "/home"), "/home", JSON.stringify(bad));
});

test("nextQuery builds ?next= for an accepted value only, leaving the slashes readable", () => {
  assert.equal(nextQuery("/tourist-visa"), "?next=/tourist-visa");
  assert.equal(nextQuery("/tourist-visa/2A?x=1"), "?next=/tourist-visa/2A%3Fx%3D1");
  for (const bad of [null, "", "//evil.example", "/admin", "javascript:alert(1)", "/tourist-visa.evil.com"]) assert.equal(nextQuery(bad), "", JSON.stringify(bad));
  // What it builds is read back to the same value.
  for (const value of ["/tourist-visa", "/tourist-visa/2A", "/tourist-visa/2A?x=1&y=2", "/tourist-visa#top"]) assert.equal(nextFromSearch(nextQuery(value)), value);
});

test("postLoginDestination: a valid next wins, anything else keeps the existing defaults for each role (and only /tourist-visa is honoured now)", () => {
  assert.equal(postLoginDestination(false, "/tourist-visa"), "/tourist-visa");
  assert.equal(postLoginDestination(true, "/tourist-visa/2A?x=1"), "/tourist-visa/2A?x=1");
  for (const next of [null, undefined, "", "//evil.example", "https://evil.example", "/admin/users", "/about", "/tourist-visaX", "/Tourist-Visa", "/tourist-visa/../admin", 42]) {
    assert.equal(postLoginDestination(false, next), "/", `user, next=${JSON.stringify(next)}`);
    assert.equal(postLoginDestination(true, next), "/admin/users", `admin, next=${JSON.stringify(next)}`);
  }
});

test("the entry points go to the application when signed in, and to the sign-up page carrying next when not; no personal data is in either", () => {
  assert.equal(touristVisaEntryHref(true), "/tourist-visa");
  assert.equal(touristVisaEntryHref(false), "/register?next=/tourist-visa");
  const url = new URL(touristVisaEntryHref(false), "https://site.example");
  assert.equal(url.pathname, "/register");
  assert.equal(url.searchParams.get("next"), TOURIST_VISA_PATH);
  assert.deepEqual([...url.searchParams.keys()], ["next"], "nothing else in the address");
  assert.equal(touristVisaNextPath(url.searchParams.get("next")), "/tourist-visa", "and the value it carries passes the rule");
  assert.equal(ENTRY_TEXT.footer, "Apply for a UK tourist visa online");
  assert.equal(ENTRY_TEXT.popup, "Continue to your full application");
});

test("OPEN ONLY: the form counts as open only for a clear open from the server together with this build's own hold passing", () => {
  const open = (server, held, preview) => availabilityOf(server, held, preview) === "open";
  assert.equal(open("open", 0, false), true);
  assert.equal(open("open", 3, true), true, "preview mode ignores the hold");
  for (const [server, held, preview] of [["unknown", 0, false], ["closed", 0, false], ["open", 2, false], ["unknown", 0, true], ["closed", 0, true]]) assert.equal(open(server, held, preview), false, `${server} ${held} ${preview}`);
});

test("OPEN ONLY: the carried next exists only while the form is open", () => {
  assert.equal(carriedNext(true, "?next=/tourist-visa"), "/tourist-visa");
  assert.equal(carriedNext(false, "?next=/tourist-visa"), null);
  assert.equal(carriedNext(true, "?next=//evil.example"), null);
  assert.equal(carriedNext(false, "?next=//evil.example"), null);
  assert.equal(carriedNext(true, ""), null);
  assert.equal(carriedNext("open", "?next=/tourist-visa") === "/tourist-visa", true, "a truthy value counts; the hooks only ever pass true or false");
});

test("the popup offers the full application only when open, after a UK tourist visa assessment was sent", () => {
  const base = { open: true, success: "Thank you", visaType: "Tourist Visa", destinationCountry: "United Kingdom" };
  assert.equal(shouldOfferFullApplication(base), true);
  for (const change of [{ open: false }, { success: null }, { success: "" }, { visaType: "Student Visa" }, { visaType: "Transit Visa" }, { visaType: "" }, { destinationCountry: "Germany" }, { destinationCountry: "Other" }, { destinationCountry: "" }]) {
    assert.equal(shouldOfferFullApplication({ ...base, ...change }), false, JSON.stringify(change));
  }
  assert.equal(shouldOfferFullApplication({ ...base, open: "yes" }), false, "only a real true opens it");
});

test("the next of an address bar is read in ONE place: safeRedirect.ts and the login form, which hands it to the same rule", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(SRC);
  const readers = files.filter((file) => /\.get\(\s*["']next["']\s*\)|searchParams\.next\b/.test(fs.readFileSync(file, "utf8"))).map((file) => path.relative(SRC, file).replace(/\\/g, "/")).sort();
  assert.deepEqual(readers, ["components/login-form.tsx", "utils/safeRedirect.ts"]);
  assert.match(read("components/login-form.tsx"), /postLoginDestination\(isAdminRole\(user\.role\), next\)/);
  for (const file of ["app/register/page.tsx", "components/signup-form.tsx"]) assert.match(read(file), /carriedNext\(open, window\.location\.search\)/, file);
  assert.match(read("hooks/useTouristVisaEntry.ts"), /carriedNext\(open, search\)/);
});

// ---------------------------------------------------------------------------
// The real components
// ---------------------------------------------------------------------------

const fakeLink = ({ href, children, ...rest }) => React.createElement("a", { href, ...rest }, children);
const icon = () => null;
const state = { availability: "loading", user: null };
const fakes = () => ({
  "next/link": { __esModule: true, default: fakeLink },
  "react-icons/fa": { FaFacebookF: icon, FaTwitter: icon, FaLinkedinIn: icon, FaInstagram: icon, FaPhone: icon, FaEnvelope: icon, FaMapMarkerAlt: icon },
  "@/context/SettingsContext": { useSettings: () => ({ settings: { websiteTitle: "Test Site", logoUrl: "", socialLinks: {}, address: "1 Test Street", emailAddress: "test@example.com", phoneNumber: "+440000000000" } }) },
  "@/redux/hooks": { useAppSelector: (select) => select({ auth: { user: state.user } }), useAppDispatch: () => () => {} },
  "@/hooks/useTouristVisaOpen": { useTouristVisaAvailability: () => state.availability },
});
const setState = (availability, user = null) => {
  state.availability = availability;
  state.user = user;
};
const USER = { _id: "u1", name: "Test User", email: "test.user@example.com", role: 0 };

/** The anchors of rendered HTML: [{ href, text, attrs }] (attrs is the whole opening tag). */
const anchors = (html) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1], href: (/href="([^"]*)"/.exec(m[1]) || [])[1], text: m[2].replace(/<[^>]*>/g, "").trim() }));
const footerHtml = (availability, user) => {
  setState(availability, user);
  const { module } = loadTsx("components/Footer.tsx", { mocks: fakes() });
  return renderToStaticMarkup(React.createElement(module.default));
};

test("FOOTER: no new link while the form is loading, closed or failed (the status hook answers loading or closed): the column is as it always was", () => {
  const closed = footerHtml("closed", null);
  const loading = footerHtml("loading", null);
  for (const html of [closed, loading]) {
    assert.equal(html.includes(ENTRY_TEXT.footer), false);
    assert.equal(html.includes("/register?next="), false);
    const services = html.slice(html.indexOf("Our Services"), html.indexOf("Quick Links"));
    assert.equal((services.match(/<li>/g) || []).length, 2, "Student Visa and Tourist Visa only");
    assert.deepEqual(anchors(services).map((a) => a.text), ["Student Visa", "Tourist Visa"]);
  }
  assert.equal(closed, loading, "closed and loading are the same page");
  assert.equal(footerHtml("closed", USER), closed, "signed in or not makes no difference while closed");
});

test("FOOTER: when the form is open the link is in Our Services, in the same style as the others, in the same tab", () => {
  const html = footerHtml("open", null);
  const services = html.slice(html.indexOf("Our Services"), html.indexOf("Quick Links"));
  const links = anchors(services);
  assert.deepEqual(links.map((a) => a.text), ["Student Visa", "Tourist Visa", "Apply for a UK tourist visa online"]);
  const added = links[2];
  assert.equal(added.href, "/register?next=/tourist-visa", "not signed in: the sign-up page carrying next");
  assert.equal(/target=|rel=/.test(added.attrs), false, "same tab: no target");
  const classOf = (link) => (/class="([^"]*)"/.exec(link.attrs) || [])[1];
  assert.equal(classOf(added), classOf(links[1]), "the same classes as the other footer links");
  assert.equal((html.match(/Apply for a UK tourist visa online/g) || []).length, 1, "once");
  assert.equal(anchors(footerHtml("open", USER)).find((a) => a.text === ENTRY_TEXT.footer).href, "/tourist-visa", "signed in: straight to the application");
});

const popupPanel = (user) => {
  setState("open", user);
  const { module } = loadTsx("components/AssessmentForm/FullApplicationPanel.tsx", { mocks: fakes() });
  return module.FullApplicationPanel;
};

test("POPUP PANEL: the button says Continue to your full application, opens the application in the same tab, and can be reached and seen on a keyboard at 375 px", () => {
  const html = renderToStaticMarkup(React.createElement(popupPanel(null), { href: touristVisaEntryHref(false), onClose() {} }));
  const [button] = anchors(html);
  assert.equal(button.text, "Continue to your full application");
  assert.equal(button.href, "/register?next=/tourist-visa");
  assert.equal(/target=|rel=/.test(button.attrs), false, "same tab");
  assert.equal(/tabindex="-1"/.test(html), false, "reachable by Tab");
  assert.match(button.attrs, /focus-visible:ring-2/, "a visible focus style");
  assert.match(button.attrs, /min-h-11/, "at least 44 px tall to tap");
  assert.match(html, /flex flex-col gap-3 sm:flex-row/, "stacked at 375 px, side by side from small screens");
  assert.ok(html.indexOf("Continue to your full application") < html.indexOf(">Close<"), "the button comes first in the tab order, then Close");
  assert.match(html, /<button[^>]*type="button"[^>]*>Close<\/button>/);
  // Signed in: straight to the application.
  assert.equal(anchors(renderToStaticMarkup(React.createElement(popupPanel(USER), { href: touristVisaEntryHref(true), onClose() {} })))[0].href, "/tourist-visa");
});

test("POPUP PANEL: the button takes the keyboard focus when the panel appears", () => {
  setState("open", null);
  const focused = [];
  // The ref of the link is replaced by one that holds a fake element, so the effect's call of focus() can be seen.
  const { module, effects } = loadTsx("components/AssessmentForm/FullApplicationPanel.tsx", { mocks: fakes(), reactOverrides: { useRef: () => ({ current: { focus: () => focused.push("link") } }) } });
  renderToStaticMarkup(React.createElement(module.FullApplicationPanel, { href: "/tourist-visa", onClose() {} }));
  assert.equal(effects.length, 1);
  assert.deepEqual(focused, [], "not before the effect runs");
  effects[0]();
  assert.deepEqual(focused, ["link"]);
  assert.match(read("components/AssessmentForm/FullApplicationPanel.tsx"), /ref=\{linkRef\}/, "and the ref is on the button's link");
});

// ---- the whole popup (the assessment form), with its own hooks replaced

function popup({ availability, success, visaType = "Tourist Visa", destinationCountry = "United Kingdom", user = null }) {
  setState(availability, user);
  const dispatched = [];
  const closed = [];
  const timeouts = [];
  const mocks = {
    ...fakes(),
    "react-redux": { useSelector: (select) => select({ auth: { user }, formSubmission: { success, error: null, isSubmitting: false } }), useDispatch: () => (action) => dispatched.push(action) },
    "@/redux/slices/formSubmission/formSubmissionSlice": { clearError: () => ({ type: "clearError" }), clearSuccess: () => ({ type: "clearSuccess" }) },
    "@/hooks/useAssessmentForm": {
      useAssessmentForm: () => ({
        formData: { visaType, destinationCountry, name: "", email: "", phone: "" },
        currentStep: 3,
        validationErrors: {},
        isSubmitting: false,
        handleInputChange() {}, handleFileChange: () => () => {}, removeFile() {}, handleNextStep() {}, handlePreviousStep() {}, handleSubmit() {}, setCurrentStep() {},
      }),
    },
    "next/image": { __esModule: true, default: () => null },
    "./PersonalInfoStep": { PersonalInfoStep: () => null },
    "./TravelDetailsStep": { TravelDetailsStep: () => null },
    "./DocumentsStep": { DocumentsStep: () => null },
  };
  const { module, effects } = loadTsx("components/AssessmentForm/index.tsx", { mocks });
  const html = renderToStaticMarkup(React.createElement(module.default, { isOpen: true, onClose: () => closed.push(1) }));
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => { timeouts.push(ms); return 0; };
  globalThis.clearTimeout = () => {};
  try {
    for (const effect of effects) effect();
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
  return { html, timeouts, dispatched, closed };
}

test("POPUP: open, UK tourist visa, assessment sent: the panel with the button replaces the form, and the popup does not close by itself", () => {
  const { html, timeouts } = popup({ availability: "open", success: "Your assessment was submitted." });
  assert.match(html, /data-testid="full-application-panel"/);
  assert.equal(anchors(html).find((a) => a.text === "Continue to your full application").href, "/register?next=/tourist-visa");
  assert.equal(html.includes('id="assessment-form"'), false, "the form is gone, so it cannot be sent twice");
  assert.deepEqual(timeouts, [], "no automatic close");
  assert.equal(anchors(popup({ availability: "open", success: "ok", user: USER }).html).find((a) => a.text === ENTRY_TEXT.popup).href, "/tourist-visa");
});

test("POPUP: loading, closed or failed, or another visa, or no success yet: exactly as before (the form, and the three-second close after success)", () => {
  for (const availability of ["loading", "closed"]) {
    const sent = popup({ availability, success: "Your assessment was submitted." });
    assert.equal(sent.html.includes("Continue to your full application"), false, availability);
    assert.equal(sent.html.includes("full-application-panel"), false);
    assert.equal(sent.html.includes('id="assessment-form"'), true, "the form is still there");
    assert.deepEqual(sent.timeouts, [3000], `${availability}: it still closes after three seconds`);
    const idle = popup({ availability, success: null });
    assert.equal(idle.html.includes("Continue to your full application"), false);
    assert.deepEqual(idle.timeouts, []);
  }
  for (const other of [{ visaType: "Student Visa" }, { visaType: "Transit Visa" }, { destinationCountry: "Germany" }]) {
    const sent = popup({ availability: "open", success: "Your assessment was submitted.", ...other });
    assert.equal(sent.html.includes("Continue to your full application"), false, JSON.stringify(other));
    assert.deepEqual(sent.timeouts, [3000]);
  }
  const before = popup({ availability: "open", success: null });
  assert.equal(before.html.includes("Continue to your full application"), false, "open, but nothing has been sent yet");
  assert.equal(before.html.includes("Free Visa Assessment"), true);
});

test("POPUP: closing from the panel forgets the success, so the popup opens as a fresh form next time", () => {
  const source = read("components/AssessmentForm/index.tsx");
  assert.match(source, /const handleClose = \(\) => \{\s*if \(offerFullApplication\) \{\s*setNotification\(null\);\s*dispatch\(clearSuccess\(\)\);\s*\}\s*onClose\(\);\s*\};/);
  assert.match(source, /<FullApplicationPanel href=\{touristVisaEntry\.href\} onClose=\{handleClose\} \/>/);
  assert.equal((source.match(/onClick=\{onClose\}/g) || []).length, 0, "every close goes through handleClose");
});

// ---- the sign-up and login pages

function page(file, exportName, { availability, user = null, search = "", carried = null, pageState = {}, runs = 1 }) {
  setState(availability, user);
  const pushes = [];
  const replaces = [];
  const router = { push: (to) => pushes.push(to), replace: (to) => replaces.push(to) };
  const thunk = Object.assign(() => ({ type: "thunk" }), { fulfilled: { match: () => false } });
  const mocks = {
    ...fakes(),
    "@/redux/hooks": { useAppSelector: (select) => select({ auth: { user, loading: false, error: null, success: null, ...pageState } }), useAppDispatch: () => () => ({}) },
    "next/navigation": { useRouter: () => router, usePathname: () => "/" },
    "@/redux/slices/auth/authSlice": { register: thunk, login: thunk, clearError: () => ({ type: "clearError" }) },
    "framer-motion": { motion: {} },
    // The carried next that the page would hold after it has mounted (the hook reads the address bar in an effect, which a server render does not run).
    "@/hooks/useTouristVisaEntry": { useCarriedNext: () => ({ open: availability === "open", next: carried }) },
  };
  const { module, effects } = loadTsx(file, { mocks });
  globalThis.window = { location: { search } };
  const html = renderToStaticMarkup(React.createElement(module[exportName]));
  // `runs` more than one stands for the effect running again (its dependencies changed, for instance the status answered later).
  for (let run = 0; run < runs; run += 1) for (const effect of effects) effect();
  return { html, pushes, replaces };
}

const REGISTER = ["app/register/page.tsx", "default"];
const SIGNUP = ["components/signup-form.tsx", "SignupForm"];
const LOGIN = ["components/login-form.tsx", "LoginForm"];

test("SIGN-UP (/register): the sign-in link carries next only while the form is open", () => {
  const open = page(...REGISTER, { availability: "open", carried: "/tourist-visa" });
  assert.equal(anchors(open.html).find((a) => a.text === "Sign in").href, "/login?next=/tourist-visa");
  for (const availability of ["loading", "closed"]) {
    const html = page(...REGISTER, { availability, carried: null }).html;
    assert.equal(anchors(html).find((a) => a.text === "Sign in").href, "/login");
  }
  assert.equal(anchors(page(...REGISTER, { availability: "open", carried: null }).html).find((a) => a.text === "Sign in").href, "/login", "open but no next: unchanged");
});

test("SIGN-UP (/register): after success a person goes to the carried next while open; otherwise home, exactly as before", () => {
  assert.deepEqual(page(...REGISTER, { availability: "open", user: USER, search: "?next=/tourist-visa" }).pushes, ["/tourist-visa"]);
  assert.deepEqual(page(...REGISTER, { availability: "open", user: USER, search: "?next=%2Ftourist-visa%2F2A%3Fx%3D1" }).pushes, ["/tourist-visa/2A?x=1"]);
  assert.deepEqual(page(...REGISTER, { availability: "open", user: USER, search: "" }).pushes, ["/"]);
  for (const availability of ["loading", "closed"]) assert.deepEqual(page(...REGISTER, { availability, user: USER, search: "?next=/tourist-visa" }).pushes, ["/"], availability);
  for (const bad of ["?next=//evil.example", "?next=https://evil.example", "?next=/tourist-visaX", "?next=/tourist-visa/../admin", "?next=/Tourist-Visa", "?next=/admin/users", "?next=javascript:alert(1)", "?next=/tourist-visa%252Fx"]) {
    assert.deepEqual(page(...REGISTER, { availability: "open", user: USER, search: bad }).pushes, ["/"], bad);
  }
  assert.deepEqual(page(...REGISTER, { availability: "open", user: null, search: "?next=/tourist-visa" }).pushes, [], "nobody is moved before they are signed up");
});

test("SIGN-UP (/register): the person is moved once, even if the effect runs again (for instance when the status answers after they were already signed in)", () => {
  assert.deepEqual(page(...REGISTER, { availability: "open", user: USER, search: "?next=/tourist-visa", runs: 3 }).pushes, ["/tourist-visa"]);
  assert.deepEqual(page(...REGISTER, { availability: "loading", user: USER, search: "?next=/tourist-visa", runs: 3 }).pushes, ["/"]);
});

test("SIGN-UP (the /signup page and its SignupForm component): the sign-in link carries next while open, and after sign-up it moves on only to a valid carried next", () => {
  assert.equal(anchors(page(...SIGNUP, { availability: "open", carried: "/tourist-visa" }).html).find((a) => a.text === "Sign in").href, "/login?next=/tourist-visa");
  assert.equal(anchors(page(...SIGNUP, { availability: "closed", carried: null }).html).find((a) => a.text === "Sign in").href, "/login");
  assert.deepEqual(page(...SIGNUP, { availability: "open", user: USER, search: "?next=/tourist-visa" }).pushes, ["/tourist-visa"]);
  // This form never moved on by itself, and still does not.
  assert.deepEqual(page(...SIGNUP, { availability: "open", user: USER, search: "" }).pushes, []);
  for (const availability of ["loading", "closed"]) assert.deepEqual(page(...SIGNUP, { availability, user: USER, search: "?next=/tourist-visa" }).pushes, [], availability);
  for (const bad of ["?next=//evil.example", "?next=/tourist-visaX", "?next=/tourist-visa/../admin", "?next=/admin"]) assert.deepEqual(page(...SIGNUP, { availability: "open", user: USER, search: bad }).pushes, [], bad);
  assert.deepEqual(page(...SIGNUP, { availability: "open", user: null, search: "?next=/tourist-visa" }).pushes, []);
});

test("LOGIN: the sign-up link carries next only while open; after sign-in a valid next is used, anything else keeps the usual defaults", () => {
  assert.equal(anchors(page(...LOGIN, { availability: "open", carried: "/tourist-visa" }).html).find((a) => a.text === "Sign up").href, "/register?next=/tourist-visa");
  for (const availability of ["loading", "closed"]) assert.equal(anchors(page(...LOGIN, { availability, carried: null }).html).find((a) => a.text === "Sign up").href, "/register");
  const target = (user, search, availability = "open") => page(...LOGIN, { availability, user, search }).pushes;
  assert.deepEqual(target(USER, "?next=/tourist-visa"), ["/tourist-visa"]);
  assert.deepEqual(target(USER, "?next=%2Ftourist-visa%2F2A"), ["/tourist-visa/2A"]);
  // The login page has always honoured a valid next, whatever the status says (the application's own page sends people here with one).
  assert.deepEqual(target(USER, "?next=/tourist-visa", "closed"), ["/tourist-visa"]);
  assert.deepEqual(target(USER, ""), ["/"]);
  assert.deepEqual(target({ ...USER, role: 1 }, ""), ["/admin/users"]);
  for (const bad of ["?next=//evil.example", "?next=https://evil.example", "?next=/tourist-visaX", "?next=/tourist-visa/../admin", "?next=/Tourist-Visa", "?next=/admin/users", "?next=javascript:alert(1)", "?next=/tourist-visa.evil.com"]) {
    assert.deepEqual(target(USER, bad), ["/"], `user ${bad}`);
    assert.deepEqual(target({ ...USER, role: 1 }, bad), ["/admin/users"], `admin ${bad}`);
  }
});

test("no page puts anything personal in an address: the only value ever carried is the fixed /tourist-visa path, and the links are built from it alone", () => {
  assert.match(read("components/Footer.tsx"), /href: touristVisaEntry\.href/, "the footer link is the entry href and nothing else");
  for (const file of ["app/register/page.tsx", "components/signup-form.tsx", "components/login-form.tsx", "components/AssessmentForm/index.tsx", "components/AssessmentForm/FullApplicationPanel.tsx", "hooks/useTouristVisaEntry.ts"]) {
    const source = read(file);
    assert.equal(/\?next=\$\{(?!nextQuery)/.test(source), false, file);
    assert.equal(/email|name=|password/i.test((source.match(/href=\{[^}]*\}/g) || []).join(" ")), false, `${file}: no personal field in a link`);
  }
});
