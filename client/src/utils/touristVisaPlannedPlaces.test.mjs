// Run with: npm run test:unit   (from client/). All answers are made-up test data.
// The questions of config 1.6.0 on the applicant's side: the section of the places they plan to visit (10E), the Other option shown first in the two
// new lists, the form's payload and the errors pointing at the right field. The real shared config and rules are used.

import test from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import engine from "../shared/tourist-visa/engine.js";
import { buildChecklist } from "./touristVisaChecklist.ts";
import { buildPayload, collectErrors, hintFor, initialValues, isGroupOpen, nextSectionId, previousSectionId, sectionItems } from "./touristVisaForm.ts";

const cfg = engine.config;
const saved = { q1_6: "2027-03-01", q1_7: "2027-03-15", q6_7: false };
const place = (name, from, to, extra = {}) => ({ q10_28a: name, q10_28b: from, q10_28c: to, ...extra });
const payload = (values, existing = saved) => buildPayload(cfg, "10E", values, existing).answers;
const validate = (values, existing = saved) => engine.validateSection(z, cfg, "10E", payload(values, existing), existing);
const q = (id) => cfg.questions.find((x) => x.id === id);

test("the section 10E is on the checklist only while 6.7 is No, and it is second-last, before the documents", () => {
  const ids = (answers) => buildChecklist(cfg, { sectionStatus: {}, answers }).parts.flatMap((p) => p.sections.map((s) => s.id));
  assert.equal(ids({ q6_7: true }).includes("10E"), false);
  assert.equal(ids({}).includes("10E"), false, "6.7 is not answered yet: nothing to ask");
  const withIt = ids({ q6_7: false });
  assert.equal(withIt.includes("10E"), true);
  assert.deepEqual(withIt.slice(-3), ["10C", "10E", "10D"]);
  assert.equal(nextSectionId(cfg, "10C", { q6_7: false }), "10E");
  assert.equal(nextSectionId(cfg, "10C", { q6_7: true }), "10D");
  assert.equal(previousSectionId(cfg, "10D", { q6_7: false }), "10E");
  assert.equal(previousSectionId(cfg, "10D", { q6_7: true }), "10C");
});

test("the form shows the Yes/No first, and the places and their Other box only after a Yes", () => {
  const items = sectionItems(cfg, "10E").map((item) => (item.kind === "group" ? item.group.id : item.question.id));
  assert.deepEqual(items, ["q10_28", "plannedPlaces"], "the Yes/No, then the group of places");
  const group = cfg.groups.find((g) => g.id === "plannedPlaces");
  assert.equal(isGroupOpen(cfg, group, { q6_7: false }), false);
  assert.equal(isGroupOpen(cfg, group, { q6_7: false, q10_28: false }), false);
  assert.equal(isGroupOpen(cfg, group, { q6_7: false, q10_28: true }), true);
});

test("Other is the first option of the place list and of the who-with list, and the 94 options are the 93 places A to Z after it", () => {
  const places = engine.resolveOptions(cfg, "q10_28a", saved, {});
  assert.equal(places.length, 94);
  assert.deepEqual(places[0], { value: "other", label: "Other (please write)" });
  assert.deepEqual(places.slice(1).map((o) => o.label), [...places.slice(1).map((o) => o.label)].sort((a, b) => a.localeCompare(b, "en")));
  assert.deepEqual(engine.resolveOptions(cfg, "q6_7e", saved, {})[0], { value: "other", label: "Other (please write)" });
  // An existing list is left as it is written: Other where the config puts it.
  const existing = engine.resolveOptions(cfg, "q6_7x", saved, {});
  assert.equal(existing[existing.length - 1].value, "other");
});

test("the Other box of a place is labelled for a town or city, and is asked right under the question, only when Other is chosen", () => {
  assert.equal(q("q10_28a_other").label, "Name of the town or city");
  assert.equal(cfg.questions[cfg.questions.indexOf(q("q10_28a")) + 1].id, "q10_28a_other");
  const entry = (extra = {}) => initialValues(cfg, "10E", { ...saved, q10_28: true, plannedPlaces: [place("London", "2027-03-01", "2027-03-02", extra)] });
  assert.ok(entry({ q10_28a_other: "kept" }).plannedPlaces[0].q10_28a);
  const visible = (name) => engine.isVisible(cfg, "q10_28a_other", { ...saved, q10_28: true }, { q10_28a: name });
  assert.equal(visible("other"), true);
  assert.equal(visible("London"), false);
});

test("the payload of the section keeps a place from the list, drops the written text of a list place, and keeps a written place", () => {
  const sent = payload({ q10_28: true, plannedPlaces: [place("Bath", "2027-03-01", "2027-03-04", { q10_28a_other: "left over" }), place("other", "2027-03-04", "2027-03-06", { q10_28a_other: "Stoke on Trent" })] });
  assert.equal(sent.plannedPlaces[0].q10_28a, "Bath");
  assert.equal(sent.plannedPlaces[0].q10_28a_other, undefined, "text left under a place of the list is not sent");
  assert.equal(sent.plannedPlaces[1].q10_28a_other, "Stoke on Trent");
  assert.equal(validate({ q10_28: true, plannedPlaces: [place("Bath", "2027-03-01", "2027-03-04"), place("other", "2027-03-04", "2027-03-06", { q10_28a_other: "Stoke on Trent" })] }).success, true);
  // 6.7 Yes: nothing of the section is sent at all.
  assert.deepEqual(payload({ q10_28: true, plannedPlaces: [place("Bath", "2027-03-01", "2027-03-04")] }, { ...saved, q6_7: true }), {});
});

test("a written place that is not a town comes back as an error under the Other box, with the plain message", () => {
  const result = validate({ q10_28: true, plannedPlaces: [place("other", "2027-03-01", "2027-03-04", { q10_28a_other: "12 Acacia Avenue" })] });
  assert.equal(result.success, false);
  const items = collectErrors(cfg, "10E", result.errors);
  assert.deepEqual(items.map((i) => i.targetId), ["field-plannedPlaces-0-q10_28a_other"]);
  assert.equal(items[0].message, "Write only the name of a town or city");
  assert.equal(items[0].label, "Place you will visit 1: Written answer: Which place will you visit?", "named after the question it belongs to, as every Other box is");
});

test("an empty place shows a required error on each of its three fields, in form order", () => {
  const result = validate({ q10_28: true, plannedPlaces: [{}] });
  const items = collectErrors(cfg, "10E", result.errors);
  assert.deepEqual(items.map((i) => i.targetId), ["field-plannedPlaces-0-q10_28a", "field-plannedPlaces-0-q10_28b", "field-plannedPlaces-0-q10_28c"]);
  assert.ok(items.every((i) => i.message === "This question is required"));
});

test("the dates: errors point at the right place and field, and the hints are worded like the stays'", () => {
  const outside = collectErrors(cfg, "10E", validate({ q10_28: true, plannedPlaces: [place("Bath", "2027-02-20", "2027-03-04")] }).errors);
  assert.deepEqual(outside.map((i) => i.targetId), ["field-plannedPlaces-0-q10_28b"]);
  assert.match(outside[0].message, /on or after the date in question 1\.6/);
  const overlap = collectErrors(cfg, "10E", validate({ q10_28: true, plannedPlaces: [place("Bath", "2027-03-01", "2027-03-06"), place("York", "2027-03-05", "2027-03-09")] }).errors);
  assert.deepEqual(overlap.map((i) => [i.targetId, i.message]), [["field-plannedPlaces-1-q10_28b", "Overlaps the dates of Place you will visit 1"]]);
  const touching = validate({ q10_28: true, plannedPlaces: [place("Bath", "2027-03-01", "2027-03-05"), place("York", "2027-03-05", "2027-03-09")] });
  assert.equal(touching.success, true);
  assert.equal(hintFor(cfg, q("q10_28c")), "Must be on or after the date in question 10.28b. Must be on or before the date in question 1.7.");
});
