/* eslint-disable */
'use strict';

/**
 * The facts the itinerary may use, and nothing else.
 *
 * The itinerary is a proposed, day-by-day plan for the visit. It is built from the trip alone, so its allowlist is much smaller than
 * the cover letter's, and it is checked and built by the same code (coverLetterFacts.js: buildFactsFor, validateAllowlist), with its
 * own rules. Allowed: the arrival and departure dates and the number of nights; the main purpose and kind of visit; the places and
 * plans the applicant described for the trip (free text, redacted exactly like the cover letter's: the AI only ever sees tokens for a
 * name, an employer, an email, a phone number, a link); the city and type of stay; whether they travel alone or in a group and how
 * many companions; and the PLACES OF STAY the applicant gave (6.7: only the town of each address and its two dates). Never: every financial fact, employment and study, family, previous travel, identity and contact details, Parts 9
 * and 10, health, documents. A question in any section but 1 and 6C is refused outright.
 *
 * It also works out ONE derived fact from the trip description: the well-known places the applicant named, in the order they named
 * them, from a fixed list (PLACES). The list is ours, so nothing the applicant typed is sent by this: only a place from the list.
 * The template uses it for the order of the places, and the checks use it to see that an itinerary keeps that order.
 *
 * Pure: no I/O, no clock, no server code.
 */

const engine = require('./engine');
const cover = require('./coverLetterFacts');

/** The type of stay in words that cannot suggest a booking or a hotel (the form's own option says "I will book a hotel..."). */
const STAY_WORDS = Object.freeze({
  not_decided: 'not decided yet',
  paid_stay: 'a paid stay',
  family_friends: 'with family or friends',
  address_unknown: 'somewhere not yet known',
  other: 'somewhere else',
});

const pick = (key) => {
  const found = cover.SPECS.find((spec) => spec.key === key);
  if (!found) throw new Error(`no cover letter fact ${key}`);
  return found;
};

/** The allowlist. Every spec is one the cover letter already reads (the same question, read the same way). */
const SPECS = Object.freeze([
  pick('arrival'),
  pick('departure'),
  pick('stay'),
  pick('purpose'),
  pick('holidayReason'),
  pick('groupTravel'),
  pick('companions'),
  { ...pick('purposeDetails'), key: 'tripDescription', label: 'The places and plans for the trip' },
  { ...pick('accommodationPlan'), words: STAY_WORDS },
  pick('accommodationArea'),
  pick('accommodationTowns'),
  // The places of stay (6.7b to 6.7d): the town of each address and the arrival and leaving dates, nothing else of the entry.
  { key: 'stays', section: 'Where they will stay in the UK', label: 'Places of stay, with dates', kind: 'stays', group: 'accommodation', gate: 'q6_7', townId: 'q6_7b', fromId: 'q6_7c', toId: 'q6_7d', max: 20, fields: [{ id: 'q6_7b' }, { id: 'q6_7c' }, { id: 'q6_7d' }] },
].map((spec) => Object.freeze({ ...spec })));

/** The derived fact: the places named, in order. Not a question of its own. */
const PLACES_SPEC = Object.freeze({ key: 'places', section: 'The visit', label: 'Places the applicant named, in order', kind: 'value', oneLine: true });

/** The only sections the itinerary reads. */
const ALLOWED_SECTIONS = Object.freeze(['1', '6C']);

/** Whole sections that can never feed it, by what they hold (for the handover and the tests). */
const EXCLUDED_SECTIONS = Object.freeze({
  'Identity, name, email, sex, date and place of birth, nationality, identity card, other names': ['2A', '2B'],
  'Home address and living situation, driving licence, health and medical treatment': ['2C'],
  'Telephone': ['2D'],
  'Passport': ['3'],
  'Family: spouse or partner, dependants, parents': ['4A', '4B', '4C'],
  'Employment, business and study': ['5'],
  'Every financial fact: income, savings, spending, who pays': ['6A'],
  'Relatives in the UK': ['6B'],
  'Public funds': ['6D'],
  'Previous travel to the UK and to other countries, visas and immigration history': ['7', '8'],
  'Security and character (Part 9) and penalties (10A)': ['9A', '9B', '9C', '10A'],
  'Extra information (10B), language and National Insurance number (10C), documents (10D)': ['10B', '10C', '10D'],
});

/** Questions in the two allowed sections that can still never be a fact, by why. */
const EXCLUDED_IDS = Object.freeze({
  'The organiser of a group and the details of companions (only how many are counted)': ['q1_2a', 'q1_2b', 'q1_3a', 'q1_3b', 'q1_3c', 'q1_3d', 'q1_3e'],
  'The name of a place of stay and the rest of its address (only the town and the two dates of a stay are read)': ['q6_7a'],
});

const ITINERARY_RULES = Object.freeze({
  allowedSections: ALLOWED_SECTIONS,
  forbiddenSections: Object.freeze(Object.values(EXCLUDED_SECTIONS).flat()),
  excludedIds: new Set(Object.values(EXCLUDED_IDS).flat()),
  // No amount, count of anything but companions, address, telephone, email, file or declaration.
  forbiddenTypes: new Set(['AMT', 'NUM', 'EML', 'TEL', 'FILE', 'ACK']),
  addressParts: new Set(['town']),
  // It has no use for a name or an employer, so a placeholder for one is refused as well.
  noTokenSpecs: true,
});

// ---------------------------------------------------------------------------
// The places the applicant named
// ---------------------------------------------------------------------------

// The fixed list of places, and the function that finds the ones a text names, are shared with the cover letter (places.js).
const { PLACES, placesIn } = require('./places');

// ---------------------------------------------------------------------------
// The facts
// ---------------------------------------------------------------------------

/** Every question id the itinerary reads. */
function allowedIds(specs = SPECS) {
  return cover.allowedIds(specs);
}

/** Checks an itinerary allowlist (the same checks as the cover letter's, against the itinerary's rules). Empty means safe. */
function validateItineraryAllowlist(specs = SPECS, cfg = engine.config) {
  return cover.validateAllowlist(specs, cfg, ITINERARY_RULES);
}

/**
 * The facts of one application for its itinerary. Same shape as the cover letter's (see coverLetterFacts.buildFacts), plus:
 *   places   the well-known places named in the trip description, in order (also a line in the facts, when there are any)
 * `raw.arrival` and `raw.departure` are the stored dates (or missing).
 */
function buildItineraryFacts(cfg, answers, options = {}) {
  // An application keeps the config it was submitted under, so an allowlist question that config does not have is simply not read (never a
  // refusal to run): the facts are the ones that config can give. The real config is checked in full by validateItineraryAllowlist.
  const specs = SPECS.filter((spec) => cover.allowedIds([spec]).every((id) => engine.getQuestion(cfg, id)));
  const facts = cover.buildFactsFor(specs, ITINERARY_RULES, cfg, answers, {
    ...options,
    derive: ({ values, add }) => {
      const places = placesIn(values.tripDescription);
      if (places.length) add(PLACES_SPEC, places);
    },
  });
  facts.places = Array.isArray(facts.values.places) ? facts.values.places : [];
  // The places of stay as { town, place, from, to, fromText, toText } (never sent as such: the AI gets the lines of the "stays" fact), and the
  // plan they make with the dates of the visit.
  facts.stays = Array.isArray(facts.raw.stays) ? facts.raw.stays : [];
  facts.stayPlan = planStays(facts.stays, facts.raw.arrival, facts.raw.departure);

  // The AI does not need the applicant's name at all: no name line (a name part in the free text is still a token).
  facts.text = cover.renderFacts(facts.sections, {});
  return facts;
}

// ---------------------------------------------------------------------------
// The stays, as a plan
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;

/** "2027-03-15" -> a day number (UTC), or null when it is not a real calendar date. */
function dayNumber(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value === undefined || value === null ? '' : value));
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const back = new Date(ms);
  return back.getUTCFullYear() === +m[1] && back.getUTCMonth() === +m[2] - 1 && back.getUTCDate() === +m[3] ? Math.round(ms / DAY_MS) : null;
}

const MONTH_NAMES = cover.MONTHS;
const partsOf = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return { y: +m[1], m: MONTH_NAMES[+m[2] - 1], d: +m[3] }; };

/** "15 March to 18 March 2027" (the year once when both dates are in it, otherwise on each: "28 December 2026 to 3 January 2027"). */
function stayRange(from, to) {
  const a = partsOf(from);
  const b = partsOf(to);
  return a.y === b.y ? `${a.d} ${a.m} to ${b.d} ${b.m} ${b.y}` : `${a.d} ${a.m} ${a.y} to ${b.d} ${b.m} ${b.y}`;
}

/** The questions to fix when the stays contradict each other or the dates of the visit. */
const STAY_QUESTIONS = Object.freeze(['6.7c', '6.7d']);

/**
 * What the places of stay make of the visit, worked out again from the stored dates (never trusted):
 *   { mode: 'trip' }                          no stay has a place we can name (or the visit's own dates are unusable): the itinerary is built from the trip
 *                                             alone, exactly as it was before stays were read
 *   { mode: 'stays', stays }                  at least one stay has a place: `stays` are the stays that have both dates, in date order
 *   { mode: 'invalid', questions }            a stay leaves before it arrives, or starts before the visit or ends after it, or overlaps another
 *                                             (touching, one leaving the day the next arrives, is fine): generation is refused, nothing is guessed
 * A stay is { town, place, from, to, fromText, toText }.
 */
function planStays(stays, arrival, departure) {
  const list = Array.isArray(stays) ? stays : [];
  if (!list.some((s) => s && s.place)) return { mode: 'trip' };
  const first = dayNumber(arrival);
  const last = dayNumber(departure);
  if (first === null || last === null || last < first) return { mode: 'trip' }; // the visit's own dates are refused elsewhere, with their own code
  const sorted = list.map((s) => ({ ...s, a: dayNumber(s.from), b: dayNumber(s.to) })).sort((x, y) => (x.a === null ? Infinity : x.a) - (y.a === null ? Infinity : y.a));
  for (let i = 0; i < sorted.length; i += 1) {
    const s = sorted[i];
    if (s.a === null || s.b === null || s.b <= s.a || s.a < first || s.b > last) return { mode: 'invalid', questions: [...STAY_QUESTIONS] };
    if (i > 0 && s.a < sorted[i - 1].b) return { mode: 'invalid', questions: [...STAY_QUESTIONS] };
  }
  return { mode: 'stays', stays: sorted.map(({ a, b, ...rest }) => rest) };
}

/**
 * The stay a day belongs to, or null (a day no stay covers). A stay covers its arrival day, every day between, and its leaving day; when a stay
 * leaves on the day the next one arrives, that day belongs to the LATER stay (it is the day of the move).
 */
function stayOnDay(stays, iso) {
  const day = dayNumber(iso);
  if (day === null) return null;
  let found = null;
  for (const s of stays) {
    const a = dayNumber(s.from);
    const b = dayNumber(s.to);
    if (a !== null && b !== null && a <= day && day <= b && (found === null || a > dayNumber(found.from))) found = s;
  }
  return found;
}

/** The lines of the "Staying" row of the details grid, from the stays: "London, 15 March to 18 March 2027". The town is as the applicant typed it (restored by the caller). */
function stayLines(stays) {
  return stays.map((s) => `${s.town || 'Place not given'}, ${stayRange(s.from, s.to)}`);
}

module.exports = {
  planStays,
  stayOnDay,
  stayLines,
  stayRange,
  dayNumber,
  STAY_QUESTIONS,
  SPECS,
  PLACES_SPEC,
  ALLOWED_SECTIONS,
  EXCLUDED_SECTIONS,
  EXCLUDED_IDS,
  ITINERARY_RULES,
  PLACES,
  placesIn,
  allowedIds,
  validateItineraryAllowlist,
  buildItineraryFacts,
};
