// Run with: npm run test:unit   (from client/)
// The date input of the Tourist Visa form (components/tourist-visa/fields/DateField.tsx), the real component compiled by loadTsx: what it
// draws (a text box that takes dd/mm/yyyy, a numeric keypad, a label-linked error, the echo in a polite live region) and what it does when
// a person types, pastes and leaves the box. Made-up dates only.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx, React } from "./loadTsx.mjs";

const QUESTION = { id: "q1_6", number: "1.6", section: "1", label: "Date you plan to arrive in the UK", type: "DATE", required: true };

function load(reactOverrides) {
  return loadTsx("components/tourist-visa/fields/DateField.tsx", reactOverrides ? { reactOverrides } : {}).module.DateField;
}
const props = (over = {}) => ({ id: "field-q1_6", question: QUESTION, value: "", onChange() {}, options: [], subErrors: {}, invalid: false, required: true, describedBy: "field-q1_6-hint", ...over });
const html = (over) => renderToStaticMarkup(React.createElement(load(), props(over)));
const tag = (markup, id) => (new RegExp(`<[^>]*\\bid="${id}"[^>]*>`).exec(markup) || [""])[0];

/** The component called directly with its hooks replaced, so its handlers can be run and what they do read back. */
function rig(over = {}) {
  const changes = [];
  const touched = [];
  const DateField = load({ useState: (initial) => [initial, (next) => touched.push(next)], useRef: () => ({ current: null }) });
  const element = DateField(props({ onChange: (value) => changes.push(value), ...over }));
  const find = (node, predicate) => {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    const children = node.props && node.props.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  };
  const input = find(element, (node) => node.props && node.props.id === "field-q1_6");
  return { changes, touched, input: input.props, element };
}
const type = (rigged, raw, selectionStart = raw.length) => rigged.input.onChange({ target: { value: raw, selectionStart } });

// ---------------------------------------------------------------------------
// What it draws
// ---------------------------------------------------------------------------

test("an empty date is a text box with the dd/mm/yyyy placeholder and a numeric keypad, not the browser's date picker", () => {
  const out = html();
  const input = tag(out, "field-q1_6");
  assert.match(input, /type="text"/);
  assert.doesNotMatch(input, /type="date"/);
  assert.match(input, /placeholder="dd\/mm\/yyyy"/);
  assert.match(input, /inputMode="numeric"/i);
  assert.match(input, /autoComplete="off"/i);
  assert.match(input, /maxLength="14"/i);
  assert.match(input, /value=""/);
  assert.match(input, /aria-required="true"/);
  assert.doesNotMatch(input, /aria-invalid/);
  assert.equal(/Error:/.test(out), false, "no error while empty");
  assert.match(tag(out, "field-q1_6-echo"), /aria-live="polite"/);
  assert.match(out, /<p id="field-q1_6-echo"[^>]*><\/p>/, "nothing is shown while empty");
});

test("the box is described by the hint, the format sentence and (when there is one) the echo or the error, so a screen reader reads them with it", () => {
  assert.match(tag(html(), "field-q1_6"), /aria-describedby="field-q1_6-hint field-q1_6-format"/);
  assert.match(html(), /Type the date as day, month and year, for example 18\/01\/2026\./);
  assert.match(tag(html({ value: "2026-01-18" }), "field-q1_6"), /aria-describedby="field-q1_6-hint field-q1_6-format field-q1_6-echo"/);
  assert.match(tag(html({ value: "31/02/2026" }), "field-q1_6"), /aria-describedby="field-q1_6-hint field-q1_6-format field-q1_6-date-error"/);
});

test("a stored ISO date is shown as dd/mm/yyyy, with the date written out under it in a polite live region", () => {
  const out = html({ value: "2026-01-18" });
  assert.match(tag(out, "field-q1_6"), /value="18\/01\/2026"/);
  assert.match(out, /<p id="field-q1_6-echo" aria-live="polite" class="text-xs text-muted-foreground" data-testid="date-echo">18 January 2026<\/p>/);
  assert.match(html({ value: "2024-02-29" }), />29 February 2024<\/p>/, "a leap day");
  assert.equal(/Error:/.test(out), false);
});

test("text that is being typed is kept as typed, with no echo and no error yet while it is only unfinished", () => {
  for (const partial of ["18", "18/", "18/0", "18/01", "18/01/20"]) {
    const out = html({ value: partial });
    assert.match(tag(out, "field-q1_6"), new RegExp(`value="${partial.replace(/\//g, "\\/")}"`), partial);
    assert.match(out, /<p id="field-q1_6-echo"[^>]*><\/p>/, `${partial}: no echo`);
    assert.equal(/Error:/.test(out), false, `${partial}: no error before the person leaves the box`);
  }
});

test("a complete date that is not real gets a plain error at once, linked to the box, and no echo", () => {
  for (const bad of ["31/02/2026", "13/13/2026", "29/02/2025", "00/01/2026", "31/04/2026"]) {
    const out = html({ value: bad });
    const input = tag(out, "field-q1_6");
    assert.match(input, /aria-invalid="true"/, bad);
    assert.match(input, /aria-describedby="[^"]*field-q1_6-date-error/, bad);
    assert.match(out, /<p id="field-q1_6-date-error"[^>]*><span class="sr-only">Error: <\/span>Enter a real date as dd\/mm\/yyyy<\/p>/, bad);
    assert.match(out, /<p id="field-q1_6-echo"[^>]*><\/p>/, `${bad}: nothing is written out for a date that is not real`);
  }
});

test("when the form already shows an error under the question, the box does not say it twice, and is still marked invalid", () => {
  const out = html({ value: "31/02/2026", invalid: true });
  assert.equal(/Error:/.test(out), false);
  assert.match(tag(out, "field-q1_6"), /aria-invalid="true"/);
});

test("the leap day 29/02/2024 is a real date and shows its echo", () => {
  assert.match(html({ value: "29/02/2024" }), />29 February 2024<\/p>/);
  assert.match(html({ value: "29/02/2025" }), /Enter a real date as dd\/mm\/yyyy/);
});

// ---------------------------------------------------------------------------
// What it does
// ---------------------------------------------------------------------------

test("typing 1, 8, 0, 1, 2, 0, 2, 6 gives 1, 18/, 18/0, 18/01/, 18/01/2, 18/01/20, 18/01/202 and then the date", () => {
  const steps = [];
  let current = "";
  for (const character of "18012026") {
    const rigged = rig({ value: current });
    type(rigged, rigged.input.value + character);
    current = rigged.changes[0];
    steps.push(current);
  }
  assert.deepEqual(steps, ["1", "18/", "18/0", "18/01/", "18/01/2", "18/01/20", "18/01/202", "2026-01-18"]);
});

test("a paste of 18/01/2026, 18-01-2026 and 18.01.2026 gives the ISO date; a paste of a date that is not real is kept as typed", () => {
  for (const pasted of ["18/01/2026", "18-01-2026", "18.01.2026"]) {
    const rigged = rig();
    type(rigged, pasted);
    assert.deepEqual(rigged.changes, ["2026-01-18"], pasted);
  }
  for (const bad of ["31/02/2026", "13/13/2026"]) {
    const rigged = rig();
    type(rigged, bad);
    assert.deepEqual(rigged.changes, [bad], `${bad} is kept as typed, never turned into another date`);
  }
});

test("clearing the box clears the answer, and backspace can delete a slash", () => {
  const cleared = rig({ value: "1" });
  type(cleared, "");
  assert.deepEqual(cleared.changes, [""]);
  // The box shows "18/"; the person presses backspace, so the text is "18": it stays "18" (no slash is put back).
  const back = rig({ value: "18/" });
  type(back, "18");
  assert.deepEqual(back.changes, ["18"]);
});

test("leaving the box marks it touched, so an unfinished date is then reported", () => {
  const rigged = rig({ value: "18/01/20" });
  rigged.input.onBlur();
  assert.deepEqual(rigged.touched, [true]);
  // After it, an unfinished date is reported in plain words.
  assert.match(renderToStaticMarkup(React.createElement(loadTsx("components/tourist-visa/fields/DateField.tsx", { reactOverrides: { useState: () => [true, () => {}] } }).module.DateField, props({ value: "18/01/20" }))), /Enter the full date as dd\/mm\/yyyy/);
  assert.equal(/Error:/.test(html({ value: "18/01/20" })), false, "and not before");
});

// ---------------------------------------------------------------------------
// How it is wired
// ---------------------------------------------------------------------------

test("DATE questions use this input everywhere (the form and the admin editor go through the same renderer), and the question wrapper uses its words", () => {
  const index = readFileSync(new URL("../components/tourist-visa/fields/index.ts", import.meta.url), "utf8");
  assert.match(index, /DATE: DateField/);
  const field = readFileSync(new URL("../components/tourist-visa/fields/DateField.tsx", import.meta.url), "utf8");
  assert.equal(/type="date"/.test(field), false, "no browser date picker");
  const wrapper = readFileSync(new URL("../components/tourist-visa/QuestionField.tsx", import.meta.url), "utf8");
  assert.match(wrapper, /question\.type === "DATE" \? dateErrorMessage\(value, reportedError\) : reportedError/);
  for (const file of ["SectionForm.tsx", "AdminEditor.tsx"]) assert.match(readFileSync(new URL(`../components/tourist-visa/${file}`, import.meta.url), "utf8"), /<QuestionField/, file);
});
