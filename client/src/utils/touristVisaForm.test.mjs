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
const ALL = { 1: V1, "2A": V2A, "2B": V2B, "2C": V2C, "2D": V2D };

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

test("every question of Parts 1-2 is rendered exactly once across the sections", () => {
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
  assert.equal(nextSectionId(cfg, "2D"), null);
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
