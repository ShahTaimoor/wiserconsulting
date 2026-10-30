// Run with: npm run test:unit   (from client/). All answers are made-up test data.

import test from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import engine from "../shared/tourist-visa/engine.js";
import {
  sectionKeys,
  sectionItems,
  nextSectionId,
  previousSectionId,
  cleanValue,
  initialValues,
  isGroupOpen,
  mergedAnswers,
  buildPayload,
  valuesEqual,
  errorTargetId,
  subErrors,
  withoutErrorsFor,
  withoutEntryErrors,
  collectErrors,
  hintFor,
} from "./touristVisaForm.ts";

const cfg = engine.config;

// Valid made-up values for each section, as the form would hold them.
const V1 = { q1_1: "tourism", q1_2: false, q1_3: false, q1_4: "tbc_a", q1_5: "Test trip.", q1_6: "2027-03-01", q1_7: "2027-03-15" };
const V2A = {
  q2_1: "Testfirst", q2_2: "Testlast", q2_3: false, q2_4: "test.applicant@example.com", q2_5: "tbc_self", q2_6: false,
  q2_9: "test.applicant@example.com", q2_10: "test.applicant@example.com", q2_11: "test.applicant@example.com",
};
const V2B = {
  q2_12: "tbc_a", q2_13: "tbc_single", q2_14: "GB", q2_15: "GB", q2_16: "Testville", q2_17: "1990-01-01",
  q2_18: true, q2_19: "FAKE-ID-0001", q2_20: "Test Authority", q2_23: false,
};
const V2C = {
  q2_24: { line1: "1 Test Street", town: "Testville", country: "GB" }, q2_25: true,
  q2_27: { years: 2, months: 3 }, q2_28: "tbc_owned", q2_30: false, q2_31: false,
};
const V2D = { q2_32: { countryCode: "+44", number: "7700 900123" }, q2_33: "tbc_a", q2_34: "mobile", q2_35: ["call"] };
const V3 = { q3_1: "FAKE-PASSPORT-9876", q3_2: "Test Passport Office", q3_3: "2022-05-01", q3_4: "2032-05-01" };
const V4A = { q4_1: "Testpartner", q4_2: "Testsurname", q4_3: "1991-02-03", q4_4: "GB", q4_5: true, q4_6: false };
const DEPENDANT = { q4_7a: "tbc_child", q4_7b: "Testchild", q4_7c: "Testsurname", q4_7d: "2015-06-07", q4_7e: true, q4_7f: false };
const V4B = { q4_7: true, dependants: [DEPENDANT] };
const PARENT = { q4_8a: "tbc_mother", q4_8b: "Testmother", q4_8c: "Testsurname", q4_8d: "1962-01-02", q4_8e: "GB", q4_8f: true };
const V4C = { parents: [PARENT, { ...PARENT, q4_8a: "tbc_father", q4_8b: "Testfather", q4_8f: false }] };
const gbp = (amount) => ({ amount, currency: "GBP" });
const V5 = {
  q5_1: "tbc_employed", q5_2: "2019-04", q5_3: "Test Employer Ltd",
  q5_4: { line1: "3 Test Street", town: "Testville", country: "GB" },
  q5_5: { countryCode: "+44", number: "20 7946 0000" }, q5_6: "Test Analyst",
  q5_7: gbp(2500.5), q5_8: "Made-up description of a made-up job.", q5_9: "Previous Test Co",
};
const V6A = { q6_1: "tbc_savings", q6_2: gbp(8000), q6_3: gbp(1500), q6_4: gbp(900), q6_5: false };
const STAY = {
  q6_7a: "Test Hotel", q6_7b: { line1: "2 Test Road", town: "Testtown", country: "GB" },
  q6_7c: "2027-03-01", q6_7d: "2027-03-08",
};
const V6C = { q6_7: true, accommodation: [STAY, { ...STAY, q6_7a: "Second Hotel", q6_7c: "2027-03-08", q6_7d: "2027-03-15" }] };
// 2.13 is married here, so that section 4A applies and is exercised too.
const ALL = {
  1: V1, "2A": V2A, "2B": { ...V2B, q2_13: "tbc_married" }, "2C": V2C, "2D": V2D, 3: V3, "4A": V4A, "4B": V4B, "4C": V4C,
  5: V5, "6A": V6A, "6B": { q6_6: false }, "6C": V6C, "6D": { q6_8: false },
};

const payload = (section, values, saved = {}) => buildPayload(cfg, section, values, saved).answers;

/** A small two-section config for rules the real Parts 1-2 do not exercise yet. */
function mk(questions, groups = []) {
  return {
    version: "t",
    limits: { txtMax: 50, lngMax: 200, groupMax: 3 },
    parts: [{ id: "1", title: "P" }],
    sections: [{ id: "A", part: "1", title: "A" }, { id: "B", part: "1", title: "B" }],
    groups: groups.map((g) => ({ section: "A", entryLabel: "Entry", max: 3, ...g })),
    questions: questions.map((q) => ({ section: "A", required: true, label: "L", ...q })),
  };
}

// ---------------------------------------------------------------------------
// What to render
// ---------------------------------------------------------------------------

test("sectionKeys lists a section's questions and its repeating groups", () => {
  assert.deepEqual(sectionKeys(cfg, "1"), ["q1_1", "q1_2", "q1_3", "q1_4", "q1_5", "q1_6", "q1_7"]);
  const keys2A = sectionKeys(cfg, "2A");
  assert.ok(keys2A.includes("otherNames") && !keys2A.includes("q2_3a") && keys2A.includes("q2_3"));
});

test("sectionItems puts the repeating group once, right after its Yes/No question", () => {
  const items = sectionItems(cfg, "2A");
  const ids = items.map((i) => (i.kind === "question" ? i.question.id : `group:${i.group.id}`));
  const gate = ids.indexOf("q2_3");
  assert.equal(ids[gate + 1], "group:otherNames");
  assert.equal(ids[gate + 2], "q2_4");
  assert.equal(ids.filter((i) => i.startsWith("group:")).length, 1);
  const group = items.find((i) => i.kind === "group");
  assert.deepEqual(group.members.map((m) => m.id), ["q2_3a", "q2_3b"]);
});

test("every question of every part is rendered exactly once across the sections", () => {
  const seen = [];
  for (const section of cfg.sections) {
    for (const item of sectionItems(cfg, section.id)) {
      if (item.kind === "question") seen.push(item.question.id);
      else seen.push(...item.members.map((m) => m.id));
    }
  }
  assert.deepEqual([...seen].sort(), cfg.questions.map((q) => q.id).sort());
});

test("next and previous section follow the form order", () => {
  assert.equal(nextSectionId(cfg, "1"), "2A");
  assert.equal(nextSectionId(cfg, "2C"), "2D");
  assert.equal(nextSectionId(cfg, "2D"), "3");
  assert.equal(nextSectionId(cfg, "4C"), "5");
  assert.equal(nextSectionId(cfg, "5"), "6A");
  assert.equal(nextSectionId(cfg, "6D"), null);
  assert.equal(previousSectionId(cfg, "6A"), "5");
  assert.equal(nextSectionId(cfg, "nope"), null);
  assert.equal(previousSectionId(cfg, "1"), null);
  assert.equal(previousSectionId(cfg, "2B"), "2A");
});

// ---------------------------------------------------------------------------
// cleanValue and initial values
// ---------------------------------------------------------------------------

test("cleanValue drops empty answers and keeps real ones, including false and 0", () => {
  for (const empty of [undefined, null, "", "   ", [], {}, { a: "" }, { a: { b: [] } }, Number.NaN]) {
    assert.equal(cleanValue(empty), undefined, JSON.stringify(empty));
  }
  assert.equal(cleanValue(false), false);
  assert.equal(cleanValue(0), 0);
  assert.equal(cleanValue(" x "), " x ");
  assert.deepEqual(cleanValue({ line1: "a", line2: "", town: "  " }), { line1: "a" });
  assert.deepEqual(cleanValue({ years: 0, months: 0 }), { years: 0, months: 0 });
  assert.deepEqual(cleanValue(["call"]), ["call"]);
});

test("cleanValue ignores prototype-pollution keys", () => {
  const evil = JSON.parse('{"__proto__": {"polluted": true}, "line1": "a"}');
  assert.deepEqual(cleanValue(evil), { line1: "a" });
  assert.equal({}.polluted, undefined);
});

test("initialValues starts from the saved answers and never aliases them", () => {
  const saved = { ...V2C, q1_5: "belongs to another section" };
  const values = initialValues(cfg, "2C", saved);
  assert.deepEqual(values.q2_24, saved.q2_24);
  assert.equal("q1_5" in values, false);
  values.q2_24.line1 = "changed";
  assert.equal(saved.q2_24.line1, "1 Test Street", "editing the form does not touch the saved copy");
});

test("initialValues pre-fills the account email only when nothing is saved for 2.4", () => {
  assert.equal(initialValues(cfg, "2A", {}, { email: "me@example.com" }).q2_4, "me@example.com");
  assert.equal(initialValues(cfg, "2A", { q2_4: "saved@example.com" }, { email: "me@example.com" }).q2_4, "saved@example.com");
  assert.equal(initialValues(cfg, "2A", {}, {}).q2_4, undefined);
  assert.equal(initialValues(cfg, "2B", {}, { email: "me@example.com" }).q2_4, undefined);
});

test("initialValues gives an open repeating group one entry to fill in", () => {
  assert.deepEqual(initialValues(cfg, "2A", { q2_3: true }).otherNames, [{}]);
  assert.deepEqual(initialValues(cfg, "2A", { q2_3: true, otherNames: [{ q2_3a: "A", q2_3b: "B" }] }).otherNames, [{ q2_3a: "A", q2_3b: "B" }]);
  assert.equal(initialValues(cfg, "2A", { q2_3: false }).otherNames, undefined);
});

// ---------------------------------------------------------------------------
// buildPayload
// ---------------------------------------------------------------------------

test("payload: a complete section is sent as typed", () => {
  assert.deepEqual(payload("1", V1), V1);
});

test("payload: hidden questions are left out even if they hold a value", () => {
  const out = payload("1", { ...V1, q1_1: "tbc_other" }); // 1.4 only shows for the tourism option
  assert.equal("q1_4" in out, false);
  const noSecond = payload("2A", { ...V2A, q2_6: false, q2_7: "x@example.com", q2_8: "tbc_self" });
  assert.equal("q2_7" in noSecond || "q2_8" in noSecond, false);
  const noId = payload("2B", { ...V2B, q2_18: false });
  assert.equal(["q2_19", "q2_20", "q2_21", "q2_22"].some((k) => k in noId), false);
});

test("payload: empty and whitespace-only answers are left out, false and 0 are kept", () => {
  const out = payload("1", { ...V1, q1_5: "   ", q1_6: "" });
  assert.equal("q1_5" in out || "q1_6" in out, false);
  assert.equal(out.q1_2, false);
  const dur = payload("2C", { ...V2C, q2_27: { years: 0, months: 0 } });
  assert.deepEqual(dur.q2_27, { years: 0, months: 0 });
});

test("payload: a choice that is no longer on offer is left out, not sent as invalid", () => {
  // 2.9 was picked, then the email in 2.4 was changed: the old address is no longer an option.
  const out = payload("2A", { ...V2A, q2_4: "new@example.com", q2_9: "test.applicant@example.com" });
  assert.equal("q2_9" in out, false);
  assert.equal(out.q2_10, undefined);
  const kept = payload("2A", { ...V2A, q2_4: "new@example.com", q2_9: "new@example.com" });
  assert.equal(kept.q2_9, "new@example.com");
  const bogus = payload("2B", { ...V2B, q2_14: "United Kingdom" });
  assert.equal("q2_14" in bogus, false, "a country must be one of the listed codes");
});

test("payload: checklist answers keep only the options on offer", () => {
  assert.deepEqual(payload("2D", { ...V2D, q2_35: ["call", "fax"] }).q2_35, ["call"]);
  assert.equal("q2_35" in payload("2D", { ...V2D, q2_35: ["fax"] }), false);
});

test("payload: repeating-group entries keep their position, blank ones included", () => {
  const values = { ...V2A, q2_3: true, otherNames: [{ q2_3a: "Alias", q2_3b: "" }, {}, { q2_3a: "Third", q2_3b: "Name", stray: "x" }] };
  assert.deepEqual(payload("2A", values).otherNames, [{ q2_3a: "Alias" }, {}, { q2_3a: "Third", q2_3b: "Name" }]);
});

test("payload: a repeating group is only sent while its Yes/No is Yes", () => {
  const entries = [{ q2_3a: "Alias", q2_3b: "One" }];
  assert.equal("otherNames" in payload("2A", { ...V2A, q2_3: false, otherNames: entries }), false);
  assert.equal("otherNames" in payload("2A", { ...V2A, q2_3: undefined, otherNames: entries }), false);
  assert.deepEqual(payload("2A", { ...V2A, q2_3: true, otherNames: [] }).otherNames, []);
});

test("payload: conditions use answers saved in other sections", () => {
  const two = mk([
    { id: "q1_1", number: "1.1", type: "YN" },
    { id: "q2_1", number: "2.1", type: "TXT", section: "B", showWhen: { q: "q1_1", eq: true } },
  ]);
  assert.deepEqual(engine.validateConfig(two), []);
  assert.deepEqual(buildPayload(two, "B", { q2_1: "Partner" }, { q1_1: true }).answers, { q2_1: "Partner" });
  assert.deepEqual(buildPayload(two, "B", { q2_1: "Partner" }, { q1_1: false }).answers, {});
  assert.deepEqual(buildPayload(two, "B", { q2_1: "Partner" }, {}).answers, {});
});

test("payload: file questions are skipped, entry-level conditions are honoured", () => {
  const c = mk(
    [
      { id: "q1_1", number: "1.1", type: "YN" },
      { id: "q1_2", number: "1.2", type: "SEL", group: "trips", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
      { id: "q1_3", number: "1.3", type: "TXT", group: "trips", showWhen: { q: "q1_2", eq: "b" } },
      { id: "q1_4", number: "1.4", type: "FILE" },
    ],
    [{ id: "trips", gate: "q1_1", questions: ["q1_2", "q1_3"] }]
  );
  assert.deepEqual(engine.validateConfig(c), []);
  const out = buildPayload(c, "A", { q1_1: true, q1_4: "file.pdf", trips: [{ q1_2: "a", q1_3: "stale" }, { q1_2: "b", q1_3: "kept" }] }, {}).answers;
  assert.equal("q1_4" in out, false);
  assert.deepEqual(out.trips, [{ q1_2: "a" }, { q1_2: "b", q1_3: "kept" }]);
});

test("payload: never mutates the values it is given", () => {
  const values = Object.freeze({ ...V2A, q2_3: true, otherNames: Object.freeze([Object.freeze({ q2_3a: "A", q2_3b: "B" })]) });
  assert.doesNotThrow(() => buildPayload(cfg, "2A", values, Object.freeze({})));
});

test("round trip: the payload built for every section passes the shared validation", () => {
  const saved = {};
  for (const section of cfg.sections) {
    const answers = payload(section.id, ALL[section.id], saved);
    const result = engine.validateSection(z, cfg, section.id, answers, saved);
    assert.equal(result.success, true, `${section.id}: ${JSON.stringify(result.errors)}`);
    Object.assign(saved, result.data);
  }
});

test("round trip: a section with an open repeating group and the second email passes", () => {
  const values = {
    ...V2A, q2_3: true, otherNames: [{ q2_3a: "Alias", q2_3b: "One" }, { q2_3a: "Second", q2_3b: "Alias" }],
    q2_6: true, q2_7: "second@example.com", q2_8: "tbc_other", q2_10: "second@example.com",
  };
  const result = engine.validateSection(z, cfg, "2A", payload("2A", values), {});
  assert.equal(result.success, true, JSON.stringify(result.errors));
});

test("a deliberately wrong date comes back as an error on the right field", () => {
  const answers = payload("1", { ...V1, q1_7: "2027-02-01" }); // leaves before arriving
  const result = engine.validateSection(z, cfg, "1", answers, {});
  assert.equal(result.success, false);
  const items = collectErrors(cfg, "1", result.errors);
  assert.equal(items.length, 1);
  assert.equal(items[0].targetId, "field-q1_7");
  assert.equal(items[0].label, "1.7 Date you plan to leave the UK");
  assert.match(items[0].message, /after the date in question 1\.6/);
});

test("mergedAnswers combines other sections as saved with this section as edited", () => {
  const merged = mergedAnswers(cfg, "1", { q1_1: "stale", q2_1: "Other section" }, { q1_1: "tourism", q1_5: "   " });
  assert.deepEqual(merged, { q2_1: "Other section", q1_1: "tourism" });
});

// ---------------------------------------------------------------------------
// Unsaved changes
// ---------------------------------------------------------------------------

test("valuesEqual ignores empty answers and key order, and notices real changes", () => {
  assert.equal(valuesEqual({ a: "x", b: "" }, { a: "x" }), true);
  assert.equal(valuesEqual({ a: { y: 1, x: 2 } }, { a: { x: 2, y: 1 } }), true);
  assert.equal(valuesEqual({ a: "x" }, { a: "y" }), false);
  assert.equal(valuesEqual({ a: false }, {}), false, "false is an answer");
  assert.equal(valuesEqual({ a: [{ q: "1" }] }, { a: [{ q: "2" }] }), false);
  assert.equal(valuesEqual({ a: [{}] }, { a: [] }), false, "adding a blank entry counts as a change");
  assert.equal(valuesEqual({}, {}), true);
});

// ---------------------------------------------------------------------------
// Server errors -> fields
// ---------------------------------------------------------------------------

test("errorTargetId turns an error key into the id of the control", () => {
  assert.equal(errorTargetId("q1_7"), "field-q1_7");
  assert.equal(errorTargetId("q2_24.line1"), "field-q2_24-line1");
  assert.equal(errorTargetId("otherNames.1.q2_3b"), "field-otherNames-1-q2_3b");
  assert.equal(errorTargetId("otherNames"), "field-otherNames");
});

test("subErrors and withoutErrorsFor handle compound answers", () => {
  const errors = { "q2_24.line1": "Required", "q2_24.country": "Pick one", q2_24: "Whole", q2_241: "Different question", q1_7: "Later" };
  assert.deepEqual(subErrors(errors, "q2_24"), { line1: "Required", country: "Pick one" });
  assert.deepEqual(withoutErrorsFor(errors, "q2_24"), { q2_241: "Different question", q1_7: "Later" });
  assert.deepEqual(withoutErrorsFor(errors, "q9_9"), errors);
});

test("withoutEntryErrors clears only one question of one entry", () => {
  const errors = { "otherNames.0.q2_3a": "a", "otherNames.1.q2_3a": "b", "otherNames.1.q2_3b": "c", otherNames: "group" };
  assert.deepEqual(withoutEntryErrors(errors, "otherNames", 1, "q2_3a"), { "otherNames.0.q2_3a": "a", "otherNames.1.q2_3b": "c", otherNames: "group" });
});

test("collectErrors lists errors in form order with readable names and targets", () => {
  const items = collectErrors(cfg, "2A", {
    "otherNames.1.q2_3b": "This question is required",
    q2_9: "Choose from the listed options",
    q2_1: "This question is required",
    otherNames: "Add at least one entry",
    "otherNames.0.q2_3a": "This question is required",
  });
  assert.deepEqual(items.map((i) => i.key), ["q2_1", "otherNames", "otherNames.0.q2_3a", "otherNames.1.q2_3b", "q2_9"]);
  assert.equal(items[0].label, "2.1 Given name(s)");
  assert.equal(items[1].label, "Other name");
  assert.equal(items[2].label, "Other name 1: Given name(s)");
  assert.equal(items[3].label, "Other name 2: Family name");
  assert.deepEqual(items.map((i) => i.targetId), ["field-q2_1", "field-otherNames", "field-otherNames-0-q2_3a", "field-otherNames-1-q2_3b", "field-q2_9"]);
});

test("collectErrors keeps keys it does not recognise, so nothing the server reported is lost", () => {
  const items = collectErrors(cfg, "1", { q1_7: "Bad", mystery: "Something else" });
  assert.deepEqual(items.map((i) => [i.key, i.label]), [["q1_7", "1.7 Date you plan to leave the UK"], ["mystery", "This section"]]);
});

test("collectErrors names compound-answer errors after the question", () => {
  const [item] = collectErrors(cfg, "2C", { "q2_24.line1": "This question is required" });
  assert.equal(item.label, "2.24 Address");
  assert.equal(item.targetId, "field-q2_24-line1");
});

// ---------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------

test("hintFor builds a hint from the question's rules", () => {
  const q = (id) => cfg.questions.find((x) => x.id === id);
  assert.equal(hintFor(cfg, q("q1_7")), "Must be after the date in question 1.6.");
  assert.equal(hintFor(cfg, q("q2_17")), "Cannot be in the future.");
  assert.equal(hintFor(cfg, q("q2_21")), "Cannot be in the future.");
  assert.match(hintFor(cfg, q("q2_32")), /country code/);
  assert.equal(hintFor(cfg, q("q2_1")), undefined);
  assert.equal(hintFor({ ...cfg }, { ...q("q2_1"), help: "Use your passport spelling." }), "Use your passport spelling.");
});

// ---------------------------------------------------------------------------
// Step 6a: Parts 3 and 4
// ---------------------------------------------------------------------------

test("next and previous section skip a section that does not apply (4A without a partner)", () => {
  const single = { q2_13: "tbc_single" };
  assert.equal(nextSectionId(cfg, "3", single), "4B");
  assert.equal(previousSectionId(cfg, "4B", single), "3");
  for (const status of ["tbc_married", "tbc_partner"]) {
    assert.equal(nextSectionId(cfg, "3", { q2_13: status }), "4A");
    assert.equal(previousSectionId(cfg, "4B", { q2_13: status }), "4A");
  }
  assert.equal(nextSectionId(cfg, "3", {}), "4B", "no 2.13 answer yet: no partner section");
  assert.equal(nextSectionId(cfg, "4C", single), "5");
  assert.equal(nextSectionId(cfg, "6D", single), null);
  assert.equal(previousSectionId(cfg, "1", single), null);
  assert.equal(nextSectionId(cfg, "3"), "4A", "without answers the plain order is used");
});

test("a group without a Yes/No question is always open", () => {
  const parents = cfg.groups.find((g) => g.id === "parents");
  assert.equal(isGroupOpen(cfg, parents, {}), true);
  const dependants = cfg.groups.find((g) => g.id === "dependants");
  assert.equal(isGroupOpen(cfg, dependants, {}), false);
  assert.equal(isGroupOpen(cfg, dependants, { q4_7: true }), true);
  assert.equal(isGroupOpen(cfg, dependants, { q4_7: false }), false);
});

test("initialValues gives the always-open parents group an entry to fill in, and keeps saved ones", () => {
  assert.deepEqual(initialValues(cfg, "4C", {}).parents, [{}]);
  assert.deepEqual(initialValues(cfg, "4C", { parents: [PARENT] }).parents, [PARENT]);
  assert.equal(initialValues(cfg, "4B", {}).dependants, undefined, "a gated group stays closed until its Yes/No is Yes");
  assert.deepEqual(initialValues(cfg, "4B", { q4_7: true }).dependants, [{}]);
});

test("initialValues gives a group with a larger minimum that many blank entries", () => {
  const c = mk([{ id: "q1_1", number: "1.1", type: "TXT", group: "people" }], [{ id: "people", questions: ["q1_1"], min: 2 }]);
  assert.deepEqual(initialValues(c, "A", {}).people, [{}, {}]);
});

test("payload: the parents group is sent with its entries, blank ones included, so errors line up", () => {
  assert.deepEqual(payload("4C", { parents: [{}] }), { parents: [{}] });
  assert.deepEqual(payload("4C", { parents: [PARENT, { q4_8b: "  " }] }), { parents: [PARENT, {}] });
});

test("payload: section 4A is empty while 2.13 does not indicate a partner, and full once it does", () => {
  assert.deepEqual(payload("4A", V4A, { q2_13: "tbc_single" }), {});
  assert.deepEqual(payload("4A", V4A, {}), {});
  assert.deepEqual(payload("4A", V4A, { q2_13: "tbc_partner" }), V4A);
});

test("payload: yes/no answers inside a dependants entry stay real booleans, false included", () => {
  const out = payload("4B", V4B);
  assert.equal(out.dependants[0].q4_7e, true);
  assert.equal(out.dependants[0].q4_7f, false);
});

test("round trip: with 2.13 = single the 4A payload is empty and validates as nothing to answer", () => {
  const saved = { q2_13: "tbc_single" };
  const answers = payload("4A", V4A, saved);
  const result = engine.validateSection(z, cfg, "4A", answers, saved);
  assert.equal(result.success, true);
  assert.deepEqual(result.data, {});
});

test("round trip: the passport expiry is checked against the leave date saved in section 1", () => {
  const saved = { q1_7: "2027-03-15" };
  const early = engine.validateSection(z, cfg, "3", payload("3", { ...V3, q3_4: "2027-03-15" }, saved), saved);
  assert.equal(early.success, false);
  const items = collectErrors(cfg, "3", early.errors);
  assert.equal(items.length, 1);
  assert.equal(items[0].targetId, "field-q3_4");
  assert.equal(items[0].label, "3.4 Expiry date");
  assert.match(items[0].message, /after the date in question 1\.7/);
  const ok = engine.validateSection(z, cfg, "3", payload("3", V3, saved), saved);
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
});

test("collectErrors names parent and dependant entries and points at the right control", () => {
  const items = collectErrors(cfg, "4C", { "parents.1.q4_8b": "This question is required", parents: "Add at least one entry" });
  assert.deepEqual(items.map((i) => [i.label, i.targetId]), [
    ["Parent", "field-parents"],
    ["Parent 2: Given names", "field-parents-1-q4_8b"],
  ]);
  const dep = collectErrors(cfg, "4B", { "dependants.0.q4_7d": "Cannot be in the future" });
  assert.deepEqual([dep[0].label, dep[0].targetId], ["Dependant 1: Date of birth", "field-dependants-0-q4_7d"]);
});

test("hintFor words a date that must follow several earlier dates", () => {
  const q34 = cfg.questions.find((q) => q.id === "q3_4");
  assert.equal(hintFor(cfg, q34), "Must be after the dates in questions 3.3 and 1.7.");
  assert.equal(hintFor(cfg, cfg.questions.find((q) => q.id === "q1_7")), "Must be after the date in question 1.6.");
});

test("every Part 3 and Part 4 section renders: no section is empty and the sensitive passport number turns autocomplete off", () => {
  for (const id of ["3", "4A", "4B", "4C"]) assert.ok(sectionItems(cfg, id).length > 0, id);
  assert.equal(cfg.questions.find((q) => q.id === "q3_1").sensitive, true);
});

// ---------------------------------------------------------------------------
// Step 6b: Parts 5 and 6
// ---------------------------------------------------------------------------

test("hintFor words the inclusive trip-date rules of a place of stay", () => {
  const q = (id) => cfg.questions.find((x) => x.id === id);
  assert.equal(hintFor(cfg, q("q6_7c")), "Must be on or after the date in question 1.6. Must be on or before the date in question 1.7.");
  assert.equal(hintFor(cfg, q("q6_7d")), "Must be after the date in question 6.7c. Must be on or before the date in question 1.7.");
  assert.equal(hintFor(cfg, q("q5_9")), "Leave this blank if you have no previous employment to list.");
});

test("initialValues: the accommodation group stays closed until 6.7 is Yes, then offers one place of stay", () => {
  assert.equal(initialValues(cfg, "6C", {}).accommodation, undefined);
  assert.deepEqual(initialValues(cfg, "6C", { q6_7: true }).accommodation, [{}]);
  assert.deepEqual(initialValues(cfg, "6C", { q6_7: true, accommodation: V6C.accommodation }).accommodation, V6C.accommodation);
});

test("payload: section 5 sends only 5.1 unless the status is employed", () => {
  assert.deepEqual(payload("5", V5), V5);
  assert.deepEqual(payload("5", { ...V5, q5_1: "tbc_student" }), { q5_1: "tbc_student" });
  assert.deepEqual(payload("5", { ...V5, q5_1: "tbc_student" }, {}), { q5_1: "tbc_student" });
});

test("payload: an amount of zero is a real answer and is kept; an empty amount is not", () => {
  assert.deepEqual(payload("6A", { ...V6A, q6_4: gbp(0) }).q6_4, gbp(0));
  assert.equal("q6_4" in payload("6A", { ...V6A, q6_4: undefined }), false);
});

test("payload: places of stay are sent only while 6.7 is Yes", () => {
  assert.deepEqual(payload("6C", { ...V6C, q6_7: false }), { q6_7: false });
  assert.deepEqual(payload("6C", V6C).accommodation.length, 2);
});

test("round trip: the optional previous employer can be left out", () => {
  const { q5_9, ...rest } = V5;
  const result = engine.validateSection(z, cfg, "5", payload("5", rest), {});
  assert.equal(result.success, true, JSON.stringify(result.errors));
});

test("round trip: a negative or oversized amount comes back as an error on the amount box", () => {
  const bad = engine.validateSection(z, cfg, "5", payload("5", { ...V5, q5_7: gbp(-5) }), {});
  assert.equal(bad.success, false);
  const items = collectErrors(cfg, "5", bad.errors);
  assert.deepEqual(items.map((i) => [i.targetId, i.message]), [["field-q5_7-amount", "Cannot be negative"]]);
  assert.equal(items[0].label, "5.7 How much do you earn each month - after tax?");

  const big = engine.validateSection(z, cfg, "6A", payload("6A", { ...V6A, q6_3: gbp(2000000) }), {});
  assert.equal(collectErrors(cfg, "6A", big.errors)[0].message, "Amount cannot be more than 1,000,000");
});

test("round trip: a stay outside the travel dates, and overlapping stays, point at the right place-of-stay field", () => {
  const saved = { q1_6: "2027-03-01", q1_7: "2027-03-15" };
  const outside = engine.validateSection(z, cfg, "6C", payload("6C", { ...V6C, accommodation: [{ ...STAY, q6_7c: "2027-02-20" }] }, saved), saved);
  const items = collectErrors(cfg, "6C", outside.errors);
  assert.deepEqual(items.map((i) => i.targetId), ["field-accommodation-0-q6_7c"]);
  assert.equal(items[0].label, "Place of stay 1: When will you arrive there?");
  assert.match(items[0].message, /on or after the date in question 1\.6/);

  const overlap = { ...V6C, accommodation: [STAY, { ...STAY, q6_7a: "Second Hotel", q6_7c: "2027-03-05", q6_7d: "2027-03-12" }] };
  const result = engine.validateSection(z, cfg, "6C", payload("6C", overlap, saved), saved);
  const overlapItems = collectErrors(cfg, "6C", result.errors);
  assert.deepEqual(overlapItems.map((i) => [i.targetId, i.message]), [
    ["field-accommodation-1-q6_7c", "Overlaps the dates of Place of stay 1"],
  ]);
});

test("round trip: stays that meet on the same day are accepted", () => {
  const saved = { q1_6: "2027-03-01", q1_7: "2027-03-15" };
  const result = engine.validateSection(z, cfg, "6C", payload("6C", V6C, saved), saved);
  assert.equal(result.success, true, JSON.stringify(result.errors));
});

test("every Part 5 and Part 6 section renders: no section is empty", () => {
  for (const id of ["5", "6A", "6B", "6C", "6D"]) assert.ok(sectionItems(cfg, id).length > 0, id);
});
