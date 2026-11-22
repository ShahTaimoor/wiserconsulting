'use strict';

// The staff-only funds check (config 1.7.0): the colour badge rule, its edges, the grey cases, the planned spending, the pounds, the notes and the
// careful wording. No database, no network: the rates are passed in. Made-up numbers only.

process.env.NODE_ENV = 'test';
process.env.FIELD_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../shared/tourist-visa/engine');
const { FUNDS, publicSettings, engineSettings } = require('../config/touristVisaFunds');
const { buildFundsCheck, plannedSpending, compare, HELPER_LINE } = require('../utils/touristVisaFundsCheck');
const { BANK_ACTIVITY, pkr, gbp } = require('./helpers/touristVisaFixtures');

const clone = (o) => JSON.parse(JSON.stringify(o));
const cfg = engine.config;
const RATES = { base: 'GBP', asOf: '2026-11-20', stale: false, rates: { PKR: 400, USD: 1.3 } };
// 700,000 PKR at 400 PKR to the pound is £1,750.
const answers = (extra = {}) => ({ ...clone(BANK_ACTIVITY), q6_3: gbp(1000), q6_5: false, ...extra });
const check = (extra, rates = RATES, config = cfg) => buildFundsCheck({ cfg: config, answers: answers(extra), rates });

test('the settings live in one backend config file; the form gets three numbers from it and never the indicator thresholds', () => {
  assert.deepEqual(publicSettings(), { currency: 'PKR', spikePercent: 50, singleTransactionPercent: 25, singleTransactionFloor: 25000 });
  assert.deepEqual(engineSettings(), { spikePercent: 50, singleTransactionPercent: 25, singleTransactionFloor: 25000 });
  assert.deepEqual({ ...engine.getSettings() }, engineSettings(), 'loading the config file hands them to the shared engine');
  assert.deepEqual({ ...FUNDS.indicator }, { redBelowPercent: 100, greenAtOrAbovePercent: 120, largeNegativeChangePercent: 30 });
  const exposed = JSON.stringify(publicSettings());
  for (const word of ['indicator', '120', 'red', 'green', 'amber']) assert.equal(exposed.includes(word), false, word);
});

test('green: the closing balance is at least 120% of the planned spending', () => {
  const result = check({});
  assert.equal(result.badge, 'green');
  assert.equal(result.headline, 'Looks consistent');
  assert.equal(result.comparison.closingGbp, 1750);
  assert.equal(result.comparison.plannedGbp, 1000);
  assert.equal(result.comparison.percentOfPlanned, 175);
});

test('amber and red: it covers the planned spending but is under 120% of it, or it does not cover it', () => {
  assert.equal(check({ q6_3: gbp(1500) }).badge, 'amber', '1,750 against 1,500 is 117%');
  assert.equal(check({ q6_3: gbp(1500) }).headline, 'Needs a closer look');
  assert.equal(check({ q6_3: gbp(2000) }).badge, 'red', '1,750 against 2,000 is 88%');
  assert.equal(check({ q6_3: gbp(2000) }).headline, 'Needs a closer look');
  assert.match(check({ q6_3: gbp(2000) }).reason, /below the planned spending/);
});

test('the edges: exactly 100% is amber, just under it is red; exactly 120% is green, just under it is amber', () => {
  // The planned spending is £1,000 at 400 PKR to the pound: 100% is PKR 400,000 and 120% is PKR 480,000.
  const at = (closing) => check({ q10_32: pkr(closing) }).badge;
  assert.equal(at(400000), 'amber', 'exactly 100%');
  assert.equal(at(399999.99), 'red', 'just under 100%');
  assert.equal(at(480000), 'green', 'exactly 120%');
  assert.equal(at(479999.99), 'amber', 'just under 120%');
  assert.equal(at(480000.01), 'green');
  assert.equal(compare(400000, 1000, 400), 'amber');
  assert.equal(compare(480000, 1000, 400), 'green');
  // A rate that is not round does not blur the edge.
  assert.equal(compare(375150 * 1.2, 1000 * 1, 375.15), 'green');
  assert.equal(compare(375150, 1000, 375.15), 'amber');
  assert.equal(compare(375149.99, 1000, 375.15), 'red');
});

test('grey: not enough information when the planned spending is missing, the rate is missing, or the section is not complete', () => {
  const noPlanned = check({ q6_3: undefined });
  assert.equal(noPlanned.badge, 'grey');
  assert.equal(noPlanned.headline, 'Not enough information');
  assert.match(noPlanned.reason, /planned spending/);
  assert.ok(noPlanned.figures, 'the figures are still shown');
  const noRate = check({}, null);
  assert.equal(noRate.badge, 'grey');
  assert.match(noRate.reason, /exchange rate/);
  assert.equal(noRate.figures.closing.gbp, null, 'no pounds without a rate');
  assert.equal(noRate.figures.closing.pkr, 700000);
  assert.equal(check({}, { asOf: '2026-11-20', rates: {} }).badge, 'grey');
  const incomplete = check({ q10_32: undefined });
  assert.equal(incomplete.badge, 'grey');
  assert.equal(incomplete.figures, undefined);
  assert.equal(check({ bankMonths: BANK_ACTIVITY.bankMonths.slice(1) }).badge, 'grey', 'the months do not match the dates');
  assert.equal(buildFundsCheck({ cfg, answers: {}, rates: RATES }).badge, 'grey');
  assert.equal(buildFundsCheck({ cfg, answers: undefined, rates: RATES }).badge, 'grey');
});

test('the planned spending is 6.3 plus everything the people paying will pay (6.5f), only while 6.5 is Yes, all in pounds', () => {
  assert.deepEqual(plannedSpending(cfg, answers({})), { total: 1000, personal: 1000, others: 0 });
  const payers = [{ q6_5f: gbp(500) }, { q6_5f: gbp(250.5) }, {}];
  assert.deepEqual(plannedSpending(cfg, answers({ q6_5: true, payers })), { total: 1750.5, personal: 1000, others: 750.5 });
  assert.deepEqual(plannedSpending(cfg, answers({ q6_5: false, payers })), { total: 1000, personal: 1000, others: 0 }, 'ignored while 6.5 is No');
  assert.equal(plannedSpending(cfg, answers({ q6_3: undefined, q6_5: true, payers })), null, 'no 6.3 answer: no planned spending');
  // The sponsors' money counts in the comparison: £1,750 needed, £1,750 in the account is exactly 100%.
  assert.equal(check({ q6_5: true, payers: [{ q6_5f: gbp(750) }] }).badge, 'amber');
  assert.equal(check({ q6_5: true, payers: [{ q6_5f: gbp(750) }] }).planned.gbp, 1750);
});

test('the figures are shown in rupees and in pounds, with the rate date, the averages and the months', () => {
  const result = check({});
  assert.deepEqual(result.rates, { asOf: '2026-11-20', stale: false, pkrPerGbp: 400 });
  const f = result.figures;
  assert.deepEqual(f.period, { start: '2026-06-20', end: '2026-12-19', months: 6 });
  assert.deepEqual(f.opening, { pkr: 500000, gbp: 1250 });
  assert.deepEqual(f.closing, { pkr: 700000, gbp: 1750 });
  assert.deepEqual(f.totalCredit, { pkr: 1200000, gbp: 3000 });
  assert.deepEqual(f.totalDebit, { pkr: 1000000, gbp: 2500 });
  assert.deepEqual(f.averageCredit, { pkr: 200000, gbp: 500 });
  assert.deepEqual(f.averageDebit, { pkr: 166666.67, gbp: 416.67 });
  assert.deepEqual(f.singleTransactionLimits, { credit: 50000, debit: 41667 });
  assert.equal(f.months.length, 6);
  assert.equal(f.months[0].label, '20 June to 19 July');
  assert.deepEqual(f.months[3].debit, { pkr: 250000, gbp: 625 });
  assert.equal(check({}, { ...RATES, stale: true }).rates.stale, true);
});

test('the months that were asked to be explained show the reason the applicant gave, and the large transactions are listed', () => {
  const months = clone(BANK_ACTIVITY.bankMonths);
  const over = [100000, 100000, 100000, 100000, 100000, 700000].map((credit, i) => ({ q10_35a: pkr(credit), q10_35b: months[i].q10_35b }));
  over[5].q10_35c = 'A relative returned money I had lent.';
  const large = [
    { q10_37a: '2026-09-10', q10_37b: 'credit', q10_37c: pkr(600000), q10_37d: 'An uncle', q10_37e: 'gift', q10_37f: 'A gift for the trip.' },
    { q10_37a: '2026-10-02', q10_37b: 'debit', q10_37c: pkr(300000), q10_37d: 'A dealer', q10_37e: 'other', q10_37e_other: 'Prize money', q10_37f: 'A car part.' },
  ];
  const result = check({ bankMonths: over, q10_36: true, largeTransactions: large });
  const row = result.figures.months[5];
  assert.equal(row.creditHigh, true);
  assert.equal(row.debitHigh, false);
  assert.equal(row.explanation, 'A relative returned money I had lent.');
  assert.equal(result.figures.months[0].explanation, null);
  assert.equal(result.figures.largeTransactions.length, 2);
  assert.deepEqual(result.figures.largeTransactions[0], { date: '2026-09-10', type: 'credit', amount: { pkr: 600000, gbp: 1500 }, who: 'An uncle', reason: 'gift', details: 'A gift for the trip.' });
  assert.equal(result.figures.largeTransactions[1].reason, 'Other: Prize money');
  // A No hides whatever entries are left over.
  assert.equal(check({ q10_36: false, largeTransactions: large }).figures.largeTransactions.length, 0);
});

test('the checks of the figures are shown again: they pass for figures that add up and say so when they do not', () => {
  const ok = check({}).checks;
  assert.deepEqual([ok.balance.passed, ok.monthlyCredits.passed, ok.monthlyDebits.passed], [true, true, true]);
  const bad = check({ q10_32: pkr(650000) });
  assert.equal(bad.checks.balance.passed, false);
  assert.equal(bad.checks.balance.left, 700000);
  assert.equal(bad.checks.balance.right, 650000);
  assert.ok(bad.notes.some((n) => /automatic checks/.test(n)));
  assert.equal(check({ q10_32: pkr(700000.99) }).checks.balance.passed, true, 'within the tolerance of PKR 1.00');
});

test('the notes are never colours: unusual months, large transactions, and a large fall from the opening to the closing balance', () => {
  const calm = check({});
  assert.deepEqual(calm.notes, ['0 unusual months (well above the average of the period).', '0 large transactions listed by the applicant.']);
  const over = [100000, 100000, 100000, 100000, 100000, 700000].map((credit, i) => ({ q10_35a: pkr(credit), q10_35b: BANK_ACTIVITY.bankMonths[i].q10_35b }));
  const noted = check({ bankMonths: over, q10_36: true, largeTransactions: [{ q10_37a: '2026-09-10', q10_37b: 'credit', q10_37c: pkr(600000), q10_37d: 'A', q10_37e: 'gift', q10_37f: 'B' }] });
  assert.equal(noted.notes[0], '1 unusual month (well above the average of the period).');
  assert.equal(noted.notes[1], '1 large transaction listed by the applicant.');
  assert.equal(noted.badge, 'green', 'the notes do not change the colour');
  // 500,000 opening to 350,000 closing is 30% down: a note; 360,000 is 28% down: none.
  assert.ok(check({ q10_32: pkr(350000) }).notes.some((n) => /30% below the opening balance/.test(n)));
  assert.equal(check({ q10_32: pkr(360000) }).notes.some((n) => /below the opening balance/.test(n)), false);
  assert.equal(check({ q10_31: pkr(0), q10_32: pkr(700000) }).notes.some((n) => /below the opening balance/.test(n)), false, 'a zero opening balance has no fall');
});

test('an application submitted before the section existed gets the grey "Not collected" badge, and nothing else', () => {
  const older = clone(cfg);
  older.version = '1.6.0';
  older.questions = older.questions.filter((q) => q.section !== '10F');
  older.sections = older.sections.filter((s) => s.id !== '10F');
  older.groups = older.groups.filter((g) => !['bankMonths', 'largeTransactions'].includes(g.id));
  delete older.checks;
  const result = buildFundsCheck({ cfg: older, answers: { q6_3: gbp(1000) }, rates: RATES });
  assert.equal(result.collected, false);
  assert.equal(result.badge, 'grey');
  assert.equal(result.headline, 'Not collected (submitted on an older form)');
  assert.equal(result.figures, undefined);
  assert.equal(result.checks, undefined);
  // Even with figures lying in its answers (they cannot be there), an older form is not read.
  assert.equal(buildFundsCheck({ cfg: older, answers: answers(), rates: RATES }).figures, undefined);
});

test('the wording is careful: a helper for staff, never a decision, and no word of refusal or approval anywhere in the panel', () => {
  assert.match(HELPER_LINE, /helper for staff, not a decision/);
  const results = [check({}), check({ q6_3: gbp(1500) }), check({ q6_3: gbp(2000) }), check({ q6_3: undefined }), check({}, null), buildFundsCheck({ cfg: { questions: [] }, answers: {}, rates: RATES })];
  assert.deepEqual(results.map((r) => r.badge), ['green', 'amber', 'red', 'grey', 'grey', 'grey']);
  for (const r of results) {
    assert.equal(r.helper, HELPER_LINE);
    const text = JSON.stringify(r);
    assert.equal(/approv|refus|reject|declin|denied|eligible|pass the visa|will be granted/i.test(text), false, text.slice(0, 120));
  }
});
