'use strict';

// Canonical source: shared/tourist-visa/. Run `node scripts/sync-shared.js` after changing this file.
//
// The sums behind the "Your bank activity" section (config 1.7.0): how many months a statement covers, the rolling period of each month,
// the averages, the amounts above which a single transaction is asked about, whether a month is far above the average, and whether the
// figures add up. Pure functions with no settings of their own: the percentages and the floor are passed in (they live in
// backend/config/touristVisaFunds.js and reach the form through the server). Nothing here knows about the staff-only indicator.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** { y, m, d } for a real calendar date written "2027-03-15", else null. */
function parseIso(iso) {
  const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof iso === 'string' ? iso : '');
  if (!found) return null;
  const y = +found[1];
  const m = +found[2];
  const d = +found[3];
  const back = new Date(Date.UTC(y, m - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? { y, m, d } : null;
}

const pad = (n) => String(n).padStart(2, '0');
const toIso = ({ y, m, d }) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A date `n` months after `iso`, on the same day of the month (the last day of a shorter month). */
function addMonths(iso, n) {
  const p = parseIso(iso);
  if (!p) return null;
  const index = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return toIso({ y, m, d: Math.min(p.d, daysIn(y, m)) });
}

/** The day before `iso`. */
function dayBefore(iso) {
  const p = parseIso(iso);
  if (!p) return null;
  const back = new Date(Date.UTC(p.y, p.m - 1, p.d - 1));
  return toIso({ y: back.getUTCFullYear(), m: back.getUTCMonth() + 1, d: back.getUTCDate() });
}

/**
 * The months between two dates: the calendar months, with the days that are left over counted as a part of the end date's month, rounded to the
 * nearest whole month. 20 May to 19 June is 1 (a rolling month), 1 January to 31 March is 3, 1 January to 31 December is 12, and 1 to 10 March is 0.
 * Null when either is not a real date or the end is not after the start.
 */
function monthsBetween(start, end) {
  const a = parseIso(start);
  const b = parseIso(end);
  if (!a || !b || start >= end) return null;
  const whole = (b.y - a.y) * 12 + (b.m - a.m);
  const part = (b.d - a.d) / daysIn(b.y, b.m);
  return Math.round(whole + part);
}

/** The number of months of a statement the form asks about: whole, from 1 to `max`, else null (the dates are then refused on their own). */
function statementMonths(start, end, { min = 1, max = 12 } = {}) {
  const months = monthsBetween(start, end);
  return months !== null && months >= min && months <= max ? months : null;
}

const SHORT_MONTH = (iso) => { const p = parseIso(iso); return `${p.d} ${MONTH_NAMES[p.m - 1]}`; };
const LONG_MONTH = (iso) => { const p = parseIso(iso); return `${p.d} ${MONTH_NAMES[p.m - 1]} ${p.y}`; };

/** The rolling month periods of a statement: [{ start, end, label }]; the last one ends on the statement's own end date. */
function rollingPeriods(start, end, count) {
  const out = [];
  if (!parseIso(start) || !parseIso(end) || !Number.isInteger(count) || count < 1) return out;
  for (let i = 0; i < count; i += 1) {
    const from = addMonths(start, i);
    const to = i === count - 1 ? end : dayBefore(addMonths(start, i + 1));
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    out.push({ start: from, end: to, label: sameYear ? `${SHORT_MONTH(from)} to ${SHORT_MONTH(to)}` : `${LONG_MONTH(from)} to ${LONG_MONTH(to)}` });
  }
  return out;
}

/** The number in an amount answer ({ amount, currency }), or in a plain number; null for anything else. */
function amountOf(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && typeof value.amount === 'number' && Number.isFinite(value.amount)) return value.amount;
  return null;
}

const cents = (n) => Math.round(n * 100);

/** total / months, or null when either is missing. */
function averageOf(total, months) {
  const t = amountOf(total);
  return t !== null && Number.isInteger(months) && months > 0 ? t / months : null;
}

/**
 * The amount above which a single transaction is asked about: `percent` of the monthly average, never below `floor`, in whole rupees (rounded
 * up). Null when the average is not known.
 */
function singleTransactionLimit(average, percent, floor) {
  if (average === null || !Number.isFinite(average)) return null;
  return Math.max(floor, Math.ceil(cents((average * percent) / 100) / 100));
}

/**
 * Is `value` more than `percent` percent above the average of `total` over `months`? Compared in whole cents with integers, so the edge is exact:
 * exactly at the limit is not above it. A zero (or unknown) average is never "above": there is nothing to compare with.
 */
function isAboveAverage(value, total, months, percent) {
  const v = amountOf(value);
  const t = amountOf(total);
  if (v === null || t === null || !Number.isInteger(months) || months < 1 || !(t > 0)) return false;
  return cents(v) * months * 100 > cents(t) * (100 + percent);
}

/** The sum of the amounts, in cents, so that adding many 0.1s is exact; null when one of them is not an amount. */
function sumCents(values) {
  let total = 0;
  for (const value of values) {
    const n = amountOf(value);
    if (n === null) return null;
    total += cents(n);
  }
  return total;
}

/** "1,234.50" (always two decimals). */
function formatPkr(n) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { MONTH_NAMES, parseIso, addMonths, dayBefore, monthsBetween, statementMonths, rollingPeriods, amountOf, averageOf, singleTransactionLimit, isAboveAverage, sumCents, formatPkr };
