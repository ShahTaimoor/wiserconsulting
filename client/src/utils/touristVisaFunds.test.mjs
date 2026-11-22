// Run with: npm run test:unit   (from client/). All numbers are made up.
// The bank activity section on the applicant's side (config 1.7.0): the settings the form reads from the server, the months and the averages it
// shows, the amounts above which a single transaction is asked about, the group of months that follows the dates, the explanation of an unusual
// month, the hints and the errors that point at the right field. The real shared config and rules are used.

import test from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import engine from "../shared/tourist-visa/engine.js";
import { buildChecklist } from "./touristVisaChecklist.ts";
import { buildPayload, collectErrors, groupEntryCount, hintFor, initialValues } from "./touristVisaForm.ts";
import { describeRate, formatRupees, readFundsSettings, rupeesAndPounds, rupeesToPounds, summariseFunds } from "./touristVisaFunds.ts";

const cfg = engine.config;
const SETTINGS = { currency: "PKR", spikePercent: 50, singleTransactionPercent: 25, singleTransactionFloor: 25000 };
engine.setSettings({ spikePercent: 50, singleTransactionPercent: 25, singleTransactionFloor: 25000 });
const RATES = { base: "GBP", asOf: "2026-11-20", stale: false, attribution: null, rates: { PKR: 400, USD: 1.3 } };

const pkr = (amount) => ({ amount, currency: "PKR" });
const months = (credits, debits) => credits.map((c, i) => ({ q10_35a: pkr(c), q10_35b: pkr(debits[i]) }));
const SIX = () => ({
  q10_29: "2026-06-20", q10_30: "2026-12-19", q10_31: pkr(500000), q10_32: pkr(700000), q10_33: pkr(1200000), q10_34: pkr(1000000),
  bankMonths: months([200000, 200000, 200000, 200000, 200000, 200000], [100000, 200000, 150000, 250000, 150000, 150000]), q10_36: false,
});
const payload = (values, existing = {}) => buildPayload(cfg, "10F", values, existing).answers;
const validate = (values, existing = {}) => engine.validateSection(z, cfg, "10F", payload(values, existing), existing);

test("the settings of the server are read as they are, and anything odd is not used", () => {
  assert.deepEqual(readFundsSettings(SETTINGS), SETTINGS);
  assert.equal(readFundsSettings(null), null);
  assert.equal(readFundsSettings([]), null);
  assert.equal(readFundsSettings({ ...SETTINGS, currency: "pkr" }), null);
  assert.equal(readFundsSettings({ ...SETTINGS, spikePercent: "50" }), null);
  assert.equal(readFundsSettings({ ...SETTINGS, singleTransactionFloor: -1 }), null);
  assert.equal(readFundsSettings({ currency: "PKR" }), null);
  // Only the three numbers of the form are read: nothing else the server might send is kept.
  assert.deepEqual(readFundsSettings({ ...SETTINGS, indicator: { redBelowPercent: 100 } }), SETTINGS);
});

test("the months, the periods, the averages and the single-transaction amounts follow what is typed", () => {
  const empty = summariseFunds({}, SETTINGS);
  assert.deepEqual([empty.months, empty.averageCredit, empty.creditLimit], [null, null, null]);
  const dates = summariseFunds({ q10_29: "2026-06-20", q10_30: "2026-12-19" }, SETTINGS);
  assert.equal(dates.months, 6);
  assert.equal(dates.periods.length, 6);
  assert.equal(dates.periods[0].label, "20 June to 19 July");
  assert.equal(dates.averageCredit, null, "no totals yet");
  const full = summariseFunds(SIX(), SETTINGS);
  assert.equal(full.averageCredit, 200000);
  assert.equal(full.averageDebit, 1000000 / 6);
  assert.equal(full.creditLimit, 50000, "25% of 200,000");
  assert.equal(full.debitLimit, 41667, "25% of the debit average, rounded up to a whole rupee");
  const small = summariseFunds({ ...SIX(), q10_33: pkr(60000), q10_34: pkr(60000) }, SETTINGS);
  assert.deepEqual([small.creditLimit, small.debitLimit], [25000, 25000], "never below the floor");
  assert.equal(summariseFunds(SIX(), null).creditLimit, null, "without the settings no amount is shown");
  assert.equal(summariseFunds({ ...SIX(), q10_30: "2027-12-19" }, SETTINGS).months, null, "more than 12 months");
});

test("amounts are shown in rupees and in pounds from the rate the currency helper uses, with its date", () => {
  assert.equal(formatRupees(1250000.4), "PKR 1,250,000");
  assert.equal(rupeesToPounds(400000, RATES), 1000);
  assert.equal(rupeesToPounds(400000, null), null);
  assert.equal(rupeesToPounds(400000, { ...RATES, rates: { USD: 1.3 } }), null, "no PKR rate");
  assert.equal(rupeesAndPounds(400000, RATES), "PKR 400,000 (about £1,000)");
  assert.equal(rupeesAndPounds(400000, null), "PKR 400,000");
  assert.equal(describeRate(RATES), "1 GBP = 400 PKR, rates of 20 November 2026");
  assert.equal(describeRate(null), null);
});

test("the group of months has as many entries as the dates make, and follows them when they change", () => {
  const group = cfg.groups.find((g) => g.id === "bankMonths");
  assert.equal(groupEntryCount(cfg, group, {}), 0, "no dates: no entries");
  assert.equal(groupEntryCount(cfg, group, { q10_29: "2026-06-20", q10_30: "2026-12-19" }), 6);
  assert.equal(groupEntryCount(cfg, group, { q10_29: "2026-06-20", q10_30: "2026-09-19" }), 3);
  assert.equal(groupEntryCount(cfg, group, { q10_29: "2026-06-20", q10_30: "2027-09-19" }), 0, "13 months: refused by the dates, no entries");
  assert.equal(groupEntryCount(cfg, group, { q10_29: "2026-06-20", q10_30: "2026-06-20" }), 0);
  // The payload sends exactly that many: extra entries typed before the dates changed are left out, missing ones go blank.
  const values = SIX();
  assert.equal(payload({ ...values, q10_30: "2026-09-19" }).bankMonths.length, 3);
  assert.equal(payload({ ...values, q10_30: "2027-03-19" }).bankMonths.length, 9);
  assert.equal(initialValues(cfg, "10F", {}).bankMonths, undefined, "no starter entry: the dates decide");
  assert.equal(initialValues(cfg, "10F", {}).largeTransactions?.length, undefined, "the large transactions open with the Yes");
});

test("the form asks for an explanation of an unusual month and keeps nothing for a month that is not unusual", () => {
  const over = SIX();
  over.bankMonths = months([100000, 100000, 100000, 100000, 100000, 700000], [100000, 200000, 150000, 250000, 150000, 150000]);
  const result = validate(over);
  assert.equal(result.success, false);
  const items = collectErrors(cfg, "10F", result.errors);
  assert.deepEqual(items.map((i) => i.targetId), ["field-bankMonths-5-q10_35c"]);
  assert.equal(items[0].message, "This question is required");
  assert.equal(items[0].label, "Month 6: Why was this month higher?");
  assert.equal(engine.isVisible(cfg, "q10_35c", over, over.bankMonths[5]), true);
  assert.equal(engine.isVisible(cfg, "q10_35c", over, over.bankMonths[0]), false);
  over.bankMonths[5].q10_35c = "A relative returned money.";
  over.bankMonths[0].q10_35c = "typed for a month that is not unusual";
  const sent = payload(over);
  assert.equal(sent.bankMonths[5].q10_35c, "A relative returned money.");
  assert.equal(sent.bankMonths[0].q10_35c, undefined, "not sent for a month that is not unusual");
  assert.equal(validate(over).success, true);
});

test("a figure that does not add up comes back as an error on the right field, with both numbers", () => {
  const mismatch = validate({ ...SIX(), q10_32: pkr(650000) });
  const items = collectErrors(cfg, "10F", mismatch.errors);
  assert.deepEqual(items.map((i) => i.targetId), ["field-q10_32"]);
  assert.match(items[0].message, /comes to PKR 700,000\.00, but the closing balance you entered is PKR 650,000\.00/);
  const monthly = SIX();
  monthly.bankMonths[0].q10_35a = pkr(100000);
  const credits = collectErrors(cfg, "10F", validate(monthly).errors);
  assert.deepEqual(credits.map((i) => i.targetId), ["field-q10_33"]);
  assert.match(credits[0].message, /Your monthly credits add up to PKR 1,100,000\.00 but the statement total is PKR 1,200,000\.00/);
});

test("the end date says how long the statement may be, and a large transaction asks only inside the period", () => {
  assert.match(hintFor(cfg, cfg.questions.find((q) => q.id === "q10_30")), /Must cover between 1 and 12 months\./);
  const transaction = { q10_37a: "2026-05-01", q10_37b: "credit", q10_37c: pkr(100000), q10_37d: "Someone", q10_37e: "gift", q10_37f: "A gift" };
  const result = validate({ ...SIX(), q10_36: true, largeTransactions: [transaction] });
  assert.deepEqual(collectErrors(cfg, "10F", result.errors).map((i) => i.targetId), ["field-largeTransactions-0-q10_37a"]);
  assert.match(result.errors["largeTransactions.0.q10_37a"], /on or after the date in question 10\.29/);
  assert.equal(validate({ ...SIX(), q10_36: true, largeTransactions: [{ ...transaction, q10_37a: "2026-07-01" }] }).success, true);
});

test("the section is on the dashboard for every applicant, before the plans in the UK and the documents", () => {
  const ids = (answers) => buildChecklist(cfg, { sectionStatus: {}, answers }).parts.flatMap((p) => p.sections.map((s) => s.id));
  assert.equal(ids({}).includes("10F"), true);
  assert.deepEqual(ids({ q6_7: false }).slice(-4), ["10C", "10F", "10E", "10D"]);
  assert.deepEqual(ids({ q6_7: true }).slice(-3), ["10C", "10F", "10D"]);
  const row = buildChecklist(cfg, { sectionStatus: { "10F": "saved" }, answers: {} }).parts.flatMap((p) => p.sections).find((s) => s.id === "10F");
  assert.equal(row.title, "Your bank activity");
  assert.equal(row.state, "saved");
  assert.equal(cfg.sections.find((s) => s.id === "10F").helper, "funds");
  assert.equal(cfg.questions.find((q) => q.id === "q10_36").helper, "fundsLimits");
});
