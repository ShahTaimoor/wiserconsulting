// Run with: npm run test:unit   (from client/). The currency helper's logic: the amount a person types, the conversion to whole
// pounds, the words, the order of the currencies, the check of what the rates route sends, and the single shared fetch.
// All made-up data; no network.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  amountOf,
  convertToGbp,
  createRatesStore,
  currencyOptions,
  describeConversion,
  describeUse,
  formatAmount,
  formatAsOf,
  formatPounds,
  formatRate,
  MAX_AMOUNT_DIGITS,
  readRatesAnswer,
  roundPounds,
  sanitizeAmountInput,
  staleNotice,
  wantsCurrencyHelper,
} from "./touristVisaCurrency.ts";
import { touristVisaService } from "../services/touristVisaService.ts";

const GOOD = { base: "GBP", asOf: "2026-11-03", stale: false, attribution: null, rates: { PKR: 370.993122, USD: 1.340956, EUR: 1.197588, AED: 4.92, JPY: 205.1 } };

// ---------------------------------------------------------------------------
// What a person types
// ---------------------------------------------------------------------------

test("sanitizeAmountInput keeps digits and one decimal point, and nothing else", () => {
  assert.equal(sanitizeAmountInput("450000"), "450000");
  assert.equal(sanitizeAmountInput("1250.50"), "1250.50");
  assert.equal(sanitizeAmountInput("-5"), "5", "no negatives");
  assert.equal(sanitizeAmountInput("+5"), "5");
  assert.equal(sanitizeAmountInput("1,250"), "1250", "a comma is dropped");
  assert.equal(sanitizeAmountInput("1 250"), "1250");
  assert.equal(sanitizeAmountInput("1.2.3"), "1.23", "only the first point counts");
  assert.equal(sanitizeAmountInput("..5"), ".5");
  assert.equal(sanitizeAmountInput("12abc34"), "1234");
  assert.equal(sanitizeAmountInput("PKR 450,000.75"), "450000.75", "pasted text with a currency and separators");
  assert.equal(sanitizeAmountInput("١٢"), "", "other scripts' digits are not digits here");
  assert.equal(sanitizeAmountInput("1e5"), "15", "no exponents");
  assert.equal(sanitizeAmountInput(""), "");
});

test("sanitizeAmountInput allows at most 12 digits, counting the digits after the point too", () => {
  assert.equal(MAX_AMOUNT_DIGITS, 12);
  assert.equal(sanitizeAmountInput("1234567890123456"), "123456789012");
  assert.equal(sanitizeAmountInput("123456789012"), "123456789012");
  assert.equal(sanitizeAmountInput("1234567890.1234"), "1234567890.12");
  assert.equal(sanitizeAmountInput("123456789012.5"), "123456789012.", "the thirteenth digit is refused");
  assert.equal(sanitizeAmountInput("0".repeat(30)).length, 12);
});

test("amountOf: a number once there is a digit, null before; never negative, never infinite", () => {
  for (const nothing of ["", ".", "..", "abc", "-", " ", "$"]) assert.equal(amountOf(nothing), null, JSON.stringify(nothing));
  assert.equal(amountOf("0"), 0);
  assert.equal(amountOf("0.5"), 0.5);
  assert.equal(amountOf(".5"), 0.5);
  assert.equal(amountOf("5."), 5);
  assert.equal(amountOf("1,250.50"), 1250.5);
  assert.equal(amountOf("-100"), 100, "the sign is dropped, never kept");
  assert.equal(amountOf("999999999999"), 999999999999);
  assert.ok(Number.isFinite(amountOf("9".repeat(40))));
});

// ---------------------------------------------------------------------------
// The conversion
// ---------------------------------------------------------------------------

test("conversion: units of the currency per 1 GBP, divided, then rounded to whole pounds", () => {
  assert.equal(convertToGbp(380, 380), 1);
  assert.equal(roundPounds(convertToGbp(475000, 380)), 1250);
  assert.equal(roundPounds(convertToGbp(450000, 370.993122)), 1213);
  assert.equal(roundPounds(convertToGbp(100, 1.340956)), 75, "dollars");
  assert.equal(roundPounds(convertToGbp(5000000, 205.1)), 24378, "yen");
});

test("rounding: to the nearest pound, halves up, and never below zero", () => {
  assert.equal(roundPounds(1249.49), 1249);
  assert.equal(roundPounds(1249.5), 1250);
  assert.equal(roundPounds(1249.51), 1250);
  assert.equal(roundPounds(0.5), 1);
  assert.equal(roundPounds(2.5), 3);
  assert.equal(roundPounds(0.49), 0);
  assert.equal(roundPounds(convertToGbp(1, 370.99)), 0, "one rupee is nothing in whole pounds");
  assert.equal(roundPounds(convertToGbp(0.001, 370.99)), 0, "a tiny amount");
  assert.equal(roundPounds(convertToGbp(0, 370.99)), 0);
});

test("large amounts stay exact enough: twelve digits of rupees are a plausible number of pounds", () => {
  const pounds = roundPounds(convertToGbp(999999999999, 370.993122));
  assert.ok(Number.isSafeInteger(pounds));
  assert.ok(pounds > 2_690_000_000 && pounds < 2_700_000_000, String(pounds));
  assert.equal(roundPounds(convertToGbp(999999999999, 0.5)), 1999999999998, "even a very small rate stays a safe integer");
  assert.equal(formatPounds(pounds).startsWith("£2,69"), true);
});

test("decimals: an amount with pence-like decimals converts and rounds the same way", () => {
  assert.equal(roundPounds(convertToGbp(1250.75, 1)), 1251);
  assert.equal(roundPounds(convertToGbp(0.1 + 0.2, 0.3)), 1, "floating point noise does not matter at whole pounds");
  assert.equal(roundPounds(convertToGbp(185496.5, 370.993122)), 500);
});

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

test("pounds, rates and dates are written the way a person reads them", () => {
  assert.equal(formatPounds(1250), "£1,250");
  assert.equal(formatPounds(0), "£0");
  assert.equal(formatPounds(1234567), "£1,234,567");
  assert.equal(formatRate(380), "380");
  assert.equal(formatRate(370.993122), "370.99");
  assert.equal(formatRate(1.340956), "1.341");
  assert.equal(formatRate(0.0027), "0.0027");
  assert.equal(formatAsOf("2026-11-03"), "3 November 2026");
  assert.equal(formatAsOf("2027-01-05"), "5 January 2027");
  assert.equal(formatAsOf("not a date"), "not a date");
  assert.equal(formatAmount(450000.5), "450,000.5");
});

test("the line under the inputs says what it is, the rate, and the date of the rates", () => {
  assert.equal(describeConversion(1250, "PKR", 380, "2026-11-03"), "About £1,250 (1 GBP = 380 PKR, rates of 3 November 2026)");
  assert.equal(describeConversion(75, "USD", 1.340956, "2026-11-03"), "About £75 (1 GBP = 1.341 USD, rates of 3 November 2026)");
  assert.equal(describeUse(1250, 475000, "PKR"), "£1,250 filled in, from 475,000 PKR.");
  assert.equal(staleNotice("2026-10-28"), "Rates may be out of date (rates of 28 October 2026).");
});

test("the currencies: PKR first, then the rest alphabetically; only those that have a rate", () => {
  assert.deepEqual(currencyOptions({ USD: 1, PKR: 2, AED: 3, EUR: 4, JPY: 5 }), ["PKR", "AED", "EUR", "JPY", "USD"]);
  assert.deepEqual(currencyOptions({ USD: 1, AED: 3 }), ["AED", "USD"], "without PKR it is just alphabetical");
  assert.deepEqual(currencyOptions({}), []);
});

// ---------------------------------------------------------------------------
// What the rates route sends
// ---------------------------------------------------------------------------

test("readRatesAnswer: a good answer passes unchanged, as a copy", () => {
  const read = readRatesAnswer(GOOD);
  assert.deepEqual(read, GOOD);
  assert.notEqual(read.rates, GOOD.rates);
});

test("readRatesAnswer: anything odd is refused, so the helper is hidden", () => {
  const bad = [
    null, undefined, "x", 5, [], true,
    { ...GOOD, base: "EUR" }, { ...GOOD, base: undefined },
    { ...GOOD, asOf: "3/11/2026" }, { ...GOOD, asOf: 20261103 }, { ...GOOD, asOf: undefined },
    { ...GOOD, stale: "no" }, { ...GOOD, stale: undefined },
    { ...GOOD, rates: null }, { ...GOOD, rates: [1, 2] }, { ...GOOD, rates: "x" }, { ...GOOD, rates: {} },
    { ...GOOD, rates: { USD: 1.3 } }, // no PKR
    { ...GOOD, rates: { ...GOOD.rates, PKR: 0 } }, { ...GOOD, rates: { ...GOOD.rates, PKR: -1 } }, { ...GOOD, rates: { ...GOOD.rates, PKR: "370" } },
    { ...GOOD, rates: { ...GOOD.rates, PKR: null } }, { ...GOOD, rates: { ...GOOD.rates, USD: NaN } }, { ...GOOD, rates: { ...GOOD.rates, USD: Infinity } },
    { ...GOOD, rates: { ...GOOD.rates, usd: 1.3 } }, { ...GOOD, rates: { ...GOOD.rates, "US": 1.3 } }, { ...GOOD, rates: { ...GOOD.rates, USDX: 1.3 } },
  ];
  for (const answer of bad) assert.equal(readRatesAnswer(answer), null, JSON.stringify(answer));
});

test("readRatesAnswer: the attribution is kept only as a link to the rates provider over https", () => {
  const link = { text: "Rates By Exchange Rate API", url: "https://www.exchangerate-api.com" };
  assert.deepEqual(readRatesAnswer({ ...GOOD, attribution: link }).attribution, { text: link.text, url: "https://www.exchangerate-api.com/" });
  assert.equal(readRatesAnswer({ ...GOOD, attribution: undefined }).attribution, null);
  assert.equal(readRatesAnswer({ ...GOOD, attribution: null }).attribution, null);
  for (const attribution of [
    { text: "x", url: "javascript:alert(1)" }, { text: "x", url: "http://www.exchangerate-api.com" }, { text: "x", url: "https://evil.example.com" },
    { text: "x", url: "https://exchangerate-api.com.evil.com" }, { text: "x", url: "https://evilexchangerate-api.com" }, { text: "", url: "https://www.exchangerate-api.com" },
    { text: "x" }, { url: "https://www.exchangerate-api.com" }, "https://www.exchangerate-api.com", [], 5, { text: 5, url: 5 },
  ]) {
    assert.equal(readRatesAnswer({ ...GOOD, attribution }), null, JSON.stringify(attribution));
  }
});

test("readRatesAnswer: stale rates keep their flag and their own date", () => {
  const read = readRatesAnswer({ ...GOOD, stale: true, asOf: "2026-10-28" });
  assert.equal(read.stale, true);
  assert.equal(read.asOf, "2026-10-28");
});

// ---------------------------------------------------------------------------
// One fetch for the whole page
// ---------------------------------------------------------------------------

test("the store fetches the rates once however many helpers ask, at once or later", async () => {
  let calls = 0;
  const store = createRatesStore({ fetchRates: async () => { calls += 1; return GOOD; } });
  assert.equal(store.peek(), undefined, "not asked yet");
  const results = await Promise.all([store.get(), store.get(), store.get(), store.get()]);
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r && r.rates.PKR === GOOD.rates.PKR));
  assert.deepEqual(store.peek(), GOOD);
  await store.get();
  assert.equal(calls, 1, "and not again later");
});

test("the store: any failure is simply unavailable (null), with no error: a rejection, a throw, a 503, an odd answer", async () => {
  const cases = [
    () => Promise.reject(new Error("503 RATES_UNAVAILABLE")),
    () => { throw new TypeError("network"); },
    async () => undefined,
    async () => ({ ...GOOD, base: "USD" }),
    async () => "<html>",
  ];
  for (const fetchRates of cases) {
    const store = createRatesStore({ fetchRates });
    assert.equal(await store.get(), null);
    assert.equal(store.peek(), null);
  }
});

test("the store: rates that never arrive are unavailable after the timeout", async () => {
  const store = createRatesStore({ fetchRates: () => new Promise(() => {}), timeoutMs: 30 });
  assert.equal(await store.get(), null);
  // a late answer does not bring them back for this page
  const late = createRatesStore({ fetchRates: () => new Promise((resolve) => setTimeout(() => resolve(GOOD), 100)), timeoutMs: 20 });
  assert.equal(await late.get(), null);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(late.peek(), null);
});

test("the store: stale rates are shared as they came, and reset forgets them", async () => {
  let calls = 0;
  const store = createRatesStore({ fetchRates: async () => { calls += 1; return { ...GOOD, stale: true }; } });
  assert.equal((await store.get()).stale, true);
  store.reset();
  assert.equal(store.peek(), undefined);
  await store.get();
  assert.equal(calls, 2);
});

test("the rates call sends only the sign-in token, to /tourist-visa/rates, and returns the data as it came", async () => {
  const realFetch = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init }; return { status: 200, json: async () => ({ success: true, data: GOOD }) }; };
  try {
    assert.deepEqual(await touristVisaService.getRates("tok"), GOOD);
    assert.match(seen.url, /\/tourist-visa\/rates$/);
    assert.equal(seen.init.method, "GET");
    assert.deepEqual(Object.keys(seen.init.headers), ["Authorization"]);
    assert.equal(seen.init.body, undefined);
    globalThis.fetch = async () => ({ status: 503, json: async () => ({ success: false, code: "RATES_UNAVAILABLE", message: "x" }) });
    await assert.rejects(() => touristVisaService.getRates("tok"), (e) => e.status === 503 && e.code === "RATES_UNAVAILABLE");
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------------------------------------------------------------------------
// The component and where it appears (read from the source: the component needs a browser)
// ---------------------------------------------------------------------------

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the helper appears under a money question that asks for it, in the one component every form uses", () => {
  const field = source("../components/tourist-visa/QuestionField.tsx");
  assert.match(field, /wantsCurrencyHelper\(question, LIVE_HELPER_IDS\) \?/);
  assert.match(field, /new Set\(liveConfig\.questions\.filter\(\(q\) => q\.currencyHelper\)/, "today's config decides for a snapshot older than the flag");
  assert.match(field, /onChange\(\{ amount: pounds, currency: "GBP" \}\)/, "it fills the field with whole pounds, in pounds");
  assert.equal(field.split("{helperNode}").length - 1, 2, "in both layouts a money question can use");
  // every place that draws a question goes through QuestionField: the applicant form, repeat groups and the admin Edit form
  for (const file of ["../components/tourist-visa/SectionForm.tsx", "../components/tourist-visa/RepeatGroupField.tsx", "../components/tourist-visa/AdminEditor.tsx"]) {
    assert.match(source(file), /QuestionField/, file);
  }
});

test("wantsCurrencyHelper: its own config decides when it speaks; an older snapshot falls back to today's config; only money questions", () => {
  const live = new Set(["q6_3"]);
  assert.equal(wantsCurrencyHelper({ id: "q6_3", type: "AMT", currencyHelper: true }, live), true);
  assert.equal(wantsCurrencyHelper({ id: "q6_3", type: "AMT", currencyHelper: false }, live), false, "a snapshot that says no is respected");
  assert.equal(wantsCurrencyHelper({ id: "q6_3", type: "AMT" }, live), true, "a snapshot older than the flag: today's config says yes");
  assert.equal(wantsCurrencyHelper({ id: "q6_9", type: "AMT" }, live), false, "not flagged today either");
  assert.equal(wantsCurrencyHelper({ id: "q6_3", type: "TXT" }, live), false, "never on a question that is not money");
  assert.equal(wantsCurrencyHelper({ id: "q6_3", type: "TXT", currencyHelper: true }, live), false);
});

test("the component: hidden without rates, never submits the form, closes on Escape, fills and focuses the field, announces the result", () => {
  const c = source("../components/tourist-visa/CurrencyHelper.tsx");
  assert.match(c, /if \(!rates \|\| options\.length === 0\) return null;/, "no rates, nothing shown");
  assert.match(c, /event\.key === "Enter"[\s\S]{0,60}event\.preventDefault\(\)/, "Enter does not submit the section form");
  assert.match(c, /event\.key === "Escape"/);
  assert.match(c, /document\.getElementById\(`\$\{idBase\}-amount`\)\?\.focus\(\)/, "focus goes to the field");
  assert.match(c, /role="status" aria-live="polite"/, "a live region for the result");
  assert.match(c, /Enter in another currency/);
  assert.match(c, /Use this amount/);
  assert.match(c, /Approximate\. Rates change daily\./);
  assert.match(c, /rates\.stale &&/, "the stale notice");
  assert.match(c, /rates\.attribution &&/, "the attribution link");
  assert.match(c, /rel="noopener noreferrer"/);
  assert.equal((c.match(/<Button\b/g) || []).length, (c.match(/<Button\b[^>]*type="button"/g) || []).length, "every button is a plain button");
  assert.equal(/\b(alert|confirm|prompt)\(/.test(c), false, "no native dialog");
  assert.equal(/localStorage|sessionStorage|console\./.test(c), false, "nothing is stored or logged");
});

test("the hook asks the store, and the store's fetch is the only place the rates are fetched", () => {
  const hook = source("../hooks/useTouristVisaRates.ts");
  assert.match(hook, /touristVisaRatesStore\.get\(\)/);
  assert.match(hook, /touristVisaService\.getRates\(token\)/);
  const component = source("../components/tourist-visa/CurrencyHelper.tsx");
  assert.equal(/getRates|fetch\(/.test(component), false, "the component never fetches by itself");
});
