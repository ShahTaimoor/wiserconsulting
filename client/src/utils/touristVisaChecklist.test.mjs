// Run with: npm run test:unit   (from client/)

import test from "node:test";
import assert from "node:assert/strict";
import engine from "../shared/tourist-visa/engine.js";
import { buildChecklist, countHeldSections, documentSummary, isFormOpen } from "./touristVisaChecklist.ts";

const { config } = engine;

test("the checklist follows the shared config: parts and sections in form order, without sections that do not apply", () => {
  const checklist = buildChecklist(config, null);
  assert.deepEqual(checklist.parts.map((p) => p.id), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  assert.deepEqual(checklist.parts.map((p) => p.sections.map((s) => s.id)), [
    ["1"], ["2A", "2B", "2C", "2D"], ["3"], ["4B", "4C"], ["5"], ["6A", "6B", "6C", "6D"], ["7"], ["8"], ["9A", "9B", "9C"], ["10A", "10B", "10C", "10D"],
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
    7: "not_started", 8: "not_started", "9A": "not_started", "9B": "not_started", "9C": "not_started",
    "10A": "not_started", "10B": "not_started", "10C": "not_started", "10D": "not_started",
  });
  assert.deepEqual([checklist.saved, checklist.needsReview, checklist.total], [2, 1, 22]);
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
  assert.deepEqual([single.saved, single.total], [8, 22], "the eight sections of Parts 1-4 are saved; Parts 5-10 are not started");

  const married = buildChecklist(config, { sectionStatus: status, answers: { q2_13: "married" } });
  assert.deepEqual(rows(married), ["1", "2A", "2B", "2C", "2D", "3", "4A", "4B", "4C", "5", "6A", "6B", "6C", "6D", "7", "8", "9A", "9B", "9C", "10A", "10B", "10C", "10D"]);
  assert.deepEqual([married.saved, married.total], [8, 23]);
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
  for (const d of Object.values(c.declarations || {})) delete d.draft;
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

test("declaration wording that is still a draft holds the form closed even when every section is clean", () => {
  const clean = stripDrafts(stripTbc(clone(config)));
  assert.equal(countHeldSections(clean), 0);
  clean.declarations.submit.draft = "Draft: wording awaiting approval";
  assert.equal(countHeldSections(clean), 1, "one held entry for the wording, not a section");
  assert.equal(isFormOpen(countHeldSections(clean), false), false);
  assert.equal(isFormOpen(countHeldSections(clean), true), true, "preview mode still opens it for testing");
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

// ---------------------------------------------------------------------------
// Step 8c-2: the documents section (10D) follows the uploaded files
// ---------------------------------------------------------------------------

const doc = (slot, n = 1) => ({ id: `d${slot}${n}`, slot, name: `${slot}-${n}.pdf`, size: 100, type: "application/pdf", uploadedAt: "2026-11-01T10:00:00.000Z" });
const row10D = (application) => buildChecklist(config, application).parts.flatMap((p) => p.sections).find((s) => s.id === "10D");

test("10D is the last row of Part 10, and with no application it is not started with no detail", () => {
  const checklist = buildChecklist(config, null);
  const part10 = checklist.parts.find((p) => p.id === "10");
  assert.deepEqual(part10.sections.map((s) => s.id), ["10A", "10B", "10C", "10D"]);
  assert.equal(part10.sections[3].title, "Documents");
  assert.equal(part10.sections[3].state, "not_started");
  assert.equal(part10.sections[3].detail, undefined);
});

test("10D: not started with no files, in progress with one slot, saved with both slots (the state follows the files)", () => {
  const app = (documents, status = {}) => ({ sectionStatus: status, answers: {}, documents });
  assert.equal(row10D(app([])).state, "not_started");
  assert.equal(row10D(app([doc("passport")])).state, "in_progress");
  assert.equal(row10D(app([doc("funds"), doc("funds", 2)])).state, "in_progress");
  assert.equal(row10D(app([doc("passport"), doc("funds")])).state, "saved");
  // The files decide, not a status sent with them.
  assert.equal(row10D(app([doc("passport")], { "10D": "saved" })).state, "in_progress");
  assert.equal(row10D(app([], { "10D": "saved" })).state, "not_started");
  // Without a documents list (an older response) the server's status is used.
  assert.equal(row10D({ sectionStatus: { "10D": "in_progress" }, answers: {} }).state, "in_progress");
});

test("10D: a complete documents section counts as saved on the dashboard, an in-progress one does not", () => {
  const complete = buildChecklist(config, { sectionStatus: {}, answers: {}, documents: [doc("passport"), doc("funds")] });
  const partial = buildChecklist(config, { sectionStatus: {}, answers: {}, documents: [doc("passport")] });
  assert.deepEqual([complete.saved, complete.total], [1, 22]);
  assert.deepEqual([partial.saved, partial.total], [0, 22]);
});

test("10D: the row says how many files each slot has", () => {
  const detail = (documents) => row10D({ sectionStatus: {}, answers: {}, documents }).detail;
  assert.equal(detail([]), "No files uploaded yet");
  assert.equal(detail([doc("passport")]), "1 passport file");
  assert.equal(detail([doc("passport"), doc("funds"), doc("funds", 2)]), "1 passport file, 2 funds files");
  assert.equal(detail([doc("passport"), doc("passport", 2), doc("passport", 3), doc("funds")]), "3 passport files, 1 funds file");
  assert.equal(detail([doc("funds", 1), doc("funds", 2)]), "2 funds files", "a slot with no files is left out");
  assert.equal(documentSummary(config, undefined), "No files uploaded yet");
  assert.equal(documentSummary(config, [doc("passport")], "10D"), "1 passport file");
});

test("only the documents row has a detail line", () => {
  const checklist = buildChecklist(config, { sectionStatus: {}, answers: {}, documents: [doc("passport")] });
  const withDetail = checklist.parts.flatMap((p) => p.sections).filter((s) => s.detail !== undefined).map((s) => s.id);
  assert.deepEqual(withDetail, ["10D"]);
});
