/**
 * Checks on what the AI writes for an itinerary, and the final text (pure functions, no I/O).
 *
 * The server writes the skeleton (one heading for each day or week, utils/touristVisaItinerarySkeleton.js). The AI is asked for JSON with
 * exactly one short description for each heading, and nothing else:
 *
 *   { "descriptions": ["...", "...", ...] }
 *
 * validateDescriptions refuses an answer that has the wrong shape or number of entries, an entry that is not a short plain sentence or two,
 * an entry that holds a digit, a currency symbol, a time, a link, an email, a phone number, a bracketed token, a weekday or a month (the
 * headings carry the dates, and a description must never contradict them), an entry that promises or sells (booked, tickets, flights,
 * hotels, prices, opening times, marketing words, and the cover letter's own list of banned wording), an entry that names a well-known
 * place the applicant did not name (or the city they will stay in), or places named in a different order from the applicant's.
 *
 * A failed check returns a FIXED CODE (and the number of the entry and the id of the rule, never any text), so the reason can be
 * recorded and shown safely. The service asks the AI once more, then uses the template.
 */

const { BANNED_PHRASES: COVER_LETTER_BANNED } = require('./touristVisaCoverLetterChecks');
const { placesIn } = require('../shared/tourist-visa/places');

const TITLE = 'Proposed itinerary';
const NOTE = 'This is a proposed plan for the visit, and it may change.';

const MIN_ENTRY = 20;
// Sized so that the longest itinerary (22 days, or 27 weeks) still fits the 8000 characters an administrator may save.
const MAX_ENTRY = { days: 300, weeks: 240 };

/** What must not appear in a description at all. */
const FORBIDDEN_CONTENT = Object.freeze([
  { id: 'digit', pattern: /\d/ },
  { id: 'currency', pattern: /[£$€¥₹₩₦₱฿₪]|\b(pounds?|dollars?|euros?|pence|sterling)\b/i },
  { id: 'time', pattern: /\b(o['’]clock|noon|midday|midnight)\b/i },
  { id: 'link', pattern: /https?:|www\.|\b[\w-]+\.(?:com|org|net|co|uk|io|info|gov|edu|app)\b/i },
  { id: 'email', pattern: /@/ },
  { id: 'phone', pattern: /\b(phone|telephone|mobile number|call ahead)\b/i },
  { id: 'bracket', pattern: /[\[\]{}<>]/ },
  { id: 'weekday-month', pattern: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|april|june|july|september|october|november|december)\b/i },
  // "May", "March" and "August" are also ordinary words ("march along the river"): only a capital letter in the middle of a sentence is a month.
  { id: 'weekday-month', pattern: /(?<=[a-z,;] )(?:May|March|August)\b/ },
]);

/** Wording an itinerary must not contain: promises, bookings and prices, marketing language. Case-insensitive. */
const BANNED_PHRASES = Object.freeze([
  { id: 'booking', pattern: /\bbook(?:ed|ing|ings|s)?\b|\bpre-?book\w*|\breserv\w*|\bconfirm\w*|\bguarantee\w*/i },
  { id: 'ticket', pattern: /\btickets?\b|\badmission\b|\bentry fees?\b/i },
  { id: 'transport-or-stay', pattern: /\bflights?\b|\btrains?\b|\bairlines?\b|\bhotels?\b|\bhostels?\b|\bairbnb\b/i },
  { id: 'price', pattern: /\bpric(?:e|es|ed|ing)\b|\bcosts?\b|\bfees?\b|\bfree of charge\b|\bdiscount\w*|\bcheap\b|\bexpensive\b|\bbudget\b|\bafford\w*/i },
  { id: 'opening-times', pattern: /\bopening (?:hours|times)\b|\bopen (?:daily|all day|until|from)\b|\bclosing time\b/i },
  { id: 'marketing', pattern: /\b(?:breathtaking|must[- ]see|must[- ]visit|unforgettable|unmissable|stunning|spectacular|iconic|world[- ]famous|world[- ]renowned|renowned|magical|hidden gems?|bucket[- ]list|once[- ]in[- ]a[- ]lifetime|amazing|incredible|paradise|picture[- ]perfect|fairy[- ]?tale)\b/i },
  // Scene-setting and feelings: an itinerary says what the traveller will do, in plain words (the marketing words above are banned too).
  { id: 'scene-setting', pattern: /\b(?:absorb\w*|soak\w*|immers\w*|picturesque|charming|majestic|captivating|breathtaking|stunning|unforgettable|must[- ]see|iconic)\b/i },
  // The last day is a departure from the United Kingdom: no next destination and no onward travel.
  { id: 'onward-travel', pattern: /\bnext destinations?\b|\bonward(?:s)?\b/i },
  ...COVER_LETTER_BANNED,
]);

/** What the last description must say: the traveller leaves the United Kingdom or goes home. */
const DEPARTURE = /\b(?:leav\w*|depart\w*|return\w*|home|homeward|set(?:s|ting)? off|head(?:s|ing)? back)\b/i;

// Country names are not "a place the applicant did not name": a description may say that a city is in a country.
const COUNTRIES = new Set(['England', 'Scotland', 'Wales', 'Northern Ireland']);

/** The id of the first banned phrase in the text, or null. */
function bannedIn(text) {
  for (const { id, pattern } of BANNED_PHRASES) if (pattern.test(text)) return id;
  return null;
}

/** The id of the first forbidden kind of content in the text, or null. */
function forbiddenIn(text) {
  for (const { id, pattern } of FORBIDDEN_CONTENT) if (pattern.test(text)) return id;
  return null;
}

/**
 * Reads the AI's answer: JSON, optionally inside a code fence, an object with exactly one key, "descriptions", holding an array of exactly
 * `count` strings. -> { ok: true, descriptions } or { ok: false, code: "ITINERARY_BAD_JSON" | "ITINERARY_WRONG_COUNT" }.
 */
function parseDescriptions(raw, count) {
  const text = String(raw === undefined || raw === null ? '' : raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: 'ITINERARY_BAD_JSON' };
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return { ok: false, code: 'ITINERARY_BAD_JSON' };
  const keys = Object.keys(json);
  if (keys.length !== 1 || keys[0] !== 'descriptions' || !Array.isArray(json.descriptions)) return { ok: false, code: 'ITINERARY_BAD_JSON' };
  if (json.descriptions.length !== count) return { ok: false, code: 'ITINERARY_WRONG_COUNT' };
  return { ok: true, descriptions: json.descriptions };
}

/**
 * Checks the descriptions entry by entry (and the places across them).
 *   options.mode     "days" or "weeks" (the length cap)
 *   options.named    the places the applicant named, in order
 *   options.stay     the places of the stay (the city they will stay in), which may be named too
 *   options.lastDay  when true, the LAST description must say that the traveller leaves the United Kingdom or goes home
 * -> { ok: true, descriptions } with each entry tidied, or { ok: false, code, entry?, rule? }. Never any text.
 */
function validateDescriptions(descriptions, { mode = 'days', named = [], stay = [], lastDay = false } = {}) {
  const max = MAX_ENTRY[mode] || MAX_ENTRY.days;
  const clean = [];
  for (let i = 0; i < descriptions.length; i += 1) {
    const value = descriptions[i];
    if (typeof value !== 'string') return { ok: false, code: 'ITINERARY_BAD_ENTRY', entry: i, rule: 'not-a-string' };
    if (/\n|\r/.test(value) || /^\s*(?:[-*•·]|\d+[.)])\s/.test(value) || /[*_`#]/.test(value)) return { ok: false, code: 'ITINERARY_BAD_ENTRY', entry: i, rule: 'not-plain' };
    const text = value.replace(/\s+/g, ' ').trim();
    if (text.length < MIN_ENTRY) return { ok: false, code: 'ITINERARY_BAD_ENTRY', entry: i, rule: 'too-short' };
    if (text.length > max) return { ok: false, code: 'ITINERARY_BAD_ENTRY', entry: i, rule: 'too-long' };
    const content = forbiddenIn(text);
    if (content) return { ok: false, code: 'ITINERARY_FORBIDDEN_CONTENT', entry: i, rule: content };
    const banned = bannedIn(text);
    if (banned) return { ok: false, code: 'ITINERARY_BANNED_PHRASE', entry: i, rule: banned };
    clean.push(text);
  }
  if (lastDay && clean.length > 0 && !DEPARTURE.test(clean[clean.length - 1])) return { ok: false, code: 'ITINERARY_BAD_ENTRY', entry: clean.length - 1, rule: 'last-day' };

  // Places: only the ones the applicant named (or the city of the stay), and in the order they named them.
  const allowed = new Set([...named, ...stay]);
  const firstSeen = new Map();
  for (let i = 0; i < clean.length; i += 1) {
    for (const place of placesIn(clean[i])) {
      if (COUNTRIES.has(place)) continue;
      if (!allowed.has(place)) return { ok: false, code: 'ITINERARY_PLACE_NOT_NAMED', entry: i, rule: 'place' };
      if (!firstSeen.has(place)) firstSeen.set(place, i);
    }
  }
  let last = -1;
  for (const place of named) {
    if (!firstSeen.has(place)) continue;
    if (firstSeen.get(place) < last) return { ok: false, code: 'ITINERARY_PLACE_ORDER', rule: 'order' };
    last = firstSeen.get(place);
  }
  return { ok: true, descriptions: clean };
}

/** The text of an itinerary: the title, one neutral sentence, then each heading with its description. */
function assembleItinerary(blocks, descriptions) {
  return [TITLE, NOTE, ...blocks.map((block, i) => `${block.heading}\n${descriptions[i]}`)].join('\n\n');
}

module.exports = {
  TITLE,
  NOTE,
  MIN_ENTRY,
  MAX_ENTRY,
  FORBIDDEN_CONTENT,
  BANNED_PHRASES,
  DEPARTURE,
  COUNTRIES,
  bannedIn,
  forbiddenIn,
  parseDescriptions,
  validateDescriptions,
  assembleItinerary,
};
