// Run with: npm run test:unit   (from client/)
// Task A: document slots that are conditional and optional, on the applicant's side: the dashboard line, readiness and the files kept from a different list.
// The real config has only passport and funds, so these tests add four FILE questions to a COPY of it.

import test from "node:test";
import assert from "node:assert/strict";
import engine from "../shared/tourist-visa/engine.js";
import { buildChecklist, documentSummary, getReadiness } from "./touristVisaChecklist.ts";
import { documentErrorMessage, DOCUMENT_ERROR_CODES } from "./touristVisaDocuments.ts";

const real = engine.config;
const file = (number, slot, extra) => ({ id: `q10_${number}`, number: `10.${number}`, section: "10D", label: `Document ${slot}`, type: "FILE", slot, maxFiles: 2, required: true, help: "Made-up guidance.", ...extra });
const config = JSON.parse(JSON.stringify(real));
config.questions.push(
  file(8, "salary", { showWhen: { q: "q5_1", eq: "employed" } }),
  file(9, "bizreg", { showWhen: { q: "q5_1", eq: "self_employed" } }),
  file(10, "other", { required: false }),
  file(11, "sponsor", { required: false, showWhen: { q: "q6_5", eq: true } })
);
const doc = (slot, n = 1) => ({ id: `${slot}-${n}`, slot, size: 1000 });

const SECTION_IDS = config.sections.map((s) => s.id);
const allSaved = () => Object.fromEntries(SECTION_IDS.map((id) => [id, "saved"]));
const draft = (documents, answers = {}, sectionStatus = allSaved()) => ({ status: "draft", sectionStatus, answers, documents });
const row10D = (app) => buildChecklist(config, app).parts.flatMap((p) => p.sections).find((s) => s.id === "10D");

test("the test config is valid", () => {
  assert.deepEqual(engine.validateConfig(config), []);
});

test("the dashboard line names each slot by its label from the config, in order, and leaves out slots that are hidden", () => {
  const files = [doc("passport"), doc("funds"), doc("funds", 2), doc("salary")];
  assert.equal(documentSummary(config, files, "10D", { q5_1: "employed" }), "Your passport or travel document (1 file), Evidence of funds (2 files), Document salary (1 file)");
  // salary is hidden for a retired applicant: its file is not named
  assert.equal(documentSummary(config, files, "10D", { q5_1: "retired" }), "Your passport or travel document (1 file), Evidence of funds (2 files)");
  assert.equal(documentSummary(config, [], "10D", {}), "No files uploaded yet");
  assert.equal(documentSummary(config, [doc("salary")], "10D", { q5_1: "retired" }), "No files uploaded yet", "only a hidden slot has a file");
});

test("the dashboard line stays short with many documents: three are named, the rest are counted", () => {
  const files = [doc("passport"), doc("funds"), doc("salary"), doc("other"), doc("sponsor")];
  const text = documentSummary(config, files, "10D", { q5_1: "employed", q6_5: true });
  assert.equal(text, "Your passport or travel document (1 file), Evidence of funds (1 file), Document salary (1 file) and 2 more");
  assert.equal(text.includes("sponsor"), false);
});

test("the documents row follows the slots on the list: a required conditional slot holds the row back, a hidden one does not", () => {
  const retired = { q5_1: "retired" };
  const employed = { q5_1: "employed" };
  assert.equal(row10D(draft([doc("passport"), doc("funds")], retired)).state, "saved");
  assert.equal(row10D(draft([doc("passport"), doc("funds")], employed)).state, "in_progress", "the salary document is still missing");
  assert.equal(row10D(draft([doc("passport"), doc("funds"), doc("salary")], employed)).state, "saved");
  assert.equal(row10D(draft([], employed)).state, "not_started");
  // a file in a slot that is hidden for these answers does not complete anything
  assert.equal(row10D(draft([doc("passport"), doc("salary")], retired)).state, "in_progress");
});

test("readiness: only the required slots on the list are asked for, and an optional slot never holds the submit back", () => {
  const retired = { q5_1: "retired" };
  const employed = { q5_1: "employed" };
  assert.equal(getReadiness(config, draft([doc("passport"), doc("funds")], retired)).ready, true, "salary, bizreg and the optional ones are not needed");
  const noSalary = getReadiness(config, draft([doc("passport"), doc("funds")], employed));
  assert.equal(noSalary.ready, false);
  assert.equal(noSalary.missing[0].reason, "Upload a file for: Document salary");
  assert.equal(getReadiness(config, draft([doc("passport"), doc("funds"), doc("salary")], employed)).ready, true, "the optional slot is empty and does not matter");
  const none = getReadiness(config, draft([], employed));
  assert.equal(none.missing[0].reason, "Upload a file for: Your passport or travel document, Evidence of funds and Document salary");
  // a conditional optional slot (sponsor) with no files is never listed as missing
  assert.equal(getReadiness(config, draft([doc("passport"), doc("funds")], { q5_1: "retired", q6_5: true })).ready, true);
});

test("readiness: a files section made only of optional slots is not missing when it is empty", () => {
  const optionalOnly = JSON.parse(JSON.stringify(config));
  for (const q of optionalOnly.questions.filter((x) => x.type === "FILE")) q.required = false;
  const result = getReadiness(optionalOnly, draft([], {}));
  assert.equal(result.ready, true);
  assert.equal(buildChecklist(optionalOnly, draft([], {})).parts.flatMap((p) => p.sections).find((s) => s.id === "10D").state, "not_started");
});

test("files kept from a different list: the engine finds them for the box on the documents page", () => {
  const files = [doc("passport"), doc("salary"), doc("bizreg"), doc("longgone")];
  assert.deepEqual(engine.getOrphanDocuments(config, files, { q5_1: "employed" }).map((d) => d.slot), ["bizreg", "longgone"]);
  assert.deepEqual(engine.getOrphanDocuments(config, files, { q5_1: "self_employed" }).map((d) => d.slot), ["salary", "longgone"]);
  assert.deepEqual(engine.getVisibleFileQuestions(config, { q5_1: "employed" }, "10D").map((q) => q.slot), ["passport", "funds", "salary", "other"]);
});

test("the new refusal has its own plain message, and the codes list knows it", () => {
  assert.ok(DOCUMENT_ERROR_CODES.includes("SLOT_NOT_AVAILABLE"));
  assert.match(documentErrorMessage("SLOT_NOT_AVAILABLE"), /not on your list/);
  assert.match(documentErrorMessage("TOO_MANY_UPLOADS"), /wait/);
  assert.equal(/\d/.test(documentErrorMessage("TOO_MANY_UPLOADS")), false, "the wording mentions waiting, not a number");
});
