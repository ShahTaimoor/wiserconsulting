// Run with: npm run test:unit   (from client/). Step 8f: the diff, the form logic and the wording of the admin edit. All made-up data.

import test from "node:test";
import assert from "node:assert/strict";
import engine from "../shared/tourist-visa/engine.js";
import {
  appendEntry,
  applyAnswer,
  applyEntryAnswer,
  buildChanges,
  dropEntry,
  editableSectionIds,
  initialValues,
  MAX_CHANGES_PER_REQUEST,
  sameValue,
  workingAnswers,
} from "./touristVisaForm.ts";
import {
  ADMIN_FLAGS,
  CALL_OUTCOMES,
  describeActivity,
  describeAdminError,
  describeEditFailure,
  flagLabel,
  lineTitle,
  noteState,
  outcomeLabel,
  previewSummaryText,
  problemsText,
  reasonState,
  toggleFlag,
} from "./touristVisaAdmin.ts";
import { listQueryString, touristVisaService, TouristVisaApiError } from "../services/touristVisaService.ts";

const cfg = engine.config;

// A small made-up application: enough sections for the changes below.
const BASE = {
  q2_1: "Testfirst", q2_2: "Testlast", q2_3: false, q2_4: "test.applicant@example.com", q2_5: "me", q2_6: false,
  q2_9: "test.applicant@example.com", q2_10: "test.applicant@example.com", q2_11: "test.applicant@example.com",
  q2_12: "female", q2_13: "single", q2_14: "GB", q2_15: "GB", q2_16: "Testville", q2_17: "1990-01-01", q2_18: false, q2_23: false,
  q2_32: { countryCode: "+44", number: "7700 900123" }, q2_33: "in_uk", q2_34: "mobile", q2_35: ["call", "sms"],
  q3_1: "FAKE-PASSPORT-9876", q3_2: "Test Passport Office", q3_3: "2022-05-01", q3_4: "2032-05-01",
  q4_8: true, parents: [{ q4_8a: "mother", q4_8b: "Testmother", q4_8c: "Testsurname", q4_8d: "1962-01-02", q4_8e: "GB", q4_8f: true }],
  q9_11: true, q9_12: true, q9_1: false, q9_2: false,
};

/** The edits the page would hold after the admin changed `section` by `mutate`. */
function edit(section, mutate, base = BASE) {
  const start = initialValues(cfg, section, base);
  return { [section]: mutate(start) };
}

test("sameValue: empty answers count as absent and key order does not matter", () => {
  assert.equal(sameValue(undefined, ""), true);
  assert.equal(sameValue(undefined, null), true);
  assert.equal(sameValue("  ", undefined), true);
  assert.equal(sameValue({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  assert.equal(sameValue(false, undefined), false, "No is an answer");
  assert.equal(sameValue(0, undefined), false);
  assert.equal(sameValue(["call", "sms"], ["sms", "call"]), false, "the order of ticks is part of the answer");
});

test("workingAnswers: every edited section replaces its own answers and nothing else", () => {
  const edits = { ...edit("2D", (v) => ({ ...v, q2_33: "outside_uk" })), ...edit("3", (v) => ({ ...v, q3_1: "NEW-ID" })) };
  const working = workingAnswers(cfg, BASE, edits);
  assert.equal(working.q2_33, "outside_uk");
  assert.equal(working.q3_1, "NEW-ID");
  assert.equal(working.q2_1, "Testfirst");
  assert.deepEqual(working.parents, BASE.parents);
  assert.equal(BASE.q3_1, "FAKE-PASSPORT-9876", "the original is never changed");
});

test("buildChanges: nothing changed, nothing sent", () => {
  assert.deepEqual(buildChanges(cfg, BASE, {}), []);
  assert.deepEqual(buildChanges(cfg, BASE, edit("2D", (v) => v)), []);
  assert.deepEqual(buildChanges(cfg, BASE, { ...edit("2D", (v) => v), ...edit("4C", (v) => v), ...edit("9A", (v) => v) }), []);
});

test("buildChanges: only the answers that differ are sent, one change each", () => {
  const changes = buildChanges(cfg, BASE, edit("2D", (v) => ({ ...v, q2_32: { countryCode: "+44", number: "7700 900555" } })));
  assert.deepEqual(changes, [{ questionId: "q2_32", value: { countryCode: "+44", number: "7700 900555" } }]);
  const two = buildChanges(cfg, BASE, edit("3", (v) => ({ ...v, q3_1: "NEW-ID", q3_2: "New Office" })));
  assert.deepEqual(two.map((c) => c.questionId), ["q3_1", "q3_2"]);
});

test("buildChanges: several sections come out in form order whatever order they were edited in", () => {
  const edits = { ...edit("3", (v) => ({ ...v, q3_1: "NEW-ID" })), ...edit("2D", (v) => ({ ...v, q2_33: "outside_uk" })) };
  assert.deepEqual(buildChanges(cfg, BASE, edits).map((c) => c.questionId), ["q2_33", "q3_1"]);
});

test("buildChanges: an answer cleared on purpose is sent as null; one the edit hid is not sent (the server removes it)", () => {
  const optional = cfg.questions.find((q) => !q.group && !q.required && q.type === "TXT" && q.section === "3" && BASE[q.id] === undefined);
  const withOptional = { ...BASE, ...(optional ? { [optional.id]: "Something" } : {}) };
  if (optional) assert.deepEqual(buildChanges(cfg, withOptional, edit("3", (v) => ({ ...v, [optional.id]: "" }), withOptional)), [{ questionId: optional.id, value: null }]);

  // Yes -> No on 4.8: the parents' group is closed, so it is not sent, only the Yes/No itself
  const changes = buildChanges(cfg, BASE, edit("4C", (v) => applyAnswer(cfg, v, "q4_8", false)));
  assert.deepEqual(changes, [{ questionId: "q4_8", value: false }]);
});

test("buildChanges: a follow-up question that the edit hides is not sent (the server removes it), but one cleared while still shown is", () => {
  const base = { ...BASE, q10_4: "other", q10_4a: "Sindhi" };
  const hidden = buildChanges(cfg, base, edit("10C", (v) => ({ ...v, q10_4: "english" }), base));
  assert.deepEqual(hidden, [{ questionId: "q10_4", value: "english" }]);
  const cleared = buildChanges(cfg, base, edit("10C", (v) => ({ ...v, q10_4a: "" }), base));
  assert.deepEqual(cleared, [{ questionId: "q10_4a", value: null }]);
});

test("buildChanges: an answer inside a repeating group's entry is sent with its entry number", () => {
  const changes = buildChanges(cfg, BASE, edit("4C", (v) => applyEntryAnswer(v, "parents", 0, "q4_8b", "Newmother")));
  assert.deepEqual(changes, [{ questionId: "q4_8b", index: 0, value: "Newmother" }]);
  const several = buildChanges(cfg, BASE, edit("4C", (v) => applyEntryAnswer(applyEntryAnswer(v, "parents", 0, "q4_8b", "Newmother"), "parents", 0, "q4_8c", "Newsurname")));
  assert.deepEqual(several.map((c) => [c.questionId, c.index]), [["q4_8b", 0], ["q4_8c", 0]]);
});

test("buildChanges: a follow-up that becomes necessary is sent with the answer that caused it", () => {
  const changes = buildChanges(cfg, BASE, edit("4C", (v) => applyEntryAnswer(applyEntryAnswer(v, "parents", 0, "q4_8f", false), "parents", 0, "q4_8h", "FR")));
  assert.deepEqual(changes, [{ questionId: "q4_8f", index: 0, value: false }, { questionId: "q4_8h", index: 0, value: "FR" }]);
});

test("buildChanges: a group that is opened, or gets more or fewer entries, is sent as a whole", () => {
  const opened = buildChanges(cfg, BASE, edit("2A", (v) => applyEntryAnswer(applyAnswer(cfg, v, "q2_3", true), "otherNames", 0, "q2_3a", "Aliasfirst")));
  assert.deepEqual(opened.map((c) => c.questionId), ["q2_3", "otherNames"]);
  assert.deepEqual(opened[1].value, [{ q2_3a: "Aliasfirst" }]);

  const longer = buildChanges(cfg, BASE, edit("4C", (v) => applyEntryAnswer(appendEntry(v, "parents"), "parents", 1, "q4_8b", "Testfather")));
  assert.equal(longer.length, 1);
  assert.equal(longer[0].questionId, "parents");
  assert.equal(longer[0].index, undefined);
  assert.equal(longer[0].value.length, 2);
  assert.deepEqual(longer[0].value[0], BASE.parents[0], "the first entry is sent unchanged inside the group");

  const base2 = { ...BASE, parents: [BASE.parents[0], { ...BASE.parents[0], q4_8b: "Second" }] };
  const shorter = buildChanges(cfg, base2, edit("4C", (v) => dropEntry(v, "parents", 1), base2));
  assert.deepEqual(shorter, [{ questionId: "parents", value: [BASE.parents[0]] }]);
});

test("buildChanges: the declaration ticks are never sent, even if their section was opened", () => {
  const changes = buildChanges(cfg, BASE, edit("9A", (v) => ({ ...v, q9_11: false, q9_1: true, q9_1a: "Made-up details" })));
  assert.equal(changes.some((c) => ["q9_11", "q9_12", "q9_13", "q9_14"].includes(c.questionId)), false);
  assert.equal(changes.some((c) => c.questionId === "q9_1"), true);
});

test("buildChanges: a change in one section can open another; its answers go in the same list", () => {
  const edits = {
    ...edit("2B", (v) => ({ ...v, q2_13: "married" })),
    "4A": { q4_1: "Partnerfirst", q4_2: "Partnerlast", q4_3: "1991-02-03", q4_4: "GB", q4_5: true, q4_6: true },
  };
  const changes = buildChanges(cfg, BASE, edits);
  assert.deepEqual(changes.map((c) => c.questionId), ["q2_13", "q4_1", "q4_2", "q4_3", "q4_4", "q4_5", "q4_6"]);
});

test("the server takes at most 30 changes at once", () => {
  assert.equal(MAX_CHANGES_PER_REQUEST, 30);
});

test("applyAnswer, applyEntryAnswer, appendEntry and dropEntry give new values and never change the old ones", () => {
  const start = initialValues(cfg, "4C", BASE);
  const frozen = JSON.stringify(start);
  const next = applyEntryAnswer(start, "parents", 2, "q4_8b", "Third");
  assert.equal(next.parents.length, 3, "filled with blanks up to this entry");
  assert.deepEqual(next.parents[1], {});
  assert.equal(JSON.stringify(start), frozen);
  assert.equal(appendEntry(start, "parents").parents.length, 2);
  assert.equal(dropEntry(next, "parents", 0).parents.length, 2);
  assert.equal(applyAnswer(cfg, { q2_3: false }, "q2_3", true).otherNames.length, 1, "Yes gives the group its first entry");
  assert.equal(applyAnswer(cfg, { q2_3: true, otherNames: [{ q2_3a: "A" }] }, "q2_3", true).otherNames.length, 1, "and keeps the ones already there");
});

test("editableSectionIds: the sections that apply, never the files section", () => {
  const ids = editableSectionIds(cfg, BASE);
  assert.ok(ids.includes("2D") && ids.includes("4C") && ids.includes("9A"));
  assert.equal(ids.includes("10D"), false);
  assert.equal(ids.includes("4A"), false, "no partner section while single");
  assert.equal(editableSectionIds(cfg, { ...BASE, q2_13: "married" }).includes("4A"), true);
});

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

test("the reason box: 10 to 1000 characters once trimmed, with a counter and a plain message", () => {
  assert.deepEqual(reasonState(""), { length: 0, counter: "0 of 1000", valid: false, message: "Give the reason for the change (at least 10 characters)." });
  assert.equal(reasonState("   123456789   ").valid, false);
  assert.equal(reasonState("   123456789   ").message, "Write at least 10 characters (1 more).");
  assert.equal(reasonState("  1234567890  ").valid, true);
  assert.equal(reasonState("  1234567890  ").counter, "10 of 1000");
  assert.equal(reasonState("x".repeat(1000)).valid, true);
  assert.deepEqual([reasonState("x".repeat(1001)).valid, reasonState("x".repeat(1001)).message], [false, "That is 1 characters too long."]);
});

test("a note: required for a note, optional for a call, up to 2000 characters", () => {
  assert.equal(noteState("", true).valid, false);
  assert.equal(noteState("   ", true).message, "Write the note first.");
  assert.equal(noteState("", false).valid, true);
  assert.equal(noteState("x".repeat(2000), true).valid, true);
  assert.equal(noteState("x".repeat(2001), false).valid, false);
  assert.equal(noteState(" hello ", true).counter, "5 of 2000");
});

test("flags: five fixed words with labels, toggled in a fixed order", () => {
  assert.deepEqual(ADMIN_FLAGS.map(flagLabel), ["Needs a call", "Called", "Waiting for the applicant", "Verified", "Concern"]);
  assert.equal(flagLabel("something_else"), "something_else");
  assert.deepEqual(toggleFlag([], "concern"), ["concern"]);
  assert.deepEqual(toggleFlag(["concern"], "needs_call"), ["needs_call", "concern"]);
  assert.deepEqual(toggleFlag(["needs_call", "concern"], "needs_call"), ["concern"]);
  assert.deepEqual(toggleFlag(["needs_call"], "needs_call"), []);
});

test("call outcomes have words", () => {
  assert.deepEqual(CALL_OUTCOMES.map(outcomeLabel), ["Spoke to them", "No answer", "Wrong number", "Call back later"]);
});

test("every refusal of an edit has a plain sentence, and a stale one, an invalid one and a locked one are told apart", () => {
  const cases = [
    ["REVISION_CHANGED", /Someone else changed this application/], ["STATUS_NOT_EDITABLE", /completed application cannot be edited/], ["CHANGES_INVALID", /need attention/],
    ["NO_CHANGES", /Nothing would change/], ["TOO_MANY_CHANGES", /too many changes/], ["INVALID_REASON", /between 10 and 1000/], ["TRANSACTIONS_UNAVAILABLE", /transactions|server/],
    ["NOT_EDITABLE_DECLARATION", /cannot be changed by an administrator/], ["NOT_EDITABLE_DOCUMENTS", /cannot be changed by an administrator/],
  ];
  for (const [code, pattern] of cases) assert.match(describeAdminError({ status: 400, code }), pattern, code);
  assert.equal(describeEditFailure({ status: 409, code: "REVISION_CHANGED" }).kind, "stale");
  assert.equal(describeEditFailure({ status: 409, code: "STATUS_NOT_EDITABLE" }).kind, "locked");
  const invalid = describeEditFailure({ status: 422, code: "CHANGES_INVALID", sections: [{ id: "2A", problems: 3 }] });
  assert.deepEqual([invalid.kind, invalid.sections], ["invalid", [{ id: "2A", problems: 3 }]]);
  assert.deepEqual(describeEditFailure({ status: 500 }).sections, []);
});

test("the preview is summed up in words", () => {
  assert.equal(previewSummaryText({ changes: 1, removed: 0, required: 0 }), "1 answer changed");
  assert.equal(previewSummaryText({ changes: 2, removed: 6, required: 1 }), "2 answers changed, 6 removed, 1 question now needed");
  assert.equal(problemsText(1), "1 thing to check");
  assert.equal(problemsText(3), "3 things to check");
  assert.equal(lineTitle({ number: "2.32", label: "Telephone" }), "2.32 Telephone");
  assert.equal(lineTitle({ number: null, label: "Parent details" }), "Parent details");
});

test("the activity says what the new rows mean", () => {
  const admin = { id: "a1", name: "Alex Auditor" };
  const what = (action, extra = {}) => describeActivity({ action, admin, ...extra }).what;
  assert.equal(what("changes_apply"), "corrected answers");
  assert.equal(what("changes_preview"), "previewed a correction");
  assert.equal(what("changes_view"), "looked at the history of corrections");
  assert.equal(what("edit_open"), "opened the answers to correct them");
  assert.equal(what("notes_view"), "read the notes and calls");
  assert.equal(what("notes_add"), "added a note or logged a call");
  assert.equal(what("flags_change", { fromFlags: [], toFlags: ["needs_call", "concern"] }), "changed the flags from no flags to Needs a call, Concern");
  assert.equal(what("flags_change", { fromFlags: ["verified"], toFlags: [] }), "changed the flags from Verified to no flags");
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

test("listQueryString: the flag filter", () => {
  assert.equal(listQueryString({ flag: "needs_call" }), "?flag=needs_call");
  assert.equal(listQueryString({ flag: "" }), "");
  assert.equal(listQueryString({ q: "x", status: "in_review", flag: "concern", page: 2 }), "?q=x&status=in_review&flag=concern&page=2");
});

test("adminPreviewChanges sends a dry run with the revision and no reason; adminApplyChanges sends the reason and no dry run", async () => {
  const preview = { dryRun: true, revision: 3, sections: [], changes: [], removed: [], required: [] };
  let calls = stubFetch(200, { success: true, data: preview });
  const changes = [{ questionId: "q2_32", value: { countryCode: "+44", number: "7700 900555" } }];
  assert.deepEqual(await touristVisaService.adminPreviewChanges("t", "abc123", { expectedRevision: 3, changes }), preview);
  assert.match(calls[0].url, /\/tourist-visa\/admin\/applications\/abc123\/changes$/);
  assert.equal(calls[0].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].init.body), { expectedRevision: 3, changes, dryRun: true });

  calls = stubFetch(200, { success: true, data: { dryRun: false, revision: 4, applied: 1 } });
  assert.deepEqual(await touristVisaService.adminApplyChanges("t", "abc123", { expectedRevision: 3, reason: "A good enough reason", changes }), { revision: 4, applied: 1 });
  assert.deepEqual(JSON.parse(calls[0].init.body), { expectedRevision: 3, reason: "A good enough reason", changes });
  assert.equal("dryRun" in JSON.parse(calls[0].init.body), false);
});

test("a refused correction keeps the code, the sections to fix and the message for each field; a conflict keeps its code", async () => {
  stubFetch(422, { success: false, message: "Some answers need attention.", code: "CHANGES_INVALID", sections: [{ id: "4A", problems: 6 }, { id: "x", problems: "no" }], errors: { q4_1: "Enter a value", q4_2: 5 } });
  await assert.rejects(() => touristVisaService.adminPreviewChanges("t", "a", { expectedRevision: 0, changes: [] }), (e) => {
    assert.ok(e instanceof TouristVisaApiError);
    assert.equal(e.status, 422);
    assert.equal(e.code, "CHANGES_INVALID");
    assert.deepEqual(e.sections, [{ id: "4A", problems: 6 }]);
    assert.deepEqual(e.fieldErrors, { q4_1: "Enter a value" });
    return true;
  });
  stubFetch(409, { success: false, message: "x", code: "REVISION_CHANGED" });
  await assert.rejects(() => touristVisaService.adminApplyChanges("t", "a", { expectedRevision: 0, reason: "long enough reason", changes: [] }), (e) => e.status === 409 && e.code === "REVISION_CHANGED");
});

test("the form, the history, the notes and the flags: the right paths, methods and bodies", async () => {
  const form = { application: { id: "a1", reference: "TV-AAAAAAAA", status: "submitted", revision: 2, configVersion: "1" }, config: { version: "1" }, answers: {} };
  let calls = stubFetch(200, { success: true, data: form });
  assert.deepEqual(await touristVisaService.adminEditForm("t", "a/b"), form);
  assert.match(calls[0].url, /\/admin\/applications\/a%2Fb\/edit-form$/);

  calls = stubFetch(200, { success: true, data: { revision: 1, history: [{ id: "h1" }] } });
  assert.deepEqual(await touristVisaService.adminChanges("t", "a1"), [{ id: "h1" }]);
  assert.match(calls[0].url, /\/admin\/applications\/a1\/changes$/);
  assert.equal(calls[0].init.method, "GET");

  calls = stubFetch(200, { success: true, data: { notes: [{ id: "n1" }] } });
  assert.deepEqual(await touristVisaService.adminNotes("t", "a1"), [{ id: "n1" }]);
  assert.match(calls[0].url, /\/admin\/applications\/a1\/notes$/);

  calls = stubFetch(201, { success: true, data: { note: { id: "n2", kind: "call", outcome: "reached", text: "", at: "x", admin: { id: "u", name: "n" } } } });
  const note = await touristVisaService.adminAddNote("t", "a1", { kind: "call", outcome: "reached" });
  assert.equal(note.id, "n2");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { kind: "call", outcome: "reached" });

  calls = stubFetch(200, { success: true, data: { flags: ["needs_call"] } });
  assert.deepEqual(await touristVisaService.adminSetFlags("t", "a1", ["needs_call"]), ["needs_call"]);
  assert.match(calls[0].url, /\/admin\/applications\/a1\/flags$/);
  assert.equal(calls[0].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].init.body), { flags: ["needs_call"] });
});

test("a strange answer from the server is rejected instead of being shown", async () => {
  for (const call of [
    () => touristVisaService.adminEditForm("t", "a"),
    () => touristVisaService.adminPreviewChanges("t", "a", { expectedRevision: 0, changes: [] }),
    () => touristVisaService.adminApplyChanges("t", "a", { expectedRevision: 0, reason: "long enough reason", changes: [] }),
    () => touristVisaService.adminChanges("t", "a"),
    () => touristVisaService.adminNotes("t", "a"),
    () => touristVisaService.adminAddNote("t", "a", { kind: "note", text: "x" }),
    () => touristVisaService.adminSetFlags("t", "a", []),
  ]) {
    stubFetch(200, { success: true, data: {} });
    await assert.rejects(call, (e) => e.status === 502);
  }
});
