// Run with: npm run test:unit   (from client/). Node strips the TypeScript types itself.
//
// The chat's length limits come from the server (GET /api/chat/status, data.limits): the pure reading, the fallbacks, the shared store, how the
// screens use it, that the client's fallback numbers cannot drift from the backend config, and the two small clean-ups that go with it:
// one environment-variable name for the old Contact screens, and the old detail screen asking for "mark read" itself. Made-up data only.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DEFAULT_CHAT_LIMITS, readChatLimits, getChatLimits, rememberChatLimits, resetChatLimits, subscribeChatLimits } from "./chatLimits.ts";
import { readChatStatus, cleanSubject, cleanPhone, describeSendError, CLIENT_MESSAGE_MAX, SUBJECT_MAX, PHONE_MAX } from "./chatWidget.ts";
import { STAFF_MESSAGE_MAX, canSendReply } from "./chatAdmin.ts";
import { needsMarkRead } from "./legacyContacts.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");
const CLIENT = path.resolve(SRC, "..");
const read = (file) => fs.readFileSync(path.join(SRC, file), "utf8");
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Reading the numbers
// ---------------------------------------------------------------------------

test("DEFAULTS: today's numbers (message 2000, staff reply 4000, topic 80, phone 25), frozen", () => {
  assert.deepEqual({ ...DEFAULT_CHAT_LIMITS }, { clientMessage: 2000, staffMessage: 4000, subject: 80, phone: 25 });
  assert.ok(Object.isFrozen(DEFAULT_CHAT_LIMITS));
  assert.deepEqual([CLIENT_MESSAGE_MAX, STAFF_MESSAGE_MAX, SUBJECT_MAX, PHONE_MAX], [2000, 4000, 80, 25], "the old constants are the defaults");
});

test("READING: the server's numbers are used; each field that is missing or odd falls back to its own default", () => {
  assert.deepEqual(readChatLimits({ clientMessage: 1500, staffMessage: 3000, subject: 60, phone: 20 }), { clientMessage: 1500, staffMessage: 3000, subject: 60, phone: 20 });
  assert.deepEqual(readChatLimits({ clientMessage: 1500 }), { clientMessage: 1500, staffMessage: 4000, subject: 80, phone: 25 }, "one field only");
  assert.deepEqual(readChatLimits({ clientMessage: 1500, subject: "80", phone: -1, staffMessage: 0 }), { clientMessage: 1500, staffMessage: 4000, subject: 80, phone: 25 });
  for (const odd of [undefined, null, 5, "x", [], {}, [2000], { clientMessage: null }]) assert.deepEqual(readChatLimits(odd), { ...DEFAULT_CHAT_LIMITS }, JSON.stringify(odd));
  for (const bad of [0, -5, 1.5, NaN, Infinity, "2000", null, undefined, {}, [], true, 100001, 1e9]) {
    assert.equal(readChatLimits({ clientMessage: bad }).clientMessage, 2000, `unusable: ${String(bad)}`);
  }
  assert.equal(readChatLimits({ subject: 1 }).subject, 1);
  assert.equal(readChatLimits({ subject: 100000 }).subject, 100000);
});

test("STATUS ANSWER: limits come with an enabled answer; chat off or an odd answer gives today's numbers", () => {
  const on = readChatStatus(200, { success: true, data: { enabled: true, hours: null, limits: { clientMessage: 1234, staffMessage: 2345, subject: 33, phone: 18 } } });
  assert.equal(on.state, "on");
  assert.deepEqual(on.limits, { clientMessage: 1234, staffMessage: 2345, subject: 33, phone: 18 });
  assert.deepEqual(readChatStatus(200, { data: { enabled: true } }).limits, { ...DEFAULT_CHAT_LIMITS }, "an older server (no limits): today's numbers");
  assert.deepEqual(readChatStatus(200, { data: { enabled: true, limits: "many" } }).limits, { ...DEFAULT_CHAT_LIMITS });
  assert.deepEqual(readChatStatus(200, { data: { enabled: false, limits: { clientMessage: 5 } } }), { state: "off", hours: null, limits: { ...DEFAULT_CHAT_LIMITS } }, "off: nothing from the server is used");
  assert.deepEqual(readChatStatus(500, null).limits, { ...DEFAULT_CHAT_LIMITS });
});

// ---------------------------------------------------------------------------
// The shared store
// ---------------------------------------------------------------------------

test("STORE: starts at today's numbers, remembers the server's, tells listeners once per change, and goes back to the defaults", () => {
  resetChatLimits();
  assert.deepEqual(getChatLimits(), { ...DEFAULT_CHAT_LIMITS });
  let calls = 0;
  const stop = subscribeChatLimits(() => {
    calls += 1;
  });
  rememberChatLimits({ clientMessage: 1000, staffMessage: 2000, subject: 40, phone: 20 });
  assert.deepEqual(getChatLimits(), { clientMessage: 1000, staffMessage: 2000, subject: 40, phone: 20 });
  assert.equal(calls, 1);
  rememberChatLimits({ clientMessage: 1000, staffMessage: 2000, subject: 40, phone: 20 });
  assert.equal(calls, 1, "the same numbers again tell nobody");
  rememberChatLimits({ clientMessage: 1000 });
  assert.deepEqual(getChatLimits(), { clientMessage: 1000, staffMessage: 4000, subject: 80, phone: 25 }, "a partial answer replaces the others by their defaults");
  assert.equal(calls, 2);
  stop();
  resetChatLimits();
  assert.equal(calls, 2, "no call after unsubscribing");
  assert.deepEqual(getChatLimits(), { ...DEFAULT_CHAT_LIMITS });
});

// ---------------------------------------------------------------------------
// Using them
// ---------------------------------------------------------------------------

test("USING: the topic, the phone and the reply box follow the numbers they are given (and keep today's when none are given)", () => {
  assert.equal(cleanSubject("x".repeat(80)).error, null);
  assert.match(cleanSubject("x".repeat(81)).error, /at most 80/);
  assert.equal(cleanSubject("x".repeat(40), 40).error, null);
  assert.match(cleanSubject("x".repeat(41), 40).error, /at most 40/, "the server's smaller number is the one in the words");
  assert.equal(cleanSubject("x".repeat(100), 120).error, null, "a larger server number is allowed");
  assert.equal(cleanPhone("+(92)(300)(0000000)------").error, null, "25 characters");
  assert.match(cleanPhone("+(92)(300)(0000000)-------").error, /valid phone/, "26 characters");
  assert.equal(cleanPhone("+(92)(300)(0000000)-------", 30).error, null, "a larger server number");
  assert.match(cleanPhone("+92 300 1234567", 10).error, /valid phone/, "a smaller one");
  assert.match(describeSendError(400, "SUBJECT_TOO_LONG"), /at most 80/);
  assert.match(describeSendError(400, "SUBJECT_TOO_LONG", { subject: 50 }), /at most 50/);
  assert.equal(canSendReply("a".repeat(4000), false), true);
  assert.equal(canSendReply("a".repeat(4001), false), false);
  assert.equal(canSendReply("a".repeat(100), false, 100), true);
  assert.equal(canSendReply("a".repeat(101), false, 100), false);
});

test("WIRING: both status readers remember the limits, and the visitor panel and the admin reply box use the shared numbers, not fixed ones", () => {
  assert.match(read("hooks/useChatVisitor.ts"), /rememberChatLimits\(reading\.state === "on" \? reading\.limits : undefined\)/);
  assert.match(read("hooks/useChatAdmin.ts"), /rememberChatLimits\(answer\.enabled \? answer\.limits : undefined\)/);
  assert.match(read("services/chatAdminService.ts"), /limits\?: unknown/);
  const panel = read("components/chat/ChatPanel.tsx");
  assert.match(panel, /useChatLimits\(\)/);
  assert.equal(/CLIENT_MESSAGE_MAX|SUBJECT_MAX/.test(panel), false, "no fixed number in the visitor panel");
  for (const needle of ["limits.clientMessage", "limits.subject", "cleanSubject(subject, limits.subject)", "cleanPhone(phone, limits.phone)"]) assert.ok(panel.includes(needle), needle);
  const view = read("components/admin/chat/ConversationView.tsx");
  assert.match(view, /useChatLimits\(\)/);
  assert.equal(/STAFF_MESSAGE_MAX/.test(view), false, "no fixed number in the admin reply box");
  assert.ok(view.includes("limits.staffMessage"));
});

// ---------------------------------------------------------------------------
// The client's fallback numbers cannot drift from the server
// ---------------------------------------------------------------------------

test("NO DRIFT: the client's fallback numbers are exactly the numbers in the backend config (and the backend states those same numbers in /status)", () => {
  const backendFile = path.resolve(CLIENT, "..", "backend", "config", "contactChat.js");
  assert.ok(fs.existsSync(backendFile), "the backend config is where the test expects it");
  const { CHAT } = require(backendFile);
  assert.deepEqual(
    { ...DEFAULT_CHAT_LIMITS },
    { clientMessage: CHAT.MAX_CLIENT_MESSAGE, staffMessage: CHAT.MAX_STAFF_MESSAGE, subject: CHAT.MAX_SUBJECT, phone: CHAT.MAX_PHONE },
    "a number was changed on one side only: change utils/chatLimits.ts and backend/config/contactChat.js together",
  );
  // The backend builds the status answer from that same config (the service has no numbers of its own).
  const service = fs.readFileSync(path.resolve(CLIENT, "..", "backend", "services", "contactChatService.js"), "utf8");
  for (const key of ["MAX_CLIENT_MESSAGE", "MAX_STAFF_MESSAGE", "MAX_SUBJECT", "MAX_PHONE"]) assert.ok(new RegExp(`chatLimits\\(\\)[\\s\\S]*CHAT\\.${key}`).test(service), `the status limits use CHAT.${key}`);
  // And the old constants are the defaults, not separate copies.
  const widget = read("utils/chatWidget.ts");
  assert.match(widget, /export const CLIENT_MESSAGE_MAX = DEFAULT_CHAT_LIMITS\.clientMessage;/);
  assert.match(widget, /export const SUBJECT_MAX = DEFAULT_CHAT_LIMITS\.subject;/);
  assert.match(widget, /export const PHONE_MAX = DEFAULT_CHAT_LIMITS\.phone;/);
  assert.match(read("utils/chatAdmin.ts"), /export const STAFF_MESSAGE_MAX = DEFAULT_CHAT_LIMITS\.staffMessage;/);
});

// ---------------------------------------------------------------------------
// One environment-variable name
// ---------------------------------------------------------------------------

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("ENV NAMES: the old Contact screens use NEXT_PUBLIC_API_URL like the rest; no source uses the other name; .env.example documents only names that are used", () => {
  const used = new Set();
  for (const file of sourceFiles(SRC)) {
    for (const match of fs.readFileSync(file, "utf8").matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) used.add(match[0]);
  }
  assert.equal(used.has("NEXT_PUBLIC_API_BASE_URL"), false, "the old name is gone from the source");
  const example = fs.readFileSync(path.join(CLIENT, ".env.example"), "utf8");
  const documented = [...example.matchAll(/^\s*#?\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=/gm)].map((m) => m[1]);
  assert.ok(documented.includes("NEXT_PUBLIC_API_URL"));
  for (const name of documented) assert.ok(used.has(name), `${name} is documented in .env.example but used nowhere`);
  for (const name of used) assert.ok(documented.includes(name), `${name} is used in the source but not documented in .env.example`);
  for (const file of ["components/admin/contacts/LegacyContactsPage.tsx", "components/admin/contacts/LegacyContactDetailPage.tsx", "app/contact/page.tsx", "components/sections/ContactSection.tsx"]) {
    const text = read(file);
    assert.match(text, /NEXT_PUBLIC_API_URL \|\| "http:\/\/localhost:5000\/api"/, file);
    assert.doesNotMatch(text, /\/api\/contacts/, `${file} builds its address from the API address (which already ends in /api)`);
  }
});

// ---------------------------------------------------------------------------
// The old detail screen marks a message read itself
// ---------------------------------------------------------------------------

test("OLD DETAIL SCREEN: only a message that is still new is marked read, by the explicit call, and the screen shows the answer", () => {
  assert.equal(needsMarkRead("new"), true);
  for (const other of ["read", "responded", "archived", "", undefined, null, 0, {}, "NEW"]) assert.equal(needsMarkRead(other), false, String(other));
  const detail = read("components/admin/contacts/LegacyContactDetailPage.tsx");
  assert.match(detail, /needsMarkRead\(shown\.status\)/);
  assert.match(detail, /`\$\{API_URL\}\/contacts\/\$\{id\}\/read`/);
  assert.match(detail, /method: "PATCH"/);
  // The read call comes after the GET and its answer replaces what is shown (status "read"), so the screen looks the same as it always did.
  assert.ok(detail.indexOf("/contacts/${id}`") < detail.indexOf("/contacts/${id}/read`"));
  assert.match(detail, /if \(result && result\.data\) shown = result\.data;/);
  assert.match(detail, /setStatusFilter\(shown\.status\)/);
  // The old LIST screen opens nothing, so it makes no such call.
  assert.equal(/\/read/.test(read("components/admin/contacts/LegacyContactsPage.tsx")), false);
});

test("EARLIER FORM MESSAGES TAB (in the new inbox): the search and the status filter are sent together, the 'filter not used' note is gone, and the placeholder names the topic", () => {
  const tab = read("components/admin/chat/LegacyMessages.tsx");
  assert.match(tab, /fetchLegacyMessages\(\{ page, search: query, status \}\)/);
  assert.equal(/status filter is not used/i.test(tab), false, "the server now combines them, so the note would be wrong");
  assert.match(tab, /placeholder="Search name, email, phone, topic or message"/);
  const service = read("services/chatAdminService.ts");
  assert.match(service, /if \(search\) params\.set\("search", search\);/);
  assert.match(service, /if \(status\) params\.set\("status", status\);/);
});
