// Run with: npm run test:unit   (from client/)

import test from "node:test";
import assert from "node:assert/strict";
import engine from "../shared/tourist-visa/engine.js";
import { describeSubmitFailure, problemsText, submittedOnText } from "./touristVisaReview.ts";

const { config } = engine;

test("problemsText: one thing, or several", () => {
  assert.equal(problemsText(1), "1 thing to check");
  assert.equal(problemsText(2), "2 things to check");
  assert.equal(problemsText(12), "12 things to check");
});

test("a refusal that names sections lists each with its title, a link and a count, in the order sent", () => {
  const failure = describeSubmitFailure(config, {
    status: 422, code: "NOT_READY", declarationMissing: false,
    sections: [{ id: "2C", problems: 1 }, { id: "7", problems: 3 }, { id: "10D", problems: 2 }],
  });
  assert.equal(failure.kind, "not_ready");
  assert.deepEqual(failure.sections.map((s) => [s.id, s.title, s.text, s.href]), [
    ["2C", "Address and living situation", "1 thing to check", "/tourist-visa/2C"],
    ["7", "Travel history (UK)", "3 things to check", "/tourist-visa/7"],
    ["10D", "Documents", "2 things to check", "/tourist-visa/10D"],
  ]);
  assert.equal(failure.message, "3 sections need attention. Fix them and submit again.");
  assert.equal(failure.declarationMissing, false);
});

test("one section, a missing declaration, or both, each have their own sentence", () => {
  assert.equal(describeSubmitFailure(config, { status: 422, code: "NOT_READY", sections: [{ id: "5", problems: 1 }], declarationMissing: false }).message, "One section needs attention. Fix it and submit again.");
  const onlyDeclaration = describeSubmitFailure(config, { status: 422, code: "NOT_READY", sections: [], declarationMissing: true });
  assert.equal(onlyDeclaration.message, "The final declaration has not been ticked. Fix it and submit again.");
  assert.equal(onlyDeclaration.declarationMissing, true);
  assert.deepEqual(onlyDeclaration.sections, []);
  const oneAndDeclaration = describeSubmitFailure(config, { status: 422, code: "NOT_READY", sections: [{ id: "5", problems: 1 }], declarationMissing: true });
  assert.equal(oneAndDeclaration.message, "One section needs attention, and the final declaration has not been ticked. Fix them and submit again.");
  const both = describeSubmitFailure(config, { status: 422, code: "NOT_READY", sections: [{ id: "5", problems: 1 }, { id: "8", problems: 1 }], declarationMissing: true });
  assert.equal(both.message, "2 sections need attention, and the final declaration has not been ticked. Fix them and submit again.");
  assert.equal(describeSubmitFailure(config, { status: 422, code: "NOT_READY" }).message, "Your application is not ready to submit yet.");
});

test("a section the page does not know is still listed, by its id", () => {
  const failure = describeSubmitFailure(config, { status: 422, code: "NOT_READY", sections: [{ id: "99Z", problems: 2 }] });
  assert.equal(failure.sections[0].title, "Section 99Z");
  assert.equal(failure.sections[0].href, "/tourist-visa/99Z");
});

test("every other code has plain words, and never shows what the server wrote", () => {
  const cases = [
    [{ status: 409, code: "ALREADY_SUBMITTED" }, "already_submitted", /already been submitted/],
    [{ status: 409, code: "APPLICATION_CHANGED" }, "changed", /changed while it was being submitted/],
    [{ status: 404, code: "APPLICATION_NOT_FOUND" }, "other", /Start your application/],
    [{ status: 503, code: "REFERENCE_UNAVAILABLE" }, "other", /Nothing was submitted/],
    [{ status: 400, code: "INVALID_REQUEST" }, "other", /reload the page/],
    [{ status: 0 }, "other", /couldn't reach the server\. Nothing was submitted/],
    [{ status: 404 }, "closed", /isn't open/],
    [{ status: 429 }, "other", /Too many requests/],
    [{ status: 500 }, "other", /our side\. Nothing was submitted/],
    [{ status: 502, code: "SOMETHING_NEW" }, "other", /our side/],
    [{ status: 400 }, "other", /Something went wrong/],
  ];
  for (const [input, kind, pattern] of cases) {
    const failure = describeSubmitFailure(config, { ...input, message: "SERVER-TEXT-SHOULD-NOT-APPEAR" });
    assert.equal(failure.kind, kind, JSON.stringify(input));
    assert.match(failure.message, pattern, JSON.stringify(input));
    assert.equal(failure.message.includes("SERVER-TEXT"), false, JSON.stringify(input));
    assert.deepEqual(failure.sections, []);
    assert.equal(failure.declarationMissing, false);
  }
});

test("submittedOnText writes the date out, or says only Submitted when there is none", () => {
  assert.equal(submittedOnText("2026-11-01T10:00:00.000Z"), "Submitted on 1 November 2026");
  assert.equal(submittedOnText("2027-03-09T23:59:00.000Z"), "Submitted on 9 March 2027");
  assert.equal(submittedOnText(null), "Submitted");
  assert.equal(submittedOnText(undefined), "Submitted");
  assert.equal(submittedOnText("not a date"), "Submitted");
});

test("the text shown after submitting is in the config as a draft, in plain steps", () => {
  assert.ok(Array.isArray(config.afterSubmit.steps) && config.afterSubmit.steps.length >= 3);
  assert.ok(config.afterSubmit.draft.length > 20);
  assert.match(config.afterSubmit.steps.join(" "), /telephone number you gave/);
  assert.match(config.afterSubmit.steps.join(" "), /reference/);
});
