// Run with: npm run test:unit   (from client/)

import test from "node:test";
import assert from "node:assert/strict";
import engine from "../shared/tourist-visa/engine.js";
import { buildChecklist, isFormOpen } from "./touristVisaChecklist.ts";

const { config } = engine;

test("the checklist follows the shared config: parts and sections in form order, without sections that do not apply", () => {
  const checklist = buildChecklist(config, null);
  assert.deepEqual(checklist.parts.map((p) => p.id), ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(checklist.parts.map((p) => p.sections.map((s) => s.id)), [
    ["1"], ["2A", "2B", "2C", "2D"], ["3"], ["4B", "4C"], ["5"], ["6A", "6B", "6C", "6D"],
  ]);
  assert.equal(checklist.total, config.sections.length - 1, "4A is hidden until 2.13 indicates a partner");
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
  assert.deepEqual(states, {
    1: "saved", "2A": "saved", "2B": "not_started", "2C": "needs_review", "2D": "not_started",
    3: "not_started", "4B": "not_started", "4C": "not_started",
    5: "not_started", "6A": "not_started", "6B": "not_started", "6C": "not_started", "6D": "not_started",
  });
  assert.deepEqual([checklist.saved, checklist.needsReview, checklist.total], [2, 1, 13]);
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

test("with the current config the form is closed unless preview mode is on", () => {
  const blocked = engine.getReleaseBlockers(config).length;
  assert.ok(blocked > 0, "the config still has open tbc items");
  assert.equal(isFormOpen(blocked, false), false);
  assert.equal(isFormOpen(blocked, true), true);
});

const rows = (checklist) => checklist.parts.flatMap((p) => p.sections.map((s) => s.id));

test("changing 2.13 adds or removes the 4A row, and the counts follow", () => {
  const status = { 1: "saved", "2A": "saved", "2B": "saved", "2C": "saved", "2D": "saved", 3: "saved", "4B": "saved", "4C": "saved" };
  const single = buildChecklist(config, { sectionStatus: status, answers: { q2_13: "tbc_single" } });
  assert.equal(rows(single).includes("4A"), false);
  assert.deepEqual([single.saved, single.total], [8, 13], "the eight sections of Parts 1-4 are saved; Parts 5-6 are not started");

  const married = buildChecklist(config, { sectionStatus: status, answers: { q2_13: "tbc_married" } });
  assert.deepEqual(rows(married), ["1", "2A", "2B", "2C", "2D", "3", "4A", "4B", "4C", "5", "6A", "6B", "6C", "6D"]);
  assert.deepEqual([married.saved, married.total], [8, 14]);
  const row = married.parts[3].sections.find((s) => s.id === "4A");
  assert.equal(row.state, "not_started");
});

test("a status the server still reports for a section that does not apply is not counted", () => {
  const checklist = buildChecklist(config, { sectionStatus: { "4A": "saved", 1: "saved" }, answers: { q2_13: "tbc_single" } });
  assert.equal(rows(checklist).includes("4A"), false);
  assert.equal(checklist.saved, 1);
});

test("every part keeps at least one section; a part whose sections all drop out is left off", () => {
  const checklist = buildChecklist(config, null);
  assert.ok(checklist.parts.every((p) => p.sections.length > 0));
  const onlyPartner = { ...config, sections: config.sections.filter((s) => s.id === "4A" || s.id === "1"), parts: config.parts };
  const trimmed = buildChecklist(onlyPartner, null);
  assert.deepEqual(trimmed.parts.map((p) => p.id), ["1"], "part 4 has only 4A, which does not apply, so the part is dropped");
});
