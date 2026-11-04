// Run with: npm run test:unit   (from client/)

import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_STATUSES,
  describeActivity,
  describeAdminError,
  emptyListText,
  filesOfRow,
  formatWhen,
  jumpLinks,
  listSummaryText,
  moveWords,
  pagerState,
  statusLabel,
} from "./touristVisaAdmin.ts";
import { listQueryString, touristVisaService, TouristVisaApiError } from "../services/touristVisaService.ts";

test("status labels: the three an administrator sees, and anything else as it is", () => {
  assert.deepEqual(ADMIN_STATUSES, ["submitted", "in_review", "completed"]);
  assert.deepEqual(ADMIN_STATUSES.map(statusLabel), ["Submitted", "In review", "Completed"]);
  assert.equal(statusLabel("draft"), "draft", "a draft is not a status the admin side knows");
});

test("a status move has its own button, question and confirm wording, and the question says what changes", () => {
  const start = moveWords("submitted", "in_review");
  assert.deepEqual([start.button, start.confirm], ["Start review", "Start review"]);
  assert.equal(start.title, "Start reviewing this application?");
  assert.equal(start.text, "The status changes from Submitted to In review. This is recorded in the activity log.");
  const done = moveWords("in_review", "completed");
  assert.deepEqual([done.button, done.title], ["Mark as completed", "Mark this application as completed?"]);
  assert.match(done.text, /from In review to Completed/);
  const reopen = moveWords("completed", "in_review");
  assert.deepEqual([reopen.button, reopen.confirm], ["Reopen for review", "Reopen for review"]);
  assert.match(reopen.text, /from Completed to In review/);
});

test("every failure of an admin call has plain words, and the server's own text is never shown", () => {
  const cases = [
    [{ status: 409, code: "INVALID_STATUS_MOVE" }, /not allowed from the application's current status/],
    [{ status: 409, code: "STATUS_CHANGED" }, /status changed while you were looking/],
    [{ status: 404, code: "APPLICATION_NOT_FOUND" }, /could not be found/],
    [{ status: 404, code: "DOCUMENT_NOT_FOUND" }, /file could not be found/],
    [{ status: 503, code: "STORAGE_UNAVAILABLE" }, /File storage isn't available/],
    [{ status: 400, code: "INVALID_QUERY" }, /search or filter is not valid/],
    [{ status: 404, closed: true }, /isn't open/],
    [{ status: 0 }, /couldn't reach the server/],
    [{ status: 401 }, /sign in again/],
    [{ status: 403 }, /do not have access/],
    [{ status: 404 }, /could not be found/],
    [{ status: 429 }, /Too many requests/],
    [{ status: 500 }, /our side/],
    [{ status: 418 }, /Something went wrong/],
  ];
  for (const [failure, pattern] of cases) assert.match(describeAdminError(failure), pattern, JSON.stringify(failure));
});

test("the list says what it shows: a range, a count, and a kind sentence when empty", () => {
  assert.equal(listSummaryText(1, 20, 45), "Showing 1 to 20 of 45 applications");
  assert.equal(listSummaryText(3, 20, 45), "Showing 41 to 45 of 45 applications");
  assert.equal(listSummaryText(1, 20, 1), "Showing 1 to 1 of 1 application");
  assert.equal(listSummaryText(1, 20, 0), "No applications");
  assert.match(emptyListText("fernandez", ""), /No applications match your search/);
  assert.match(emptyListText("", "in_review"), /No applications match your search/);
  assert.equal(emptyListText("   ", ""), "No applications have been submitted yet.");
});

test("the pager can go back from page 2 and forward until the last page", () => {
  assert.deepEqual(pagerState(1, 1), { hasPrevious: false, hasNext: false });
  assert.deepEqual(pagerState(1, 3), { hasPrevious: false, hasNext: true });
  assert.deepEqual(pagerState(2, 3), { hasPrevious: true, hasNext: true });
  assert.deepEqual(pagerState(3, 3), { hasPrevious: true, hasNext: false });
});

test("formatWhen writes a date and time, and nothing for a missing or bad one", () => {
  assert.equal(formatWhen("2026-10-31T11:56:00.000Z", "UTC"), "31 Oct 2026, 11:56");
  assert.equal(formatWhen("2027-03-01T00:05:00.000Z", "UTC"), "1 Mar 2027, 00:05");
  assert.equal(formatWhen(null), "");
  assert.equal(formatWhen(""), "");
  assert.equal(formatWhen("not a date"), "");
});

test("each line of the activity says who did what, in words", () => {
  const admin = { id: "a1", name: "Alex Auditor" };
  assert.deepEqual(describeActivity({ action: "overview_view", admin }), { who: "Alex Auditor", what: "opened the Overview" });
  assert.deepEqual(describeActivity({ action: "list_view", admin }), { who: "Alex Auditor", what: "saw the application in the list" });
  assert.deepEqual(describeActivity({ action: "document_link", admin }), { who: "Alex Auditor", what: "opened a file" });
  assert.deepEqual(describeActivity({ action: "status_change", admin, fromStatus: "submitted", toStatus: "in_review" }), { who: "Alex Auditor", what: "changed the status from Submitted to In review" });
  assert.equal(describeActivity({ action: "status_change", admin }).what, "changed the status");
  assert.equal(describeActivity({ action: "overview_view", admin: { id: "a2", name: "" } }).who, "An administrator");
});

test("the jump list has Notes first, a link for every section the Overview shows in order, and then Changes and Activity", () => {
  const review = { parts: [
    { id: "1", title: "Travel", sections: [{ id: "1", title: "Travel information", filesOnly: false, rows: [] }] },
    { id: "2", title: "Personal", sections: [{ id: "2A", title: "Name", filesOnly: false, rows: [] }, { id: "2B", title: "Identity", filesOnly: false, rows: [] }] },
  ] };
  assert.deepEqual(jumpLinks(review), [
    { href: "#notes", label: "Notes and calls" },
    { href: "#cover-letter", label: "Cover letter" },
    { href: "#itinerary", label: "Itinerary" },
    { href: "#section-1", label: "1 Travel information" },
    { href: "#section-2A", label: "2A Name" },
    { href: "#section-2B", label: "2B Identity" },
    { href: "#changes", label: "Changes" },
    { href: "#activity", label: "Activity" },
  ]);
  assert.deepEqual(jumpLinks({ parts: [] }), [{ href: "#notes", label: "Notes and calls" }, { href: "#cover-letter", label: "Cover letter" }, { href: "#itinerary", label: "Itinerary" }, { href: "#changes", label: "Changes" }, { href: "#activity", label: "Activity" }]);
});

test("the files of a file question are found through its slot", () => {
  const documents = [
    { id: "d1", slot: "passport", name: "a.pdf", size: 10, type: "application/pdf" },
    { id: "d2", slot: "funds", name: "b.pdf", size: 20, type: "application/pdf" },
    { id: "d3", slot: "funds", name: "c.png", size: 30, type: "image/png" },
  ];
  const slots = { q10_6: "passport", q10_7: "funds" };
  assert.deepEqual(filesOfRow("q10_6", slots, documents).map((d) => d.id), ["d1"]);
  assert.deepEqual(filesOfRow("q10_7", slots, documents).map((d) => d.id), ["d2", "d3"]);
  assert.deepEqual(filesOfRow("q1_1", slots, documents), [], "not a file question");
  assert.deepEqual(filesOfRow("q10_6", {}, documents), []);
});

// ---------------------------------------------------------------------------
// The service calls
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });
function stubFetch(status, body) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new SyntaxError("x"); return body; } };
  };
  return calls;
}

test("listQueryString: only what is set, the search text trimmed, page 1 left out", () => {
  assert.equal(listQueryString({}), "");
  assert.equal(listQueryString({ q: "  Fernandez  " }), "?q=Fernandez");
  assert.equal(listQueryString({ q: "a b&c=d" }), "?q=a+b%26c%3Dd", "text is encoded, never pasted in");
  assert.equal(listQueryString({ status: "in_review", page: 1 }), "?status=in_review");
  assert.equal(listQueryString({ q: "x", status: "completed", page: 3, pageSize: 10 }), "?q=x&status=completed&page=3&pageSize=10");
  assert.equal(listQueryString({ q: "   ", status: "" }), "");
});

test("adminList: GET with the Bearer token and the query, returns the page", async () => {
  const data = { applications: [{ id: "a1" }], page: 2, pageSize: 20, total: 21, totalPages: 2 };
  const calls = stubFetch(200, { success: true, data });
  const result = await touristVisaService.adminList("admin-token", { q: "TV-ABCDEFGH", page: 2 });
  assert.match(calls[0].url, /\/tourist-visa\/admin\/applications\?q=TV-ABCDEFGH&page=2$/);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer admin-token");
  assert.deepEqual(result, data);
});

test("adminOverview, adminActivity and adminDocumentLink: the right paths, with the ids encoded", async () => {
  const overview = { application: { id: "a1" }, call: {}, review: { parts: [] }, documents: [], fileSlots: {} };
  let calls = stubFetch(200, { success: true, data: overview });
  assert.deepEqual(await touristVisaService.adminOverview("t", "abc123"), overview);
  assert.match(calls[0].url, /\/tourist-visa\/admin\/applications\/abc123$/);

  calls = stubFetch(200, { success: true, data: { activity: [{ id: "r1" }] } });
  assert.deepEqual(await touristVisaService.adminActivity("t", "abc123"), [{ id: "r1" }]);
  assert.match(calls[0].url, /\/admin\/applications\/abc123\/activity$/);

  calls = stubFetch(200, { success: true, data: { url: "https://x.invalid/f", expiresAt: "2026-11-01T10:02:00.000Z" } });
  assert.deepEqual(await touristVisaService.adminDocumentLink("t", "a/b", "d?1"), { url: "https://x.invalid/f", expiresAt: "2026-11-01T10:02:00.000Z" });
  assert.match(calls[0].url, /\/admin\/applications\/a%2Fb\/documents\/d%3F1\/link$/);
});

test("adminSetStatus: PATCHes { status } as JSON and returns the new status and the moves still open", async () => {
  const calls = stubFetch(200, { success: true, data: { status: "in_review", allowedMoves: ["completed"] } });
  const result = await touristVisaService.adminSetStatus("t", "abc123", "in_review");
  assert.match(calls[0].url, /\/admin\/applications\/abc123\/status$/);
  assert.equal(calls[0].init.method, "PATCH");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), { status: "in_review" });
  assert.deepEqual(result, { status: "in_review", allowedMoves: ["completed"] });
});

test("the admin calls keep the server's status and code on a refusal, flag the closed answer, and reject a strange answer", async () => {
  stubFetch(403, { success: false, message: "Access denied. Admins only." });
  await assert.rejects(() => touristVisaService.adminList("t"), (e) => e instanceof TouristVisaApiError && e.status === 403);
  stubFetch(409, { success: false, code: "INVALID_STATUS_MOVE", message: "x" });
  await assert.rejects(() => touristVisaService.adminSetStatus("t", "a", "completed"), (e) => e.status === 409 && e.code === "INVALID_STATUS_MOVE");
  stubFetch(404, { success: false, code: "FEATURE_CLOSED", message: "x" });
  await assert.rejects(() => touristVisaService.adminOverview("t", "a"), (e) => e.closed === true);
  for (const call of [() => touristVisaService.adminList("t"), () => touristVisaService.adminOverview("t", "a"), () => touristVisaService.adminActivity("t", "a"), () => touristVisaService.adminDocumentLink("t", "a", "d"), () => touristVisaService.adminSetStatus("t", "a", "in_review")]) {
    stubFetch(200, { success: true, data: {} });
    await assert.rejects(call, (e) => e.status === 502);
  }
  globalThis.fetch = async () => { throw new TypeError("network"); };
  await assert.rejects(() => touristVisaService.adminList("t"), (e) => e.status === 0);
});
