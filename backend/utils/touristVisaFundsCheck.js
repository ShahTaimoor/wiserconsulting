/**
 * The staff-only "Funds check": what an administrator sees about the bank statement figures an applicant entered (section 10F).
 *
 * A HELPER FOR STAFF, never a decision. Its words never say that anything is approved or refused. It is worked out here, on the server, from the stored answers, and
 * the only place it is sent is the administrator's route: no applicant response, review, PDF or email carries any of it.
 *
 * Rule v1 (settings in config/touristVisaFunds.js): the CLOSING balance, in pounds, against the PLANNED SPENDING for the trip:
 *   red    the closing balance is below the planned spending
 *   amber  it covers it but is below 120% of it
 *   green  it is at least 120% of it
 *   grey   not enough information: the section was not collected (an older form), a figure is missing, or there is no rate
 * Planned spending = 6.3 (what the applicant personally plans to spend) + every amount in 6.5f (what the people paying will pay, only while
 * 6.5 is Yes), all in pounds. When 6.3 is unanswered it is grey. Notes (never colours) list the unusual months, the large transactions and a large
 * fall from the opening to the closing balance. Pure: the rates and the settings are passed in.
 */

const funds = require('../shared/tourist-visa/funds');
const { FUNDS } = require('../config/touristVisaFunds');

const HELPER_LINE = 'This is a helper for staff, not a decision: compare the figures with the statement the applicant uploaded.';
const PLANNED_QUESTION = 'q6_3';
const PAYER_GROUP = 'payers';
const PAYER_AMOUNT = 'q6_5f';

const isPlainObject = (v) => Object.prototype.toString.call(v) === '[object Object]';
const num = (value) => funds.amountOf(value);
const round2 = (n) => Math.round(n * 100) / 100;

/** The question ids of the section, by role (a config that has no bank activity section answers "not collected"). */
function collected(cfg) {
  return Boolean(cfg && Array.isArray(cfg.questions) && cfg.questions.some((q) => q.id === 'q10_29'));
}

/** The planned spending in pounds: { total, personal, others } or null when 6.3 has no answer. */
function plannedSpending(cfg, answers) {
  const personal = num(answers[PLANNED_QUESTION]);
  if (personal === null) return null;
  let others = 0;
  const hasPayers = cfg.questions.some((q) => q.id === PAYER_AMOUNT);
  if (hasPayers && answers.q6_5 === true && Array.isArray(answers[PAYER_GROUP])) {
    for (const entry of answers[PAYER_GROUP]) {
      const amount = isPlainObject(entry) ? num(entry[PAYER_AMOUNT]) : null;
      if (amount !== null) others += amount;
    }
  }
  return { total: round2(personal + others), personal, others: round2(others) };
}

/** closing (PKR) against planned (GBP) at `rate` PKR per pound, in exact cents: { ratio, colour }. */
function compare(closingPkr, plannedGbp, rate, thresholds = FUNDS.indicator) {
  const closingCents = Math.round(closingPkr * 100);
  // closing >= planned * rate * percent/100  <=>  closingCents * 100 >= planned * rate * percent * 100 ... in whole units: cents of PKR, times 100.
  const atLeast = (percent) => closingCents * 100 >= Math.round(plannedGbp * rate * percent * 100);
  let colour = 'red';
  if (atLeast(thresholds.greenAtOrAbovePercent)) colour = 'green';
  else if (atLeast(thresholds.redBelowPercent)) colour = 'amber';
  return colour;
}

const WORDS = {
  green: { headline: 'Looks consistent', detail: (p) => `The closing balance is at least ${p.greenAtOrAbovePercent}% of the planned spending.` },
  amber: { headline: 'Needs a closer look', detail: (p) => `The closing balance covers the planned spending, but is below ${p.greenAtOrAbovePercent}% of it.` },
  red: { headline: 'Needs a closer look', detail: () => 'The closing balance is below the planned spending.' },
};

function grey(reason, extra = {}) {
  return { badge: 'grey', headline: 'Not enough information', reason, ...extra };
}

/**
 * The panel of one application: { collected, badge, headline, reason, helper, figures?, checks?, planned?, notes, rates }.
 * `rates` is { asOf, stale, rates: { PKR } } or null (the pound figures are then left out and the badge is grey).
 */
function buildFundsCheck({ cfg, answers, rates, settings = FUNDS }) {
  const base = { helper: HELPER_LINE, notes: [], rates: rates && rates.rates && rates.rates.PKR ? { asOf: rates.asOf, stale: rates.stale === true, pkrPerGbp: rates.rates.PKR } : null };
  if (!collected(cfg)) {
    return { ...base, collected: false, badge: 'grey', headline: 'Not collected (submitted on an older form)', reason: 'This application was submitted before the bank activity questions existed.' };
  }
  const a = isPlainObject(answers) ? answers : {};
  const start = a.q10_29;
  const end = a.q10_30;
  const months = funds.statementMonths(start, end);
  const opening = num(a.q10_31);
  const closing = num(a.q10_32);
  const totalCredit = num(a.q10_33);
  const totalDebit = num(a.q10_34);
  const rate = base.rates ? base.rates.pkrPerGbp : null;
  const gbp = (pkr) => (pkr === null || rate === null ? null : round2(pkr / rate));
  const both = (pkr) => ({ pkr, gbp: gbp(pkr) });

  const answered = months !== null && opening !== null && closing !== null && totalCredit !== null && totalDebit !== null && Array.isArray(a.bankMonths) && a.bankMonths.length === months;
  if (!answered) return { ...base, collected: true, ...grey('The bank activity section has not been completed.') };

  const periods = funds.rollingPeriods(start, end, months);
  const averageCredit = funds.averageOf(totalCredit, months);
  const averageDebit = funds.averageOf(totalDebit, months);
  const spike = settings.spikePercent;
  const monthRows = a.bankMonths.map((entry, i) => {
    const credit = num(entry && entry.q10_35a);
    const debit = num(entry && entry.q10_35b);
    const creditHigh = funds.isAboveAverage(credit, totalCredit, months, spike);
    const debitHigh = funds.isAboveAverage(debit, totalDebit, months, spike);
    return {
      label: periods[i] ? periods[i].label : `Month ${i + 1}`,
      credit: both(credit),
      debit: both(debit),
      creditHigh,
      debitHigh,
      // What the applicant wrote (staff only): only for a month that was asked to be explained.
      explanation: (creditHigh || debitHigh) && entry && typeof entry.q10_35c === 'string' ? entry.q10_35c : null,
    };
  });

  const limit = (average, percent) => funds.singleTransactionLimit(average, percent, settings.singleTransactionFloor);
  const large = (Array.isArray(a.largeTransactions) && a.q10_36 === true ? a.largeTransactions : []).map((t) => ({
    date: t.q10_37a,
    type: t.q10_37b,
    amount: both(num(t.q10_37c)),
    who: typeof t.q10_37d === 'string' ? t.q10_37d : null,
    reason: t.q10_37e === 'other' && typeof t.q10_37e_other === 'string' ? `Other: ${t.q10_37e_other}` : t.q10_37e,
    details: typeof t.q10_37f === 'string' ? t.q10_37f : null,
  }));

  // The checks of section 10F again, from the stored answers (they were enforced when the section was saved).
  const monthsCredit = funds.sumCents(a.bankMonths.map((e) => e && e.q10_35a));
  const monthsDebit = funds.sumCents(a.bankMonths.map((e) => e && e.q10_35b));
  const within = (leftCents, rightPkr) => leftCents !== null && Math.abs(leftCents - Math.round(rightPkr * 100)) <= 100;
  const balanceLeft = Math.round(opening * 100) + Math.round(totalCredit * 100) - Math.round(totalDebit * 100);
  const checks = {
    balance: { passed: within(balanceLeft, closing), left: balanceLeft / 100, right: closing },
    monthlyCredits: { passed: within(monthsCredit, totalCredit), left: monthsCredit === null ? null : monthsCredit / 100, right: totalCredit },
    monthlyDebits: { passed: within(monthsDebit, totalDebit), left: monthsDebit === null ? null : monthsDebit / 100, right: totalDebit },
  };

  const figures = {
    period: { start, end, months },
    opening: both(opening),
    closing: both(closing),
    totalCredit: both(totalCredit),
    totalDebit: both(totalDebit),
    averageCredit: both(averageCredit === null ? null : round2(averageCredit)),
    averageDebit: both(averageDebit === null ? null : round2(averageDebit)),
    singleTransactionLimits: { credit: limit(averageCredit, settings.singleTransactionPercent), debit: limit(averageDebit, settings.singleTransactionPercent) },
    months: monthRows,
    largeTransactions: large,
  };

  // Notes: never colours.
  const notes = [];
  const unusual = monthRows.filter((m) => m.creditHigh || m.debitHigh).length;
  notes.push(`${unusual} unusual ${unusual === 1 ? 'month' : 'months'} (well above the average of the period).`);
  notes.push(`${large.length} large ${large.length === 1 ? 'transaction' : 'transactions'} listed by the applicant.`);
  if (opening > 0) {
    const change = ((closing - opening) / opening) * 100;
    if (change <= -settings.indicator.largeNegativeChangePercent) notes.push(`The closing balance is ${Math.round(-change)}% below the opening balance.`);
  }
  if (!checks.balance.passed || !checks.monthlyCredits.passed || !checks.monthlyDebits.passed) notes.push('One of the automatic checks of the figures did not pass.');

  const planned = plannedSpending(cfg, a);
  const result = { ...base, collected: true, figures, checks, notes, planned: planned ? { gbp: planned.total, personalGbp: planned.personal, othersGbp: planned.others } : null };
  if (!planned) return { ...result, ...grey('The planned spending (question 6.3) has not been answered.') };
  if (rate === null) return { ...result, ...grey('The exchange rate is not available right now, so the closing balance cannot be compared with the planned spending in pounds.') };

  const colour = compare(closing, planned.total, rate, settings.indicator);
  const closingGbp = gbp(closing);
  return {
    ...result,
    badge: colour,
    headline: WORDS[colour].headline,
    reason: WORDS[colour].detail(settings.indicator),
    comparison: { closingGbp, plannedGbp: planned.total, percentOfPlanned: planned.total > 0 ? Math.round((closingGbp / planned.total) * 100) : null },
  };
}

module.exports = { buildFundsCheck, plannedSpending, compare, collected, HELPER_LINE };
