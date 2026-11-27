// Run with: npm run test:unit   (from client/). All names, addresses and messages are made up.
// The visitor's chat bubble and panel: which pages show it, the way back after signing in (the safe-redirect rule), what the status answer
// means, the hours words, the bubble's label, the first message, the retry id, the draft, polling decisions, and safe drawing of text.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CHAT_PAGES,
  CHAT_QUERY,
  allowedNextPath,
  carriedNext,
  chatNextPath,
  chatReturnPath,
  chatSignInHref,
  nextDestination,
  nextFromSearch,
  nextQuery,
  postLoginDestination,
  touristVisaNextPath,
} from "./safeRedirect.ts";
import {
  CLIENT_MESSAGE_MAX,
  DRAFT_KEY,
  FALLBACK_HOURS_TEXT,
  OPEN_CHAT_EVENT,
  bubbleLabel,
  cleanPhone,
  cleanSubject,
  describeSendError,
  hoursLines,
  isChatPage,
  normalisePath,
  pollPlan,
  readChatStatus,
  readDraft,
  requestChat,
  sendIdFor,
  shouldShowBubble,
  wantsPanelOpen,
  withoutChatParam,
  writeDraft,
} from "./chatWidget.ts";
import { loadTsx, React } from "./loadTsx.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");
const read = (file) => fs.readFileSync(path.join(SRC, file), "utf8");
const h = React.createElement;

// ---------------------------------------------------------------------------
// Which pages show the bubble
// ---------------------------------------------------------------------------

test("the allow-list is exactly the six public pages", () => {
  assert.deepEqual([...CHAT_PAGES], ["/", "/about", "/services", "/contact", "/privacy", "/terms"]);
  for (const page of CHAT_PAGES) assert.equal(isChatPage(page), true, page);
  assert.equal(isChatPage("/about/"), true, "a trailing slash is the same page");
  assert.equal(isChatPage(""), true, "an empty path is the home page");
});

test("no other page has the bubble: the Tourist Visa pages, the admin, sign-in and sign-up, look-alikes and nonsense", () => {
  for (const other of [
    "/tourist-visa", "/tourist-visa/2A", "/tourist-visa/review", "/admin", "/admin/contacts", "/admin/products", "/login", "/login-01", "/register", "/signup", "/sidebar-06",
    "/services/tourist-visa", "/about/us", "/contact/thanks", "/About", "/ABOUT", "/aboutx", "/privacy-policy", "/terms-and-conditions", "//about", "/about?x=1", "/about#top", "about", " /about",
  ]) {
    assert.equal(isChatPage(other), false, other);
  }
  for (const nothing of [null, undefined, 5, {}, ["/about"]]) assert.equal(isChatPage(nothing), false, `not a path: ${JSON.stringify(nothing)}`);
  assert.equal(normalisePath("/about///"), "/about");
});

test("the bubble is drawn only when the page is on the list, chat is on, and the person is not an administrator", () => {
  assert.equal(shouldShowBubble({ pathname: "/", chat: "on", isAdmin: false }), true);
  assert.equal(shouldShowBubble({ pathname: "/contact", chat: "on", isAdmin: false }), true);
  assert.equal(shouldShowBubble({ pathname: "/about", chat: "off", isAdmin: false }), false, "chat is off");
  assert.equal(shouldShowBubble({ pathname: "/about", chat: "unknown", isAdmin: false }), false, "not known yet: nothing is drawn");
  assert.equal(shouldShowBubble({ pathname: "/about", chat: "on", isAdmin: true }), false, "never for an administrator");
  assert.equal(shouldShowBubble({ pathname: "/tourist-visa", chat: "on", isAdmin: false }), false);
  assert.equal(shouldShowBubble({ pathname: "/admin/contacts", chat: "on", isAdmin: false }), false);
  assert.equal(shouldShowBubble({ pathname: "/login", chat: "on", isAdmin: false }), false);
});

// ---------------------------------------------------------------------------
// The way back after signing in: the safe-redirect rule
// ---------------------------------------------------------------------------

test("chat next: accepted ONLY as one of the six pages followed by exactly ?chat=open", () => {
  assert.equal(CHAT_QUERY, "chat=open");
  for (const page of CHAT_PAGES) {
    assert.equal(chatNextPath(`${page}?chat=open`), `${page}?chat=open`, page);
    assert.equal(allowedNextPath(`${page}?chat=open`), `${page}?chat=open`, page);
  }
});

test("chat next: everything else is refused (other pages, other parameters, a fragment, other case, encoded tricks, other hosts, protocol-relative, backslashes, control characters)", () => {
  const bad = [
    null, undefined, "", 5, {}, [], "/", "/about", "/about?", "/about?chat", "/about?chat=", "/about?chat=close",
    "/admin?chat=open", "/admin/products?chat=open", "/login?chat=open", "/register?chat=open", "/signup?chat=open", "/login-01?chat=open", "/sidebar-06?chat=open",
    "/tourist-visa/2A?chat=open", "/services/tourist-visa?chat=open", "/about/us?chat=open", "/aboutx?chat=open", "/contact/?chat=open", "/about/?chat=open",
    "/about?chat=open&x=1", "/about?x=1&chat=open", "/about?chat=open&chat=open", "/about?chat=open#top", "/about?chat=open#", "/about?chat=open ",
    "/About?chat=open", "/ABOUT?chat=open", "/about?CHAT=open", "/about?chat=OPEN", "/about?chat=Open",
    "/about%3Fchat=open", "/about?chat%3Dopen", "/%61bout?chat=open", "/about%3fchat%3dopen", "/%2Fabout?chat=open", "/about?chat=%6Fpen", "/..%2fabout?chat=open", "/about%2e?chat=open", "/about?chat=open%25",
    "//evil.example/?chat=open", "//about?chat=open", "///about?chat=open", "https://evil.example/about?chat=open", "http://localhost:3000/?chat=open", "javascript:alert(1)//?chat=open", "data:text/html,x?chat=open",
    "/\\evil.example?chat=open", "\\\\evil.example\\about?chat=open", "/about\\?chat=open", "/\\/evil.example?chat=open",
    "/about?chat=open\n", "/about?chat=open\r\n", "/about\n?chat=open", "/\t/evil.example?chat=open", "/about?chat=open\u0000", "/about?chat=open\u202e", "/about\u200b?chat=open",
    "/./about?chat=open", "/../about?chat=open", "/about/../admin?chat=open", "/about/.?chat=open", "/about;/..?chat=open",
    `/about?chat=open${"x".repeat(600)}`,
    "/\uff0fevil.example?chat=open",
  ];
  for (const value of bad) {
    assert.equal(chatNextPath(value), null, JSON.stringify(value));
    if (typeof value === "string" && !value.startsWith("/tourist-visa")) assert.equal(allowedNextPath(value), null, `allowedNextPath ${JSON.stringify(value)}`);
  }
});

test("the Tourist Visa rule is unchanged, and the two rules do not borrow from each other", () => {
  assert.equal(touristVisaNextPath("/tourist-visa"), "/tourist-visa");
  assert.equal(touristVisaNextPath("/about?chat=open"), null, "the Tourist Visa rule does not accept the chat form");
  assert.equal(chatNextPath("/tourist-visa"), null, "the chat rule does not accept the Tourist Visa path");
  assert.equal(allowedNextPath("/tourist-visa/2A?x=1"), "/tourist-visa/2A?x=1");
  assert.equal(allowedNextPath("/tourist-visaX"), null);
});

test("the way back from the sign-in addresses: the page with the chat open, and an administrator never lands there", () => {
  assert.equal(chatReturnPath("/about"), "/about?chat=open");
  assert.equal(chatReturnPath("/about/"), "/about?chat=open");
  assert.equal(chatReturnPath("/"), "/?chat=open");
  assert.equal(chatReturnPath(""), "/?chat=open");
  assert.equal(chatReturnPath("/tourist-visa/2A"), "/?chat=open", "a page that is not on the list comes back to the home page");
  assert.equal(chatReturnPath("//evil.example"), "/?chat=open");
  assert.equal(chatReturnPath(undefined), "/?chat=open");
  assert.equal(chatSignInHref("login", "/about"), "/login?next=/about%3Fchat%3Dopen");
  assert.equal(chatSignInHref("register", "/contact"), "/register?next=/contact%3Fchat%3Dopen");
  assert.equal(chatSignInHref("login", "/"), "/login?next=/%3Fchat%3Dopen");
  // What the sign-in page reads back from that address is exactly the path that was meant.
  for (const page of CHAT_PAGES) {
    const href = chatSignInHref("login", page);
    const search = href.slice(href.indexOf("?"));
    assert.equal(nextFromSearch(search), `${page}?chat=open`, page);
    assert.equal(nextDestination(search, "/fallback"), `${page}?chat=open`, page);
    assert.equal(postLoginDestination(false, nextFromSearch(search)), `${page}?chat=open`, page);
    assert.equal(postLoginDestination(true, nextFromSearch(search)), "/admin/products", `an administrator does not follow it: ${page}`);
  }
  assert.equal(postLoginDestination(false, "/about"), "/", "the plain page is not a chat way back");
  assert.equal(postLoginDestination(false, "//evil.example/?chat=open"), "/");
  assert.equal(postLoginDestination(true, "/tourist-visa"), "/tourist-visa", "the Tourist Visa way back is as it was, even for an administrator");
  assert.equal(nextQuery("/about?chat=open"), "?next=/about%3Fchat%3Dopen");
  assert.equal(nextQuery("/about?chat=close"), "");
});

test("the sign-in pages carry the chat way back whatever the Tourist Visa switch says; the Tourist Visa way back only while it is open (as before)", () => {
  assert.equal(carriedNext(false, "?next=/about%3Fchat%3Dopen"), "/about?chat=open");
  assert.equal(carriedNext(true, "?next=/about%3Fchat%3Dopen"), "/about?chat=open");
  assert.equal(carriedNext(false, "?next=/tourist-visa"), null);
  assert.equal(carriedNext(true, "?next=/tourist-visa"), "/tourist-visa");
  assert.equal(carriedNext(true, "?next=/admin/products"), null);
  assert.equal(carriedNext(false, "?next=//evil.example/?chat=open"), null);
  assert.equal(carriedNext(false, ""), null);
});

// ---------------------------------------------------------------------------
// The status answer and the hours
// ---------------------------------------------------------------------------

test("the status answer: chat is on only for a 200 that says enabled exactly true; anything else is off", () => {
  const hours = { openNow: true, text: "We usually reply between 12 PM and 9 PM (Pakistan time)", backText: null };
  assert.deepEqual(readChatStatus(200, { success: true, data: { enabled: true, hours } }), { state: "on", hours });
  assert.deepEqual(readChatStatus(200, { data: { enabled: true } }), { state: "on", hours: null }, "on, without hours");
  for (const [status, json] of [[200, { data: { enabled: false } }], [200, { data: { enabled: "true" } }], [200, { data: { enabled: 1 } }], [200, { data: {} }], [200, { data: null }], [200, {}], [200, null], [200, []], [200, "x"], [404, { data: { enabled: true } }], [500, { data: { enabled: true } }], [0, null], [204, null]]) {
    assert.deepEqual(readChatStatus(status, json), { state: "off", hours: null }, JSON.stringify([status, json]));
  }
});

test("the hours words: the usual hours always; when the team is away, when they are back and that messages are still welcome", () => {
  assert.deepEqual(hoursLines({ openNow: true, text: "We usually reply between 12 PM and 9 PM (Pakistan time)" }), { usual: "We usually reply between 12 PM and 9 PM (Pakistan time)", back: null, outside: false });
  const away = hoursLines({ openNow: false, text: "We usually reply between 12 PM and 9 PM (Pakistan time)", backText: "We are back tomorrow at 12 PM (Pakistan time)" });
  assert.equal(away.outside, true);
  assert.equal(away.back, "We are back tomorrow at 12 PM (Pakistan time)");
  assert.deepEqual(hoursLines(null), { usual: FALLBACK_HOURS_TEXT, back: null, outside: false }, "no hours known: the usual sentence, no claim about now");
  assert.equal(FALLBACK_HOURS_TEXT, "We usually reply between 12 PM and 9 PM (Pakistan time)");
  assert.equal(hoursLines({ openNow: false, text: "   " }).usual, FALLBACK_HOURS_TEXT);
  assert.equal(hoursLines({ openNow: false, backText: "" }).back, null);
  assert.equal(hoursLines({ openNow: true, backText: "ignored while open" }).back, null);
});

// ---------------------------------------------------------------------------
// The bubble label, the first message, the retry id, the words
// ---------------------------------------------------------------------------

test("the bubble's name: 'Chat with us', and the unread count when there is one (99+ is spoken as more than 99)", () => {
  assert.equal(bubbleLabel(0), "Chat with us");
  assert.equal(bubbleLabel(undefined), "Chat with us");
  assert.equal(bubbleLabel(-3), "Chat with us");
  assert.equal(bubbleLabel(1), "Chat with us, 1 unread message");
  assert.equal(bubbleLabel(3), "Chat with us, 3 unread messages");
  assert.equal(bubbleLabel(99), "Chat with us, 99 unread messages");
  assert.equal(bubbleLabel(100), "Chat with us, more than 99 unread messages");
});

test("the first message: the topic is one line of at most 80 characters, the phone follows the server's rule, both may be empty", () => {
  assert.deepEqual(cleanSubject("  A   topic\nhere "), { value: "A topic here", error: null });
  assert.deepEqual(cleanSubject(undefined), { value: "", error: null });
  assert.equal(cleanSubject("x".repeat(80)).error, null);
  assert.match(cleanSubject("x".repeat(81)).error, /at most 80/);
  assert.deepEqual(cleanPhone(""), { value: "", error: null });
  assert.deepEqual(cleanPhone(" +92 300 1234567 "), { value: "+92 300 1234567", error: null });
  assert.equal(cleanPhone("(021) 555-0100").error, null);
  for (const bad of ["abc", "12", "1234", "+92 300 12x", "1".repeat(16), "<script>", "call me"]) assert.match(cleanPhone(bad).error, /valid phone number/, bad);
  assert.equal(CLIENT_MESSAGE_MAX, 2000);
});

test("a resend of the same words keeps the id of the failed attempt; different words get a new id", () => {
  let n = 0;
  const makeId = () => `id-${++n}`;
  const first = sendIdFor(null, "Hello there", makeId);
  assert.deepEqual(first, { text: "Hello there", id: "id-1" });
  assert.equal(sendIdFor(first, "Hello there", makeId), first, "the same words: the very same attempt");
  assert.equal(sendIdFor(first, "Hello there", makeId).id, "id-1");
  const edited = sendIdFor(first, "Hello there, again", makeId);
  assert.equal(edited.id, "id-2");
  assert.equal(sendIdFor(null, "Hello there", makeId).id, "id-3", "after a success the pending attempt is forgotten, so the same words are a new message");
});

test("the words for a failed send are fixed sentences chosen by the code; nothing from the server is shown", () => {
  assert.match(describeSendError(429, "TOO_MANY_MESSAGES"), /very quickly/);
  assert.match(describeSendError(400, "INVALID_PHONE"), /valid phone number/);
  assert.match(describeSendError(400, "FIRST_MESSAGE_ONLY"), /first message/);
  assert.match(describeSendError(400, "MESSAGE_TOO_LONG"), /too long/);
  assert.match(describeSendError(409, "CONVERSATION_FULL"), /call us/);
  assert.match(describeSendError(404, "FEATURE_CLOSED"), /not available/);
  assert.match(describeSendError(503, "CHAT_UNAVAILABLE"), /not available/);
  assert.match(describeSendError(401, null), /sign in again/);
  assert.match(describeSendError(0, null), /Could not reach the server/);
  assert.match(describeSendError(500, null), /Something went wrong/);
  assert.doesNotMatch(describeSendError(500, "<img src=x>"), /img/);
});

// ---------------------------------------------------------------------------
// The draft, opening, the address
// ---------------------------------------------------------------------------

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
}

test("the draft is kept for the tab: saved, read back, forgotten when empty, and a broken or blocked storage never throws", () => {
  const storage = fakeStorage();
  writeDraft(storage, { body: "Unsent words", subject: "A topic", phone: "" });
  assert.deepEqual(readDraft(storage), { body: "Unsent words", subject: "A topic", phone: "" });
  writeDraft(storage, { body: "", subject: "", phone: "" });
  assert.equal(DRAFT_KEY in storage.data, false, "nothing to keep: nothing kept");
  const empty = { body: "", subject: "", phone: "" };
  assert.deepEqual(readDraft(null), empty);
  assert.deepEqual(readDraft(fakeStorage({ [DRAFT_KEY]: "not json" })), empty);
  assert.deepEqual(readDraft(fakeStorage({ [DRAFT_KEY]: JSON.stringify({ body: 5, subject: null }) })), empty);
  assert.deepEqual(readDraft(fakeStorage({ [DRAFT_KEY]: "x".repeat(40000) })), empty);
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(readDraft(blocked), empty);
  assert.doesNotThrow(() => writeDraft(blocked, { body: "x", subject: "", phone: "" }));
  assert.doesNotThrow(() => writeDraft(null, { body: "x", subject: "", phone: "" }));
});

test("?chat=open opens the panel, and is removed from the address (with every other part kept)", () => {
  assert.equal(wantsPanelOpen("?chat=open"), true);
  assert.equal(wantsPanelOpen("?a=1&chat=open"), true);
  for (const no of ["", "?chat=close", "?chat=OPEN", "?chat", "?chatx=open", null, undefined, 5, `?chat=open${"x".repeat(3000)}`]) assert.equal(wantsPanelOpen(no), false, String(no));
  assert.equal(withoutChatParam("/about", "?chat=open", ""), "/about");
  assert.equal(withoutChatParam("/about", "?chat=open&a=1", "#top"), "/about?a=1#top");
  assert.equal(withoutChatParam("/", "", ""), "/");
});

test("the Contact page's button asks the bubble to open through a window event", () => {
  const seen = [];
  requestChat({ dispatchEvent: (event) => { seen.push(event.type); return true; } });
  assert.deepEqual(seen, [OPEN_CHAT_EVENT]);
  assert.doesNotThrow(() => requestChat(null));
});

// ---------------------------------------------------------------------------
// Polling decisions
// ---------------------------------------------------------------------------

test("what is polled: nothing for a logged-out visitor, an administrator or a ended session; the light unread check while the panel is closed; the conversation while it is open; nothing offline", () => {
  const base = { signedIn: true, chatOn: true, onChatPage: true, isAdmin: false, panelOpen: false, sessionExpired: false, offline: false };
  assert.equal(pollPlan(base), "badge");
  assert.equal(pollPlan({ ...base, panelOpen: true }), "conversation");
  assert.equal(pollPlan({ ...base, signedIn: false }), "none", "no polling at all for a logged-out visitor");
  assert.equal(pollPlan({ ...base, signedIn: false, panelOpen: true }), "none");
  assert.equal(pollPlan({ ...base, chatOn: false }), "none");
  assert.equal(pollPlan({ ...base, onChatPage: false }), "none");
  assert.equal(pollPlan({ ...base, isAdmin: true }), "none");
  assert.equal(pollPlan({ ...base, sessionExpired: true }), "none");
  assert.equal(pollPlan({ ...base, panelOpen: true, offline: true }), "none");
  assert.equal(pollPlan({ ...base, offline: true }), "badge", "the light check only fails quietly offline");
});

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const MESSAGES = [
  { id: "m1", sender: "client", seq: 1, createdAt: "2027-01-05T10:00:00.000Z", text: "<img src=x onerror=alert(1)> and <script>alert(2)</script>\nsecond line" },
  { id: "m2", sender: "staff", seq: 2, createdAt: "2027-01-05T10:05:00.000Z", text: "<b>Bold</b> & \"quotes\" " + "Supercalifragilistic".repeat(8), staff: { id: "s", name: "Hidden Staff Name" } },
  { id: "m3", sender: "staff", seq: 3, createdAt: "2027-01-05T10:06:00.000Z", text: null },
];

test("messages are drawn as TEXT: markup comes out escaped, never as an element; the visitor is 'You', the team is 'Wiser Consulting team' (no staff name)", () => {
  const { module } = loadTsx("components/chat/MessageList.tsx", { mocks: {} });
  const html = renderToStaticMarkup(h(module.MessageList, { messages: MESSAGES }));
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /<b>Bold/);
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;b&gt;Bold&lt;\/b&gt; &amp; &quot;quotes&quot;/);
  assert.match(html, /whitespace-pre-wrap/, "line breaks are kept by the style");
  assert.match(html, /\[overflow-wrap:anywhere\]/, "a very long word is broken");
  assert.match(html, />You</);
  assert.match(html, />Wiser Consulting team</);
  assert.doesNotMatch(html, /Hidden Staff Name/, "the visitor never sees which staff member wrote");
  assert.match(html, /This message could not be read\./);
  assert.match(html, /justify-end/, "the visitor's own messages are on the right");
  assert.match(html, /justify-start/, "the team's are on the left");
});

test("no message text is ever put in the page as HTML, and the widget uses no browser dialog", () => {
  for (const file of ["components/chat/ChatPanel.tsx", "components/chat/ChatWidget.tsx", "components/chat/ChatLauncher.tsx", "components/chat/MessageList.tsx", "app/contact/page.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/, file);
    assert.doesNotMatch(source, /\.innerHTML|insertAdjacentHTML|document\.write/, file);
    assert.doesNotMatch(source, /window\.confirm|\bconfirm\(|\balert\(|\bprompt\(/, file);
  }
});

function renderPanel(props, extraMocks = {}) {
  const mocks = {
    "next/link": { __esModule: true, default: ({ href, children, ...rest }) => h("a", { href, ...rest }, children) },
    "@/hooks/usePoller": { usePoller: () => () => {} },
    "@/hooks/useChatVisitor": { setSessionExpired: () => {} },
    "@/services/chatVisitorService": {},
    "@/services/chatAdminService": { ChatApiError: class ChatApiError extends Error {} },
    ...extraMocks,
  };
  const { module } = loadTsx("components/chat/ChatPanel.tsx", { mocks });
  const base = { titleId: "t", hours: { openNow: true, text: "We usually reply between 12 PM and 9 PM (Pakistan time)" }, signedIn: false, expired: false, pathname: "/about", offline: false, onClose: () => {}, onUnread: () => {}, announce: () => {} };
  return renderToStaticMarkup(h(module.ChatPanel, { ...base, ...props }));
}

test("the panel for a logged-out visitor: the title, the hours, the notice, and sign-in and sign-up links that bring them back to this page with the chat open", () => {
  const html = renderPanel({ signedIn: false, pathname: "/services" });
  assert.match(html, /Wiser Consulting team/);
  assert.match(html, /We usually reply between 12 PM and 9 PM \(Pakistan time\)/);
  assert.match(html, /Please don(&#x27;|')t share passport or bank details here\. Upload documents in your application\./);
  assert.match(html, /href="\/login\?next=\/services%3Fchat%3Dopen"/);
  assert.match(html, /href="\/register\?next=\/services%3Fchat%3Dopen"/);
  assert.match(html, /aria-label="Close the chat"/);
  assert.doesNotMatch(html, /<textarea/, "no message box until they are signed in");
  assert.doesNotMatch(html, /type="email"|name="name"|placeholder="[^"]*[Nn]ame|placeholder="[^"]*[Ee]mail/, "no name or email is ever asked for");
});

test("outside the hours the panel says when the team is back and that a message is still welcome; offline and ended-session notices", () => {
  const away = renderPanel({ signedIn: false, hours: { openNow: false, text: "We usually reply between 12 PM and 9 PM (Pakistan time)", backText: "We are back tomorrow at 12 PM (Pakistan time)" } });
  assert.match(away, /We are back tomorrow at 12 PM \(Pakistan time\)\. You can still leave a message/);
  assert.doesNotMatch(renderPanel({ signedIn: false }), /You can still leave a message/, "inside the hours there is no such note");
  const offline = renderPanel({ signedIn: false, offline: true });
  assert.match(offline, /role="alert"[^>]*>[^<]*<svg[^>]*aria-hidden="true"[^>]*>.*You are offline/s);
  const expired = renderPanel({ signedIn: true, expired: true });
  assert.match(expired, /Your session has ended\. Please sign in again/);
  assert.match(expired, /href="\/login\?next=/);
  assert.doesNotMatch(expired, /<textarea/);
});

test("a signed-in visitor sees a waiting message first, then the first-message form or the conversation (loaded by the browser)", () => {
  const html = renderPanel({ signedIn: true });
  assert.match(html, /role="status"[^>]*>.*Loading/s);
});

function renderWidget(unread, { open = false } = {}) {
  const mocks = {
    "@/hooks/useChatVisitor": {
      getVisitorUnreadStore: () => ({ restart() {}, refresh() {} }),
      refreshChatStatus: () => Promise.resolve(),
      syncVisitorUser: () => {},
      useSessionExpired: () => false,
      useVisitorUnread: () => ({ unread, conversations: unread > 0 ? 1 : 0, state: "ok" }),
    },
    "@/components/chat/ChatPanel": { ChatPanel: () => h("div", null, "THE PANEL") },
  };
  const { module } = loadTsx("components/chat/ChatWidget.tsx", { mocks, reactOverrides: open ? { useState: (initial) => [initial === false && open ? true : initial, () => {}] } : {} });
  return renderToStaticMarkup(h(module.ChatWidget, { pathname: "/", hours: null, signedIn: true, userKey: "someone" }));
}

test("the bubble: a real button with a name, bottom right clear of a phone's home bar, under dialogs, pulsing only by a class the CSS limits to 'no reduced motion'", () => {
  const html = renderWidget(0);
  assert.match(html, /<button[^>]*type="button"/);
  assert.match(html, /aria-label="Chat with us"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /\bfixed\b/);
  assert.match(html, /bottom-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(html, /right-\[max\(1rem,env\(safe-area-inset-right\)\)\]/);
  assert.match(html, /\bz-\(--z-chat-bubble\)/, "the bubble's layer is the named one (35): under the navbar (50), the phone menu, the chat panel and every dialog");
  assert.match(html, /\bh-14\b/);
  assert.match(html, /\bw-14\b/, "56 px, a comfortable tap target");
  assert.match(html, /focus-visible:ring-4/, "a visible focus ring");
  assert.doesNotMatch(html, /THE PANEL/, "closed: no panel");
  assert.doesNotMatch(html, /data-testid="unread-badge"/, "no unread, no badge");
  assert.match(html, /<svg[^>]*aria-hidden="true"/, "the icon is decoration");
});

test("the bubble with unread replies: the yellow badge, the count in its name, 99+ over 99", () => {
  const some = renderWidget(3);
  assert.match(some, /aria-label="Chat with us, 3 unread messages"/);
  assert.match(some, /data-testid="unread-badge"[^>]*>3</);
  assert.match(some, /chat-unread-badge/, "the same badge as the admin's");
  assert.doesNotMatch(some, /chat-bubble-pulse/, "it does not pulse while there is a badge: the badge draws the eye");
  const many = renderWidget(250);
  assert.match(many, />99\+</);
  assert.match(many, /aria-label="Chat with us, more than 99 unread messages"/);
});

function renderLauncher({ pathname, chat, user }) {
  const mocks = {
    "next/navigation": { usePathname: () => pathname },
    "@/redux/hooks": { useAppSelector: (select) => select({ auth: { user } }) },
    "@/hooks/useChatVisitor": { useChatStatus: () => ({ state: chat, hours: null }) },
    "@/components/chat/ChatWidget": { ChatWidget: (props) => h("div", { "data-widget": props.pathname, "data-signed-in": String(props.signedIn) }, "WIDGET") },
  };
  const { module } = loadTsx("components/chat/ChatLauncher.tsx", { mocks });
  return renderToStaticMarkup(h(module.ChatLauncher));
}

test("the launcher draws the widget only on the six pages, only when chat is on, never for an administrator, and nothing while it is not known", () => {
  const visitor = { name: "A Visitor", email: "a.visitor@example.invalid", role: 0 };
  const admin = { name: "An Admin", email: "an.admin@example.invalid", role: 1 };
  for (const page of CHAT_PAGES) assert.match(renderLauncher({ pathname: page, chat: "on", user: null }), /WIDGET/, page);
  assert.match(renderLauncher({ pathname: "/about", chat: "on", user: visitor }), /data-signed-in="true"/);
  assert.match(renderLauncher({ pathname: "/about", chat: "on", user: null }), /data-signed-in="false"/);
  assert.equal(renderLauncher({ pathname: "/about", chat: "off", user: visitor }), "", "chat is off: no bubble");
  assert.equal(renderLauncher({ pathname: "/about", chat: "unknown", user: visitor }), "", "not known: no bubble");
  assert.equal(renderLauncher({ pathname: "/about", chat: "on", user: admin }), "", "never for an administrator");
  for (const page of ["/tourist-visa", "/tourist-visa/2A", "/tourist-visa/review", "/admin/contacts", "/login", "/register", "/signup", "/login-01"]) {
    assert.equal(renderLauncher({ pathname: page, chat: "on", user: visitor }), "", page);
  }
});

test("the launcher is mounted once in the site layout, and no Tourist Visa, admin or sign-in page mounts a bubble of its own", () => {
  assert.match(read("app/ClientLayout.tsx"), /<ChatLauncher \/>/);
  for (const dir of ["app/tourist-visa", "app/admin", "app/login", "app/register", "app/signup"]) {
    const walk = (d) => fs.readdirSync(path.join(SRC, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
    for (const file of walk(dir)) if (/\.tsx?$/.test(file)) assert.doesNotMatch(read(file), /ChatWidget|ChatLauncher|ChatPanel/, file);
  }
});

// ---------------------------------------------------------------------------
// The Contact page
// ---------------------------------------------------------------------------

function renderContact({ chat, phone }) {
  const motion = new Proxy({}, { get: (_, tag) => ({ children, variants, initial, animate, transition, ...rest }) => h(tag, rest, children) });
  const mocks = {
    "framer-motion": { motion },
    "@/context/SettingsContext": { useSettings: () => ({ settings: { phoneNumber: phone } }) },
    "@/hooks/useChatVisitor": { useChatStatus: () => ({ state: chat, hours: null }) },
  };
  const { module } = loadTsx("app/contact/page.tsx", { mocks });
  return renderToStaticMarkup(h(module.default));
}

test("the Contact page with chat on: a 'Chat with us' button instead of the form, the notice, the Settings phone, address and map-side details kept", () => {
  const html = renderContact({ chat: "on", phone: "+92 111 222 3333" });
  assert.match(html, />Chat with us</);
  assert.doesNotMatch(html, /<form/, "the old form is not drawn");
  assert.doesNotMatch(html, /Send message/);
  assert.match(html, /Please don(&#x27;|')t share passport or bank details in the chat/);
  assert.match(html, /\+92 111 222 3333/, "the phone is the one of the Settings screen");
  assert.doesNotMatch(html, /\+92 370 970 6643/, "not the old hard-coded one");
});

test("the Contact page with chat off or not known: the old form exactly as it was, and the old phone only while Settings has none", () => {
  for (const chat of ["off", "unknown"]) {
    const html = renderContact({ chat, phone: "" });
    assert.match(html, /<form/);
    assert.match(html, /Send message/);
    assert.match(html, /name="subject"/);
    assert.doesNotMatch(html, />Chat with us</);
    assert.match(html, /\+92 370 970 6643/, "the old number is the fallback while the Settings phone is empty");
  }
  assert.match(renderContact({ chat: "off", phone: "+92 555 000 1111" }), /\+92 555 000 1111/);
});

// ---------------------------------------------------------------------------
// Colours and motion
// ---------------------------------------------------------------------------

const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hex = (v) => [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(hex(a)), luminance(hex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("the bubble's colours pass WCAG on the pages' light backgrounds and on the footer's dark one", () => {
  const green = "#047857"; // emerald-700, the bubble and the panel header
  const footer = "#020617"; // slate-950, the footer's background (components/Footer.tsx)
  const lightText = "#ecfdf5"; // emerald-50, the hours line in the header
  const figures = {
    "white icon on the bubble": contrast("#ffffff", green),
    "the bubble against a white page": contrast(green, "#ffffff"),
    "the bubble against the light grey page": contrast(green, "#f8fafc"),
    "the bubble against the dark footer": contrast(green, footer),
    "the bubble's white ring against the dark footer": contrast("#ffffff", footer),
    "the hours line on the panel header": contrast(lightText, green),
    "the notice text on its grey": contrast("#334155", "#f8fafc"),
  };
  console.log(`      bubble contrast: ${Object.entries(figures).map(([k, v]) => `${k} ${v.toFixed(1)}:1`).join("; ")}`);
  assert.ok(figures["white icon on the bubble"] >= 4.5);
  assert.ok(figures["the bubble against a white page"] >= 3 && figures["the bubble against the light grey page"] >= 3);
  assert.ok(figures["the bubble against the dark footer"] >= 3 || figures["the bubble's white ring against the dark footer"] >= 3, "on the dark footer the green or its white ring is clear");
  assert.ok(figures["the hours line on the panel header"] >= 4.5);
  assert.ok(figures["the notice text on its grey"] >= 4.5);
  assert.match(read("components/Footer.tsx"), /bg-slate-950/, "the footer colour used above is the footer's real one");
});

test("the pulse moves only when reduced motion is not requested: the animation is inside prefers-reduced-motion: no-preference, once", () => {
  const css = read("app/globals.css");
  const start = css.indexOf(".chat-bubble-pulse");
  assert.ok(start > 0);
  const before = css.slice(Math.max(0, start - 200), start);
  assert.match(before, /@media \(prefers-reduced-motion: no-preference\)/, "the class is only styled inside the media query");
  assert.equal((css.match(/animation:\s*chat-bubble-pulse/g) || []).length, 1);
  assert.equal((css.match(/\.chat-bubble-pulse/g) || []).length, 1, "there is no plain rule that animates it");
});

// ---------------------------------------------------------------------------
// The panel's height rule, the bubble that becomes an X, and the stacking scale
// ---------------------------------------------------------------------------

import {
  BUBBLE_SIZE_PX,
  BUBBLE_INSET_PX,
  PANEL_GAP_PX,
  PANEL_TOP_GAP_PX,
  PANEL_MAX_HEIGHT_PX,
  panelBottomPx,
  panelHeightPx,
  panelTopPx,
  bubbleView,
} from "./chatWidget.ts";

test("PANEL HEIGHT: at most 640 px, and never more than the window minus the bubble, the gaps and the top gap", () => {
  assert.equal(panelBottomPx(), 16 + 56 + 16, "the card's bottom edge sits just above the bubble");
  assert.equal(panelHeightPx(1000), 640, "a tall window: the usual 640 px");
  assert.equal(panelHeightPx(900), 640);
  assert.equal(panelHeightPx(740), 640, "exactly the window that holds 640 + 88 + 12");
  assert.equal(panelHeightPx(739), 639);
  assert.equal(panelHeightPx(600), 500);
  assert.equal(panelHeightPx(500), 400);
  assert.equal(panelHeightPx(300), 200);
  assert.equal(panelHeightPx(100), 0, "a window too small for the card gives 0, never a negative height");
  assert.equal(panelHeightPx(0), 0);
  for (const odd of [undefined, null, NaN, Infinity, "600", {}, -50]) assert.equal(panelHeightPx(odd), 0, String(odd));
});

test("PANEL TOP: the card's top edge is never above the top gap, so its header and close button can never go off-screen", () => {
  for (let height = 200; height <= 2400; height += 7) {
    const top = panelTopPx(height);
    assert.ok(top >= PANEL_TOP_GAP_PX, `a ${height} px window: the top is ${top}`);
    assert.ok(panelHeightPx(height) + panelBottomPx() <= height, `a ${height} px window: the card fits above its bottom edge`);
  }
  assert.equal(panelTopPx(600), 600 - 88 - 500);
  assert.equal(panelTopPx(1440), 1440 - 88 - 640);
});

test("PANEL CLASSES: the Tailwind classes of the card are written from the same numbers as panelHeightPx (so the rule and the page agree)", () => {
  const source = fs.readFileSync(new URL("../components/chat/ChatWidget.tsx", import.meta.url), "utf8");
  const rem = (px) => `${px / 16}rem`;
  const inset = "max(1rem,env(safe-area-inset-bottom))";
  assert.equal(BUBBLE_INSET_PX, 16);
  assert.ok(source.includes(`sm:bottom-[calc(${inset}+${rem(BUBBLE_SIZE_PX + PANEL_GAP_PX)})]`), "the bottom edge is the bubble's inset + 56 + 16");
  assert.ok(source.includes(`sm:h-[min(${PANEL_MAX_HEIGHT_PX}px,calc(100dvh-${inset}-${rem(BUBBLE_SIZE_PX + PANEL_GAP_PX + PANEL_TOP_GAP_PX)}))]`), "the height is min(640, window - inset - 56 - 16 - 12)");
  assert.ok(source.includes("z-(--z-chat-panel)"), "the card is above the navbar, by the named scale");
  assert.ok(source.includes("fixed inset-0") && source.includes("sm:inset-auto"), "a full-height sheet on a phone, a card from 640 px");
  assert.equal(/\bz-\[\d+\]/.test(source), false, "no raw z-index numbers in the chat widget");
});

test("BUBBLE STATE: the chat icon with the unread count while closed; an X named Close the chat while open (not drawn on a phone, where the sheet covers it)", () => {
  assert.deepEqual(bubbleView({ open: false, unread: 0 }), { icon: "chat", label: "Chat with us", hiddenOnPhone: false });
  assert.deepEqual(bubbleView({ open: false, unread: 3 }), { icon: "chat", label: "Chat with us, 3 unread messages", hiddenOnPhone: false });
  assert.deepEqual(bubbleView({ open: false, unread: 1 }), { icon: "chat", label: "Chat with us, 1 unread message", hiddenOnPhone: false });
  assert.deepEqual(bubbleView({ open: true, unread: 5 }), { icon: "close", label: "Close the chat", hiddenOnPhone: true }, "open: an X, whatever the unread count");
  assert.deepEqual(bubbleView({ open: true, unread: 0 }), { icon: "close", label: "Close the chat", hiddenOnPhone: true });
});

test("STACKING SCALE: the named layers in globals.css are in the right order, and nothing in the navbar or the chat uses a raw number", () => {
  const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const z = Object.fromEntries([...css.matchAll(/--z-([a-z-]+):\s*(\d+);/g)].map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(Object.keys(z).sort(), ["chat-bubble", "chat-panel", "dialog", "navbar", "nav-sheet", "popover", "toast"].sort());
  assert.ok(z["chat-bubble"] < z.navbar, "the bubble is under the navbar (they never meet)");
  assert.ok(z.navbar < z["nav-sheet"], "the phone menu covers the navbar");
  assert.ok(z["nav-sheet"] < z["chat-panel"], "the chat panel is above the navbar and its menu sheet");
  assert.ok(z["chat-panel"] < z.dialog, "modal dialogs cover the chat panel");
  assert.ok(z.dialog < z.popover, "the avatar menu is above the panel and dialogs' page");
  assert.ok(z.popover < z.toast);
  assert.equal(z.dialog, 60, "the dialogs the site already has use z-[60]");
  assert.ok(css.includes("The stacking scale of the public site"), "the scale is documented where the numbers are");
});
