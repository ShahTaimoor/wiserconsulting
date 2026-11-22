'use strict';

// Config 1.7.0, section 10F "Your bank activity": the months a statement covers (derived from the dates), the rolling periods, the averages, the
// spike rule, the amounts above which a single transaction is asked about, the figures that must add up, and the explanations of unusual months
// (a derived condition). Run with: node --test shared/tourist-visa/funds.test.js. Made-up numbers only.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const z = require(require.resolve('zod', { paths: [path.join(__dirname, '..', '..', 'backend')] }));
const engine = require('./engine');
const funds = require('./funds');
const cover = require('./coverLetterFacts');
const itinerary = require('./itineraryFacts');

const { config } = engine;
const clone = (o) => JSON.parse(JSON.stringify(o));
const pkr = (amount) => ({ amount, currency: 'PKR' });
const SETTINGS = { spikePercent: 50, singleTransactionPercent: 25, singleTransactionFloor: 25000 };
engine.setSettings(SETTINGS);

const validate = (incoming, existing = {}, cfg = config) => engine.validateSection(z, cfg, '10F', incoming, existing, { today: '2026-11-22' });
const months = (credits, debits) => credits.map((c, i) => ({ q10_35a: pkr(c), q10_35b: pkr(debits[i]) }));

/** A six-month statement, 20 June to 19 December, whose figures add up: opening 500,000 + credit 1,200,000 - debit 1,000,000 = closing 700,000. */
const SIX = () => ({
  q10_29: '2026-06-20', q10_30: '2026-12-19', q10_31: pkr(500000), q10_32: pkr(700000), q10_33: pkr(1200000), q10_34: pkr(1000000),
  bankMonths: months([200000, 200000, 200000, 200000, 200000, 200000], [100000, 200000, 150000, 250000, 150000, 150000]),
  q10_36: false,
});

// ---------------------------------------------------------------------------
// The months of a statement
// ---------------------------------------------------------------------------

test('the months are derived from the dates: exact 3, 6 and 12 month periods, 20th-to-20th periods, rounded to the nearest whole month', () => {
  assert.equal(funds.monthsBetween('2027-01-01', '2027-04-01'), 3);
  assert.equal(funds.monthsBetween('2027-01-01', '2027-03-31'), 3, 'a calendar quarter');
  assert.equal(funds.monthsBetween('2027-01-01', '2027-07-01'), 6);
  assert.equal(funds.monthsBetween('2027-01-01', '2027-06-30'), 6);
  assert.equal(funds.monthsBetween('2027-01-01', '2028-01-01'), 12);
  assert.equal(funds.monthsBetween('2027-01-01', '2027-12-31'), 12);
  assert.equal(funds.monthsBetween('2026-12-20', '2027-06-20'), 6, 'a rolling statement, 20th to 20th');
  assert.equal(funds.monthsBetween('2026-12-20', '2027-06-19'), 6, '20th to the 19th');
  assert.equal(funds.monthsBetween('2027-05-20', '2027-06-19'), 1);
  assert.equal(funds.monthsBetween('2027-01-31', '2027-02-28'), 1, 'a short month');
  assert.equal(funds.monthsBetween('2027-03-01', '2027-03-10'), 0, 'less than half a month');
  assert.equal(funds.monthsBetween('2027-03-01', '2027-03-17'), 1, 'more than half a month rounds up');
  assert.equal(funds.monthsBetween('2027-01-01', '2028-01-31'), 13);
});

test('the months are null for an end that is not after the start, or a date that is not real', () => {
  assert.equal(funds.monthsBetween('2027-03-05', '2027-03-05'), null);
  assert.equal(funds.monthsBetween('2027-03-06', '2027-03-05'), null);
  assert.equal(funds.monthsBetween('2027-02-30', '2027-05-01'), null);
  assert.equal(funds.monthsBetween(undefined, '2027-05-01'), null);
  assert.equal(funds.monthsBetween('2027-01-01', 'soon'), null);
  assert.equal(funds.statementMonths('2027-01-01', '2027-03-31'), 3);
  assert.equal(funds.statementMonths('2027-03-01', '2027-03-10'), null, 'under a month');
  assert.equal(funds.statementMonths('2027-01-01', '2028-01-31'), null, '13 months');
});

test('the period of the statement must cover 1 to 12 months: a month or a year is accepted, under a month and 13 months are refused, an end before the start is refused', () => {
  const check = (start, end) => validate({ ...SIX(), q10_29: start, q10_30: end, bankMonths: undefined }).errors.q10_30;
  assert.equal(check('2027-05-20', '2027-06-19'), undefined, 'one month');
  assert.equal(check('2027-01-01', '2027-12-31'), undefined, 'twelve months');
  assert.equal(check('2027-03-01', '2027-03-10'), 'The period must cover between 1 and 12 months', 'under a month');
  assert.equal(check('2027-01-01', '2028-01-31'), 'The period must cover between 1 and 12 months', 'thirteen months');
  assert.equal(check('2027-03-05', '2027-03-01'), 'Must be after the date in question 10.29', 'the end before the start');
  assert.equal(check('2027-03-05', '2027-03-05'), 'Must be after the date in question 10.29', 'the same day');
});

test('the rolling period of each month is worked out from the start date, and the last one ends on the end date', () => {
  assert.deepEqual(funds.rollingPeriods('2027-05-20', '2027-08-19', 3).map((p) => p.label), ['20 May to 19 June', '20 June to 19 July', '20 July to 19 August']);
  assert.deepEqual(funds.rollingPeriods('2027-01-01', '2027-03-31', 3).map((p) => p.label), ['1 January to 31 January', '1 February to 28 February', '1 March to 31 March']);
  assert.deepEqual(funds.rollingPeriods('2026-12-20', '2027-02-19', 2).map((p) => p.label), ['20 December 2026 to 19 January 2027', '20 January to 19 February'], 'the year is named when a period crosses it');
  assert.equal(funds.rollingPeriods('2027-05-20', '2027-06-25', 1)[0].label, '20 May to 25 June', 'the last period ends on the statement end date');
  assert.deepEqual(funds.rollingPeriods('x', 'y', 3), []);
});

// ---------------------------------------------------------------------------
// The section: the entries follow the dates
// ---------------------------------------------------------------------------

test('a statement whose figures add up is accepted, and its months are the group of entries', () => {
  const r = validate(SIX());
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.equal(r.data.bankMonths.length, 6);
  assert.equal(engine.derivedCount(config.groups.find((g) => g.id === 'bankMonths'), SIX()), 6);
});

test('the number of month entries must equal the months of the dates, and follows them when the dates change', () => {
  const six = SIX();
  assert.equal(validate({ ...six, bankMonths: six.bankMonths.slice(0, 5) }).errors.bankMonths, 'Give details for exactly 6 months');
  assert.equal(validate({ ...six, bankMonths: [...six.bankMonths, six.bankMonths[0]] }).errors.bankMonths, 'Give details for exactly 6 months');
  assert.equal(validate({ ...six, bankMonths: undefined }).errors.bankMonths, 'Give details for exactly 6 months');
  // The end date moves back to three months: six entries are now too many; three are right.
  const three = { ...six, q10_30: '2026-09-19' };
  assert.equal(engine.derivedCount(config.groups.find((g) => g.id === 'bankMonths'), three), 3);
  assert.equal(validate(three).errors.bankMonths, 'Give details for exactly 3 months');
  const threeEntries = { ...three, q10_33: pkr(600000), q10_34: pkr(450000), q10_32: pkr(650000), bankMonths: months([200000, 200000, 200000], [100000, 200000, 150000]) };
  assert.equal(validate(threeEntries).success, true, JSON.stringify(validate(threeEntries).errors));
  // Without usable dates the group asks nothing (the dates show their own errors).
  assert.equal(validate({ ...six, q10_30: '2026-06-20' }).errors.bankMonths, undefined);
});

test('required fields: every date, balance and total, every month amount, and the Yes/No about large transactions', () => {
  const r = validate({});
  for (const id of ['q10_29', 'q10_30', 'q10_31', 'q10_32', 'q10_33', 'q10_34', 'q10_36']) assert.equal(r.errors[id], 'This question is required', id);
  const blank = validate({ ...SIX(), bankMonths: [{}, ...SIX().bankMonths.slice(1)] });
  assert.equal(blank.errors['bankMonths.0.q10_35a'], 'This question is required');
  assert.equal(blank.errors['bankMonths.0.q10_35b'], 'This question is required');
});

test('the amounts are in rupees, zero or more, with at most two decimals', () => {
  assert.equal(validate({ ...SIX(), q10_31: { amount: 500000, currency: 'GBP' } }).errors['q10_31.currency'] !== undefined, true, 'pounds are not accepted');
  assert.equal(validate({ ...SIX(), q10_31: pkr(-1) }).errors['q10_31.amount'], 'Cannot be negative');
  assert.equal(validate({ ...SIX(), q10_31: pkr(500000.123) }).errors['q10_31.amount'], 'Use at most two decimal places');
  const zero = { ...SIX(), q10_31: pkr(0), q10_32: pkr(200000), q10_33: pkr(1200000), q10_34: pkr(1000000) };
  assert.equal(validate(zero).success, true, 'an opening balance of zero is allowed');
  assert.equal(validate({ ...SIX(), q10_31: pkr(500000.5), q10_32: pkr(700000.5) }).success, true, 'two decimals are allowed');
});

// ---------------------------------------------------------------------------
// The checks: the figures must add up
// ---------------------------------------------------------------------------

test('opening + total credit - total debit must equal the closing balance (tolerance PKR 1.00), and the message gives both numbers', () => {
  const closing = (n) => validate({ ...SIX(), q10_32: pkr(n) }).errors.q10_32;
  assert.equal(closing(700000), undefined, 'exactly');
  assert.equal(closing(700001), undefined, 'one rupee over is within the tolerance');
  assert.equal(closing(699999), undefined, 'one rupee under is within the tolerance');
  assert.equal(closing(700001.01), 'Your opening balance plus the credits, minus the debits, comes to PKR 700,000.00, but the closing balance you entered is PKR 700,001.01. Please check the figures against the statement.');
  assert.match(closing(699998.99), /comes to PKR 700,000\.00, but the closing balance you entered is PKR 699,998\.99/);
  assert.match(closing(650000), /PKR 700,000\.00.*PKR 650,000\.00/);
});

test('the monthly credits must add up to the total credit, and the monthly debits to the total debit, with both numbers in the message', () => {
  const bad = SIX();
  bad.bankMonths[0].q10_35a = pkr(150000);
  const r = validate(bad);
  assert.equal(r.errors.q10_33, 'Your monthly credits add up to PKR 1,150,000.00 but the statement total is PKR 1,200,000.00. Please check them against the statement.');
  assert.equal(r.errors.q10_34, undefined);
  const worse = SIX();
  worse.bankMonths[5].q10_35b = pkr(149000);
  assert.equal(validate(worse).errors.q10_34, 'Your monthly debits add up to PKR 999,000.00 but the statement total is PKR 1,000,000.00. Please check them against the statement.');
  // Within PKR 1.00: fine.
  const close = SIX();
  close.bankMonths[0].q10_35a = pkr(200000.99);
  assert.equal(validate(close).errors.q10_33, undefined);
  close.bankMonths[0].q10_35a = pkr(200001.01);
  assert.ok(validate(close).errors.q10_33);
});

test('a check that cannot be made yet says nothing: a figure missing or invalid leaves only its own error', () => {
  const noClosing = SIX();
  delete noClosing.q10_32;
  const r = validate(noClosing);
  assert.deepEqual(Object.keys(r.errors), ['q10_32']);
  assert.equal(r.errors.q10_32, 'This question is required');
  const noMonths = validate({ ...SIX(), bankMonths: undefined });
  assert.equal(noMonths.errors.q10_33, undefined);
  assert.equal(noMonths.errors.q10_34, undefined);
  const badTotal = validate({ ...SIX(), q10_33: pkr(-5) });
  assert.equal(badTotal.errors['q10_33.amount'], 'Cannot be negative');
  assert.equal(badTotal.errors.q10_32, undefined, 'the balance check waits for valid figures');
});

// ---------------------------------------------------------------------------
// Averages, the spike rule, the single transaction amount
// ---------------------------------------------------------------------------

test('the averages are the total over the months of the period', () => {
  assert.equal(funds.averageOf(pkr(1200000), 6), 200000);
  assert.equal(funds.averageOf(1000000, 6), 1000000 / 6);
  assert.equal(funds.averageOf(pkr(100), 0), null);
  assert.equal(funds.averageOf(undefined, 6), null);
  assert.equal(funds.averageOf(pkr(100), null), null);
});

test('the spike rule: a month more than the percentage above the average needs an explanation: at, just below and just above the limit, and with a zero average', () => {
  // Total 1,200,000 over 6 months: the average is 200,000 and the limit (50% above) is 300,000.
  const above = (value) => funds.isAboveAverage(pkr(value), pkr(1200000), 6, 50);
  assert.equal(above(299999.99), false, 'just below');
  assert.equal(above(300000), false, 'exactly at the limit');
  assert.equal(above(300000.01), true, 'just above');
  assert.equal(funds.isAboveAverage(pkr(5000), pkr(0), 6, 50), false, 'a zero average: nothing to compare with');
  assert.equal(funds.isAboveAverage(pkr(0), pkr(0), 6, 50), false);
  assert.equal(funds.isAboveAverage(pkr(300000.01), pkr(1200000), 0, 50), false, 'no months');
  assert.equal(funds.isAboveAverage(undefined, pkr(1200000), 6, 50), false, 'no value');
  assert.equal(funds.isAboveAverage(pkr(100), pkr(100), 1, 0), false, 'a 0% rule: equal is not above');
  assert.equal(funds.isAboveAverage(pkr(100.01), pkr(100), 1, 0), true);
});

test('a month above the limit must be explained (a derived condition, 200 characters), and one that is not asked for is not kept', () => {
  const over = SIX();
  over.bankMonths = months([100000, 100000, 100000, 100000, 100000, 700000], [100000, 200000, 150000, 250000, 150000, 150000]);
  const r = validate(over);
  assert.equal(r.errors['bankMonths.5.q10_35c'], 'This question is required', 'the sixth month is 700,000 against an average of 200,000');
  assert.equal(r.errors['bankMonths.0.q10_35c'], undefined);
  const explained = clone(over);
  explained.bankMonths[5].q10_35c = 'A relative returned money I had lent.';
  assert.equal(validate(explained).success, true, JSON.stringify(validate(explained).errors));
  explained.bankMonths[5].q10_35c = 'x'.repeat(201);
  assert.equal(validate(explained).errors['bankMonths.5.q10_35c'], 'Must be 200 characters or fewer');
  // A debit spike asks too.
  const debit = SIX();
  debit.q10_34 = pkr(1500000);
  debit.q10_32 = pkr(200000);
  debit.bankMonths = months([200000, 200000, 200000, 200000, 200000, 200000], [100000, 100000, 100000, 100000, 100000, 1000000]);
  assert.equal(validate(debit).errors['bankMonths.5.q10_35c'], 'This question is required');
  // A month that is not (or no longer) unusual drops a text typed for it.
  const calm = SIX();
  calm.bankMonths[2].q10_35c = 'left over';
  const kept = validate(calm);
  assert.equal(kept.success, true);
  assert.equal(kept.data.bankMonths[2].q10_35c, undefined);
});

test('the explanation follows the setting: a higher percentage asks for fewer, and without the setting nothing is asked of the form', () => {
  const over = SIX();
  over.bankMonths = months([100000, 100000, 100000, 100000, 100000, 700000], [100000, 200000, 150000, 250000, 150000, 150000]);
  engine.setSettings({ ...SETTINGS, spikePercent: 400 }); // limit 1,000,000: 700,000 is not above it
  try {
    assert.equal(validate(over).errors['bankMonths.5.q10_35c'], undefined);
    engine.setSettings({});
    assert.equal(validate(over).errors['bankMonths.5.q10_35c'], undefined, 'no setting: not asked (the server always has it)');
  } finally {
    engine.setSettings(SETTINGS);
  }
  assert.equal(validate(over).errors['bankMonths.5.q10_35c'], 'This question is required');
  engine.setSettings({ spikePercent: Number.NaN, other: 'x', bad: Infinity });
  assert.deepEqual({ ...engine.getSettings() }, {}, 'only finite numbers are kept');
  engine.setSettings(SETTINGS);
});

test('the amount above which a single transaction is asked about: a percent of the average, never below the floor', () => {
  assert.equal(funds.singleTransactionLimit(1000000, 25, 25000), 250000);
  assert.equal(funds.singleTransactionLimit(100000, 25, 25000), 25000, 'exactly the floor');
  assert.equal(funds.singleTransactionLimit(10000, 25, 25000), 25000, 'the floor wins over a small average');
  assert.equal(funds.singleTransactionLimit(166666.67, 25, 25000), 41667, 'whole rupees, rounded up');
  assert.equal(funds.singleTransactionLimit(0, 25, 25000), 25000);
  assert.equal(funds.singleTransactionLimit(null, 25, 25000), null);
});

// ---------------------------------------------------------------------------
// Large single transactions
// ---------------------------------------------------------------------------

const large = (extra = {}) => ({ q10_37a: '2026-09-10', q10_37b: 'credit', q10_37c: pkr(600000), q10_37d: 'An uncle', q10_37e: 'gift', q10_37f: 'A gift for the trip.', ...extra });

test('large transactions: a No needs none and removes any; a Yes needs at least one with every answer; up to 20', () => {
  assert.equal(validate({ ...SIX(), q10_36: true }).errors.largeTransactions, 'Add at least one entry');
  const yes = validate({ ...SIX(), q10_36: true, largeTransactions: [large()] });
  assert.equal(yes.success, true, JSON.stringify(yes.errors));
  const no = validate({ ...SIX(), q10_36: false, largeTransactions: [large()] });
  assert.equal(no.success, true);
  assert.deepEqual(no.removed, ['largeTransactions']);
  assert.equal(no.data.largeTransactions, undefined);
  const blank = validate({ ...SIX(), q10_36: true, largeTransactions: [{}] });
  assert.deepEqual(Object.keys(blank.errors).sort(), ['largeTransactions.0.q10_37a', 'largeTransactions.0.q10_37b', 'largeTransactions.0.q10_37c', 'largeTransactions.0.q10_37d', 'largeTransactions.0.q10_37e', 'largeTransactions.0.q10_37f']);
  assert.equal(validate({ ...SIX(), q10_36: true, largeTransactions: Array.from({ length: 20 }, () => large()) }).success, true);
  assert.equal(validate({ ...SIX(), q10_36: true, largeTransactions: Array.from({ length: 21 }, () => large()) }).errors.largeTransactions, 'You can add up to 20 entries');
});

test('a large transaction must be inside the period of the statement, and the texts have their limits', () => {
  const errors = (extra) => validate({ ...SIX(), q10_36: true, largeTransactions: [large(extra)] }).errors;
  assert.equal(errors({ q10_37a: '2026-06-20' })['largeTransactions.0.q10_37a'], undefined, 'the first day');
  assert.equal(errors({ q10_37a: '2026-12-19' })['largeTransactions.0.q10_37a'], undefined, 'the last day');
  assert.equal(errors({ q10_37a: '2026-06-19' })['largeTransactions.0.q10_37a'], 'Must be on or after the date in question 10.29');
  assert.equal(errors({ q10_37a: '2026-12-20' })['largeTransactions.0.q10_37a'], 'Must be on or before the date in question 10.30');
  assert.equal(errors({ q10_37d: 'x'.repeat(101) })['largeTransactions.0.q10_37d'], 'Must be 100 characters or fewer');
  assert.equal(errors({ q10_37d: 'x'.repeat(100) })['largeTransactions.0.q10_37d'], undefined);
  assert.equal(errors({ q10_37f: 'x'.repeat(201) })['largeTransactions.0.q10_37f'], 'Must be 200 characters or fewer');
  assert.equal(errors({ q10_37b: 'transfer' })['largeTransactions.0.q10_37b'], 'Choose from the listed options');
  assert.equal(errors({ q10_37c: pkr(-1) })['largeTransactions.0.q10_37c.amount'], 'Cannot be negative');
});

test('the reason uses the Other mechanism: every reason is accepted, Other asks for words (up to 100) and any other choice drops them', () => {
  const run = (extra) => validate({ ...SIX(), q10_36: true, largeTransactions: [large(extra)] });
  for (const reason of ['gift', 'property_sale', 'business_income', 'loan', 'savings_moved', 'refund']) assert.equal(run({ q10_37e: reason }).success, true, reason);
  assert.equal(run({ q10_37e: 'other' }).errors['largeTransactions.0.q10_37e_other'], 'This question is required');
  assert.equal(run({ q10_37e: 'other', q10_37e_other: 'Prize money' }).success, true);
  assert.equal(run({ q10_37e: 'other', q10_37e_other: 'x'.repeat(101) }).errors['largeTransactions.0.q10_37e_other'], 'Must be 100 characters or fewer');
  assert.equal(run({ q10_37e: 'lottery' }).errors['largeTransactions.0.q10_37e'], 'Choose from the listed options');
  assert.equal(run({ q10_37e: 'gift', q10_37e_other: 'left over' }).data.largeTransactions[0].q10_37e_other, undefined);
  assert.equal(engine.getQuestion(config, 'q10_37e').options[engine.getQuestion(config, 'q10_37e').options.length - 1].value, 'other', 'Other stays last, as in the lists of config 1.4.0');
});

// ---------------------------------------------------------------------------
// Where the section is, and what reads it
// ---------------------------------------------------------------------------

test('section order: the bank activity, then the plans in the UK, then the documents; no existing section or question id was renumbered', () => {
  const ids = config.sections.map((s) => s.id);
  assert.deepEqual(ids.slice(-4), ['10C', '10F', '10E', '10D']);
  assert.equal(config.sections.find((s) => s.id === '10F').title, 'Your bank activity');
  assert.deepEqual(config.questions.filter((q) => q.section === '10F' && !q.otherOf).map((q) => q.number), ['10.29', '10.30', '10.31', '10.32', '10.33', '10.34', '10.35a', '10.35b', '10.35c', '10.36', '10.37a', '10.37b', '10.37c', '10.37d', '10.37e', '10.37f']);
  // The numbers of what was there before are where they were.
  for (const [id, number] of [['q10_28', '10.28'], ['q10_28a', '10.28a'], ['q10_8', '10.8'], ['q10_27', '10.27'], ['q10_6', '10.6'], ['q6_7e', '6.7e'], ['q6_7y', '6.7y'], ['q5_7', '5.7'], ['q1_6', '1.6']]) assert.equal(engine.getQuestion(config, id).number, number, id);
  const sectionOrder = config.questions.map((q) => q.section);
  const runs = sectionOrder.filter((id, i) => id !== sectionOrder[i - 1]);
  assert.equal(runs.filter((id) => id === '10F').length, 1, '10F is one run of questions');
  assert.deepEqual(runs.slice(-4), ['10C', '10F', '10E', '10D']);
});

test('the section applies to everybody: it is visible whatever 6.7 and the other answers are', () => {
  for (const answers of [{}, { q6_7: true }, { q6_7: false }, { q2_13: 'married' }]) assert.equal(engine.isSectionVisible(config, '10F', answers), true);
});

test('the amounts and the free texts of the section are encrypted at rest (flagged sensitive), the Other box of the reason too', () => {
  const sensitive = config.questions.filter((q) => q.section === '10F' && q.sensitive).map((q) => q.id);
  assert.deepEqual(sensitive, ['q10_31', 'q10_32', 'q10_33', 'q10_34', 'q10_35a', 'q10_35b', 'q10_35c', 'q10_37c', 'q10_37d', 'q10_37e', 'q10_37e_other', 'q10_37f']);
  for (const q of config.questions.filter((x) => x.section === '10F' && (x.type === 'AMT' || x.type === 'TXT'))) assert.equal(q.sensitive, true, q.id);
});

test('the cover letter and the itinerary refuse every id of the section (the answers never go to the AI)', () => {
  const ids = config.questions.filter((q) => q.section === '10F').map((q) => q.id);
  assert.ok(ids.length >= 17);
  const spec = (id) => ({ key: `probe_${id}`, section: 'Probe', label: 'Probe', kind: 'value', id });
  assert.deepEqual(cover.validateAllowlist(), []);
  assert.deepEqual(itinerary.validateItineraryAllowlist(), []);
  for (const id of ids) {
    assert.equal(cover.allowedIds().includes(id), false, `${id} is not a cover letter fact`);
    assert.equal(itinerary.allowedIds().includes(id), false, `${id} is not an itinerary fact`);
    assert.ok(cover.validateAllowlist([...cover.SPECS, spec(id)]).some((p) => p.startsWith(`${id}:`)), `the cover letter refuses ${id}`);
    assert.ok(itinerary.validateItineraryAllowlist([...itinerary.SPECS, spec(id)]).some((p) => p.startsWith(`${id}:`)), `the itinerary refuses ${id}`);
  }
  assert.ok(cover.FORBIDDEN_SECTIONS.includes('10F'));
  assert.ok(itinerary.ITINERARY_RULES.forbiddenSections.includes('10F'));
  // A cover letter and an itinerary built from an application that has the section carry none of its figures or words.
  const answers = { ...SIX(), q10_36: true, largeTransactions: [large({ q10_37d: 'SECRET-UNCLE-NAME', q10_37f: 'SECRET-DETAILS' })], q1_1: 'tourism', q1_4: 'holiday', q1_6: '2027-03-01', q1_7: '2027-03-15', q6_7: false };
  for (const text of [cover.buildFacts(config, answers, { submittedAt: new Date() }).text, itinerary.buildItineraryFacts(config, answers, { submittedAt: new Date() }).text]) {
    for (const secret of ['SECRET-UNCLE-NAME', 'SECRET-DETAILS', '1200000', '1,200,000', '700000', 'PKR']) assert.equal(text.includes(secret), false, secret);
  }
});

test('switching the Yes/No about large transactions after answering removes the entries (the usual rule)', () => {
  const saved = { ...SIX(), q10_36: true, largeTransactions: [large()] };
  const pruned = engine.pruneAnswers(config, { ...saved, q10_36: false });
  assert.deepEqual(pruned.removed, ['largeTransactions']);
  assert.equal(engine.pruneAnswers(config, saved).removed.length, 0);
});

// ---------------------------------------------------------------------------
// The engine's new generic pieces, in the config check
// ---------------------------------------------------------------------------

test('validateConfig checks the new settings of the engine: a derived condition, countFrom, entryPeriod, periodMonths, checks and helpers', () => {
  assert.deepEqual(engine.validateConfig(config), []);
  const problems = (mutate) => { const c = clone(config); mutate(c); return engine.validateConfig(c); };
  const q = (c, id) => c.questions.find((x) => x.id === id);
  const g = (c, id) => c.groups.find((x) => x.id === id);
  assert.ok(problems((c) => { q(c, 'q10_35c').showWhen.any[0].derived = 'nonsense'; }).some((p) => /unknown derived condition nonsense/.test(p)));
  assert.ok(problems((c) => { q(c, 'q10_35c').showWhen.any[0].value = 'q10_29'; }).some((p) => /value q10_29 must be a AMT question/.test(p)));
  assert.ok(problems((c) => { delete q(c, 'q10_35c').showWhen.any[0].setting; }).some((p) => /needs the name of a setting/.test(p)));
  assert.ok(problems((c) => { q(c, 'q10_35c').showWhen.any[0].total = 'q10_99'; }).some((p) => /unknown question q10_99/.test(p)));
  assert.ok(problems((c) => { g(c, 'bankMonths').countFrom.months.end = 'q10_31'; }).some((p) => /countFrom.months.end must be a DATE/.test(p)));
  assert.ok(problems((c) => { g(c, 'bankMonths').count = 'q1_5'; }).some((p) => /count and countFrom cannot be used together/.test(p)));
  assert.ok(problems((c) => { delete g(c, 'bankMonths').countFrom; }).some((p) => /entryPeriod needs countFrom/.test(p)));
  assert.ok(problems((c) => { g(c, 'bankMonths').entryPeriod.start = 'q10_31'; }).some((p) => /entryPeriod.start must be a DATE/.test(p)));
  assert.ok(problems((c) => { q(c, 'q10_30').rules.periodMonths.max = 0; }).some((p) => /periodMonths needs whole numbers/.test(p)));
  assert.ok(problems((c) => { q(c, 'q10_31').rules.periodMonths = { start: 'q10_29', min: 1, max: 12 }; }).some((p) => /periodMonths needs a DATE question/.test(p)));
  assert.ok(problems((c) => { c.checks[0].right = 'q10_29'; }).some((p) => /right q10_29 must be an AMT question/.test(p)));
  assert.ok(problems((c) => { c.checks[0].message = 'no places'; }).some((p) => /message must contain \{left\} and \{right\}/.test(p)));
  assert.ok(problems((c) => { c.checks[1].left[0].group = 'largeTransactions'; }).some((p) => /is not a member of group/.test(p)));
  assert.ok(problems((c) => { c.checks.push(clone(c.checks[0])); }).some((p) => /listed twice/.test(p)));
  assert.ok(problems((c) => { c.sections.find((s) => s.id === '10F').helper = 'nonsense'; }).some((p) => /unknown helper nonsense/.test(p)));
  assert.ok(problems((c) => { q(c, 'q10_36').helper = 'nonsense'; }).some((p) => /unknown helper nonsense/.test(p)));
  // Money in and out (display only): which questions carry it, and what the config check refuses.
  assert.deepEqual(config.questions.filter((x) => x.flow).map((x) => [x.id, x.flow]), [['q10_33', 'credit'], ['q10_34', 'debit'], ['q10_35a', 'credit'], ['q10_35b', 'debit']]);
  assert.equal(engine.getQuestion(config, 'q10_37c').flowFrom, 'q10_37b');
  assert.equal(engine.getQuestion(config, 'q10_31').flow, undefined, 'the opening balance has no flow');
  assert.equal(engine.getQuestion(config, 'q10_32').flow, undefined, 'nor has the closing balance');
  assert.ok(problems((c) => { q(c, 'q10_29').flow = 'credit'; }).some((p) => /flow must be "credit" or "debit" and only for an AMT/.test(p)));
  assert.ok(problems((c) => { q(c, 'q10_33').flow = 'in'; }).some((p) => /flow must be/.test(p)));
  assert.ok(problems((c) => { q(c, 'q10_37c').flow = 'credit'; }).some((p) => /flowFrom is only for an AMT question without a flow of its own/.test(p)));
  assert.ok(problems((c) => { q(c, 'q10_37c').flowFrom = 'q10_31'; }).some((p) => /flowFrom q10_31 must be a SEL question of the same group/.test(p)));
  assert.ok(problems((c) => { q(c, 'q10_37b').options = [{ value: 'credit', label: 'In' }]; }).some((p) => /with the options credit and debit/.test(p)));
});
