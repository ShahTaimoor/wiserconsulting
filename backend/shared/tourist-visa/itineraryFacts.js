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
 * many companions. Never: every financial fact, employment and study, family, previous travel, identity and contact details, Parts 9
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
  'The name of a place of stay, its full address and the dates of each stay (only the town is read)': ['q6_7', 'q6_7a', 'q6_7c', 'q6_7d'],
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
  const facts = cover.buildFactsFor(SPECS, ITINERARY_RULES, cfg, answers, {
    ...options,
    derive: ({ values, add }) => {
      const places = placesIn(values.tripDescription);
      if (places.length) add(PLACES_SPEC, places);
    },
  });
  facts.places = Array.isArray(facts.values.places) ? facts.values.places : [];

  // The AI does not need the applicant's name at all: no name line (a name part in the free text is still a token).
  facts.text = cover.renderFacts(facts.sections, {});
  return facts;
}

module.exports = {
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
