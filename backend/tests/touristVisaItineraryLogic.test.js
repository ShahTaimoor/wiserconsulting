'use strict';

// The itinerary, without a database: the skeleton the server writes (dates, weekdays, number of headings, weekly blocks for a long stay),
// the strict checks on what the AI returns (every kind of rejection), the banned wording, the template (which must pass the same
// checks), what the AI is and is not shown, the exact round trip of the applicant's own words, the shared limits and the production
// guard. The service is run for real with a scripted AI (no network). Made-up data only.

process.env.NODE_ENV = 'test';
process.env.FIELD_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../shared/tourist-visa/engine');
const facts = require('../shared/tourist-visa/itineraryFacts');
const { buildSkeleton, parseDate, LONG_STAY_NIGHTS, MAX_NIGHTS } = require('../utils/touristVisaItinerarySkeleton');
const checks = require('../utils/touristVisaItineraryChecks');
const { buildTemplateDescriptions } = require('../utils/touristVisaItineraryTemplate');
const { ITINERARY_PROMPT_VERSION, SYSTEM_PROMPT, RETRY_REMINDER, buildUserPrompt } = require('../config/touristVisaItineraryPrompt');
const { AiError } = require('../services/aiService');
const { TouristVisaItineraryService } = require('../services/touristVisaItineraryService');
const { FALLBACK_REASONS, MAX_TEXT } = require('../models/TouristVisaItinerary');
const { readAiSettings, DEFAULT_GROQ_MODEL } = require('../config/ai');

const SUBMITTED = new Date('2026-11-03T10:00:00Z');
const ENV = { AI_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: 'gsk_fake_itinerary_key', NODE_ENV: 'test' };

const base = (extra = {}) => ({
  q1_1: 'tourism', q1_4: 'holiday', q1_6: '2027-03-15', q1_7: '2027-04-02', q1_5: 'I would like to see London, then Bath, and finally Edinburgh.',
  q2_1: 'Test', q2_2: 'Person', q6_7: false, q6_7x: 'paid_stay', q6_7y: 'London', ...extra,
});
const build = (answers) => facts.buildItineraryFacts(engine.config, answers, { submittedAt: SUBMITTED });
const skeletonOf = (f) => buildSkeleton(f.raw.arrival, f.raw.departure);

/** A good answer for a skeleton: one plain sentence per heading, the named places in order, no digits. */
function goodAnswer(f, skeleton, { places = f.places } = {}) {
  const n = skeleton.blocks.length;
  const verbs = ['Wander through', 'Spend the day in', 'Take a slow walk around', 'Explore the streets of', 'Visit the museums of', 'Enjoy the parks of'];
  const out = skeleton.blocks.map((block, i) => {
    const place = places.length ? places[Math.min(places.length - 1, Math.floor((i / n) * places.length))] : 'the city';
    if (block.first) return `Arrive in ${place} and settle in, then take a gentle first look around the area.`;
    if (block.last) return `Spend a last quiet morning in ${place} before setting off on the journey home.`;
    return `${verbs[i % verbs.length]} ${place} at an easy pace, with time to rest between visits.`;
  });
  return JSON.stringify({ descriptions: out });
}

function serviceWith(answer, { counts = { today: 0, hour: 0 }, env = ENV, unavailable = null } = {}) {
  const prompts = [];
  const settings = readAiSettings(env);
  const ai = {
    unavailable: () => unavailable,
    settings: () => settings,
    generate: async (prompt) => {
      prompts.push(prompt);
      const out = await answer(prompt, prompts.length);
      if (out instanceof Error) throw out;
      return { text: out, model: DEFAULT_GROQ_MODEL, provider: 'groq' };
    },
  };
  const itineraries = { countAiRequests: async ({ adminId }) => (adminId ? counts.hour : counts.today) };
  return { service: new TouristVisaItineraryService({ itineraries, audit: {}, applications: {}, admin: {}, ai }), prompts };
}

// ---------------------------------------------------------------------------
// 1. The skeleton
// ---------------------------------------------------------------------------

test('skeleton: 15 March to 2 April 2027 is 18 nights and 19 headings, with the right dates and weekdays, arrival and departure days included', () => {
  const s = buildSkeleton('2027-03-15', '2027-04-02');
  assert.equal(s.ok, true);
  assert.equal(s.nights, 18);
  assert.equal(s.mode, 'days');
  assert.equal(s.blocks.length, 19);
  assert.equal(s.blocks[0].heading, 'Day 1, Monday 15 March 2027');
  assert.equal(s.blocks[6].heading, 'Day 7, Sunday 21 March 2027');
  assert.equal(s.blocks[16].heading, 'Day 17, Wednesday 31 March 2027');
  assert.equal(s.blocks[17].heading, 'Day 18, Thursday 1 April 2027');
  assert.equal(s.blocks[18].heading, 'Day 19, Friday 2 April 2027');
  assert.deepEqual(s.blocks.map((b) => [b.first, b.last]).filter(([a, b]) => a || b), [[true, false], [false, true]]);
  // Every heading is the day after the one before it.
  for (let i = 1; i < s.blocks.length; i += 1) assert.equal(parseDate(s.blocks[i].start) - parseDate(s.blocks[i - 1].start), 86400000);
});

test('skeleton: the number of headings is what the dates imply, for every length up to the long-stay line; one day is one heading', () => {
  for (let nights = 0; nights <= LONG_STAY_NIGHTS; nights += 1) {
    const to = new Date(Date.UTC(2027, 2, 15) + nights * 86400000).toISOString().slice(0, 10);
    const s = buildSkeleton('2027-03-15', to);
    assert.equal(s.mode, 'days');
    assert.equal(s.blocks.length, nights + 1, `${nights} nights`);
  }
  const one = buildSkeleton('2027-03-15', '2027-03-15');
  assert.equal(one.blocks.length, 1);
  assert.equal(one.blocks[0].first && one.blocks[0].last, true);
});

test('skeleton: month ends, a leap day and a change of clocks do not move a date or a weekday', () => {
  const s = buildSkeleton('2028-02-27', '2028-03-02');
  assert.deepEqual(s.blocks.map((b) => b.heading), [
    'Day 1, Sunday 27 February 2028', 'Day 2, Monday 28 February 2028', 'Day 3, Tuesday 29 February 2028', 'Day 4, Wednesday 1 March 2028', 'Day 5, Thursday 2 March 2028',
  ]);
  const clocks = buildSkeleton('2027-03-27', '2027-03-29');
  assert.deepEqual(clocks.blocks.map((b) => b.heading), ['Day 1, Saturday 27 March 2027', 'Day 2, Sunday 28 March 2027', 'Day 3, Monday 29 March 2027']);
  const year = buildSkeleton('2027-12-30', '2028-01-02');
  assert.equal(year.blocks[3].heading, 'Day 4, Sunday 2 January 2028');
});

test('skeleton: a stay of more than 21 nights is in weekly blocks headed by their date range; the last block may be short; the days add up', () => {
  const s = buildSkeleton('2027-03-15', '2027-04-06'); // 22 nights, 23 days
  assert.equal(s.nights, 22);
  assert.equal(s.mode, 'weeks');
  assert.deepEqual(s.blocks.map((b) => b.days), [7, 7, 7, 2]);
  assert.equal(s.blocks[0].heading, 'Monday 15 March 2027 to Sunday 21 March 2027');
  assert.equal(s.blocks[3].heading, 'Monday 5 April 2027 to Tuesday 6 April 2027');
  assert.equal(s.blocks[0].first, true);
  assert.equal(s.blocks[3].last, true);
  const single = buildSkeleton('2027-03-15', '2027-04-05'); // 21 nights is still daily; one more day makes a block of one day
  assert.equal(single.mode, 'days');
  const lone = buildSkeleton('2027-03-15', '2027-04-12'); // 28 nights, 29 days: 4 weeks and a day
  assert.deepEqual(lone.blocks.map((b) => b.days), [7, 7, 7, 7, 1]);
  assert.equal(lone.blocks[4].heading, 'Monday 12 April 2027');
  const six = buildSkeleton('2027-01-01', '2027-07-03'); // 183 nights, the longest
  assert.equal(six.ok, true);
  assert.equal(six.blocks.reduce((sum, b) => sum + b.days, 0), 184);
});

test('skeleton: missing or impossible dates are refused with a fixed code and the numbers of the questions to fix', () => {
  assert.deepEqual(buildSkeleton(undefined, '2027-04-02'), { ok: false, code: 'ITINERARY_DATES_MISSING', questions: ['1.6'] });
  assert.deepEqual(buildSkeleton('2027-03-15', ''), { ok: false, code: 'ITINERARY_DATES_MISSING', questions: ['1.7'] });
  assert.deepEqual(buildSkeleton(null, null), { ok: false, code: 'ITINERARY_DATES_MISSING', questions: ['1.6', '1.7'] });
  for (const [a, d] of [['2027-04-02', '2027-03-15'], ['2027-02-30', '2027-03-15'], ['not a date', '2027-03-15'], ['2027-03-15', '2027-13-01'], ['2027-03-15', '2028-03-15'], ['15/03/2027', '2027-04-02']]) {
    assert.deepEqual(buildSkeleton(a, d), { ok: false, code: 'ITINERARY_DATES_INVALID', questions: ['1.6', '1.7'] }, `${a} ${d}`);
  }
  assert.equal(MAX_NIGHTS, 183);
});

// ---------------------------------------------------------------------------
// 2. Parsing and checking what the AI returns
// ---------------------------------------------------------------------------

const GOOD = 'Spend the day in London at an easy pace, with time to rest between visits.';
const entries = (n, text = GOOD) => Array.from({ length: n }, () => text);
const check = (list, options = {}) => checks.validateDescriptions(list, { mode: 'days', named: ['London', 'Bath', 'Edinburgh'], stay: ['London'], ...options });

test('parsing: only JSON with exactly one key "descriptions" holding exactly the right number of entries is accepted', () => {
  const ok = checks.parseDescriptions(JSON.stringify({ descriptions: entries(3) }), 3);
  assert.equal(ok.ok, true);
  assert.equal(checks.parseDescriptions('```json\n' + JSON.stringify({ descriptions: entries(3) }) + '\n```', 3).ok, true, 'a code fence is tolerated');
  for (const [raw, code] of [
    ['', 'ITINERARY_BAD_JSON'],
    ['Here are the descriptions: 1. ...', 'ITINERARY_BAD_JSON'],
    ['{"descriptions": [', 'ITINERARY_BAD_JSON'],
    ['null', 'ITINERARY_BAD_JSON'],
    ['"a string"', 'ITINERARY_BAD_JSON'],
    [JSON.stringify(entries(3)), 'ITINERARY_BAD_JSON'],
    [JSON.stringify({ items: entries(3) }), 'ITINERARY_BAD_JSON'],
    [JSON.stringify({ descriptions: entries(3), note: 'x' }), 'ITINERARY_BAD_JSON'],
    [JSON.stringify({ descriptions: 'text' }), 'ITINERARY_BAD_JSON'],
    [JSON.stringify({ descriptions: entries(2) }), 'ITINERARY_WRONG_COUNT'],
    [JSON.stringify({ descriptions: entries(4) }), 'ITINERARY_WRONG_COUNT'],
    [JSON.stringify({ descriptions: [] }), 'ITINERARY_WRONG_COUNT'],
  ]) {
    assert.deepEqual(checks.parseDescriptions(raw, 3), { ok: false, code }, raw.slice(0, 40));
  }
});

test('every rejection kind: an entry that is not a string, not plain, too short or too long', () => {
  const at = (index, value) => { const list = entries(3); list[index] = value; return check(list); };
  assert.deepEqual(check(entries(3)), { ok: true, descriptions: entries(3) });
  for (const value of [42, null, undefined, { text: GOOD }, [GOOD], true]) assert.equal(at(1, value).rule, 'not-a-string');
  for (const value of ['First line\nSecond line of the same day.', '- A bullet point about London and its parks.', '1. A numbered sentence about London parks.', 'A **bold** claim about the parks of London.', 'The `code` and # heading in London parks.']) {
    const result = at(2, value);
    assert.equal(result.code, 'ITINERARY_BAD_ENTRY', value);
    assert.equal(result.rule, 'not-plain', value);
    assert.equal(result.entry, 2);
  }
  assert.equal(at(0, 'Too short.').rule, 'too-short');
  assert.equal(at(0, '').rule, 'too-short');
  assert.equal(at(0, `${GOOD} `.repeat(6)).rule, 'too-long');
  assert.equal(check([`${GOOD} `.repeat(3).trim()]).ok, true, 'just under the cap');
  assert.equal(check([`A walk through the parks of London on a quiet morning. `.repeat(6).trim()], { mode: 'weeks' }).rule, 'too-long', 'a week has a smaller cap');
  // The result never holds the text.
  assert.equal(JSON.stringify(at(0, 'Too short.')).includes('Too short'), false);
});

test('every rejection kind: a digit, a currency, a time, a link, an email, a phone number, a bracket, a weekday or a month', () => {
  const forbidden = {
    digit: 'Spend the day in London, about 3 hours in the museums.',
    currency: 'Spend the day in London, with a modest amount in pounds for lunch.',
    'time': 'Spend the day in London, leaving at midday for the museums.',
    link: 'Spend the day in London and read more at www.visitlondon.example for ideas.',
    email: 'Spend the day in London and write to guide@example for ideas.',
    phone: 'Spend the day in London and call ahead to the museum.',
    bracket: 'Spend the day in London with [NAME] and the parks around it.',
    'weekday-month': 'Spend the day in London, since Tuesday suits the museums best.',
  };
  for (const [rule, text] of Object.entries(forbidden)) {
    const result = check([GOOD, text, GOOD]);
    assert.equal(result.code, 'ITINERARY_FORBIDDEN_CONTENT', rule);
    assert.equal(result.rule, rule, rule);
    assert.equal(result.entry, 1);
    assert.equal(JSON.stringify(result).includes('museum'), false, 'no text in the result');
  }
  for (const text of ['Spend 5 pm at the museum in London looking at the exhibits.', 'Spend the day in London for £20 of lunch and walking.', 'Wander through London in May, visiting the museums.']) {
    assert.equal(check([text]).ok, false, text);
  }
  // A month name that is also an ordinary word is NOT blocked ("may", "march") only where it is a month: here we accept it as the rule says.
  assert.equal(check(['Spend the day in London and march along the river to the parks.']).ok, true);
});

test('every rejection kind: wording that promises, books or sells, and marketing language', () => {
  const banned = {
    booking: ['Spend the day in London, with a visit that is already booked.', 'Arrive in London where the stay is reserved and confirmed.', 'This day in London is guaranteed to be calm.', 'Visit a pre-booked museum in London for the day.'],
    ticket: ['Spend the day in London with tickets for the museum.', 'Spend the day in London, with admission to the gallery.'],
    'transport-or-stay': ['Arrive in London by flight and settle into the hotel.', 'Take the train from London to the parks nearby.', 'Spend the day in London near the hostel.'],
    price: ['Spend the day in London, visiting free of charge museums.', 'Spend the day in London on a budget, keeping the cost low.', 'Spend a cheap day in London walking about the parks.'],
    'opening-times': ['Spend the day in London, when the museum is open daily to visitors.'],
    marketing: ['Spend a breathtaking day in London in the parks.', 'Visit the must-see galleries of London for the day.', 'An unforgettable day in London among the parks and rivers.', 'Spend the day in London among stunning parks and rivers.'],
  };
  for (const [rule, list] of Object.entries(banned)) {
    for (const text of list) {
      const result = check([GOOD, text]);
      assert.equal(result.ok, false, text);
      assert.equal(result.code, 'ITINERARY_BANNED_PHRASE', `${rule}: ${text}`);
      assert.equal(result.rule, rule, text);
    }
  }
  // The cover letter's own banned patterns apply too.
  const coverLetterBanned = require('../utils/touristVisaCoverLetterChecks').BANNED_PHRASES;
  assert.ok(coverLetterBanned.length > 0);
  for (const { id } of coverLetterBanned) assert.ok(checks.BANNED_PHRASES.some((p) => p.id === id), `the cover letter rule ${id} also applies to the itinerary`);
  assert.equal(check(['Spend the day in London, walking to the river and resting in a park.']).ok, true);
});

test('every rejection kind: a place the applicant did not name, and places named in another order', () => {
  const named = ['London', 'Bath', 'Edinburgh'];
  const other = check([GOOD, 'Spend the day in Oxford, walking by the river and through the colleges.'], { named, stay: ['London'] });
  assert.equal(other.code, 'ITINERARY_PLACE_NOT_NAMED');
  assert.equal(other.entry, 1);
  assert.equal(JSON.stringify(other).includes('Oxford'), false);
  assert.equal(check(['Spend the day in Manchester walking about the old streets and the canals.'], { named: [], stay: [] }).code, 'ITINERARY_PLACE_NOT_NAMED');
  // A country is not a place that must be named; the stay city may always be named; an ordinary word is not a place.
  assert.equal(check(['Spend the day in London, the capital of England, walking through its parks.']).ok, true);
  assert.equal(check(['Spend the day in Edinburgh, the capital of Scotland, walking about the old town.'], { named: ['Edinburgh'], stay: [] }).ok, true);
  assert.equal(check(['Have a long bath and a quiet rest before an easy walk about the neighbourhood.']).ok, true, 'bath in lower case is not the city');
  assert.equal(check(['Visit Bath for the day and walk about its old streets and parks.'], { named: ['Bath'], stay: [] }).ok, true);
  assert.equal(check(['Visit Bath for the day and walk about its old streets and parks.'], { named: ['London'], stay: [] }).code, 'ITINERARY_PLACE_NOT_NAMED');

  const ordered = (list) => check(list, { named, stay: [] });
  assert.equal(ordered([
    'Spend the day in London walking through its parks.', 'Visit Bath and walk about its old streets for the day.', 'Spend the day in Edinburgh walking its old town.',
  ]).ok, true);
  const wrong = ordered([
    'Spend the day in London walking through its parks.', 'Spend the day in Edinburgh walking its old town.', 'Visit Bath and walk about its old streets for the day.',
  ]);
  assert.equal(wrong.code, 'ITINERARY_PLACE_ORDER');
  assert.equal(wrong.rule, 'order');
  // Leaving a named place out is allowed (the admin sees it); a place may be mentioned again later (a day trip back).
  assert.equal(ordered(['Spend the day in London walking through its parks.', 'Visit Bath and walk about its old streets for the day.', 'Return to London for a quiet last evening on foot.']).ok, true);
});

test('the entries come back tidied (extra spaces), and the final text is the title, one neutral sentence, then each heading with its description', () => {
  const s = buildSkeleton('2027-03-15', '2027-03-17');
  const result = check(entries(3, '  Spend the day   in London at an easy pace, with time to rest. '));
  assert.equal(result.descriptions[0], 'Spend the day in London at an easy pace, with time to rest.');
  const text = checks.assembleItinerary(s.blocks, result.descriptions);
  const parts = text.split('\n\n');
  assert.equal(parts[0], 'Proposed itinerary');
  assert.equal(parts[1], 'This is a proposed plan for the visit, and it may change.');
  assert.equal(parts[2], 'Day 1, Monday 15 March 2027\nSpend the day in London at an easy pace, with time to rest.');
  assert.equal(parts.length, 5);
});

// ---------------------------------------------------------------------------
// 3. The template
// ---------------------------------------------------------------------------

test('template: the 19-day example follows the stated order, spreads the days, has an arrival and a departure day, and passes the AI\'s own checks', () => {
  const f = build(base());
  const s = skeletonOf(f);
  const list = buildTemplateDescriptions(f, s);
  assert.equal(list.length, 19);
  const result = checks.validateDescriptions(list, { mode: s.mode, named: f.places, stay: ['London'] });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.match(list[0], /^Arrive in London/);
  assert.match(list[18], /Edinburgh/);
  assert.match(list[18], /journey home/);
  // London, then Bath, then Edinburgh: never back.
  const where = list.map((text) => (checks.BANNED_PHRASES && require('../shared/tourist-visa/itineraryFacts').placesIn(text))[0]);
  const order = where.filter(Boolean).filter((place, i, all) => i === 0 || place !== all[i - 1]);
  assert.deepEqual(order, ['London', 'Bath', 'Edinburgh']);
  assert.ok(list.some((text) => /^Travel to Bath/.test(text)), 'a travel day to the next place');
  assert.ok(list.some((text) => /^Travel to Edinburgh/.test(text)));
  // No digit anywhere in the descriptions; the same facts give the same itinerary.
  assert.equal(list.some((text) => /\d/.test(text)), false);
  assert.deepEqual(buildTemplateDescriptions(build(base()), s), list);
});

test('template: with no place named it uses the city of the stay, else the plain town, else nothing in particular; the purpose changes the wording', () => {
  const none = build(base({ q1_5: 'I want to rest and see the sights.' }));
  const s = skeletonOf(none);
  assert.deepEqual(none.places, []);
  const london = buildTemplateDescriptions(none, s);
  assert.match(london[0], /^Arrive in London/, 'the city of the stay');
  assert.equal(checks.validateDescriptions(london, { mode: 'days', named: [], stay: ['London'] }).ok, true);

  // A town that is not on our list: read from the town of an address (a plain town), never from the free-text area.
  const address = { q6_7a: 'A place', q6_7b: { line1: '1 Test Street', town: 'Reading', postcode: 'RG1 1AA', country: 'GB' }, q6_7c: '2027-03-15', q6_7d: '2027-04-02' };
  const town = build(base({ q1_5: 'Nothing specific.', q6_7: true, q6_7x: undefined, q6_7y: undefined, accommodation: [address] }));
  const reading = buildTemplateDescriptions(town, skeletonOf(town));
  assert.match(reading[0], /^Arrive in Reading/);
  assert.equal(checks.validateDescriptions(reading, { mode: 'days', named: [], stay: [] }).ok, true);
  // The same town typed into the free-text area is NOT sent, so the plan says "the United Kingdom", never an invented or typed place.
  const typed = build(base({ q1_5: 'Nothing specific.', q6_7y: 'Reading' }));
  assert.equal(typed.values.accommodationArea, undefined);
  assert.match(buildTemplateDescriptions(typed, skeletonOf(typed))[0], /^Arrive in the United Kingdom/);

  const nowhere = build(base({ q1_5: 'Nothing specific.', q6_7x: 'not_decided', q6_7y: undefined }));
  const generic = buildTemplateDescriptions(nowhere, skeletonOf(nowhere));
  assert.match(generic[0], /^Arrive in the United Kingdom/);
  assert.equal(checks.validateDescriptions(generic, { mode: 'days', named: [], stay: [] }).ok, true);
  assert.equal(generic.some((text) => /\bLondon\b/.test(text)), false);

  const family = build(base({ q1_1: 'family_friends', q1_4: undefined }));
  const withFamily = buildTemplateDescriptions(family, skeletonOf(family));
  assert.ok(withFamily.some((text) => /family or friends/.test(text)));
  assert.equal(checks.validateDescriptions(withFamily, { mode: 'days', named: family.places, stay: ['London'] }).ok, true);
  const other = build(base({ q1_1: 'business', q1_4: undefined }));
  assert.equal(checks.validateDescriptions(buildTemplateDescriptions(other, skeletonOf(other)), { mode: 'days', named: other.places, stay: ['London'] }).ok, true);
});

test('template: every length from one day to six months passes the checks and fits the 8000 characters, daily or weekly', () => {
  const f = build(base());
  const stay = ['London'];
  for (const nights of [0, 1, 2, 3, 5, 10, 14, 21, 22, 28, 29, 35, 60, 90, 120, 183]) {
    const to = new Date(Date.UTC(2027, 2, 15) + nights * 86400000).toISOString().slice(0, 10);
    const s = buildSkeleton('2027-03-15', to);
    for (const answers of [base(), base({ q1_5: 'Nothing specific.' }), base({ q1_5: 'London only.' }), base({ q1_5: 'Edinburgh, London, Bath, Oxford, Cambridge, York and Cardiff.' })]) {
      const g = build(answers);
      const list = buildTemplateDescriptions(g, s);
      assert.equal(list.length, s.blocks.length, `${nights} nights`);
      const result = checks.validateDescriptions(list, { mode: s.mode, named: g.places, stay });
      assert.equal(result.ok, true, `${nights} nights: ${JSON.stringify(result)}`);
      assert.ok(checks.assembleItinerary(s.blocks, list).length <= MAX_TEXT, `${nights} nights fits`);
    }
  }
  assert.ok(f);
});

test('template: a long stay is described a week at a time, with an arrival week, a departure week and the places in order', () => {
  const f = build(base({ q1_7: '2027-05-10' }));
  const s = skeletonOf(f);
  assert.equal(s.mode, 'weeks');
  const list = buildTemplateDescriptions(f, s);
  assert.equal(list.length, s.blocks.length);
  assert.match(list[0], /^Arrive in London/);
  assert.match(list[list.length - 1], /journey home/);
  assert.equal(checks.validateDescriptions(list, { mode: 'weeks', named: f.places, stay: ['London'] }).ok, true);
});

// ---------------------------------------------------------------------------
// 4. The service: what the AI is shown, the answers it gives, the retry, the fallback
// ---------------------------------------------------------------------------

const run = async (answer, options = {}) => {
  const f = build(options.answers || base());
  const s = skeletonOf(f);
  const made = serviceWith(answer, options);
  const result = await made.service.compose('admin1', f, s);
  return { ...made, result, f, s };
};

test('the AI is shown the headings and the itinerary\'s own facts and nothing else: no name, no email, no phone, no employer, no money, no previous travel', async () => {
  const typed = 'Test wants London then Bath and Edinburgh; mail jo.bloggs@example.com, call +44 20 7946 0958, see https://example.org/trip.';
  const { prompts, result, f, s } = await run((prompt) => goodAnswer(f0(), s0()), { answers: base({ q1_5: typed, q5_3: 'Acme Secret Ltd', q5_7: 52000, q2_24: 'Secret Street 5', q8_1: true }) });
  assert.equal(result.source, 'ai', result.fallbackReason);
  const user = prompts[0].user;
  assert.match(user, /There are exactly 19 headings, one for each day/);
  assert.match(user, /1\. Day 1, Monday 15 March 2027 \(includes the arrival day\)/);
  assert.match(user, /19\. Day 19, Friday 2 April 2027 \(includes the departure day\)/);
  assert.match(user, /Planned arrival date: 15 March 2027/);
  assert.match(user, /Places the applicant named, in order: London; Bath; Edinburgh/);
  for (const secret of ['Test Person', 'Person', 'jo.bloggs', 'example.com', '7946', 'example.org', 'Acme', '52000', '52,000', 'Secret Street', 'Part 9', 'passport', 'National Insurance']) {
    assert.equal(JSON.stringify(prompts[0]).includes(secret), false, `${secret} reached the AI`);
  }
  assert.equal(/\[R\d\]/.test(user), true, 'name and contact details are tokens');
  assert.equal(f.text.includes('The applicant\'s name'), false, 'there is no name line');
  assert.equal(s.blocks.length, 19);
  function f0() { return build(base({ q1_5: typed })); }
  function s0() { return skeletonOf(f0()); }
});

test('a good answer is used: the title, the note, 19 headings with their weekdays, the descriptions, source ai, prompt version and attempts recorded', async () => {
  const { result, prompts, f, s } = await run((prompt) => goodAnswer(build(base()), skeletonOf(build(base()))));
  assert.equal(prompts.length, 1);
  assert.equal(result.source, 'ai');
  assert.equal(result.model, DEFAULT_GROQ_MODEL);
  assert.equal(result.aiAttempts, 1);
  assert.equal(result.promptVersion, ITINERARY_PROMPT_VERSION);
  assert.equal(result.aiAttempted, true);
  assert.equal(result.fallbackReason, undefined);
  const sections = result.text.split('\n\n');
  assert.equal(sections.length, 2 + 19);
  assert.deepEqual(sections.slice(2).map((section) => section.split('\n')[0]), s.blocks.map((b) => b.heading));
  for (const section of sections.slice(2)) assert.equal(/\d/.test(section.split('\n')[1]), false, 'no digit in a description');
  assert.ok(f.places.length === 3);
});

test('the rejected answers: every kind of failure is retried ONCE, with the reminder, and the second good answer is kept (counted as two requests)', async () => {
  const f = build(base());
  const s = skeletonOf(f);
  const good = goodAnswer(f, s);
  const goodList = JSON.parse(good).descriptions;
  const at = (i, text) => JSON.stringify({ descriptions: goodList.map((d, n) => (n === i ? text : d)) });
  const bad = {
    ITINERARY_BAD_JSON: 'Sure! Here you go: day 1 ...',
    ITINERARY_WRONG_COUNT: JSON.stringify({ descriptions: goodList.slice(1) }),
    ITINERARY_BAD_ENTRY: at(3, 'Too short.'),
    ITINERARY_FORBIDDEN_CONTENT: at(3, 'Spend the day in London for about 3 hours in the museums.'),
    ITINERARY_BANNED_PHRASE: at(3, 'Spend a breathtaking day in London in the parks.'),
    ITINERARY_PLACE_NOT_NAMED: at(3, 'Spend the day in Oxford walking by the river and the colleges.'),
    ITINERARY_PLACE_ORDER: JSON.stringify({ descriptions: [...goodList.slice(0, 5), 'Spend the day in Edinburgh walking the old town and the hills.', ...goodList.slice(6, 8), 'Visit Bath and walk about its old streets for the day.', ...goodList.slice(9)] }),
  };
  for (const [code, answer] of Object.entries(bad)) {
    const once = await run((prompt, n) => (n === 1 ? answer : good));
    assert.equal(once.prompts.length, 2, code);
    assert.equal(once.result.source, 'ai', code);
    assert.equal(once.result.aiAttempts, 2, code);
    assert.equal(once.prompts[0].user.includes(RETRY_REMINDER), false, 'the first request has no reminder');
    assert.equal(once.prompts[1].user.includes(RETRY_REMINDER), true, 'the second request has the reminder');

    const twice = await run(() => answer);
    assert.equal(twice.prompts.length, 2, `${code}: only one retry`);
    assert.equal(twice.result.source, 'template', code);
    assert.equal(twice.result.fallbackReason, code);
    assert.equal(twice.result.aiAttempted, true);
    assert.equal(twice.result.aiAttempts, 2);
    assert.equal(twice.result.promptVersion, ITINERARY_PROMPT_VERSION);
    assert.ok(FALLBACK_REASONS.includes(code), `${code} can be stored`);
    // The rejected answers are kept nowhere: the text is the template's.
    assert.equal(twice.result.text.includes('breathtaking'), false);
    assert.equal(twice.result.text.split('\n\n').length, 21);
  }
});

test('the retry is not made when the daily or the per-administrator limit has no room for it; a failure of the second request still gives the template with the first reason', async () => {
  const f = build(base());
  const s = skeletonOf(f);
  const bad = 'not json';
  const settings = readAiSettings(ENV);
  const daily = await run(() => bad, { counts: { today: settings.dailyLimit - 1, hour: 0 } });
  assert.equal(daily.prompts.length, 1);
  assert.equal(daily.result.fallbackReason, 'ITINERARY_BAD_JSON');
  assert.equal(daily.result.aiAttempts, 1);
  const hourly = await run(() => bad, { counts: { today: 0, hour: settings.adminHourlyLimit - 1 } });
  assert.equal(hourly.prompts.length, 1);
  assert.equal(hourly.result.aiAttempts, 1);

  const second = await run((prompt, n) => (n === 1 ? bad : new AiError('AI_TIMEOUT')));
  assert.equal(second.result.source, 'template');
  assert.equal(second.result.fallbackReason, 'ITINERARY_BAD_JSON');
  assert.equal(second.result.aiAttempts, 2);
  assert.ok(f && s);
});

test('shared limits: at the daily or per-administrator limit (counted with the cover letter) the provider is not asked and the template is written', async () => {
  const settings = readAiSettings(ENV);
  const daily = await run(() => 'x', { counts: { today: settings.dailyLimit, hour: 0 } });
  assert.equal(daily.prompts.length, 0);
  assert.equal(daily.result.fallbackReason, 'AI_DAILY_LIMIT');
  assert.equal(daily.result.aiAttempted, false);
  assert.equal(daily.result.aiAttempts, undefined);
  const hourly = await run(() => 'x', { counts: { today: 0, hour: settings.adminHourlyLimit } });
  assert.equal(hourly.prompts.length, 0);
  assert.equal(hourly.result.fallbackReason, 'AI_ADMIN_LIMIT');
  assert.equal(hourly.result.text.split('\n\n').length, 21);
});

test('provider failures give the template at once with the fixed code; a request that was never sent does not count', async () => {
  for (const code of ['AI_RATE_LIMITED', 'AI_TIMEOUT', 'AI_NETWORK', 'AI_PROVIDER_REJECTED', 'AI_PROVIDER_ERROR', 'AI_BAD_RESPONSE', 'AI_TRUNCATED']) {
    const made = await run(() => new AiError(code));
    assert.equal(made.prompts.length, 1, code);
    assert.equal(made.result.source, 'template');
    assert.equal(made.result.fallbackReason, code);
    assert.equal(made.result.aiAttempts, 1);
    assert.ok(FALLBACK_REASONS.includes(code));
  }
  const unknown = await run(() => new Error('SECRET-INTERNAL-ERROR'));
  assert.equal(unknown.result.fallbackReason, 'AI_PROVIDER_ERROR');
  assert.equal(JSON.stringify(unknown.result).includes('SECRET'), false);
  for (const code of ['AI_DISABLED', 'AI_NOT_CONFIGURED', 'AI_TERMS_NOT_CONFIRMED', 'AI_CIRCUIT_OPEN']) {
    const made = await run(() => 'x', { unavailable: code });
    assert.equal(made.prompts.length, 0, code);
    assert.equal(made.result.fallbackReason, code);
    assert.equal(made.result.aiAttempted, false);
    assert.equal(made.result.promptVersion, undefined);
  }
});

test('the production guard: in production the AI is not available without the data-terms confirmation (the shared adapter decides, the itinerary uses it)', () => {
  const { aiUnavailableCode } = require('../config/ai');
  assert.equal(aiUnavailableCode(readAiSettings({ ...ENV, NODE_ENV: 'production' })), 'AI_TERMS_NOT_CONFIRMED');
  assert.equal(aiUnavailableCode(readAiSettings({ ...ENV, NODE_ENV: 'production', AI_DATA_TERMS_CONFIRMED: 'true' })), null);
  const source = require('node:fs').readFileSync(require.resolve('../services/touristVisaItineraryService'), 'utf8');
  assert.match(source, /this\.ai\.unavailable\(\)/, 'it asks the shared adapter first');
});

test('a long stay asks for weekly descriptions, validated with the weekly cap', async () => {
  const answers = base({ q1_7: '2027-05-10' });
  const f = build(answers);
  const s = skeletonOf(f);
  assert.equal(s.mode, 'weeks');
  const good = goodAnswer(f, s);
  const made = await run(() => good, { answers });
  assert.equal(made.result.source, 'ai', made.result.fallbackReason);
  assert.match(made.prompts[0].user, new RegExp(`There are exactly ${s.blocks.length} headings, one for each week`));
  assert.match(made.prompts[0].user, /Monday 15 March 2027 to Sunday 21 March 2027 \(includes the arrival day\)/);
});

test('an itinerary over the size an administrator may save is not accepted from the AI', async () => {
  const f = build(base());
  const s = skeletonOf(f);
  // Nineteen entries under the cap each still fit; a made-up longer skeleton does not.
  const long = { ...s, blocks: Array.from({ length: 60 }, (_, i) => ({ ...s.blocks[1], heading: `Day ${i + 1}, Tuesday 16 March 2027` })) };
  const { service } = serviceWith(() => '');
  const answer = JSON.stringify({ descriptions: Array.from({ length: 60 }, () => 'A'.repeat(0) + 'Spend the day in London with a walk through its parks and a quiet rest. '.repeat(3).trim()) });
  const result = service.evaluate(answer, f, long);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ITINERARY_BAD_ENTRY');
});

// ---------------------------------------------------------------------------
// 5. The redaction round trip
// ---------------------------------------------------------------------------

test('redaction: names, emails, phone numbers and links in the trip description reach the AI only as tokens; a token in the answer is refused; the real words are never needed', async () => {
  const typed = 'Test Person will see London, then Bath; write to jo.bloggs@example.com or call +44 20 7946 0958; see https://example.org/plan.';
  const answers = base({ q1_5: typed });
  const f = build(answers);
  const s = skeletonOf(f);
  const made = await run(() => goodAnswer(f, s), { answers });
  const shown = JSON.stringify(made.prompts[0]);
  for (const secret of ['Test Person', 'jo.bloggs', 'example.com', '7946', 'example.org']) assert.equal(shown.includes(secret), false, secret);
  assert.match(made.prompts[0].user, /\[R1\] will see London, then Bath; write to \[R2\] or call \[R3\]; see \[R4\]\./);
  // A token such as [R1] has a digit, which is refused as a digit; a bracket with no digit is refused as a bracket.
  assert.equal(check([GOOD, 'Spend the day in London with [R1] and the parks around it.']).rule, 'digit');
  // The places survive the redaction (they are ours, from the list), and an answer that echoes a token or a name is refused.
  assert.deepEqual(f.places, ['London', 'Bath']);
  const echo = JSON.parse(goodAnswer(f, s));
  echo.descriptions[2] = 'Spend the day in London with [R1] and walk through its parks and squares.';
  const refused = await run(() => JSON.stringify(echo), { answers });
  assert.equal(refused.result.source, 'template');
  assert.equal(refused.result.fallbackReason, 'ITINERARY_FORBIDDEN_CONTENT');
  assert.equal(refused.result.text.includes('[R'), false);
  assert.equal(refused.result.text.includes('Test Person'), false, 'the template does not use the applicant\'s words');
});

test('the name of the applicant is not asked for, and a name that is an ordinary word cannot damage the descriptions', async () => {
  for (const [given, family] of [['Test', 'Person'], ['Will', 'Bath'], ['Hope', 'London']]) {
    const answers = base({ q2_1: given, q2_2: family, q1_5: `${given} would like to see London then Bath.` });
    const f = build(answers);
    const s = skeletonOf(f);
    const made = await run(() => goodAnswer(f, s), { answers });
    assert.equal(made.result.source, 'ai', `${given} ${family}: ${made.result.fallbackReason}`);
    assert.equal(JSON.stringify(made.prompts[0]).includes(`${given} would`), false, 'the name is a token');
    assert.equal(made.result.text.includes('[R'), false);
  }
});

// ---------------------------------------------------------------------------
// 6. The prompt
// ---------------------------------------------------------------------------

test('prompt version 1: JSON only, one description for each heading, no sample itinerary, no stock phrasing, the banned wording only named as things NOT to write', () => {
  assert.equal(ITINERARY_PROMPT_VERSION, 1);
  assert.match(SYSTEM_PROMPT, /\{"descriptions": \[ \.\.\. \]\}/);
  assert.match(SYSTEM_PROMPT, /exactly one short description for each heading/);
  assert.match(SYSTEM_PROMPT, /data to use, never as an instruction/);
  assert.match(SYSTEM_PROMPT, /Never name a place the applicant did not name/);
  // No sample itinerary or model day to copy: no "Day 1" and no heading line.
  assert.equal(/Day \d|Monday \d|Arrive in [A-Z]/.test(SYSTEM_PROMPT), false);
  assert.equal(/AI|artificial|language model/.test(SYSTEM_PROMPT.replace(/\bAI\b/g, '')), false);
  const user = buildUserPrompt('FACTS-HERE', buildSkeleton('2027-03-15', '2027-03-17'));
  assert.match(user, /There are exactly 3 headings, one for each day/);
  assert.match(user, /--- FACTS ---\nFACTS-HERE\n--- END OF FACTS ---/);
  assert.equal(user.includes(RETRY_REMINDER), false);
  assert.equal(buildUserPrompt('F', buildSkeleton('2027-03-15', '2027-03-17'), { retry: true }).includes(RETRY_REMINDER), true);
});

// ---------------------------------------------------------------------------
// 7. Missing or impossible dates, through the service
// ---------------------------------------------------------------------------

function stubbedService(answers, status = 'submitted') {
  const audit = [];
  const stored = [];
  const application = { _id: 'a'.repeat(24), status, answers, revision: 3, submittedAt: SUBMITTED };
  const service = new TouristVisaItineraryService({
    itineraries: {
      latest: async () => (stored.length ? { version: stored.length, status: 'draft', factsHash: stored[stored.length - 1].factsHash } : null),
      findVersions: async () => stored.map((row) => ({ ...row })).reverse(),
      append: async (row) => { stored.push({ ...row, status: 'draft', createdBy: { id: 'x', name: 'x' } }); },
      countAiRequests: async () => 0,
      approve: async () => true,
    },
    audit: { append: async (rows) => { audit.push(...rows); } },
    applications: { configOf: async () => engine.config },
    admin: { load: async () => application },
    ai: { unavailable: () => 'AI_DISABLED', settings: () => readAiSettings({}), generate: async () => { throw new Error('the AI must not be asked'); } },
  });
  return { service, audit, stored };
}

test('missing dates: the view says which questions to fix, generating is refused with a fixed code and writes nothing, and a hand-written itinerary can still be saved', async () => {
  const { service, audit, stored } = stubbedService({ q1_1: 'tourism', q1_4: 'holiday' });
  const view = await service.view('admin1', 'x');
  assert.deepEqual(view.blocker, { code: 'ITINERARY_DATES_MISSING', questions: ['1.6', '1.7'] });
  await assert.rejects(service.generate('admin1', 'x'), (error) => error.statusCode === 422 && error.code === 'ITINERARY_DATES_MISSING' && JSON.stringify(error.details) === '{"questions":["1.6","1.7"]}' && /arrival and departure dates/.test(error.message));
  assert.equal(stored.length, 0);
  assert.deepEqual(audit.map((row) => row.action), ['itinerary_view'], 'the refused generation is not audited as a generation');
  const saved = await service.save('admin1', 'x', { text: 'A hand-written plan for the visit.', basedOnVersion: 0 });
  assert.equal(saved.latest, 1);
  assert.equal(saved.versions[0].source, 'admin');
  assert.equal(saved.blocker.code, 'ITINERARY_DATES_MISSING');

  const onlyArrival = stubbedService({ q1_1: 'tourism', q1_6: '2027-03-15' });
  assert.deepEqual((await onlyArrival.service.view('admin1', 'x')).blocker, { code: 'ITINERARY_DATES_MISSING', questions: ['1.7'] });
});

test('impossible dates: a departure before the arrival is refused with a fixed code and both question numbers', async () => {
  const { service, stored } = stubbedService({ q1_1: 'tourism', q1_6: '2027-04-02', q1_7: '2027-03-15' });
  await assert.rejects(service.generate('admin1', 'x'), (error) => error.statusCode === 422 && error.code === 'ITINERARY_DATES_INVALID' && JSON.stringify(error.details) === '{"questions":["1.6","1.7"]}');
  assert.equal(stored.length, 0);
  const { service: fine } = stubbedService({ q1_1: 'tourism', q1_6: '2027-03-15', q1_7: '2027-04-02' });
  const generated = await fine.generate('admin1', 'x');
  assert.equal(generated.created.source, 'template');
  assert.equal(generated.blocker, null);
});

test('the service refuses a completed application and a draft before anything else, with the fixed code', async () => {
  const { service } = stubbedService({ q1_6: '2027-03-15', q1_7: '2027-04-02' }, 'completed');
  for (const call of [() => service.view('a', 'x'), () => service.generate('a', 'x'), () => service.save('a', 'x', { text: 'x', basedOnVersion: 0 }), () => service.approve('a', 'x', { version: 1 })]) {
    await assert.rejects(call(), (error) => error.statusCode === 409 && error.code === 'ITINERARY_NOT_AVAILABLE');
  }
});

test('the rows the service hands to the audit log hold ids and fixed words only: never a text, whatever the schema would drop', async () => {
  const { service, audit } = stubbedService({ q1_1: 'tourism', q1_5: 'London and Bath', q1_6: '2027-03-15', q1_7: '2027-03-17' });
  await service.view('admin1', 'x');
  await service.generate('admin1', 'x');
  await service.save('admin1', 'x', { text: 'AUDIT-STUB-TEXT written by hand', basedOnVersion: 1 });
  await service.approve('admin1', 'x', { version: 2 });
  assert.deepEqual(audit.map((row) => row.action), ['itinerary_view', 'itinerary_generate', 'itinerary_edit', 'itinerary_approve']);
  const allowed = new Set(['adminId', 'applicationId', 'action', 'at', 'letterVersion', 'letterSource', 'model', 'promptVersion']);
  for (const row of audit) {
    for (const key of Object.keys(row)) assert.ok(allowed.has(key), `${row.action} carries ${key}`);
    assert.equal(/AUDIT-STUB-TEXT|Proposed itinerary|Day 1|London/.test(JSON.stringify(row)), false);
  }
});

// ---------------------------------------------------------------------------
// City and type of stay, never an address; the scrub (the itinerary side)
// ---------------------------------------------------------------------------

test('the worst-case string in 6.7y: the itinerary AI is shown only the type of stay, and "the United Kingdom" is what a missing place becomes', async () => {
  const worst = 'Flat 4, 12 Acacia Road, SW1A 1AA, staying with my host Mr Ahmed Khan, tel 020 7946 0958, ahmed@example.com';
  const answers = base({ q6_7x: 'paid_stay', q6_7y: worst, q1_5: 'Nothing specific.', q5_3: 'Acme' });
  const f = build(answers);
  const made = await run(() => goodAnswer(f, skeletonOf(f)), { answers });
  const shown = JSON.stringify(made.prompts[0]);
  for (const leak of ['Flat 4', 'Acacia', 'SW1A', '1AA', 'Ahmed', 'Khan', 'my host', '020 7946', 'ahmed@', 'example.com']) assert.equal(shown.includes(leak), false, `${leak} was sent to the AI`);
  assert.match(made.prompts[0].user, /Where they will stay in the UK:\n- Plans for accommodation: a paid stay\n/);
  assert.equal(/Area or city they expect to stay in/.test(made.prompts[0].user), false);
  // The template has no city to name: it says the United Kingdom, and the same text passes its own checks.
  const list = buildTemplateDescriptions(f, skeletonOf(f));
  assert.match(list[0], /^Arrive in the United Kingdom/);
  assert.equal(list.some((text) => /Acacia|Khan|London/.test(text)), false);
  assert.equal(checks.validateDescriptions(list, { mode: 'days', named: [], stay: [] }).ok, true);
});

test('a listed place in 6.7y is the city of the stay for the template and for the checks; "Other" is "somewhere else"', async () => {
  const answers = base({ q6_7y: 'Flat 4, 12 Acacia Road, Bath', q6_7x: 'other', q1_5: 'Nothing specific.' });
  const f = build(answers);
  assert.deepEqual(f.values.accommodationArea, ['Bath']);
  assert.match(f.text, /- Plans for accommodation: somewhere else/);
  assert.match(f.text, /- Area or city they expect to stay in: Bath/);
  assert.match(buildTemplateDescriptions(f, skeletonOf(f))[0], /^Arrive in Bath/);
  // An AI that names the city of the stay is accepted; one that names another well-known place is not.
  const made = await run(() => goodAnswer(f, skeletonOf(f), { places: ['Bath'] }), { answers });
  assert.equal(made.result.source, 'ai', made.result.fallbackReason);
  const wrong = await run(() => goodAnswer(f, skeletonOf(f), { places: ['Oxford'] }), { answers });
  assert.equal(wrong.result.fallbackReason, 'ITINERARY_PLACE_NOT_NAMED');
});

test('the scrub reaches the itinerary AI too: a title and a street in the trip description are tokens, and an answer that echoes one is refused', async () => {
  const typed = 'London first, then stay with Mr Ahmed Khan at 12 Acacia Road, then Bath.';
  const answers = base({ q1_5: typed, q6_7y: undefined });
  const f = build(answers);
  const made = await run(() => goodAnswer(f, skeletonOf(f)), { answers });
  assert.equal(made.result.source, 'ai', made.result.fallbackReason);
  for (const leak of ['Ahmed', 'Khan', 'Acacia']) assert.equal(JSON.stringify(made.prompts[0]).includes(leak), false, leak);
  assert.deepEqual(f.places, ['London', 'Bath']);
  const echo = JSON.parse(goodAnswer(f, skeletonOf(f)));
  echo.descriptions[3] = 'Spend the day in London with [R1] and walk through its parks and squares.';
  const refused = await run(() => JSON.stringify(echo), { answers });
  assert.equal(refused.result.fallbackReason, 'ITINERARY_FORBIDDEN_CONTENT');
});

const HASH_COVER_SERVICE = require('../services/touristVisaCoverLetterService').TouristVisaCoverLetterService;
const HASH_ITINERARY_SERVICE = require('../services/touristVisaItineraryService').TouristVisaItineraryService;
const HASH_FACTS = () => ({
  cover: require('../shared/tourist-visa/coverLetterFacts').buildFacts(engine.config, base(), { submittedAt: SUBMITTED }),
  itinerary: require('../shared/tourist-visa/itineraryFacts').buildItineraryFacts(engine.config, base(), { submittedAt: SUBMITTED }),
});

// ---------------------------------------------------------------------------
// The facts hash changed with the facts (keyed hash version 2), so every earlier version shows as stale once
// ---------------------------------------------------------------------------

test('the facts hash is version 2 for the cover letter and the itinerary: a version made under the old hash is stale until a new one is made, once', () => {
  const crypto = require('node:crypto');
  const key = require('../config/fieldEncryption').getFieldEncryptionKey();
  const hmac = (prefix, canonical) => crypto.createHmac('sha256', key).update(`${prefix}${canonical}`).digest('hex');
  const f = HASH_FACTS();
  const cover = new HASH_COVER_SERVICE({ letters: {}, audit: {}, applications: {}, admin: {}, ai: {} });
  const itinerary = new HASH_ITINERARY_SERVICE({ itineraries: {}, audit: {}, applications: {}, admin: {}, ai: {} });
  assert.equal(cover.hash(f.cover), hmac('touristvisacoverletter:facts:v2:', f.cover.canonical));
  assert.equal(itinerary.hash(f.itinerary), hmac('touristvisaitinerary:facts:v2:', f.itinerary.canonical));
  assert.notEqual(cover.hash(f.cover), hmac('touristvisacoverletter:facts:v1:', f.cover.canonical), 'a hash stored by the old code no longer matches');
  assert.notEqual(itinerary.hash(f.itinerary), hmac('touristvisaitinerary:facts:v1:', f.itinerary.canonical));
  // The same facts give the same hash again, so it is stale once and not every time.
  assert.equal(cover.hash(f.cover), cover.hash(HASH_FACTS().cover));
  assert.equal(itinerary.hash(f.itinerary), itinerary.hash(HASH_FACTS().itinerary));
});
