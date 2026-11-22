// Run with: npm run test:unit   (from client/). The layout of the questions on a wide screen: which take a whole row, which sit two to a row, and that the box of an
// Other answer stays in the cell of its question. The real shared config is used; nothing here changes a question or a stored value.

import test from "node:test";
import assert from "node:assert/strict";
import engine from "../shared/tourist-visa/engine.js";
import { ENTRY_GRID_CLASS, GRID_CLASS, WIDE_CELL_CLASS, WIDE_TYPES, cellClass, isWideQuestion, layoutCells } from "./touristVisaLayout.ts";
import { sectionItems } from "./touristVisaForm.ts";

const cfg = engine.config;
const q = (id) => cfg.questions.find((x) => x.id === id);

test("short answers sit two to a row; long ones, lists, addresses, declarations and files take the whole row", () => {
  for (const type of ["TXT", "DATE", "MY", "NUM", "DUR", "AMT", "YN", "SEL", "CTRY", "EML", "TEL"]) assert.equal(isWideQuestion({ type }), false, type);
  for (const type of ["LNG", "CHK", "ADDR", "ACK", "FILE"]) assert.equal(isWideQuestion({ type }), true, type);
  assert.deepEqual([...WIDE_TYPES].sort(), ["ACK", "ADDR", "CHK", "FILE", "LNG"]);
  // A question with a block of its own under it takes the row too.
  assert.equal(isWideQuestion({ type: "YN", helper: "fundsLimits" }), true);
  assert.equal(isWideQuestion({ type: "YN", items: ["a", "b"] }), true);
  assert.equal(isWideQuestion({ type: "SEL", helpCountries: { summary: "x", countries: ["GB"] } }), true);
});

test("on the real config: names, dates, amounts and choices are short, an address, a long text, the declarations and the files are wide", () => {
  assert.equal(isWideQuestion(q("q2_1")), false, "a given name");
  assert.equal(isWideQuestion(q("q1_6")), false, "a date");
  assert.equal(isWideQuestion(q("q6_3")), false, "an amount");
  assert.equal(isWideQuestion(q("q1_1")), false, "a choice");
  assert.equal(isWideQuestion(q("q1_2")), false, "a Yes/No");
  assert.equal(isWideQuestion(q("q2_24")), true, "an address");
  assert.equal(isWideQuestion(q("q1_5")), true, "a long text");
  assert.equal(isWideQuestion(q("q2_35")), true, "a tick list");
  assert.equal(isWideQuestion(q("q9_11")), true, "a declaration tick");
  assert.equal(isWideQuestion(q("q10_8")), true, "a file slot");
  assert.equal(isWideQuestion(q("q10_36")), true, "the question with the amounts to look for under it");
});

test("the box of an Other answer is in the cell of its question, directly under it; nothing is lost and the order is kept", () => {
  for (const section of cfg.sections) {
    const questions = sectionItems(cfg, section.id).flatMap((item) => (item.kind === "question" ? [item.question] : []));
    const cells = layoutCells(questions);
    const placed = cells.flatMap((cell) => [cell.question.id, ...(cell.companion ? [cell.companion.id] : [])]);
    assert.deepEqual([...placed].sort(), questions.map((x) => x.id).sort(), `section ${section.id}: every question is in a cell`);
    for (const cell of cells) assert.equal(Boolean(cell.question.otherOf), false, `${cell.question.id} is the question, not a box`);
    // The cells come in the order of the questions.
    const order = questions.filter((x) => !x.otherOf).map((x) => x.id);
    assert.deepEqual(cells.map((cell) => cell.question.id), order, `section ${section.id}: reading order`);
  }
  const one = layoutCells(sectionItems(cfg, "1").flatMap((item) => (item.kind === "question" ? [item.question] : [])));
  const reason = one.find((cell) => cell.question.id === "q1_1");
  assert.equal(reason.companion.id, "q1_1_other");
  const lonely = layoutCells([q("q1_1_other")]);
  assert.equal(lonely.length, 1, "a box whose question is not in the list has a cell of its own");
});

test("the grid is one column on a phone and two from 1024 px; a wide cell spans both", () => {
  assert.match(GRID_CLASS, /(^| )grid-cols-1( |$)/);
  assert.match(GRID_CLASS, /lg:grid-cols-2/);
  assert.match(ENTRY_GRID_CLASS, /grid-cols-1/);
  assert.match(ENTRY_GRID_CLASS, /lg:grid-cols-2/);
  assert.equal(WIDE_CELL_CLASS, "lg:col-span-2");
  assert.equal(cellClass({ wide: true }), "min-w-0 lg:col-span-2");
  assert.equal(cellClass({ wide: false }), "min-w-0");
  assert.equal(cellClass({ wide: true }, "space-y-6"), "min-w-0 lg:col-span-2 space-y-6");
  // Nothing in the grid classes below 1024 px adds a column or an offset: the phone keeps one column.
  for (const klass of [GRID_CLASS, ENTRY_GRID_CLASS].flatMap((c) => c.split(" ")).filter((c) => !c.startsWith("lg:"))) assert.doesNotMatch(klass, /cols-[2-9]|col-span/);
});

test("the layout needs nothing in the config: no question or section carries a layout hint, and the version was not bumped for it", () => {
  const hints = ["layout", "wide", "columns", "span", "width"];
  for (const question of cfg.questions) for (const hint of hints) assert.equal(hint in question, false, `${question.id} has ${hint}`);
  for (const section of cfg.sections) for (const hint of hints) assert.equal(hint in section, false, `${section.id} has ${hint}`);
  assert.equal(cfg.version, "1.7.0");
});
