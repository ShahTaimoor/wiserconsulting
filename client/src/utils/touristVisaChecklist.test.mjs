// Run with: npm run test:unit   (from client/)

import test from "node:test";
import assert from "node:assert/strict";
import engine from "../shared/tourist-visa/engine.js";
import { buildChecklist, isFormOpen } from "./touristVisaChecklist.ts";

const { config } = engine;

test("the checklist follows the shared config: parts and sections in form order", () => {
  const checklist = buildChecklist(config, null);
  assert.deepEqual(checklist.parts.map((p) => p.id), ["1", "2"]);
  assert.deepEqual(checklist.parts.map((p) => p.sections.map((s) => s.id)), [["1"], ["2A", "2B", "2C", "2D"]]);
  assert.equal(checklist.total, config.sections.length);
  assert.equal(checklist.parts[1].sections[0].title, "Name, email and contact preferences");
});

test("before an application exists every section is not started", () => {
  const checklist = buildChecklist(config, null);
  assert.ok(checklist.parts.every((p) => p.sections.every((s) => s.state === "not_started")));
  assert.deepEqual([checklist.saved, checklist.needsReview], [0, 0]);
});

test("saved and needs-review sections are reported, everything else is not started", () => {
  const checklist = buildChecklist(config, { sectionStatus: { 1: "saved", "2A": "saved", "2C": "needs_review" } });
  const states = Object.fromEntries(checklist.parts.flatMap((p) => p.sections).map((s) => [s.id, s.state]));
  assert.deepEqual(states, { 1: "saved", "2A": "saved", "2B": "not_started", "2C": "needs_review", "2D": "not_started" });
  assert.deepEqual([checklist.saved, checklist.needsReview, checklist.total], [2, 1, 5]);
});

test("unexpected status values from the server are treated as not started", () => {
  const checklist = buildChecklist(config, { sectionStatus: { 1: "bogus", "2A": null, "9Z": "saved" } });
  assert.equal(checklist.saved, 0);
  assert.ok(checklist.parts.every((p) => p.sections.every((s) => s.state === "not_started")));
});

test("the form is open only with no blocked sections, or in preview mode", () => {
  assert.equal(isFormOpen(0, false), true);
  assert.equal(isFormOpen(5, false), false);
  assert.equal(isFormOpen(1, false), false);
  assert.equal(isFormOpen(5, true), true);
  assert.equal(isFormOpen(0, true), true);
});

test("with the current Parts 1-2 config the form is closed unless preview mode is on", () => {
  const blocked = engine.getReleaseBlockers(config).length;
  assert.ok(blocked > 0, "the config still has open tbc items");
  assert.equal(isFormOpen(blocked, false), false);
  assert.equal(isFormOpen(blocked, true), true);
});
