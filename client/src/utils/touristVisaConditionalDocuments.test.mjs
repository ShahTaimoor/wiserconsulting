// Run with: npm run test:unit   (from client/)
// The document lists (config 1.5.0) on the applicant's side: the line at the top of the documents page, the "needed" or "(optional)" word,
// the dashboard line, readiness and the files kept from a different list. The real config is used; the expected lists are written out by hand
// in backend/tests/helpers/documentSlots.js.

import test from "node:test";
import assert from "node:assert/strict";
import engine from "../shared/tourist-visa/engine.js";
import slotHelper from "../../../backend/tests/helpers/documentSlots.js";
import { buildChecklist, documentSummary, getReadiness } from "./touristVisaChecklist.ts";
import { DOCUMENT_ERROR_CODES, PREPARED_BY_US, documentErrorMessage, documentsBasis } from "./touristVisaDocuments.ts";

const { config } = engine;
const { SLOT_LIST, neededSlots, shownSlots, answersFor } = slotHelper;
const doc = (slot, n = 1) => ({ id: `${slot}-${n}`, slot, size: 1000 });
const SECTION_IDS = config.sections.map((s) => s.id);
const allSaved = () => Object.fromEntries(SECTION_IDS.map((id) => [id, "saved"]));
const draft = (documents, answers, sectionStatus = allSaved()) => ({ status: "draft", sectionStatus, answers, documents });
const row10D = (app) => buildChecklist(config, app).parts.flatMap((p) => p.sections).find((s) => s.id === "10D");

test("the line at the top of the documents page says what the list is based on, and links back to question 5.1", () => {
  const basis = (answers) => documentsBasis(config, answers);
  assert.equal(basis({ q5_1: "self_employed" }).text, "Your list is based on your employment answer: Self-employed");
  assert.equal(basis({ q5_1: "employed" }).text, "Your list is based on your employment answer: Employed");
  for (const other of ["retired", "student", "homemaker", "unemployed", "other"]) {
    assert.equal(basis({ q5_1: other }).text, "Your list is based on your employment answer: Shared documents only", other);
  }
  const unanswered = basis({});
  assert.equal(unanswered.answered, false);
  assert.match(unanswered.text, /not answered question 5\.1/);
  assert.match(unanswered.text, /only the documents everyone needs are shown/);
  assert.equal(documentsBasis(config, undefined).answered, false);
  // the link goes to the section that holds question 5.1
  assert.equal(basis({ q5_1: "employed" }).href, "/tourist-visa/5");
  assert.equal(basis({ q5_1: "employed" }).linkText, "Change your answer to question 5.1");
});

test("the covering letter and the travel itinerary are information lines, not slots", () => {
  assert.deepEqual([...PREPARED_BY_US], ["Covering letter: prepared by Wiser Consulting", "Travel itinerary: prepared by Wiser Consulting"]);
  assert.equal(SLOT_LIST.some((s) => /cover|itinerary/i.test(s.slot + s.label)), false);
  assert.equal(engine.getFileQuestions(config).some((q) => /cover|itinerary/i.test(q.slot + q.label)), false);
});

test("a slot is marked needed or optional from the answers: married, children and someone else pays flip it, a rule-less slot never changes", () => {
  const needed = (answers, slot) => engine.isFileRequired(config, engine.getFileQuestions(config).find((q) => q.slot === slot), answers);
  assert.equal(needed(answersFor({ employment: "retired", married: true }), "marriage"), true);
  assert.equal(needed(answersFor({ employment: "retired", married: false }), "marriage"), false);
  assert.equal(needed(answersFor({ employment: "retired", children: true }), "formb"), true);
  assert.equal(needed(answersFor({ employment: "retired", children: false }), "school"), false);
  assert.equal(needed(answersFor({ employment: "employed", sponsor: true }), "sponsorship"), true);
  assert.equal(needed(answersFor({ employment: "employed", sponsor: false }), "sponsorship"), false);
  assert.equal(needed({}, "passport"), true);
  assert.equal(needed({}, "oldpassports"), false);
  assert.equal(needed({ q5_1: "employed", q6_5: true, q2_13: "married", q4_7: true }, "other"), false);
});

test("the dashboard line names slots by their labels, three at most, and leaves out hidden ones", () => {
  const files = [doc("passport"), doc("funds"), doc("funds", 2), doc("salary")];
  assert.equal(documentSummary(config, files, "10D", { q5_1: "retired" }), "Personal bank statement (2 files), New passport with entry and exit stamps (1 file)", "salary is hidden for a retired applicant");
  assert.equal(documentSummary(config, files, "10D", { q5_1: "employed" }), "Salary slips (1 file), Personal bank statement (2 files), New passport with entry and exit stamps (1 file)");
  assert.equal(documentSummary(config, [], "10D", {}), "No files uploaded yet");
  assert.equal(documentSummary(config, [doc("salary")], "10D", { q5_1: "retired" }), "No files uploaded yet");
  const many = [doc("hotels"), doc("flight"), doc("familyparents"), doc("taxpayer"), doc("nic")];
  assert.match(documentSummary(config, many, "10D", {}), /^Hotel reservations \(.*\) \(1 file\), Flight reservation \(1 file\), Family registration certificate with parents and siblings \(1 file\) and 2 more$/);
});

test("readiness: the three situations need exactly their own documents", () => {
  for (const employment of ["employed", "self_employed", "retired"]) {
    const answers = answersFor({ employment });
    const docs = neededSlots({ employment }).map((s) => doc(s));
    assert.deepEqual(getReadiness(config, draft(docs, answers)), { ready: true, missing: [] }, employment);
    const short = getReadiness(config, draft(docs.slice(1), answers));
    assert.equal(short.ready, false, employment);
    assert.deepEqual(short.missing.map((m) => m.id), ["10D"]);
    assert.equal(row10D(draft(docs, answers)).state, "saved");
    assert.equal(row10D(draft(docs.slice(1), answers)).state, "in_progress");
  }
  // employed documents do not satisfy a self-employed list, and the other way round
  const employedFiles = neededSlots({ employment: "employed" }).map((s) => doc(s));
  assert.equal(getReadiness(config, draft(employedFiles, answersFor({ employment: "self_employed" }))).ready, false);
  const selfFiles = neededSlots({ employment: "self_employed" }).map((s) => doc(s));
  assert.equal(getReadiness(config, draft(selfFiles, answersFor({ employment: "employed" }))).ready, false);
});

test("readiness: an optional slot, or a slot made optional by the answers, never holds the submit back, and a slot made needed does", () => {
  const retired = answersFor({ employment: "retired" });
  const shared = neededSlots({ employment: "retired" }).map((s) => doc(s));
  assert.equal(getReadiness(config, draft(shared, retired)).ready, true, "old passports, other and the family certificates are optional here");
  assert.equal(getReadiness(config, draft(shared, answersFor({ employment: "retired", children: true }))).ready, false, "children: three more are needed");
  const withChildren = [...shared, doc("familyspouse"), doc("formb"), doc("school")];
  assert.equal(getReadiness(config, draft(withChildren, answersFor({ employment: "retired", children: true }))).ready, true);
  // and back: the extra files stay and nothing is missing
  assert.equal(getReadiness(config, draft(withChildren, retired)).ready, true);
});

test("switching 5.1 after uploading: the employment files are files from a different list, shown apart, and nothing is missing", () => {
  const employedFiles = neededSlots({ employment: "employed" }).map((s) => doc(s));
  const retired = answersFor({ employment: "retired" });
  assert.deepEqual(engine.getOrphanDocuments(config, employedFiles, retired).map((d) => d.slot), ["appointment", "confirmation", "noc", "salary"]);
  assert.equal(getReadiness(config, draft(employedFiles, retired)).ready, true);
  assert.equal(documentSummary(config, employedFiles, "10D", retired).includes("Salary slips"), false, "the dashboard line does not name them");
  assert.deepEqual(engine.getOrphanDocuments(config, employedFiles, answersFor({ employment: "employed" })), []);
});

test("every list shows its slots in the config order", () => {
  for (const ctx of [{ employment: "employed" }, { employment: "self_employed" }, { employment: "retired" }, {}]) {
    const visible = engine.getVisibleFileQuestions(config, answersFor(ctx), "10D").map((q) => q.slot);
    assert.deepEqual(visible, shownSlots(ctx), JSON.stringify(ctx));
  }
});

test("the refusal for a hidden slot has its own plain message, and the wording about waiting has no number", () => {
  assert.ok(DOCUMENT_ERROR_CODES.includes("SLOT_NOT_AVAILABLE"));
  assert.match(documentErrorMessage("SLOT_NOT_AVAILABLE"), /not on your list/);
  assert.match(documentErrorMessage("TOO_MANY_UPLOADS"), /wait/);
  assert.equal(/\d/.test(documentErrorMessage("TOO_MANY_UPLOADS")), false);
});
