// Run with: npm run test:unit   (from client/). All answers are made-up test data.
// Config 1.3.0: "Have you travelled to any other country more than 10 years ago?" (8.3) and its group of older trips.
// The form's side: what it asks for, what it sends, how it lists the server's errors, and the hint under the leave date.

import test from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import engine from "../shared/tourist-visa/engine.js";
import { sectionItems, sectionKeys, initialValues, buildPayload, collectErrors, hintFor, isGroupOpen } from "./touristVisaForm.ts";

const cfg = engine.config;
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const TRIP = { q8_2a: "FR", q8_2b: "tourism", q8_2c: ago(400), q8_2d: ago(390) };
const OLD = { q8_3a: "FR", q8_3b: "tourism", q8_3c: "2003-03-01", q8_3d: "2003-03-10" };
const payload = (values, saved = {}) => buildPayload(cfg, "8", values, saved).answers;
const question = (id) => cfg.questions.find((q) => q.id === id);
const TOO_RECENT = "Trips in the last 10 years go in the travel history above.";

test("section 8 lists the recent trips first and then 8.3 with its own group, and the ids of Part 8 are the same as before", () => {
  const ids = sectionItems(cfg, "8").map((i) => (i.kind === "question" ? i.question.id : `group:${i.group.id}`));
  assert.deepEqual(ids, ["q8_1", "q8_1a", "q8_2", "group:otherCountryTrips", "q8_3", "group:olderCountryTrips"]);
  assert.deepEqual([...sectionKeys(cfg, "8")].sort(), ["otherCountryTrips", "olderCountryTrips", "q8_1", "q8_1a", "q8_2", "q8_3"].sort());
  const group = sectionItems(cfg, "8").find((i) => i.kind === "group" && i.group.id === "olderCountryTrips");
  assert.deepEqual(group.members.map((m) => m.id), ["q8_3a", "q8_3b", "q8_3c", "q8_3d"]);
  assert.ok(group.members.every((m) => m.required === true), "every field is required");
  assert.equal(question("q8_3").required, true);
});

test("the older trip fields are the recent trip fields: the same types, labels and options", () => {
  for (const [recent, older] of [["q8_2a", "q8_3a"], ["q8_2b", "q8_3b"], ["q8_2c", "q8_3c"], ["q8_2d", "q8_3d"]]) {
    assert.equal(question(older).type, question(recent).type, older);
    assert.equal(question(older).label, question(recent).label, older);
    assert.deepEqual(question(older).options, question(recent).options, older);
  }
});

test("8.3 Yes opens the group with one empty entry to fill in; No and unanswered keep it closed", () => {
  const group = cfg.groups.find((g) => g.id === "olderCountryTrips");
  assert.deepEqual(initialValues(cfg, "8", { q8_3: true }).olderCountryTrips, [{}]);
  assert.equal(initialValues(cfg, "8", { q8_3: false }).olderCountryTrips, undefined);
  assert.equal(initialValues(cfg, "8", {}).olderCountryTrips, undefined);
  assert.equal(isGroupOpen(cfg, group, { q8_3: true }), true);
  assert.equal(isGroupOpen(cfg, group, { q8_3: false }), false);
  assert.equal(isGroupOpen(cfg, group, {}), false);
  assert.deepEqual(initialValues(cfg, "8", { q8_3: true, olderCountryTrips: [OLD] }).olderCountryTrips, [OLD], "saved entries are kept");
});

test("saving with 8.3 Yes sends the older trips; with No, or with 8.3 left unanswered, stale entries are not sent", () => {
  const yes = payload({ q8_1: 0, q8_2: false, q8_3: true, olderCountryTrips: [OLD, { ...OLD, q8_3a: "DE" }] });
  assert.deepEqual(yes, { q8_1: 0, q8_2: false, q8_3: true, olderCountryTrips: [OLD, { ...OLD, q8_3a: "DE" }] });
  const no = payload({ q8_1: 0, q8_2: false, q8_3: false, olderCountryTrips: [OLD] });
  assert.deepEqual(no, { q8_1: 0, q8_2: false, q8_3: false });
  const unanswered = payload({ q8_1: 0, q8_2: false, olderCountryTrips: [OLD] });
  assert.deepEqual(unanswered, { q8_1: 0, q8_2: false });
});

test("an empty older entry is sent as an empty entry, so the server's errors line up with what is on screen", () => {
  assert.deepEqual(payload({ q8_1: 0, q8_2: false, q8_3: true, olderCountryTrips: [{}] }).olderCountryTrips, [{}]);
  const result = engine.validateSection(z, cfg, "8", payload({ q8_1: 0, q8_2: false, q8_3: true, olderCountryTrips: [{}] }), {});
  const items = collectErrors(cfg, "8", result.errors);
  assert.deepEqual(items.map((i) => [i.targetId, i.message, i.label]), [
    ["field-olderCountryTrips-0-q8_3a", "This question is required", "Older trip 1: Which country did you visit?"],
    ["field-olderCountryTrips-0-q8_3b", "This question is required", "Older trip 1: What was the reason for your visit?"],
    ["field-olderCountryTrips-0-q8_3c", "This question is required", "Older trip 1: When did you enter this country?"],
    ["field-olderCountryTrips-0-q8_3d", "This question is required", "Older trip 1: When did you leave this country?"],
  ]);
});

test("a recent trip in the older group is refused with the message, listed under the right entry and in form order after the recent trips", () => {
  const values = { q8_1: 1, q8_2: true, q8_3: true, otherCountryTrips: [{ ...TRIP, q8_2d: TRIP.q8_2c }], olderCountryTrips: [OLD, { ...OLD, q8_3c: "1999-01-01", q8_3d: ago(100) }] };
  const result = engine.validateSection(z, cfg, "8", payload(values), {});
  const items = collectErrors(cfg, "8", result.errors);
  assert.deepEqual(items.map((i) => [i.targetId, i.message, i.label]), [
    ["field-otherCountryTrips-0-q8_2d", "Must be after the date in question 8.2c", "Trip 1: When did you leave this country?"],
    ["field-olderCountryTrips-1-q8_3d", TOO_RECENT, "Older trip 2: When did you leave this country?"],
  ]);
});

test("a valid older trip, one empty-looking answer for 8.3 left out, and 8.3 itself, validate on the form's own payload", () => {
  const ok = engine.validateSection(z, cfg, "8", payload({ q8_1: 0, q8_2: false, q8_3: true, olderCountryTrips: [OLD] }), {});
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  const missing = engine.validateSection(z, cfg, "8", payload({ q8_1: 0, q8_2: false }), {});
  assert.deepEqual(collectErrors(cfg, "8", missing.errors).map((i) => [i.targetId, i.message]), [["field-q8_3", "This question is required"]]);
});

test("the hint under the leave date says it must be more than 10 years ago, and the recent leave date keeps its own hint", () => {
  assert.match(hintFor(cfg, question("q8_3d")), /Must be more than 10 years ago\./);
  assert.match(hintFor(cfg, question("q8_3d")), /Cannot be in the future\./);
  assert.doesNotMatch(hintFor(cfg, question("q8_3d")), /within the past/);
  assert.match(hintFor(cfg, question("q8_2d")), /Must be within the past 10 years\./);
  assert.doesNotMatch(hintFor(cfg, question("q8_2d")), /more than 10 years ago/);
  assert.equal(hintFor(cfg, question("q8_3c")), "Cannot be in the future.");
});
