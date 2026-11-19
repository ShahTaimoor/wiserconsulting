// Run with: npm run test:unit   (from client/). All answers are made-up test data.
// Config 1.4.0: "Other (please write)". The form's side: where the text box sits, what is sent, what is dropped, how the server's
// errors are listed, the hint, and what the real field component draws. The rules themselves are tested in the shared engine tests.

import test from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { renderToStaticMarkup } from "react-dom/server";
import engine from "../shared/tourist-visa/engine.js";
import { sectionItems, initialValues, buildPayload, collectErrors, hintFor, mergedAnswers, applyAnswer, valuesEqual } from "./touristVisaForm.ts";
import { loadTsx, React } from "./loadTsx.mjs";

const cfg = engine.config;
const question = (id) => cfg.questions.find((q) => q.id === id);
const S1 = { q1_1: "tourism", q1_2: false, q1_3: false, q1_4: "holiday", q1_5: "Test trip.", q1_6: "2027-03-01", q1_7: "2027-03-15" };
const WORDS = "To attend my cousin's wedding";
const payload = (values, saved = {}) => buildPayload(cfg, "1", values, saved).answers;
const ids = (section) => sectionItems(cfg, section).map((i) => (i.kind === "question" ? i.question.id : `group:${i.group.id}`));

test("the text box of an Other answer is an item of the section right after its question, and inside a group right after its member", () => {
  const order = ids("1");
  assert.equal(order[order.indexOf("q1_1") + 1], "q1_1_other");
  assert.equal(order[order.indexOf("q1_4") + 1], "q1_4_other");
  const group = sectionItems(cfg, "8").find((i) => i.kind === "group" && i.group.id === "otherCountryTrips");
  assert.deepEqual(group.members.map((m) => m.id), ["q8_2a", "q8_2b", "q8_2b_other", "q8_2c", "q8_2d"]);
});

test("the option list of a question that allows Other ends with \"Other (please write)\", and its value is the plain option value \"other\"", () => {
  const options = engine.resolveOptions(cfg, "q1_1", {});
  const last = options[options.length - 1];
  assert.deepEqual(last, { value: "other", label: "Other (please write)" });
  for (const id of ["q1_2b", "q1_3a", "q1_4", "q2_3c", "q2_5", "q2_8", "q2_23c", "q4_7a", "q6_6b", "q6_7x", "q6_8b", "q7_2b", "q7_3c", "q7_5a", "q8_2b", "q8_3b"]) {
    const list = engine.resolveOptions(cfg, id, {});
    assert.equal(list[list.length - 1].label, "Other (please write)", id);
  }
});

test("the box is shown only while Other is chosen (1.1), and is hidden for every other choice and before any choice", () => {
  assert.equal(engine.isVisible(cfg, "q1_1_other", {}), false);
  assert.equal(engine.isVisible(cfg, "q1_1_other", { q1_1: "tourism" }), false);
  assert.equal(engine.isVisible(cfg, "q1_1_other", { q1_1: "other" }), true);
});

test("saving with Other sends the choice and the words as typed (the server trims them, like every short answer)", () => {
  // 1.4 (the holiday question) is not asked for any reason but tourism, so it is not sent.
  assert.deepEqual(payload({ ...S1, q1_1: "other", q1_1_other: `  ${WORDS}  ` }), {
    q1_1: "other", q1_1_other: `  ${WORDS}  `, q1_2: false, q1_3: false, q1_5: "Test trip.", q1_6: "2027-03-01", q1_7: "2027-03-15",
  });
  const stored = engine.validateSection(z, cfg, "1", payload({ ...S1, q1_1: "other", q1_1_other: `  ${WORDS}  ` }), {});
  assert.equal(stored.data.q1_1_other, WORDS);
});

test("switching away from Other: the old words are still in the form's state, but they are not sent", () => {
  // The state after choosing Other, typing the words and then choosing "Business".
  let values = initialValues(cfg, "1", S1);
  values = applyAnswer(cfg, values, "q1_1", "other");
  values = applyAnswer(cfg, values, "q1_1_other", WORDS);
  assert.equal(payload(values).q1_1_other, WORDS);
  values = applyAnswer(cfg, values, "q1_1", "business");
  const sent = payload(values);
  assert.equal(sent.q1_1, "business");
  assert.equal("q1_1_other" in sent, false, "the words are not sent once Other is not chosen");
  // And the server, given exactly that, accepts it and keeps nothing of them.
  const result = engine.validateSection(z, cfg, "1", sent, {});
  assert.equal(result.success, true, JSON.stringify(result.errors));
  assert.equal("q1_1_other" in result.data, false);
});

test("Other chosen and the box left empty: the payload carries no text, and the server's error is listed under the question's number with a clear name", () => {
  const values = { ...S1, q1_1: "other" };
  const sent = payload(values);
  assert.equal("q1_1_other" in sent, false);
  const result = engine.validateSection(z, cfg, "1", sent, {});
  const items = collectErrors(cfg, "1", result.errors);
  assert.deepEqual(items.map((i) => [i.targetId, i.message, i.label]), [
    ["field-q1_1_other", "This question is required", "1.1 Written answer: What is the main reason for your visit to the UK?"],
  ]);
});

test("in a group entry the error names the entry and the question the words belong to", () => {
  const TRIP = { q8_2a: "FR", q8_2b: "other", q8_2c: "2025-07-01", q8_2d: "2025-07-10" };
  const sent = buildPayload(cfg, "8", { q8_1: 0, q8_2: true, q8_3: false, otherCountryTrips: [TRIP] }, {}).answers;
  const result = engine.validateSection(z, cfg, "8", sent, {});
  assert.deepEqual(collectErrors(cfg, "8", result.errors).map((i) => [i.targetId, i.label]), [
    ["field-otherCountryTrips-0-q8_2b_other", "Trip 1: Written answer: What was the reason for your visit?"],
  ]);
});

test("the hint under the box says how long the words may be; no other question gets that hint", () => {
  assert.equal(hintFor(cfg, question("q1_1_other")), "Up to 100 characters.");
  assert.equal(hintFor(cfg, question("q1_1")), undefined);
  assert.equal(hintFor(cfg, question("q1_5")), undefined);
});

test("unsaved changes: typing different words is a change, and the same words are no change", () => {
  const saved = { ...S1, q1_1: "other", q1_1_other: WORDS };
  const a = initialValues(cfg, "1", saved);
  assert.equal(valuesEqual(a, initialValues(cfg, "1", saved)), true);
  assert.equal(valuesEqual(a, { ...a, q1_1_other: "Different words" }), false);
});

test("every other section still builds its payload, and the merged answers carry the words for the rules", () => {
  const merged = mergedAnswers(cfg, "1", {}, { ...S1, q1_1: "other", q1_1_other: WORDS });
  assert.equal(engine.writtenOther(cfg, question("q1_1"), merged), WORDS);
});

// What the real field component draws (the real QuestionField, compiled by loadTsx).
function renderField(q, over = {}) {
  const { module } = loadTsx("components/tourist-visa/QuestionField.tsx");
  const props = { cfg, question: q, idBase: `field-${q.id}`, value: undefined, onChange() {}, options: engine.resolveOptions(cfg, q.id, {}), subErrors: {}, previewMode: false, ...over };
  return renderToStaticMarkup(React.createElement(module.QuestionField, props));
}

test("the dropdown of a question that allows Other offers \"Other (please write)\" last", () => {
  const html = renderField(question("q1_1"));
  const labels = [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
  assert.equal(labels[labels.length - 1], "Other (please write)");
  assert.ok(html.includes('value="other"'));
});

test("the text box is a required one-line field with the label \"Please write your answer\", without the question number, indented under its question", () => {
  const html = renderField(question("q1_1_other"), { value: "" });
  assert.match(html, /Please write your answer/);
  assert.match(html, /\(required\)/);
  assert.equal(html.includes(">1.1<"), false, "the number is the question's, not repeated on the box");
  assert.match(html, /type="text"/);
  assert.match(html, /Up to 100 characters\./);
  assert.match(html, /border-l-2/, "indented under its question");
  const plain = renderField(question("q1_1"));
  assert.ok(plain.includes(">1.1<"), "the question itself keeps its number");
  assert.equal(plain.includes("border-l-2"), false);
});

test("the text box shows the server's message under it, and marks the field invalid", () => {
  const html = renderField(question("q1_1_other"), { value: "", error: "This question is required" });
  assert.match(html, /This question is required/);
  assert.match(html, /aria-invalid="true"/);
});
