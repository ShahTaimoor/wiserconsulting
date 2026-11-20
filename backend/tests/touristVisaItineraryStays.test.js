'use strict';

// The itinerary built from the applicant's own places of stay (6.7a to 6.7d): which place each day (or week) is spent in, gaps and stays that
// touch, the template with no AI, what the AI is shown and what it is allowed to write, contradictory stays, an application on an older config,
// the details grid and the PDF. No database; the service is run for real with a scripted AI (no network). Made-up data only.

process.env.NODE_ENV = 'test';
process.env.FIELD_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../shared/tourist-visa/engine');
const facts = require('../shared/tourist-visa/itineraryFacts');
const { buildSkeleton } = require('../utils/touristVisaItinerarySkeleton');
const checks = require('../utils/touristVisaItineraryChecks');
const { buildTemplateDescriptions, GENERAL_DAYS } = require('../utils/touristVisaItineraryTemplate');
const { buildUserPrompt, SYSTEM_PROMPT } = require('../config/touristVisaItineraryPrompt');
const { TouristVisaItineraryService } = require('../services/touristVisaItineraryService');
const itineraryPdf = require('../utils/touristVisaItineraryPdf');
const { readAiSettings, DEFAULT_GROQ_MODEL } = require('../config/ai');
const { inspectPdf, linesOf } = require('./helpers/pdfInspect');

const SUBMITTED = new Date('2026-11-03T10:00:00Z');
const clone = (o) => JSON.parse(JSON.stringify(o));
const ENV = { AI_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: 'gsk_fake_itinerary_key', NODE_ENV: 'test' };

const stay = (town, from, to, extra = {}) => ({ q6_7a: 'SECRET-HOTEL-NAME', q6_7b: { line1: 'SECRET-STREET 12', town, postcode: 'SECRET-POSTCODE', country: 'GB' }, q6_7c: from, q6_7d: to, q6_7e: 'family', ...extra });
const trip = (accommodation, extra = {}) => ({
  q1_1: 'tourism', q1_4: 'holiday', q1_5: 'Nothing specific.', q1_6: '2027-03-15', q1_7: '2027-03-25', q2_1: 'Test', q2_2: 'Person', q6_7: true, accommodation, ...extra,
});
const build = (answers, config = engine.config) => facts.buildItineraryFacts(config, answers, { submittedAt: SUBMITTED });
const skeletonOf = (f) => buildSkeleton(f.raw.arrival, f.raw.departure, f.stays);
const descriptionsOf = (f, skeleton = skeletonOf(f)) => buildTemplateDescriptions(f, skeleton);
const placeNamed = (text) => facts.placesIn(text).filter((p) => !['England', 'Scotland', 'Wales', 'Northern Ireland'].includes(p));

const TWO = () => trip([stay('London', '2027-03-15', '2027-03-18'), stay('Edinburgh', '2027-03-18', '2027-03-22')]);

// ---------------------------------------------------------------------------
// One stay, two or three stays, touching stays
// ---------------------------------------------------------------------------

test('one stay that covers the whole visit: every day is spent in that place, with no general day', () => {
  const f = build(trip([stay('London', '2027-03-15', '2027-03-25')]));
  const s = skeletonOf(f);
  assert.equal(s.ok, true);
  assert.equal(s.byStays, true);
  assert.equal(s.blocks.length, 11);
  assert.deepEqual(s.blocks.map((b) => b.place), Array(11).fill('London'));
  assert.deepEqual(s.stayPlaces, ['London']);
  const d = descriptionsOf(f, s);
  assert.match(d[0], /^Arrive in London/);
  assert.match(d[10], /^The last day: .*London.* set off on the journey home/);
  // every ordinary day names London, except the one quieter day the template always puts in (it names no place at all)
  for (const line of d.slice(1, 10)) assert.ok(/London/.test(line) || /^A quieter day to rest/.test(line), line);
});

test('two stays: each day takes the place of the stay that covers it, and the day of the move belongs to the later stay (it says to travel and settle in)', () => {
  const f = build(TWO());
  const s = skeletonOf(f);
  assert.deepEqual(s.blocks.slice(0, 8).map((b) => b.place), ['London', 'London', 'London', 'Edinburgh', 'Edinburgh', 'Edinburgh', 'Edinburgh', 'Edinburgh']);
  assert.match(s.blocks[3].heading, /^Day 4, Thursday 18 March 2027$/, 'the day the first stay leaves and the second arrives');
  const d = descriptionsOf(f, s);
  assert.match(d[2], /pack up ready for the move to Edinburgh/, 'the day before the move packs up for it');
  assert.match(d[3], /^Travel to Edinburgh and settle in/, 'the day of the move');
  assert.equal(placeNamed(d[0]).join(), 'London');
  assert.equal(placeNamed(d[4]).join(), 'Edinburgh');
});

test('three stays in date order, however they were typed; a place visited twice is named in order', () => {
  const f = build(trip([stay('Bath', '2027-03-20', '2027-03-22'), stay('London', '2027-03-15', '2027-03-18'), stay('Oxford', '2027-03-18', '2027-03-20')]));
  const s = skeletonOf(f);
  assert.equal(s.ok, true);
  assert.deepEqual(s.stayPlaces, ['London', 'Oxford', 'Bath']);
  assert.deepEqual(s.blocks.slice(0, 8).map((b) => b.place), ['London', 'London', 'London', 'Oxford', 'Oxford', 'Bath', 'Bath', 'Bath']);
  const back = build(trip([stay('London', '2027-03-15', '2027-03-18'), stay('Oxford', '2027-03-18', '2027-03-20'), stay('London', '2027-03-20', '2027-03-22')]));
  assert.deepEqual(skeletonOf(back).stayPlaces, ['London', 'Oxford']);
});

test('touching stays: the leaving day of one is the arrival day of the next, and it is the later stay that owns it', () => {
  const f = build(trip([stay('London', '2027-03-16', '2027-03-19'), stay('York', '2027-03-19', '2027-03-23')]));
  const s = skeletonOf(f);
  const day = (iso) => s.blocks.find((b) => b.start === iso);
  assert.equal(day('2027-03-18').place, 'London');
  assert.equal(day('2027-03-19').place, 'York');
  assert.equal(day('2027-03-19').allowed.includes('London'), true, 'the move day may name the place it leaves (the route)');
  assert.equal(day('2027-03-17').allowed.includes('York'), false, 'but a day well before may not');
});

// ---------------------------------------------------------------------------
// Gaps
// ---------------------------------------------------------------------------

test('gaps at the start, in the middle and at the end read as general days that name no place', () => {
  const f = build(trip([stay('London', '2027-03-17', '2027-03-19'), stay('York', '2027-03-22', '2027-03-23')]));
  const s = skeletonOf(f);
  assert.deepEqual(s.blocks.map((b) => b.place), [null, null, 'London', 'London', 'London', null, null, 'York', 'York', null, null]);
  const d = descriptionsOf(f, s);
  assert.equal(d[0], 'Arrive in the United Kingdom, settle in and take a gentle first look around the area.', 'the arrival day before any stay');
  assert.equal(d[1], GENERAL_DAYS[0]);
  assert.equal(placeNamed(d[1]).length, 0);
  assert.match(d[2], /^Travel to London and settle in/, 'the first day of the first stay after a gap');
  assert.equal(d[5], GENERAL_DAYS[1], 'a day between two stays');
  assert.equal(d[6], GENERAL_DAYS[2]);
  assert.match(d[7], /^Travel to York and settle in/);
  assert.equal(d[9], GENERAL_DAYS[3], 'after the last stay');
  assert.equal(d[10], 'The last day: pack, take a final short walk nearby and set off on the journey home.', 'the last day, no stay covers it');
  for (const i of [0, 1, 5, 6, 9, 10]) assert.equal(placeNamed(d[i]).length, 0, `day ${i + 1} names no place`);
  for (const i of [0, 1, 5, 6, 9, 10]) assert.deepEqual(s.blocks[i].allowed, [], `the AI may name no place on day ${i + 1}`);
});

test('the template with no AI is complete and correct for stays: one description for each heading, and it passes every check the AI has to pass', () => {
  for (const answers of [TWO(), trip([stay('London', '2027-03-15', '2027-03-25')]), trip([stay('London', '2027-03-17', '2027-03-19'), stay('York', '2027-03-22', '2027-03-23')])]) {
    const f = build(answers);
    const s = skeletonOf(f);
    const d = descriptionsOf(f, s);
    assert.equal(d.length, s.blocks.length);
    const checked = checks.validateDescriptions(d.map(checks.britishSpelling), { mode: s.mode, named: s.stayPlaces, stay: [], lastDay: true, distinct: false, dayPlaces: s.blocks.map((b) => b.allowed) });
    assert.equal(checked.ok, true, JSON.stringify(checked));
    const text = checks.assembleItinerary(s.blocks, d);
    assert.match(text, /This is a proposed plan for the visit, and it may change\./);
  }
});

// ---------------------------------------------------------------------------
// Towns: the existing "is this a town" rules, not loosened
// ---------------------------------------------------------------------------

test('a town that is not on our list is used as a plain town; a town that is not a town makes a general block; no usable town is today\'s behaviour exactly', () => {
  const reading = build(trip([stay('Reading', '2027-03-15', '2027-03-20')]));
  assert.equal(skeletonOf(reading).blocks[1].place, 'Reading');
  assert.match(descriptionsOf(reading)[0], /Arrive in Reading/);

  const mixed = build(trip([stay('12 Acacia Road, Bath', '2027-03-15', '2027-03-18'), stay('Oxford', '2027-03-18', '2027-03-21')]));
  const s = skeletonOf(mixed);
  assert.deepEqual(s.blocks.slice(0, 7).map((b) => b.place), [null, null, null, 'Oxford', 'Oxford', 'Oxford', 'Oxford']);
  assert.equal(descriptionsOf(mixed).join('\n').includes('Acacia'), false);

  // No stay has a usable town: the skeleton and the descriptions are exactly those of the trip alone.
  const unusable = build(trip([stay('12 Acacia Road', '2027-03-15', '2027-03-18')], { q1_5: 'I would like to see London, then Bath.' }));
  const alone = build(trip([], { q6_7: false, q6_7x: 'paid_stay', q1_5: 'I would like to see London, then Bath.' }));
  assert.equal(skeletonOf(unusable).byStays, undefined);
  assert.deepEqual(skeletonOf(unusable), buildSkeleton('2027-03-15', '2027-03-25'));
  assert.deepEqual(descriptionsOf(unusable), descriptionsOf(alone));
});

test('6.7 = No: nothing changes (the skeleton has no stays, the template is the old one, the facts have no stays)', () => {
  const f = build(trip([], { q6_7: false, q6_7x: 'paid_stay', q6_7y: 'London', q1_5: 'London then Bath.' }));
  assert.deepEqual(f.stays, []);
  const s = skeletonOf(f);
  assert.deepEqual(s, buildSkeleton('2027-03-15', '2027-03-25'));
  assert.equal(s.byStays, undefined);
  assert.equal(descriptionsOf(f, s).some((line) => /pack up ready for the move to Bath/.test(line)), true, 'the old way: days spread over the places named in the trip description');
});

// ---------------------------------------------------------------------------
// Contradictory data is refused (422), never a crash
// ---------------------------------------------------------------------------

test('stays outside the visit, overlapping, or leaving before they arrive are refused with a fixed code and the questions to fix', () => {
  const refused = (accommodation) => skeletonOf(build(trip(accommodation)));
  const code = { ok: false, code: 'ITINERARY_STAYS_INVALID', questions: ['6.7c', '6.7d'] };
  assert.deepEqual(refused([stay('London', '2027-03-10', '2027-03-18')]), code, 'starts before the visit');
  assert.deepEqual(refused([stay('London', '2027-03-20', '2027-03-28')]), code, 'ends after the visit');
  assert.deepEqual(refused([stay('London', '2027-03-15', '2027-03-20'), stay('Oxford', '2027-03-19', '2027-03-22')]), code, 'overlap');
  assert.deepEqual(refused([stay('London', '2027-03-20', '2027-03-17')]), code, 'leaves before it arrives');
  assert.equal(refused([stay('London', '2027-03-15', '2027-03-20'), stay('Oxford', '2027-03-20', '2027-03-22')]).ok, true, 'touching is fine');
});

function stubbedService(answers, { config = engine.config, ai = {} } = {}) {
  const audit = [];
  const stored = [];
  const prompts = [];
  const application = { _id: 'a'.repeat(24), status: 'submitted', answers, revision: 3, submittedAt: SUBMITTED };
  const settings = readAiSettings(ENV);
  const aiService = {
    unavailable: () => ai.unavailable || null,
    settings: () => settings,
    generate: async (prompt) => {
      prompts.push(prompt);
      const out = await ai.answer(prompt, prompts.length);
      if (out instanceof Error) throw out;
      return { text: out, model: DEFAULT_GROQ_MODEL, provider: 'groq' };
    },
  };
  const service = new TouristVisaItineraryService({
    itineraries: {
      latest: async () => (stored.length ? { version: stored.length, status: 'draft', factsHash: stored[stored.length - 1].factsHash } : null),
      findVersions: async () => stored.map((row) => ({ ...row })).reverse(),
      append: async (row) => { stored.push({ ...row, status: 'draft', createdBy: { id: 'x', name: 'x' } }); },
      countAiRequests: async () => 0,
      approve: async () => true,
    },
    audit: { append: async (rows) => { audit.push(...rows); } },
    applications: { configOf: async () => config },
    admin: { load: async () => application },
    ai: aiService,
  });
  return { service, audit, stored, prompts, application };
}
const NO_AI = { unavailable: 'AI_DISABLED', answer: async () => { throw new Error('the AI must not be asked'); } };

test('contradictory stays through the service: 422 ITINERARY_STAYS_INVALID with the questions, nothing stored, the AI never asked; the view carries the blocker', async () => {
  const { service, stored, prompts, audit } = stubbedService(trip([stay('London', '2027-03-15', '2027-03-20'), stay('Oxford', '2027-03-19', '2027-03-22')]), { ai: NO_AI });
  const view = await service.view('admin1', 'x');
  assert.deepEqual(view.blocker, { code: 'ITINERARY_STAYS_INVALID', questions: ['6.7c', '6.7d'] });
  await assert.rejects(service.generate('admin1', 'x'), (error) => error.statusCode === 422 && error.code === 'ITINERARY_STAYS_INVALID' && JSON.stringify(error.details) === '{"questions":["6.7c","6.7d"]}' && /places of stay cannot make an itinerary/.test(error.message));
  assert.equal(stored.length, 0);
  assert.equal(prompts.length, 0);
  assert.deepEqual(audit.map((row) => row.action), ['itinerary_view'], 'a refused generation is not audited as a generation');
  // a hand-written itinerary can still be saved, as for missing dates
  assert.equal((await service.save('admin1', 'x', { text: 'A hand-written plan.', basedOnVersion: 0 })).latest, 1);
});

test('the 183-night cap: 184 nights is refused as dates (before the stays are looked at); 183 nights with stays gives weekly blocks with places', async () => {
  const long = (to, accommodation) => trip(accommodation, { q1_6: '2027-01-01', q1_7: to });
  const tooLong = build(long('2027-07-04', [stay('London', '2027-01-01', '2027-02-01')]));
  assert.equal(skeletonOf(tooLong).code, 'ITINERARY_DATES_INVALID');
  const f = build(long('2027-07-03', [stay('London', '2027-01-01', '2027-03-01'), stay('York', '2027-03-01', '2027-05-01')]));
  const s = skeletonOf(f);
  assert.equal(s.ok, true);
  assert.equal(s.mode, 'weeks');
  assert.equal(s.nights, 183);
  assert.equal(s.blocks.length, 27);
  assert.equal(s.blocks[0].place, 'London');
  assert.equal(s.blocks[26].place, null, 'the last week is after the last stay');
  const d = descriptionsOf(f, s);
  assert.equal(d.length, 27);
  assert.equal(d.filter((line) => /^Travel to York early in the week/.test(line)).length, 1, 'the week in which the place changes');
  const text = checks.assembleItinerary(s.blocks, d);
  assert.ok(text.length < 8000, 'it still fits the 8000 characters an itinerary may have');
});

test('weekly blocks: a week that spans two stays has the place that covers most of its days, and may name both; every week of a long stay is placed', () => {
  const f = build(trip([stay('London', '2027-03-15', '2027-04-02'), stay('Bath', '2027-04-02', '2027-04-30')], { q1_7: '2027-05-05' }));
  const s = skeletonOf(f);
  assert.equal(s.mode, 'weeks');
  const week = s.blocks.find((b) => b.places.length === 2);
  assert.ok(week, 'one week holds the move');
  assert.deepEqual(week.places, ['London', 'Bath']);
  assert.equal(week.place, 'London', 'four of its seven days are in London (the day of the move belongs to Bath), three in Bath');
  assert.equal(week.start, '2027-03-29');
  assert.equal(s.blocks.every((b) => b.start && b.end), true);
});

// ---------------------------------------------------------------------------
// What the AI is shown, and what it may write
// ---------------------------------------------------------------------------

test('the AI is shown the town and the dates of each stay and the place of each heading, and never the name of a place, an address, a postcode or a host', async () => {
  const f = build(TWO());
  const s = skeletonOf(f);
  const prompt = buildUserPrompt(f.text, s);
  assert.match(prompt, /Stay 1: London, from 15 March 2027 to 18 March 2027/);
  assert.match(prompt, /Stay 2: Edinburgh, from 18 March 2027 to 22 March 2027/);
  assert.match(prompt, /1\. Day 1, Monday 15 March 2027 \(includes the arrival day\) \(in London\)/);
  assert.match(prompt, /4\. Day 4, Thursday 18 March 2027 \(the day of the move: from London to Edinburgh\)/);
  assert.match(prompt, /9\. Day 9, Tuesday 23 March 2027 \(no place applies: keep this day general and name no place\)/);
  for (const secret of ['SECRET-HOTEL-NAME', 'SECRET-STREET', 'SECRET-POSTCODE', 'Test Person']) assert.equal(prompt.includes(secret), false, secret);
  assert.match(SYSTEM_PROMPT, /When the facts list places of stay with dates/);
  // for 6.7 = No the headings carry no place note
  const plain = buildUserPrompt(build(trip([], { q6_7: false, q6_7x: 'paid_stay' })).text, buildSkeleton('2027-03-15', '2027-03-25'));
  assert.equal(/\(in [A-Z]|no place applies/.test(plain), false);
});

test('a medical visit: the AI still gets the stays, never the reason or the trip description', async () => {
  const f = build(trip([stay('London', '2027-03-15', '2027-03-25')], { q1_1: 'medical', q1_4: undefined, q1_5: 'Treatment in Oxford at SECRET-CLINIC.' }));
  const prompt = buildUserPrompt(f.text, skeletonOf(f));
  assert.match(prompt, /Stay 1: London/);
  for (const hidden of ['SECRET-CLINIC', 'Treatment', 'Main reason for the visit']) assert.equal(prompt.includes(hidden), false, hidden);
});

/** One distinct description for each heading, naming only `placeFor(i)` on that day. */
function answerFor(s, placeFor, last = 'Set off on the journey home after a last quiet morning.') {
  const openers = ['Wander through', 'Explore', 'Visit', 'Walk around', 'Stroll along', 'Browse', 'Tour', 'Cross', 'Climb', 'Sit in', 'Follow', 'Discover'];
  const tails = ['the old market and its side streets', 'a well-known museum and its galleries', 'the cathedral close', 'a city park and its lake path', 'the castle walls', 'a historic street of small shops', 'the riverside path', 'a famous abbey', 'the central library', 'a botanical garden', 'the old harbour', 'the university lanes'];
  return JSON.stringify({ descriptions: s.blocks.map((b, i) => (i === s.blocks.length - 1 ? last : `${openers[i]} ${tails[i]}${placeFor(i) ? ` in ${placeFor(i)}` : ''}.`)) });
}

test('an AI answer that follows the stays is accepted; one that names a place that is not a stay, a stay on the wrong day, or any place on a general day is rejected, asked once more, then the template is used', async () => {
  const f = build(TWO());
  const s = skeletonOf(f);
  const place = (i) => s.blocks[i].place;
  const good = answerFor(s, place);
  const accepted = stubbedService(TWO(), { ai: { answer: async () => good } });
  const made = await accepted.service.generate('admin1', 'x');
  assert.equal(made.created.source, 'ai');
  assert.equal(accepted.prompts.length, 1);

  const cases = {
    'a place that is not a stay': answerFor(s, (i) => (i === 1 ? 'Oxford' : place(i))),
    'a stay on the wrong day': answerFor(s, (i) => (i === 1 ? 'Edinburgh' : place(i))),
    'a place on a general day': answerFor(s, (i) => (i === 9 ? 'London' : place(i))),
  };
  for (const [name, bad] of Object.entries(cases)) {
    const rejected = stubbedService(TWO(), { ai: { answer: async () => bad } });
    const out = await rejected.service.generate('admin1', 'x');
    assert.equal(out.created.source, 'template', name);
    assert.equal(out.created.fallbackReason, 'ITINERARY_PLACE_NOT_NAMED', name);
    assert.equal(rejected.prompts.length, 2, `${name}: asked once more`);
  }
});

test('the AI may name the place a traveller leaves on the day of the move (the route), but not on a day well before it', () => {
  const f = build(TWO());
  const s = skeletonOf(f);
  const route = answerFor(s, (i) => s.blocks[i].place);
  const parsed = JSON.parse(route).descriptions;
  parsed[3] = 'Travel from London to Edinburgh and settle in, then walk around the old streets.';
  const ok = checks.validateDescriptions(parsed, { mode: s.mode, named: s.stayPlaces, stay: [], lastDay: true, distinct: true, dayPlaces: s.blocks.map((b) => b.allowed) });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const early = [...parsed];
  early[1] = 'Journey from London to Edinburgh early and look around the old streets there.';
  assert.equal(checks.validateDescriptions(early, { mode: s.mode, named: s.stayPlaces, stay: [], lastDay: true, distinct: true, dayPlaces: s.blocks.map((b) => b.allowed) }).code, 'ITINERARY_PLACE_NOT_NAMED');
});

test('every existing check still runs on an itinerary built from stays (a digit, a hotel, a booking, a marketing word, a repeated sentence)', async () => {
  const f = build(TWO());
  const s = skeletonOf(f);
  const base = JSON.parse(answerFor(s, (i) => s.blocks[i].place)).descriptions;
  const withLine = (i, text) => JSON.stringify({ descriptions: base.map((d, j) => (j === i ? text : d)) });
  const bad = {
    ITINERARY_FORBIDDEN_CONTENT: withLine(1, 'Visit the old market in London on day 2 of the stay.'),
    ITINERARY_BANNED_PHRASE: withLine(1, 'Check in to the hotel in London and then explore the old market.'),
  };
  for (const [code, answer] of Object.entries(bad)) {
    const { service } = stubbedService(TWO(), { ai: { answer: async () => answer } });
    const out = await service.generate('admin1', 'x');
    assert.equal(out.created.source, 'template');
    assert.equal(out.created.fallbackReason, code);
  }
  const repeated = JSON.stringify({ descriptions: base.map((d, j) => (j === 2 ? base[1] : d)) });
  const { service } = stubbedService(TWO(), { ai: { answer: async () => repeated } });
  assert.equal((await service.generate('admin1', 'x')).created.source, 'template');
});

// ---------------------------------------------------------------------------
// The template with no AI, through the service
// ---------------------------------------------------------------------------

test('with the AI off, the service writes a complete itinerary from the stays and stores it', async () => {
  const { service, stored, prompts } = stubbedService(TWO(), { ai: NO_AI });
  const out = await service.generate('admin1', 'x');
  assert.equal(out.created.source, 'template');
  assert.equal(prompts.length, 0);
  const text = stored[0].text;
  assert.match(text, /Day 1, Monday 15 March 2027\nArrive in London/);
  assert.match(text, /Day 4, Thursday 18 March 2027\nTravel to Edinburgh and settle in/);
  assert.match(text, /Day 11, Thursday 25 March 2027\nThe last day: pack, take a final short walk nearby and set off on the journey home\./);
  assert.equal(out.blocker, null);
});

// ---------------------------------------------------------------------------
// Older configs
// ---------------------------------------------------------------------------

test('an application on an older config never gets ITINERARY_UNAVAILABLE: a config without the stay questions, or with other rules, still makes an itinerary', async () => {
  for (const missing of [['q6_7c'], ['q6_7d'], ['q6_7', 'q6_7a', 'q6_7b', 'q6_7c', 'q6_7d'], ['q6_7x', 'q6_7y']]) {
    const old = clone(engine.config);
    old.version = '1.0.0';
    old.questions = old.questions.filter((q) => !missing.includes(q.id));
    if (missing.includes('q6_7')) old.groups = old.groups.filter((g) => g.id !== 'accommodation');
    const { service, stored } = stubbedService(TWO(), { config: old, ai: NO_AI });
    const out = await service.generate('admin1', 'x');
    assert.equal(out.created.source, 'template', `without ${missing.join(', ')}`);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].text.includes('Day 1, Monday 15 March 2027'), true);
  }
  // other rules on the stay dates: the overlap the old rules let through is refused by the stored-date check, not trusted
  const lax = clone(engine.config);
  for (const id of ['q6_7c', 'q6_7d']) delete lax.questions.find((q) => q.id === id).rules;
  delete lax.groups.find((g) => g.id === 'accommodation').noOverlap;
  const overlapping = stubbedService(trip([stay('London', '2027-03-15', '2027-03-20'), stay('Oxford', '2027-03-19', '2027-03-22')]), { config: lax, ai: NO_AI });
  await assert.rejects(overlapping.service.generate('admin1', 'x'), (error) => error.statusCode === 422 && error.code === 'ITINERARY_STAYS_INVALID');
});

// ---------------------------------------------------------------------------
// Stale
// ---------------------------------------------------------------------------

test('an itinerary written before stays were read shows "stale" once (the facts changed), cannot be approved as it is, and a new version is not stale', async () => {
  const { service, stored } = stubbedService(TWO(), { ai: NO_AI });
  // the facts as they were before: the same specs without the stays
  const without = facts.SPECS.filter((spec) => spec.key !== 'stays');
  const cover = require('../shared/tourist-visa/coverLetterFacts');
  const before = cover.buildFactsFor(without, facts.ITINERARY_RULES, engine.config, TWO(), {
    submittedAt: SUBMITTED,
    derive: ({ values, add }) => { const places = facts.placesIn(values.tripDescription); if (places.length) add(facts.PLACES_SPEC, places); },
  });
  stored.push({ version: 1, status: 'approved', text: 'Proposed itinerary\n\nOld text.', source: 'template', factsHash: service.hash({ canonical: before.canonical }), createdBy: { id: 'x', name: 'x' } });
  const view = await service.view('admin1', 'x');
  assert.equal(view.stale, true, 'the banner shows');
  await assert.rejects(service.approve('admin1', 'x', { version: 1 }), (error) => error.code === 'ALREADY_APPROVED' || error.code === 'ITINERARY_STALE');
  assert.equal(await service.isStale({ _id: 'a'.repeat(24), status: 'submitted', answers: TWO(), submittedAt: SUBMITTED }, stored[0]), true, 'the PDF is then printed as a draft');

  const generated = await service.generate('admin1', 'x');
  assert.equal(generated.stale, false, 'a new version is made from the current facts');
  assert.equal(generated.latest, 2);
});

test('the PDF of a stale approved itinerary is a draft with the banner, as for any answer that changed', () => {
  const model = itineraryPdf.buildItineraryModel({ text: 'Proposed itinerary\n\nThis is a proposed plan for the visit, and it may change.\n\nDay 1, Monday 15 March 2027\nArrive in London and settle in, then take a gentle first look around.', reference: 'TV-K7M3QD9R', applicantName: 'Test Person', details: [], draft: true, stale: true });
  assert.equal(model.draft, true);
  assert.equal(model.stale, true);
});

// ---------------------------------------------------------------------------
// The details grid and the PDF
// ---------------------------------------------------------------------------

test('the details grid lists each stay as "Town, 15 March to 18 March 2027" from our own data, and the places in order as the destination', () => {
  const details = itineraryPdf.detailsOf(build(TWO()), 'Test Person');
  const by = Object.fromEntries(details.map((d) => [d.label, d]));
  assert.equal(by.Destination.value, 'London, Edinburgh');
  assert.deepEqual(by.Staying.items, ['London, 15 March to 18 March 2027', 'Edinburgh, 18 March to 22 March 2027']);
  assert.equal(by.Staying.wide, true, 'the stays have a row of their own, the full width');
  assert.equal(by.Arrival.value, '15 March 2027');
  assert.equal(by.Departure.value, '25 March 2027');
  // a stay with no usable town, and a year change
  const odd = itineraryPdf.detailsOf(build(trip([stay('12 Acacia Road', '2026-12-28', '2027-01-03'), stay('Oxford', '2027-01-03', '2027-01-05')], { q1_6: '2026-12-28', q1_7: '2027-01-08' })), 'Test Person');
  assert.deepEqual(odd.find((d) => d.label === 'Staying').items, ['Place not given, 28 December 2026 to 3 January 2027', 'Oxford, 3 January to 5 January 2027']);
  // more than eight stays: eight, then a count
  const many = Array.from({ length: 10 }, (_, i) => stay('Oxford', `2027-03-${String(15 + i).padStart(2, '0')}`, `2027-03-${String(16 + i).padStart(2, '0')}`));
  const long = itineraryPdf.detailsOf(build(trip(many, { q1_7: '2027-03-30' })), 'Test Person').find((d) => d.label === 'Staying');
  assert.equal(long.items.length, 9);
  assert.equal(long.items[8], 'and 2 more');
  // 6.7 = No: the row is what it always was
  const no = itineraryPdf.detailsOf(build(trip([], { q6_7: false, q6_7x: 'paid_stay', q6_7y: 'London', q1_5: 'London then Bath.' })), 'Test Person');
  assert.equal(no.find((d) => d.label === 'Staying').value, 'A paid stay');
  assert.equal(no.find((d) => d.label === 'Staying').items, undefined);
  assert.equal(no.find((d) => d.label === 'Destination').value, 'London, Bath');
});

test('the PDF of a stay-based itinerary prints the stays in the grid and a block for every day, laid out by the same planner', async () => {
  const f = build(TWO());
  const s = skeletonOf(f);
  const text = checks.assembleItinerary(s.blocks, descriptionsOf(f, s));
  const model = itineraryPdf.buildItineraryModel({ text, reference: 'TV-K7M3QD9R', applicantName: 'Test Person', details: itineraryPdf.detailsOf(f, 'Test Person'), draft: false });
  assert.equal(itineraryPdf.unprintableIn(model), null);
  const plan = itineraryPdf.planItinerary(model);
  assert.equal(plan.pages.reduce((sum, page) => sum + page.count, 0), 11, 'every day is placed');
  const pdf = await inspectPdf(await itineraryPdf.renderItineraryPdf(model));
  const all = pdf.pages.map((page) => linesOf(page.items.filter((i) => i.angle === 0)).map((l) => l.text || l).join(' ')).join('\n');
  assert.match(all, /London, 15 March to 18 March 2027/);
  assert.match(all, /Edinburgh, 18 March to 22 March 2027/);
  // each stay is one line of text, not broken across two lines of a narrow cell
  const items = pdf.pages[0].items.map((i) => i.str);
  assert.ok(items.includes('London, 15 March to 18 March 2027'));
  assert.ok(items.includes('Edinburgh, 18 March to 22 March 2027'));
  assert.match(all, /Travel to Edinburgh and settle in/);
  assert.match(all, /This is a proposed plan for the visit, and it may change\./);
});

test('a long stay with stays still flows to the weekly blocks the planner always laid out', async () => {
  const f = build(trip([stay('London', '2027-03-15', '2027-04-10'), stay('York', '2027-04-10', '2027-05-01')], { q1_7: '2027-05-05' }));
  const s = skeletonOf(f);
  assert.equal(s.mode, 'weeks');
  const text = checks.assembleItinerary(s.blocks, descriptionsOf(f, s));
  const model = itineraryPdf.buildItineraryModel({ text, reference: 'TV-K7M3QD9R', applicantName: 'Test Person', details: itineraryPdf.detailsOf(f, 'Test Person'), draft: false });
  const plan = itineraryPdf.planItinerary(model);
  assert.equal(plan.pages.reduce((sum, page) => sum + page.count, 0), s.blocks.length);
  assert.ok((await itineraryPdf.renderItineraryPdf(model)).length > 1000);
});
