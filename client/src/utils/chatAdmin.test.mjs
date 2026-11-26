// Run with: npm run test:unit   (from client/). All names and messages are made up.
// The admin chat inbox: the unread number, merging new messages, the list query, who sent a message, the reply box rules, the polling
// (fake timers), the shared unread store, safe drawing of message text, the badge colours, and which screen /admin/contacts shows.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import {
  INBOX_TABS,
  POLL_OVERLAP,
  STAFF_MESSAGE_MAX,
  TEAM_NAME,
  afterForPoll,
  buildInboxQuery,
  buildMessagesQuery,
  canSendReply,
  cleanSearch,
  describeChatError,
  formatChatTime,
  formatUnread,
  inboxSignature,
  keyAction,
  lastSeq,
  mergeMessages,
  messageText,
  newClientMessageId,
  newMessagesCount,
  replyLength,
  safeCount,
  senderLabel,
  shouldMarkRead,
  statusChip,
  unreadLabel,
} from "./chatAdmin.ts";
import { backoffDelay, createPoller, createUnreadStore, isFinalRefusal } from "./chatPolling.ts";
import { loadTsx, React } from "./loadTsx.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");
const read = (file) => fs.readFileSync(path.join(SRC, file), "utf8");

const msg = (id, seq, sender = "client", text = `text ${id}`, extra = {}) => ({ id, seq, sender, text, createdAt: `2027-01-05T10:${String(seq).padStart(2, "0")}:00.000Z`, ...extra });

// ---------------------------------------------------------------------------
// The unread number
// ---------------------------------------------------------------------------

test("the badge number: nothing at 0, the number up to 99, then 99+", () => {
  for (const zero of [0, -1, -50, Number.NaN, Number.POSITIVE_INFINITY, undefined, null, "5", {}, [], 0.4]) assert.equal(formatUnread(zero), "", String(zero));
  assert.equal(formatUnread(1), "1");
  assert.equal(formatUnread(9), "9");
  assert.equal(formatUnread(99), "99");
  assert.equal(formatUnread(100), "99+");
  assert.equal(formatUnread(1000), "99+");
  assert.equal(formatUnread(2.9), "2", "a whole number");
});

test("the spoken form says the same in words", () => {
  assert.equal(unreadLabel(0), "");
  assert.equal(unreadLabel(1), "1 unread message");
  assert.equal(unreadLabel(3), "3 unread messages");
  assert.equal(unreadLabel(99), "99 unread messages");
  assert.equal(unreadLabel(100), "More than 99 unread messages");
  assert.deepEqual([safeCount(5), safeCount(-3), safeCount("x"), safeCount(undefined), safeCount(2.8)], [5, 0, 0, 0, 2]);
});

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

test("merging new messages: each message once, in order of seq, a duplicate is ignored, the same array comes back when nothing is new", () => {
  const current = [msg("a", 1), msg("b", 2)];
  const merged = mergeMessages(current, [msg("c", 3), msg("b", 2)]);
  assert.deepEqual(merged.map((m) => m.id), ["a", "b", "c"]);
  assert.equal(mergeMessages(current, []), current, "nothing came: the same array");
  assert.equal(mergeMessages(current, [msg("a", 1), msg("b", 2)]), current, "only copies of what is there: the same array, so nothing is redrawn");
  const late = mergeMessages([msg("a", 1), msg("c", 3)], [msg("b", 2)]);
  assert.deepEqual(late.map((m) => m.id), ["a", "b", "c"], "a message that arrives late goes where it belongs");
  const twice = mergeMessages(mergeMessages(current, [msg("c", 3)]), [msg("c", 3), msg("c", 3)]);
  assert.equal(twice.length, 3, "the same message three times is one message");
  assert.equal(mergeMessages([msg("a", 1, "client", "old")], [msg("a", 1, "client", "new")])[0].text, "new", "a newer copy replaces the old");
  assert.equal(current.length, 2, "the input is not changed");
});

test("polling asks from a few numbers before the last, and counts what is really new", () => {
  assert.equal(lastSeq([]), 0);
  assert.equal(lastSeq([msg("a", 4), msg("b", 9), msg("c", 7)]), 9);
  assert.equal(POLL_OVERLAP, 3);
  assert.equal(afterForPoll([]), 0);
  assert.equal(afterForPoll([msg("a", 2)]), 0, "never below zero");
  assert.equal(afterForPoll([msg("a", 20)]), 17);
  const before = [msg("a", 1), msg("b", 2)];
  assert.equal(newMessagesCount(before, mergeMessages(before, [msg("b", 2), msg("c", 3), msg("d", 4)])), 2, "the overlap is not counted as new");
});

// ---------------------------------------------------------------------------
// The list query
// ---------------------------------------------------------------------------

test("the tabs are All, Unread, Open, Answered, Closed", () => {
  assert.deepEqual(INBOX_TABS.map((t) => t.label), ["All", "Unread", "Open", "Answered", "Closed"]);
});

test("the list query: a status tab sends the status, Unread sends unread=1, All sends neither; page, limit and the search are checked", () => {
  assert.equal(buildInboxQuery({}), "limit=20");
  assert.equal(buildInboxQuery({ tab: "open" }), "status=open&limit=20");
  assert.equal(buildInboxQuery({ tab: "answered" }), "status=answered&limit=20");
  assert.equal(buildInboxQuery({ tab: "closed" }), "status=closed&limit=20");
  assert.equal(buildInboxQuery({ tab: "unread" }), "unread=1&limit=20");
  assert.equal(buildInboxQuery({ tab: "all" }), "limit=20");
  assert.equal(buildInboxQuery({ tab: "archived" }), "limit=20", "an unknown tab is All");
  assert.equal(buildInboxQuery({ tab: "unread", search: "  alice  smith ", page: 3, limit: 10 }), "unread=1&q=alice+smith&page=3&limit=10");
  assert.equal(buildInboxQuery({ page: 1 }), "limit=20", "page 1 is the default and is not sent");
  assert.equal(buildInboxQuery({ page: 0 }), "limit=20");
  assert.equal(buildInboxQuery({ page: 2.5 }), "limit=20");
  assert.equal(buildInboxQuery({ limit: 51 }), "limit=20");
  assert.equal(buildInboxQuery({ limit: 0 }), "limit=20");
  assert.equal(buildInboxQuery({ search: "a&status=closed#x=1" }), "q=a%26status%3Dclosed%23x%3D1&limit=20", "what is typed can never add a parameter");
});

test("the search text: single spaces, no line breaks or control characters, at most 100 characters; not text is nothing", () => {
  assert.equal(cleanSearch("  a   b \n c\t"), "a b c");
  assert.equal(cleanSearch("a\u0000b"), "a b");
  assert.equal(cleanSearch("x".repeat(250)).length, 100);
  assert.equal(Array.from(cleanSearch("\u{1F600}".repeat(150))).length, 100, "counted in characters");
  for (const nothing of [undefined, null, 5, {}, ["a"]]) assert.equal(cleanSearch(nothing), "");
});

test("the messages query: only whole numbers, after wins over before, the limit is 1 to 100", () => {
  assert.equal(buildMessagesQuery({}), "");
  assert.equal(buildMessagesQuery({ after: 5 }), "after=5");
  assert.equal(buildMessagesQuery({ after: 0 }), "after=0");
  assert.equal(buildMessagesQuery({ before: 7, limit: 50 }), "before=7&limit=50");
  assert.equal(buildMessagesQuery({ after: 3, before: 9 }), "after=3");
  assert.equal(buildMessagesQuery({ after: -1, limit: 101 }), "");
  assert.equal(buildMessagesQuery({ after: 1.5 }), "");
});

test("the list signature changes when anything a row shows changes, and only then", () => {
  const row = { id: "c1", user: { id: "u", name: "A", email: "a@example.invalid" }, topic: null, status: "open", unreadForStaff: 1, lastMessageAt: "2027-01-05T10:00:00Z", lastMessageBy: "client", preview: "Hi" };
  const base = inboxSignature([row], 1);
  assert.equal(inboxSignature([{ ...row }], 1), base);
  for (const change of [{ unreadForStaff: 2 }, { status: "answered" }, { lastMessageAt: "2027-01-05T11:00:00Z" }, { preview: "Hello" }, { lastMessageBy: "staff" }]) {
    assert.notEqual(inboxSignature([{ ...row, ...change }], 1), base, JSON.stringify(change));
  }
  assert.notEqual(inboxSignature([row], 2), base);
});

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

test("who sent a message: the client's name, or the team (and the member of it)", () => {
  assert.equal(TEAM_NAME, "Wiser Consulting team");
  assert.equal(senderLabel({ sender: "client" }, "Alice Example"), "Alice Example");
  assert.equal(senderLabel({ sender: "client" }, "  "), "Client");
  assert.equal(senderLabel({ sender: "client" }, undefined), "Client");
  assert.equal(senderLabel({ sender: "staff" }, "Alice"), "Wiser Consulting team");
  assert.equal(senderLabel({ sender: "staff", staff: { id: "s", name: "Sam Staff" } }, "Alice"), "Wiser Consulting team (Sam Staff)");
  assert.equal(senderLabel({ sender: "staff", staff: null }, "Alice"), "Wiser Consulting team");
  assert.deepEqual([statusChip("open"), statusChip("answered"), statusChip("closed"), statusChip("weird")].map((c) => c.label), ["Open", "Answered", "Closed", "Open"]);
});

test("message text for the screen is the words, or a fixed sentence when it could not be read", () => {
  assert.equal(messageText("Hello <b>there</b>"), "Hello <b>there</b>", "the words are not changed: they are drawn as text, not as HTML");
  assert.equal(messageText(null), "This message could not be read.");
  assert.equal(messageText(undefined), "This message could not be read.");
  assert.equal(messageText(""), "");
});

test("times: today the clock, yesterday, a weekday, a date, a date with the year", () => {
  const now = new Date(2027, 0, 15, 18, 0, 0); // a Friday, local time
  const at = (y, m, d, h = 14, min = 5) => new Date(y, m, d, h, min).toISOString();
  assert.equal(formatChatTime(at(2027, 0, 15), now), "14:05");
  assert.equal(formatChatTime(at(2027, 0, 14), now), "Yesterday");
  assert.equal(formatChatTime(at(2027, 0, 12), now), "Tuesday");
  assert.equal(formatChatTime(at(2027, 0, 1), now), "1 Jan");
  assert.equal(formatChatTime(at(2026, 10, 3), now), "3 Nov 2026");
  assert.equal(formatChatTime(null, now), "");
  assert.equal(formatChatTime("not a date", now), "");
});

test("error words are fixed sentences chosen by the status and code", () => {
  assert.match(describeChatError(401), /sign in again/);
  assert.match(describeChatError(403), /permission/);
  assert.match(describeChatError(404, "FEATURE_CLOSED"), /switched off/);
  assert.match(describeChatError(404, "CONVERSATION_NOT_FOUND"), /no longer exists/);
  assert.match(describeChatError(429, "TOO_MANY_REQUESTS"), /Too many/);
  assert.match(describeChatError(503, "CHAT_UNAVAILABLE"), /not available/);
  assert.match(describeChatError(400, "MESSAGE_EMPTY"), /write a message/);
  assert.match(describeChatError(400, "MESSAGE_TOO_LONG"), /too long/);
  assert.match(describeChatError(0), /Could not reach the server/);
  assert.match(describeChatError(500), /Something went wrong/);
  assert.doesNotMatch(describeChatError(500, "<script>"), /script/);
});

// ---------------------------------------------------------------------------
// The reply box
// ---------------------------------------------------------------------------

test("the reply box: sendable when it has words, within the limit, and nothing is being sent", () => {
  assert.equal(STAFF_MESSAGE_MAX, 4000);
  assert.equal(canSendReply("Hello", false), true);
  assert.equal(canSendReply("Hello", true), false, "not while sending");
  assert.equal(canSendReply("", false), false);
  assert.equal(canSendReply("  \n\t ", false), false);
  assert.equal(canSendReply("x".repeat(4000), false), true);
  assert.equal(canSendReply("x".repeat(4001), false), false);
  assert.equal(canSendReply(` ${"x".repeat(4000)} `, false), true, "the spaces around do not count");
  assert.equal(replyLength("a\r\nb"), 3, "a line break counts as one");
  assert.equal(replyLength("\u{1F600}\u{1F600}"), 2, "an emoji is one character");
});

test("keys in the reply box: Enter sends, Shift+Enter and Alt+Enter make a new line, a composing input method is left alone", () => {
  assert.equal(keyAction({ key: "Enter" }), "send");
  assert.equal(keyAction({ key: "Enter", shiftKey: true }), "newline");
  assert.equal(keyAction({ key: "Enter", altKey: true }), "newline");
  assert.equal(keyAction({ key: "Enter", isComposing: true }), "none");
  assert.equal(keyAction({ key: "a" }), "none");
  assert.equal(keyAction({ key: "Escape" }), "none");
});

test("marking read: only while the tab is visible, when there is something unread and something newer than the last mark is on screen", () => {
  assert.equal(shouldMarkRead({ visible: true, hasUnread: true, shownSeq: 5, markedSeq: 3 }), true);
  assert.equal(shouldMarkRead({ visible: false, hasUnread: true, shownSeq: 5, markedSeq: 3 }), false, "a hidden tab does not read");
  assert.equal(shouldMarkRead({ visible: true, hasUnread: false, shownSeq: 5, markedSeq: 3 }), false);
  assert.equal(shouldMarkRead({ visible: true, hasUnread: true, shownSeq: 5, markedSeq: 5 }), false, "already marked");
  assert.equal(shouldMarkRead({ visible: true, hasUnread: true, shownSeq: 0, markedSeq: 0 }), false, "nothing on screen yet");
});

test("a send id is a fresh UUID each time", () => {
  const ids = new Set(Array.from({ length: 50 }, () => newClientMessageId()));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

// ---------------------------------------------------------------------------
// Polling (fake timers)
// ---------------------------------------------------------------------------

function fakeClock() {
  const timers = [];
  let nextId = 1;
  return {
    timers,
    setTimer: (fn, ms) => {
      const handle = { id: nextId++, fn, ms };
      timers.push(handle);
      return handle;
    },
    clearTimer: (handle) => {
      const at = timers.indexOf(handle);
      if (at >= 0) timers.splice(at, 1);
    },
    /** Runs the one timer that is waiting and returns how long it waited. */
    async fire() {
      const handle = timers.shift();
      assert.ok(handle, "a timer is waiting");
      handle.fn();
      await flush();
      return handle.ms;
    },
  };
}
const flush = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

test("the backoff: the normal pace for 5 quiet polls, then it doubles for every further 5, up to the slowest", () => {
  const delays = (quiet) => backoffDelay(20_000, 60_000, quiet);
  assert.deepEqual([0, 1, 4].map(delays), [20_000, 20_000, 20_000]);
  assert.equal(delays(5), 40_000);
  assert.equal(delays(9), 40_000);
  assert.equal(delays(10), 60_000, "capped at the slowest");
  assert.equal(delays(100), 60_000);
  assert.equal(backoffDelay(30_000, 120_000, 5), 60_000);
  assert.equal(backoffDelay(30_000, 120_000, 10), 120_000);
  assert.equal(backoffDelay(30_000, 120_000, Number.NaN), 30_000);
});

test("the poller: polls at once, then at the normal pace; a quiet run slows it down; a change brings the pace back", async () => {
  const clock = fakeClock();
  const results = [];
  let polls = 0;
  const poller = createPoller({ baseMs: 15_000, maxMs: 60_000, setTimer: clock.setTimer, clearTimer: clock.clearTimer, run: async () => { polls += 1; return results.shift() ?? "same"; } });
  poller.start();
  await flush();
  assert.equal(polls, 1, "the first poll is at once");
  const waits = [];
  for (let i = 0; i < 6; i += 1) waits.push(await clock.fire());
  // The poll at the start is the first quiet one; four more follow at the normal pace, and after the fifth quiet poll the wait doubles.
  assert.deepEqual(waits, [15_000, 15_000, 15_000, 15_000, 30_000, 30_000], "after 5 quiet polls the wait doubles");
  results.push("changed");
  waits.push(await clock.fire());
  assert.equal(clock.timers[0].ms, 15_000, "something changed: back to the normal pace");
  poller.stop();
  assert.equal(clock.timers.length, 0, "stopped: nothing is waiting");
});

test("the poller waits the normal pace first when started with immediate: false, and never runs two polls at once", async () => {
  const clock = fakeClock();
  let polls = 0;
  let release;
  const poller = createPoller({ baseMs: 10_000, maxMs: 20_000, setTimer: clock.setTimer, clearTimer: clock.clearTimer, run: () => { polls += 1; return new Promise((resolve) => { release = () => resolve("same"); }); } });
  poller.start({ immediate: false });
  await flush();
  assert.equal(polls, 0);
  assert.equal(clock.timers[0].ms, 10_000);
  clock.timers.shift().fn();
  await flush();
  assert.equal(polls, 1);
  poller.poke();
  poller.poke();
  await flush();
  assert.equal(polls, 1, "a poll is under way: a poke does not start another");
  release();
  await flush();
  assert.equal(clock.timers.length, 1, "the next poll is waiting");
  poller.stop();
});

test("the poller does not poll while the tab is hidden, polls at once when it is shown, and a hidden tab leaves no timer", async () => {
  const clock = fakeClock();
  let visible = true;
  let polls = 0;
  const poller = createPoller({ baseMs: 15_000, maxMs: 60_000, isVisible: () => visible, setTimer: clock.setTimer, clearTimer: clock.clearTimer, run: async () => { polls += 1; return "same"; } });
  poller.start();
  await flush();
  assert.equal(polls, 1);
  visible = false;
  poller.visibilityChanged();
  assert.equal(clock.timers.length, 0, "hidden: the waiting timer is cancelled");
  poller.poke();
  await flush();
  assert.equal(polls, 1, "hidden: not even a poke polls");
  visible = true;
  poller.visibilityChanged();
  await flush();
  assert.equal(polls, 2, "shown again: a poll at once");
  assert.equal(clock.timers.length, 1);
  poller.stop();
  visible = false;
  poller.visibilityChanged();
  visible = true;
  poller.visibilityChanged();
  await flush();
  assert.equal(polls, 2, "a stopped poller stays stopped");
});

test("the poller stops for good on 'stop', treats an error as a quiet poll, and a stop during a poll lets that poll's answer be ignored", async () => {
  const clock = fakeClock();
  let calls = 0;
  const failing = createPoller({ baseMs: 15_000, maxMs: 60_000, setTimer: clock.setTimer, clearTimer: clock.clearTimer, run: async () => { calls += 1; throw new Error("network"); } });
  failing.start();
  await flush();
  assert.equal(failing.isRunning(), true);
  assert.equal(clock.timers.length, 1, "an error is a quiet poll: it tries again later");
  failing.stop();

  const clock2 = fakeClock();
  const stopping = createPoller({ baseMs: 15_000, maxMs: 60_000, setTimer: clock2.setTimer, clearTimer: clock2.clearTimer, run: async () => "stop" });
  stopping.start();
  await flush();
  assert.equal(stopping.isRunning(), false);
  assert.equal(clock2.timers.length, 0);

  const clock3 = fakeClock();
  let finish;
  const slow = createPoller({ baseMs: 15_000, maxMs: 60_000, setTimer: clock3.setTimer, clearTimer: clock3.clearTimer, run: () => new Promise((resolve) => { finish = resolve; }) });
  slow.start();
  await flush();
  slow.stop();
  finish("changed");
  await flush();
  assert.equal(clock3.timers.length, 0, "the answer of a poll that was stopped schedules nothing");
});

// ---------------------------------------------------------------------------
// The shared unread total
// ---------------------------------------------------------------------------

test("the unread store: one poller however many components subscribe; the snapshot follows the server; the last one out stops it", async () => {
  const clock = fakeClock();
  let calls = 0;
  let answer = { unread: 3, conversations: 2 };
  const store = createUnreadStore({ fetchUnread: async () => { calls += 1; return answer; }, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const seen = [];
  const offA = store.subscribe(() => seen.push(store.getSnapshot().unread));
  const offB = store.subscribe(() => {});
  await flush();
  assert.equal(calls, 1, "two subscribers, one ask");
  assert.deepEqual(store.getSnapshot(), { unread: 3, conversations: 2, state: "ok" });
  assert.equal(clock.timers.length, 1, "one timer");
  assert.equal(clock.timers[0].ms, 30_000, "the badge asks every 30 seconds");
  answer = { unread: 5, conversations: 3 };
  await clock.fire();
  assert.deepEqual(seen, [3, 5]);
  store.refresh();
  await flush();
  assert.equal(calls, 3, "refresh asks now");
  offA();
  assert.equal(store.isRunning(), true, "one subscriber is left");
  offB();
  assert.equal(store.isRunning(), false);
  assert.equal(clock.timers.length, 0);
});

test("the unread store stops on a refusal (signed out, not allowed, chat off) and shows 0; an ordinary failure keeps it running with the last number", async () => {
  for (const status of [401, 403, 404]) {
    const clock = fakeClock();
    const store = createUnreadStore({ fetchUnread: async () => { throw Object.assign(new Error("refused"), { status }); }, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    store.subscribe(() => {});
    await flush();
    assert.deepEqual(store.getSnapshot(), { unread: 0, conversations: 0, state: "stopped" }, String(status));
    assert.equal(store.isRunning(), false);
    assert.equal(clock.timers.length, 0);
  }
  assert.equal(isFinalRefusal({ status: 500 }), false);
  assert.equal(isFinalRefusal({ status: 0 }), false);
  assert.equal(isFinalRefusal(null), false);
  const clock = fakeClock();
  let fail = false;
  const store = createUnreadStore({ fetchUnread: async () => { if (fail) throw Object.assign(new Error("down"), { status: 500 }); return { unread: 4, conversations: 1 }; }, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  store.subscribe(() => {});
  await flush();
  fail = true;
  await clock.fire();
  assert.equal(store.getSnapshot().unread, 4, "a failed ask keeps the last number");
  assert.equal(store.isRunning(), true);
});

test("the unread store never asks while the tab is hidden, and a nonsense number from the server is shown as 0", async () => {
  const clock = fakeClock();
  let visible = false;
  let calls = 0;
  const store = createUnreadStore({ fetchUnread: async () => { calls += 1; return { unread: Number.NaN, conversations: -4 }; }, isVisible: () => visible, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  store.subscribe(() => {});
  await flush();
  assert.equal(calls, 0, "hidden");
  visible = true;
  store.visibilityChanged();
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(store.getSnapshot(), { unread: 0, conversations: 0, state: "ok" });
});

// ---------------------------------------------------------------------------
// Drawing: message text is never HTML
// ---------------------------------------------------------------------------

const ROW = { id: "c1", user: { id: "u1", name: "<b>Bold</b> Person", email: "p@example.invalid" }, topic: "<i>topic</i>", status: "open", unreadForStaff: 3, lastMessageAt: "2027-01-05T10:00:00.000Z", lastMessageBy: "client", preview: "<img src=x onerror=alert(1)> and <script>alert(2)</script>" };

test("the list draws a name, a topic and a preview as TEXT: markup in them comes out escaped, never as an element", () => {
  const { module } = loadTsx("components/admin/chat/ConversationList.tsx", { mocks: {} });
  const html = renderToStaticMarkup(React.createElement(module.ConversationList, { rows: [ROW], selectedId: null, onSelect: () => {}, emptyText: "none", hasMore: false, loadingMore: false, onLoadMore: () => {} }));
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /<b>Bold/);
  assert.doesNotMatch(html, /<i>topic/);
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;b&gt;Bold&lt;\/b&gt; Person/);
});

test("the list: a real button per row with the whole sentence as its label, the unread count in the label and in the badge, 99+ over 99", () => {
  const { module } = loadTsx("components/admin/chat/ConversationList.tsx", { mocks: {} });
  const render = (rows, selectedId = null) => renderToStaticMarkup(React.createElement(module.ConversationList, { rows, selectedId, onSelect: () => {}, emptyText: "Nothing here yet.", hasMore: false, loadingMore: false, onLoadMore: () => {} }));
  const html = render([ROW, { ...ROW, id: "c2", user: { ...ROW.user, name: "Quiet Person" }, unreadForStaff: 0, topic: null, status: "closed", lastMessageBy: "staff", preview: "Done" }, { ...ROW, id: "c3", user: { ...ROW.user, name: "Busy" }, unreadForStaff: 250 }], "c2");
  assert.equal((html.match(/<button\b/g) || []).length, 3, "one button per row");
  assert.match(html, /aria-label="&lt;b&gt;Bold&lt;\/b&gt; Person, topic &lt;i&gt;topic&lt;\/i&gt;, status Open, 3 unread messages"/);
  assert.match(html, /aria-label="Quiet Person, status Closed"/, "no unread: no unread words");
  assert.match(html, /More than 99 unread messages/);
  assert.match(html, />99\+</);
  assert.match(html, /aria-current="true"/, "the open one is marked");
  assert.match(html, /focus-visible:ring-2/, "a visible focus ring");
  assert.match(html, /You: <\/span>Done|You: <!-- -->/, "a reply of ours is marked as ours");
  assert.match(render([]), /Nothing here yet\./);
});

test("the badge: not drawn at 0, the number with a spoken sentence otherwise, 99+ from 100, hidden from the eyes but not from a screen reader", () => {
  const { module } = loadTsx("components/admin/chat/UnreadBadge.tsx", { mocks: {} });
  const render = (count) => renderToStaticMarkup(React.createElement(module.UnreadBadge, { count }));
  assert.equal(render(0), "");
  assert.equal(render(-2), "");
  assert.match(render(1), /chat-unread-badge[^>]*>1</);
  assert.match(render(1), /1 unread message</);
  assert.match(render(99), />99</);
  assert.match(render(100), />99\+</);
  assert.match(render(100), /More than 99 unread messages/);
  assert.match(render(5), /aria-hidden="true"/, "the number is not read out twice");
  assert.match(render(5), /class="sr-only"/);
});

test("no message text is ever put in the page as HTML or confirmed with a browser dialog, anywhere in the inbox code", () => {
  const files = ["components/admin/chat/ChatInbox.tsx", "components/admin/chat/ConversationList.tsx", "components/admin/chat/ConversationView.tsx", "components/admin/chat/LegacyMessages.tsx", "components/admin/chat/UnreadBadge.tsx", "app/admin/contacts/page.tsx", "app/admin/contacts/[id]/page.tsx"];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/, file);
    assert.doesNotMatch(source, /\.innerHTML|insertAdjacentHTML|document\.write/, file);
    assert.doesNotMatch(source, /window\.confirm|\bconfirm\(|\balert\(|\bprompt\(/, `${file} uses a browser dialog`);
  }
  assert.match(read("components/admin/chat/ConversationView.tsx"), /ConfirmDialog/, "delete asks in the page's own dialog");
  assert.match(read("components/admin/chat/ConversationView.tsx"), /whitespace-pre-wrap/, "line breaks are kept by the style, not by markup");
});

// ---------------------------------------------------------------------------
// Which screen /admin/contacts shows
// ---------------------------------------------------------------------------

function entry(file, name, chat) {
  const mocks = {
    "@/hooks/useChatAdmin": { useChatEnabled: () => chat },
    "@/components/admin/chat/ChatInbox": { ChatInbox: () => React.createElement("div", null, "THE INBOX") },
    "@/components/admin/contacts/LegacyContactsPage": { __esModule: true, default: () => React.createElement("div", null, "THE OLD LIST") },
    "@/components/admin/contacts/LegacyContactDetailPage": { __esModule: true, default: () => React.createElement("div", null, "THE OLD DETAIL") },
    "next/navigation": { useRouter: () => ({ replace: () => {} }), useParams: () => ({ id: "abc" }) },
  };
  const { module } = loadTsx(file, { mocks });
  return renderToStaticMarkup(React.createElement(module.default));
}

test("/admin/contacts shows the inbox while chat is on, and the old list, as it was, while it is off or unknown to be on", () => {
  assert.match(entry("app/admin/contacts/page.tsx", "page", "open"), /THE INBOX/);
  assert.match(entry("app/admin/contacts/page.tsx", "page", "closed"), /THE OLD LIST/);
  const loading = entry("app/admin/contacts/page.tsx", "page", "unknown");
  assert.doesNotMatch(loading, /THE INBOX|THE OLD LIST/, "while it is not known yet, neither is shown");
});

test("/admin/contacts/<id> shows the old detail while chat is off; while it is on the id is a conversation and the page only moves to the inbox", () => {
  assert.match(entry("app/admin/contacts/[id]/page.tsx", "page", "closed"), /THE OLD DETAIL/);
  const on = entry("app/admin/contacts/[id]/page.tsx", "page", "open");
  assert.doesNotMatch(on, /THE OLD DETAIL|THE INBOX/);
  assert.match(read("app/admin/contacts/[id]/page.tsx"), /router\.replace\(`\/admin\/contacts\?c=/);
});

test("the old screens were moved, not changed: the same calls and the same words as before", () => {
  const list = read("components/admin/contacts/LegacyContactsPage.tsx");
  assert.match(list, /NEXT_PUBLIC_API_BASE_URL/);
  assert.match(list, /Search name, email or subject/, "the old placeholder is kept exactly while chat is off");
  assert.match(list, /api\/contacts\?page=/);
  assert.match(read("components/admin/contacts/LegacyContactDetailPage.tsx"), /Send Email/, "the old detail keeps its buttons while chat is off");
});

// ---------------------------------------------------------------------------
// The colours and the glow
// ---------------------------------------------------------------------------

const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(hex(a)), luminance(hex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("the badge colours pass WCAG: the number on the yellow (4.5), the dark ring against a white or light sidebar (3), the yellow against a dark page (3)", () => {
  const css = read("app/globals.css");
  const fill = "#facc15";
  const ink = "#111827";
  const ring = "#92400e";
  for (const colour of [fill, ink, ring]) assert.ok(css.includes(colour), `${colour} is in globals.css`);
  const numberOnYellow = contrast(ink, fill);
  const ringOnWhite = contrast(ring, "#ffffff");
  const ringOnLightGrey = contrast(ring, "#f1f5f9");
  const yellowOnWhite = contrast(fill, "#ffffff");
  const yellowOnDark = contrast(fill, "#0b1120");
  const yellowOnDarkCard = contrast(fill, "#111a2e");
  console.log(`      badge contrast: number on yellow ${numberOnYellow.toFixed(1)}:1, ring on white ${ringOnWhite.toFixed(1)}:1, ring on light grey ${ringOnLightGrey.toFixed(1)}:1, yellow alone on white ${yellowOnWhite.toFixed(1)}:1, yellow on dark ${yellowOnDark.toFixed(1)}:1 and ${yellowOnDarkCard.toFixed(1)}:1`);
  assert.ok(numberOnYellow >= 4.5, `the number on the yellow is ${numberOnYellow}`);
  assert.ok(ringOnWhite >= 3 && ringOnLightGrey >= 3, "the ring makes the edge clear on a white or light-grey sidebar");
  assert.ok(yellowOnWhite < 3, "this is why the ring is needed: yellow alone on white is too faint");
  assert.ok(yellowOnDark >= 3 && yellowOnDarkCard >= 3, "on a dark page the yellow itself is clear");
});

test("the glow moves only when reduced motion is not requested: every animation in the badge's CSS sits inside prefers-reduced-motion: no-preference", () => {
  const css = read("app/globals.css");
  const start = css.indexOf(".chat-unread-badge {");
  assert.ok(start > 0);
  const block = css.slice(start);
  const media = block.indexOf("@media (prefers-reduced-motion: no-preference)");
  assert.ok(media > 0, "the media query is there");
  const baseRule = block.slice(0, media);
  assert.doesNotMatch(baseRule, /animation\s*:/, "the plain badge has no animation");
  assert.match(baseRule, /box-shadow: 0 0 0 1\.5px #92400e/, "and keeps its ring");
  const inside = block.slice(media, block.indexOf("@keyframes"));
  assert.match(inside, /animation:\s*chat-unread-glow/);
  assert.equal((css.match(/animation:\s*chat-unread-glow/g) || []).length, 1, "used in one place only");
});
