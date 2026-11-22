// Run with: npm run test:unit   (from client/). All numbers are made up.
// How money in and out is written on screen: a green + for a credit, a red − for a debit, nothing for a zero or a balance; one helper for every place.

import test from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import engine from "../shared/tourist-visa/engine.js";
import { buildReview } from "../shared/tourist-visa/view.js";
import { buildPayload } from "./touristVisaForm.ts";
import { MINUS, NUMBER_CLASS, TONE_CLASS, flowOfQuestion, formatNumber, moneyDisplay, netDisplay, signFor, signOfText } from "./touristVisaMoney.ts";

const cfg = engine.config;
const pkr = (amount) => ({ amount, currency: "PKR" });

test("a credit has a leading + and a debit a leading − (a proper minus sign, not a hyphen), in rupees and in pounds", () => {
  assert.equal(moneyDisplay(200000, { flow: "credit", currency: "PKR" }).text, "+200,000 PKR");
  assert.equal(moneyDisplay(100000, { flow: "debit", currency: "PKR" }).text, `${MINUS}100,000 PKR`);
  assert.equal(moneyDisplay(500, { flow: "credit", currency: "GBP" }).text, "+£500");
  assert.equal(moneyDisplay(417, { flow: "debit", currency: "GBP" }).text, `${MINUS}£417`);
  assert.equal(MINUS, "−");
  assert.notEqual(MINUS, "-");
  assert.equal(moneyDisplay(200000, { flow: "credit" }).tone, "credit");
  assert.equal(moneyDisplay(100000, { flow: "debit" }).tone, "debit");
  assert.deepEqual([moneyDisplay(5, { flow: "credit" }).sign, moneyDisplay(5, { flow: "debit" }).sign], ["+", MINUS]);
});

test("a balance, a planned amount and a rate have no flow: no sign and no colour", () => {
  const closing = moneyDisplay(700000, { currency: "PKR" });
  assert.deepEqual([closing.sign, closing.tone, closing.text], ["", "neutral", "700,000 PKR"]);
  assert.equal(moneyDisplay(1600, { flow: null, currency: "GBP" }).text, "£1,600");
  assert.equal(moneyDisplay(700000, { flow: null }).tone, "neutral");
});

test("a zero has no sign and no colour, whatever its flow", () => {
  for (const flow of ["credit", "debit", null]) {
    const zero = moneyDisplay(0, { flow, currency: "PKR" });
    assert.deepEqual([zero.sign, zero.tone, zero.text], ["", "neutral", "0 PKR"], String(flow));
  }
  assert.equal(moneyDisplay(0.004, { flow: "credit" }).tone, "neutral", "under half a paisa is a zero");
  assert.equal(moneyDisplay(0.01, { flow: "credit" }).tone, "credit");
  assert.equal(moneyDisplay(0, { flow: "credit", currency: "GBP" }).text, "£0");
});

test("thousands separators and decimals: whole amounts have none, anything else has two; the size is never negative", () => {
  assert.equal(formatNumber(1200000), "1,200,000");
  assert.equal(formatNumber(999), "999");
  assert.equal(formatNumber(1234.5), "1,234.50");
  assert.equal(formatNumber(1234567.89), "1,234,567.89");
  assert.equal(formatNumber(0.1 + 0.2), "0.30");
  assert.equal(formatNumber(100.004), "100");
  assert.equal(formatNumber(100.006), "100.01");
  assert.equal(formatNumber(-250.5), "250.50", "the size only: the sign comes from the flow");
  assert.equal(formatNumber(Number.NaN), "");
  assert.equal(moneyDisplay(1234.5, { flow: "debit" }).text, `${MINUS}1,234.50 PKR`);
});

test("a very large amount keeps its separators and its sign", () => {
  assert.equal(moneyDisplay(1000000000, { flow: "credit" }).text, "+1,000,000,000 PKR");
  assert.equal(moneyDisplay(123456789012.34, { flow: "debit" }).text, `${MINUS}123,456,789,012.34 PKR`);
  assert.equal(moneyDisplay(1000000000, { flow: "credit", currency: "GBP" }).text, "+£1,000,000,000");
});

test("the net of a month is a credit when positive, a debit when negative, and neutral at zero", () => {
  assert.equal(netDisplay(200000, 100000).text, "+100,000 PKR");
  assert.equal(netDisplay(200000, 100000).tone, "credit");
  assert.equal(netDisplay(200000, 250000).text, `${MINUS}50,000 PKR`);
  assert.equal(netDisplay(200000, 250000).tone, "debit");
  assert.deepEqual([netDisplay(200000, 200000).sign, netDisplay(200000, 200000).tone, netDisplay(200000, 200000).text], ["", "neutral", "0 PKR"]);
  assert.equal(netDisplay(0.3, 0.1).text, "+0.20 PKR", "cents do not drift");
  assert.equal(netDisplay(500, 417, "GBP").text, "+£83");
  assert.equal(netDisplay(417, 500, "GBP").text, `${MINUS}£83`);
});

test("an amount already written as text (the review's) gets its sign and tone without the text being changed", () => {
  assert.deepEqual(signOfText("200,000 PKR", "credit"), { sign: "+", tone: "credit" });
  assert.deepEqual(signOfText("100,000 PKR", "debit"), { sign: MINUS, tone: "debit" });
  assert.deepEqual(signOfText("0 PKR", "credit"), { sign: "", tone: "neutral" });
  assert.deepEqual(signOfText("1,234.50 PKR", "debit"), { sign: MINUS, tone: "debit" });
  assert.deepEqual(signOfText("700,000 PKR", null), { sign: "", tone: "neutral" });
  assert.deepEqual(signOfText("Not answered", "credit"), { sign: "", tone: "neutral" });
  assert.deepEqual([signFor("credit"), signFor("debit"), signFor(null)], ["+", MINUS, ""]);
});

test("which way money goes for a question: its own flow, or the answer of the question it follows in the entry", () => {
  const q = (id) => cfg.questions.find((x) => x.id === id);
  assert.equal(flowOfQuestion(q("q10_33")), "credit");
  assert.equal(flowOfQuestion(q("q10_34")), "debit");
  assert.equal(flowOfQuestion(q("q10_35a")), "credit");
  assert.equal(flowOfQuestion(q("q10_35b")), "debit");
  assert.equal(flowOfQuestion(q("q10_31")), null, "the opening balance has no flow");
  assert.equal(flowOfQuestion(q("q10_32")), null, "nor has the closing balance");
  assert.equal(flowOfQuestion(q("q6_3")), null, "nor has the planned spending");
  assert.equal(flowOfQuestion(q("q10_37c"), { q10_37b: "credit" }), "credit");
  assert.equal(flowOfQuestion(q("q10_37c"), { q10_37b: "debit" }), "debit");
  assert.equal(flowOfQuestion(q("q10_37c"), {}), null, "no type chosen yet");
  assert.equal(flowOfQuestion(q("q10_37c"), { q10_37b: "transfer" }), null);
  assert.equal(flowOfQuestion(q("q10_37c")), null);
});

// WCAG 2.x contrast, worked out from the colours in the classes against the backgrounds of both themes.
const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test("the colours keep WCAG AA contrast (4.5:1) on the light and the dark theme, on the card and on a zebra row, and the tabular figures class is there", () => {
  const colours = {
    credit: { light: TONE_CLASS.credit.match(/text-\[(#[0-9a-f]{6})\]/)[1], dark: TONE_CLASS.credit.match(/dark:text-\[(#[0-9a-f]{6})\]/)[1] },
    debit: { light: TONE_CLASS.debit.match(/text-\[(#[0-9a-f]{6})\]/)[1], dark: TONE_CLASS.debit.match(/dark:text-\[(#[0-9a-f]{6})\]/)[1] },
  };
  assert.deepEqual(colours, { credit: { light: "#15803d", dark: "#4ade80" }, debit: { light: "#b91c1c", dark: "#f87171" } });
  // The lightest background of the light theme that text sits on (the muted grey, #f4f4f6 or so) and the darkest and lightest of the dark theme's cards and rows.
  const lightBackgrounds = { card: [1, 1, 1], "muted row": hex("#f3f4f6") };
  const darkBackgrounds = { "page background": hex("#0b1120"), card: hex("#111a2e"), "muted row": hex("#1f2a40") };
  for (const flow of ["credit", "debit"]) {
    for (const [name, background] of Object.entries(lightBackgrounds)) assert.ok(contrast(hex(colours[flow].light), background) >= 4.5, `${flow} on light ${name}`);
    for (const [name, background] of Object.entries(darkBackgrounds)) assert.ok(contrast(hex(colours[flow].dark), background) >= 4.5, `${flow} on dark ${name}`);
  }
  assert.equal(TONE_CLASS.neutral, "");
  assert.equal(NUMBER_CLASS, "tabular-nums");
});

test("display only: the stored amounts and the payload of the section are unchanged, and the review carries the flow beside the same text", () => {
  const values = {
    q10_29: "2026-06-20", q10_30: "2026-07-19", q10_31: pkr(500000), q10_32: pkr(600000), q10_33: pkr(300000), q10_34: pkr(200000),
    bankMonths: [{ q10_35a: pkr(300000), q10_35b: pkr(200000) }], q10_36: true,
    largeTransactions: [{ q10_37a: "2026-07-01", q10_37b: "debit", q10_37c: pkr(250000), q10_37d: "A dealer", q10_37e: "gift", q10_37f: "Paid once." }],
  };
  const before = JSON.stringify(values);
  const sent = buildPayload(cfg, "10F", values, {}).answers;
  assert.equal(JSON.stringify(values), before, "the form values are not touched");
  assert.deepEqual(sent.q10_34, pkr(200000), "a debit is stored positive, as typed");
  assert.deepEqual(sent.bankMonths[0].q10_35b, pkr(200000));
  assert.deepEqual(sent.largeTransactions[0].q10_37c, pkr(250000));
  assert.equal(JSON.stringify(sent).includes("−"), false, "no minus sign is ever sent");
  assert.equal(JSON.stringify(sent).includes('"+'), false);
  assert.equal(engine.validateSection(z, cfg, "10F", sent, {}, { today: "2026-11-22" }).data.q10_34.amount, 200000);
  // The review: the same text as before, plus the flow.
  const review = buildReview(cfg, values, [], {}, {});
  const rows = review.parts.flatMap((p) => p.sections).find((s) => s.id === "10F").rows;
  const row = (id) => rows.find((r) => r.id === id);
  assert.deepEqual([row("q10_33").value, row("q10_33").flow], ["300,000 PKR", "credit"]);
  assert.deepEqual([row("q10_34").value, row("q10_34").flow], ["200,000 PKR", "debit"]);
  assert.equal(row("q10_31").flow, undefined);
  assert.equal(row("q10_32").flow, undefined);
  const entry = row("largeTransactions").entries[0].rows.find((r) => r.id === "q10_37c");
  assert.deepEqual([entry.value, entry.flow], ["250,000 PKR", "debit"], "a large transaction follows its own type");
  const month = row("bankMonths").entries[0].rows;
  assert.equal(month.find((r) => r.id === "q10_35a").flow, "credit");
  assert.equal(month.find((r) => r.id === "q10_35b").flow, "debit");
});
