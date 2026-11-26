/**
 * When the team usually answers the chat: ONE place. Change the hours here and nowhere else (the client only shows what the status
 * endpoint says; it never works the hours out itself).
 *
 * The hours are evaluated in the zone below whatever time zone the server or the visitor is in (Intl with the named zone), so "12 PM to
 * 9 PM Pakistan time" is the same moment for everyone. Messages are ALWAYS accepted: the hours only decide what the panel says.
 *
 *   days   0 = Sunday ... 6 = Saturday
 *   from, to   "HH:MM", 24 hour clock, in `timezone`; `to` is the first minute that is no longer in hours
 */

const HOURS = Object.freeze({
  timezone: 'Asia/Karachi',
  days: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
  from: '12:00',
  to: '21:00',
  zoneLabel: 'Pakistan time',
});

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function minutesOf(hhmm) {
  const found = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm));
  if (!found) throw new Error('chat hours must be written "HH:MM"');
  return Number(found[1]) * 60 + Number(found[2]);
}

/** "12:00" -> "12 PM", "21:00" -> "9 PM", "09:30" -> "9:30 AM". */
function label12(hhmm) {
  const total = minutesOf(hhmm);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** The wall-clock parts of an instant in a named zone. */
function zoneParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')), hh: Number(get('hour')), mm: Number(get('minute')), weekday: SHORT_WEEKDAYS[get('weekday')] };
}

/** The instant at which the wall clock of `timezone` shows y-m-d hh:mm. */
function zonedToUtc({ y, m, d, hh, mm }, timezone) {
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wanted;
  for (let i = 0; i < 4; i += 1) {
    const p = zoneParts(new Date(guess), timezone);
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
    const diff = wanted - shown;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/**
 * Is the team in hours at `now`, and when do they open or close next?
 * @returns {{ openNow:boolean, nextOpenAt:string|null, closesAt:string|null, timezone:string, from:string, to:string, text:string, backText:string|null }}
 *   `nextOpenAt` is set only while closed, `closesAt` only while open (ISO instants); `text` is the usual-hours sentence; `backText` says when
 *   they are back, only while closed.
 */
function evaluateHours(now = new Date(), hours = HOURS) {
  const fromMinutes = minutesOf(hours.from);
  const toMinutes = minutesOf(hours.to);
  if (!(fromMinutes < toMinutes)) throw new Error('chat hours must end after they start');
  const p = zoneParts(now, hours.timezone);
  const minutes = p.hh * 60 + p.mm;
  const openNow = hours.days.includes(p.weekday) && minutes >= fromMinutes && minutes < toMinutes;
  const text = `We usually reply between ${label12(hours.from)} and ${label12(hours.to)} (${hours.zoneLabel})`;
  const base = { openNow, timezone: hours.timezone, from: hours.from, to: hours.to, text };

  if (openNow) {
    const closes = zonedToUtc({ y: p.y, m: p.m, d: p.d, hh: Math.floor(toMinutes / 60), mm: toMinutes % 60 }, hours.timezone);
    return { ...base, nextOpenAt: null, closesAt: closes.toISOString(), backText: null };
  }

  for (let offset = 0; offset <= 7; offset += 1) {
    const weekday = (p.weekday + offset) % 7;
    if (!hours.days.includes(weekday)) continue;
    if (offset === 0 && minutes >= fromMinutes) continue; // today's opening has passed
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d + offset));
    const opens = zonedToUtc({ y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate(), hh: Math.floor(fromMinutes / 60), mm: fromMinutes % 60 }, hours.timezone);
    const when = offset === 0 ? '' : offset === 1 ? ' tomorrow' : ` on ${WEEKDAYS[weekday]}`;
    return { ...base, nextOpenAt: opens.toISOString(), closesAt: null, backText: `We are back${when} at ${label12(hours.from)} (${hours.zoneLabel})` };
  }
  return { ...base, nextOpenAt: null, closesAt: null, backText: null };
}

module.exports = { HOURS, evaluateHours, label12, zoneParts, zonedToUtc };
