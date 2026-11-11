/**
 * The skeleton of an itinerary: one heading for each day of the stay (or, for a long stay, each week), built from the two dates by the
 * server and never by the AI. The AI only writes the short text under each heading, so the dates, the weekdays and the number of
 * headings are always right.
 *
 *  - A stay of up to LONG_STAY_NIGHTS nights has one heading for every day, the arrival day and the departure day included:
 *    "Day 1, Monday 15 March 2027". The number of headings is the number of nights plus one.
 *  - A longer stay has weekly blocks, headed by their date range: "Monday 15 March 2027 to Sunday 21 March 2027" (the last block may be
 *    shorter; a block of one day is headed by that day).
 *  - Missing or impossible dates are refused with a fixed code and the numbers of the questions to fix.
 *
 * Pure: dates are worked out in UTC, so no time zone and no clock changes anything.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MS = 86400000;
const LONG_STAY_NIGHTS = 21;
// A visit is at most six months, and the whole text must fit the 8000 characters an edited itinerary may have.
const MAX_NIGHTS = 183;
const WEEK_DAYS = 7;

/** "2027-03-15" -> milliseconds (UTC midnight), or null when it is not a real calendar date. */
function parseDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value === undefined || value === null ? '' : value));
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  return back.getUTCFullYear() === year && back.getUTCMonth() === month - 1 && back.getUTCDate() === day ? ms : null;
}

/** Milliseconds -> "Monday 15 March 2027". */
function dayName(ms) {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * buildSkeleton(arrival, departure) -> { ok: true, nights, mode: "days" | "weeks", blocks: [{ heading, start, end, days, first, last }] }
 * or { ok: false, code, questions } with code ITINERARY_DATES_MISSING or ITINERARY_DATES_INVALID and the question numbers to fix.
 * `start` and `end` are the first and last day of a block as "YYYY-MM-DD"; `first` and `last` say that the block holds the arrival
 * day and the departure day.
 */
function buildSkeleton(arrival, departure) {
  const missing = [];
  if (arrival === undefined || arrival === null || String(arrival).trim() === '') missing.push('1.6');
  if (departure === undefined || departure === null || String(departure).trim() === '') missing.push('1.7');
  if (missing.length) return { ok: false, code: 'ITINERARY_DATES_MISSING', questions: missing };

  const from = parseDate(arrival);
  const to = parseDate(departure);
  if (from === null || to === null || to < from || (to - from) / DAY_MS > MAX_NIGHTS) {
    return { ok: false, code: 'ITINERARY_DATES_INVALID', questions: ['1.6', '1.7'] };
  }
  const nights = Math.round((to - from) / DAY_MS);
  const days = nights + 1;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const blocks = [];

  if (nights <= LONG_STAY_NIGHTS) {
    for (let i = 0; i < days; i += 1) {
      const ms = from + i * DAY_MS;
      blocks.push({ heading: `Day ${i + 1}, ${dayName(ms)}`, start: iso(ms), end: iso(ms), days: 1, first: i === 0, last: i === days - 1 });
    }
    return { ok: true, nights, mode: 'days', blocks };
  }

  for (let offset = 0; offset < days; offset += WEEK_DAYS) {
    const length = Math.min(WEEK_DAYS, days - offset);
    const start = from + offset * DAY_MS;
    const end = start + (length - 1) * DAY_MS;
    blocks.push({
      heading: length === 1 ? dayName(start) : `${dayName(start)} to ${dayName(end)}`,
      start: iso(start),
      end: iso(end),
      days: length,
      first: offset === 0,
      last: offset + length === days,
    });
  }
  return { ok: true, nights, mode: 'weeks', blocks };
}

module.exports = { buildSkeleton, parseDate, dayName, LONG_STAY_NIGHTS, MAX_NIGHTS, WEEKDAYS, MONTHS };
