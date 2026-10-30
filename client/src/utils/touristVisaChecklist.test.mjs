// Run with: npm run test:unit   (from client/)

import test from "node:test";
import assert from "node:assert/strict";
import engine from "../shared/tourist-visa/engine.js";
import { buildChecklist, countHeldSections, isFormOpen } from "./touristVisaChecklist.ts";

const { config } = engine;

test("the checklist follows the shared config: parts and sections in form order, without sections that do not apply", () => {
  const checklist = buildChecklist(config, null);
  assert.deepEqual(checklist.parts.map((p) => p.id), ["1", "2", "3", "4", "5", "6", "7", "8"]);
  assert.deepEqual(checklist.parts.map((p) => p.sections.map((s) => s.id)), [
    ["1"], ["2A", "2B", "2C", "2D"], ["3"], ["4B", "4C"], ["5"], ["6A", "6B", "6C", "6D"], ["7"], ["8"],
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
    7: "not_started", 8: "not_started",
  });
  assert.deepEqual([checklist.saved, checklist.needsReview, checklist.total], [2, 1, 15]);
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
  const held = countHeldSections(config);
  assert.ok(held > 0, "the config still has open tbc items and drafts");
  assert.equal(isFormOpen(held, false), false);
  assert.equal(isFormOpen(held, true), true);
});
const rows = (checklist) => checklist.parts.flatMap((p) => p.sections.map((s) => s.id));

test("changing 2.13 adds or removes the 4A row, and the counts follow", () => {
  const status = { 1: "saved", "2A": "saved", "2B": "saved", "2C": "saved", "2D": "saved", 3: "saved", "4B": "saved", "4C": "saved" };
  const single = buildChecklist(config, { sectionStatus: status, answers: { q2_13: "single" } });
  assert.equal(rows(single).includes("4A"), false);
  assert.deepEqual([single.saved, single.total], [8, 15], "the eight sections of Parts 1-4 are saved; Parts 5-8 are not started");

  const married = buildChecklist(config, { sectionStatus: status, answers: { q2_13: "married" } });
  assert.deepEqual(rows(married), ["1", "2A", "2B", "2C", "2D", "3", "4A", "4B", "4C", "5", "6A", "6B", "6C", "6D", "7", "8"]);
  assert.deepEqual([married.saved, married.total], [8, 16]);
  const row = married.parts[3].sections.find((s) => s.id === "4A");
  assert.equal(row.state, "not_started");
});

test("a status the server still reports for a section that does not apply is not counted", () => {
  const checklist = buildChecklist(config, { sectionStatus: { "4A": "saved", 1: "saved" }, answers: { q2_13: "single" } });
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

// ---------------------------------------------------------------------------
// Step 7b: the client opens the form only when no section is held by a tbc flag or a draft
// ---------------------------------------------------------------------------

const clone = (o) => JSON.parse(JSON.stringify(o));
const stripTbc = (c) => {
  for (const q of c.questions) delete q.tbc;
  for (const g of c.groups) delete g.tbc;
  return c;
};
const stripDrafts = (c) => {
  for (const q of c.questions) delete q.draft;
  for (const g of c.groups) delete g.draft;
  return c;
};

test("the form is closed while only drafts remain: a default nobody has signed off never reaches applicants", () => {
  const draftsOnly = stripTbc(clone(config));
  assert.equal(engine.getReleaseBlockers(draftsOnly).length, 0, "no tbc left, so nothing is 'blocked'");
  assert.ok(countHeldSections(draftsOnly) > 0, "but the drafts still hold the sections");
  assert.equal(isFormOpen(countHeldSections(draftsOnly), false), false);
});

test("the form is closed while only tbc items remain", () => {
  const tbcOnly = stripDrafts(clone(config));
  tbcOnly.questions.find((q) => q.id === "q8_1").tbc = "Still unknown.";
  assert.equal(engine.getDraftItems(tbcOnly).length, 0);
  assert.ok(countHeldSections(tbcOnly) > 0);
  assert.equal(isFormOpen(countHeldSections(tbcOnly), false), false);
});

test("the form opens only when no tbc and no draft is left", () => {
  const clean = stripDrafts(stripTbc(clone(config)));
  assert.equal(countHeldSections(clean), 0);
  assert.equal(isFormOpen(countHeldSections(clean), false), true);
});

test("a single draft on one question, or on one group, holds the form closed", () => {
  const clean = stripDrafts(stripTbc(clone(config)));
  clean.questions.find((q) => q.id === "q3_1").draft = "Draft: test";
  assert.equal(countHeldSections(clean), 1);
  assert.equal(isFormOpen(countHeldSections(clean), false), false);
  delete clean.questions.find((q) => q.id === "q3_1").draft;
  clean.groups.find((g) => g.id === "parents").draft = "Draft: test";
  assert.equal(countHeldSections(clean), 1);
  assert.equal(isFormOpen(countHeldSections(clean), false), false);
});

test("preview mode shows everything for testing, held or not", () => {
  assert.equal(isFormOpen(countHeldSections(config), true), true);
  assert.equal(isFormOpen(0, true), true);
});

test("countHeldSections counts sections, not items", () => {
  const c = stripDrafts(stripTbc(clone(config)));
  c.questions.find((q) => q.id === "q2_1").draft = "Draft: one";
  c.questions.find((q) => q.id === "q2_2").draft = "Draft: two";
  c.questions.find((q) => q.id === "q3_1").tbc = "x";
  assert.equal(countHeldSections(c), 2, "section 2A (two drafts) and section 3 (one tbc)");
});
