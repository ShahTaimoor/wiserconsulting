'use strict';

// The itinerary built from the applicant's own places of stay (6.7a to 6.7d, the "Place of stay" group): the facts it reads (only the town of
// each address and its two dates), the plan the stays make of the visit (which day belongs to which stay, gaps, touching stays, contradictions), and
// what an older config does. Made-up data only.

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('./engine');
const cover = require('./coverLetterFacts');
const itinerary = require('./itineraryFacts');

const cfg = engine.config;
const SUBMITTED = new Date('2026-11-03T10:00:00Z');
const clone = (o) => JSON.parse(JSON.stringify(o));

const stay = (town, from, to, extra = {}) => ({ q6_7a: 'SECRET-HOTEL-NAME', q6_7b: { line1: 'SECRET-STREET 12', town, postcode: 'SECRET-POSTCODE', country: 'GB' }, q6_7c: from, q6_7d: to, ...extra });
const trip = (accommodation, extra = {}) => ({ q1_1: 'tourism', q1_4: 'holiday', q1_5: 'Nothing specific.', q1_6: '2027-03-15', q1_7: '2027-03-25', q6_7: true, accommodation, ...extra });
const build = (answers, config = cfg) => itinerary.buildItineraryFacts(config, answers, { submittedAt: SUBMITTED });

// ---------------------------------------------------------------------------
// The facts: only the town of each address and its two dates
// ---------------------------------------------------------------------------

test('a stay is read as its town and its two dates, in order; the name of the place and the rest of the address never are', () => {
  const f = build(trip([stay('London', '2027-03-15', '2027-03-18'), stay('Edinburgh', '2027-03-18', '2027-03-22')]));
  assert.deepEqual(f.stays.map((s) => [s.town, s.place, s.from, s.to]), [['London', 'London', '2027-03-15', '2027-03-18'], ['Edinburgh', 'Edinburgh', '2027-03-18', '2027-03-22']]);
  assert.match(f.text, /Stay 1: London, from 15 March 2027 to 18 March 2027/);
  assert.match(f.text, /Stay 2: Edinburgh, from 18 March 2027 to 22 March 2027/);
  for (const secret of ['SECRET-HOTEL-NAME', 'SECRET-STREET', 'SECRET-POSTCODE']) {
    assert.equal(f.text.includes(secret), false, `${secret} is in the facts text`);
    assert.equal(JSON.stringify(f).includes(secret), false, `${secret} is in the facts`);
  }
  assert.equal(f.stayPlan.mode, 'stays');
});

test('the allowlist for the stays reads exactly the gate, the town of the address and the two dates; the name of the place stays excluded', () => {
  const ids = new Set(itinerary.allowedIds());
  for (const id of ['q6_7', 'q6_7b', 'q6_7c', 'q6_7d']) assert.ok(ids.has(id), id);
  assert.equal(ids.has('q6_7a'), false, 'the name of the place of stay is never read');
  assert.deepEqual(itinerary.validateItineraryAllowlist(), []);
  // an address can only be read as its town
  const asValue = { key: 'x', section: 'S', label: 'L', kind: 'value', id: 'q6_7b' };
  assert.ok(itinerary.validateItineraryAllowlist([...itinerary.SPECS, asValue]).some((p) => p.startsWith('q6_7b:')));
  const asName = { key: 'y', section: 'S', label: 'L', kind: 'value', id: 'q6_7a' };
  assert.ok(itinerary.validateItineraryAllowlist([...itinerary.SPECS, asName]).some((p) => p.startsWith('q6_7a:')));
});

test('a town that is not a town, or has no place we can name, gives a stay with no place; it is still a stay (a general block)', () => {
  const f = build(trip([stay('12 Acacia Road, Bath', '2027-03-15', '2027-03-18'), stay('Reading', '2027-03-18', '2027-03-20'), stay('Newcastle upon Tyne', '2027-03-20', '2027-03-22')]));
  assert.deepEqual(f.stays.map((s) => [s.town, s.place]), [[null, null], ['Reading', 'Reading'], ['Newcastle upon Tyne', 'Newcastle']]);
  assert.match(f.text, /Stay 1: place not given, from 15 March 2027/);
  assert.equal(f.text.includes('Acacia'), false, 'the address typed into the town box is not sent');
  assert.equal(f.stayPlan.mode, 'stays');
});

test('with no stay that has a place, the itinerary is built from the trip alone, exactly as before', () => {
  const only = build(trip([stay('12 Acacia Road', '2027-03-15', '2027-03-18')]));
  assert.equal(only.stayPlan.mode, 'trip');
  const none = build(trip([]));
  assert.equal(none.stays.length, 0);
  assert.equal(none.stayPlan.mode, 'trip');
  const no = build(trip([], { q6_7: false, q6_7x: 'paid_stay', q6_7y: 'London' }));
  assert.equal(no.stays.length, 0, '6.7 is No: there are no stays');
  assert.equal(no.stayPlan.mode, 'trip');
  assert.equal(no.text.includes('Stay 1'), false);
});

test('6.7 = No: the facts are exactly the ones they were before stays were read (the same keyed text, so no letter or itinerary goes stale)', () => {
  const answers = trip([], { q6_7: false, q6_7x: 'paid_stay', q6_7y: 'London', q1_5: 'I would like to see London, then Bath.' });
  const without = itinerary.SPECS.filter((spec) => spec.key !== 'stays');
  const before = cover.buildFactsFor(without, itinerary.ITINERARY_RULES, cfg, answers, {
    submittedAt: SUBMITTED,
    derive: ({ values, add }) => { const places = itinerary.placesIn(values.tripDescription); if (places.length) add(itinerary.PLACES_SPEC, places); },
  });
  assert.equal(build(answers).canonical, before.canonical);
  // ... and with stays the facts change (an itinerary written before shows "stale" once)
  const withStays = trip([stay('London', '2027-03-15', '2027-03-20')], { q1_5: 'I would like to see London, then Bath.' });
  const beforeStays = cover.buildFactsFor(without, itinerary.ITINERARY_RULES, cfg, withStays, {
    submittedAt: SUBMITTED,
    derive: ({ values, add }) => { const places = itinerary.placesIn(values.tripDescription); if (places.length) add(itinerary.PLACES_SPEC, places); },
  });
  assert.notEqual(build(withStays).canonical, beforeStays.canonical);
  // and a changed date of a stay changes the facts again
  assert.notEqual(build(trip([stay('London', '2027-03-15', '2027-03-21')])).canonical, build(trip([stay('London', '2027-03-15', '2027-03-20')])).canonical);
});

test('an entry without both dates is not a stay we can place, and the group is read up to its own limit', () => {
  const f = build(trip([stay('London', '2027-03-15', undefined), stay('Oxford', '2027-03-16', '2027-03-18'), { q6_7b: { town: 'Bath', line1: 'x', country: 'GB' }, q6_7c: 'soon', q6_7d: '2027-03-19' }]));
  assert.deepEqual(f.stays.map((s) => s.town), ['Oxford']);
  const many = Array.from({ length: 25 }, (_, i) => stay('London', '2027-03-15', '2027-03-16'));
  assert.equal(build(trip(many)).stays.length, 20, 'the group allows 20 entries');
});

test('a medical visit: the places of stay are read as the towns always were; the purpose, the reason and the trip description are still withheld', () => {
  const f = build(trip([stay('London', '2027-03-15', '2027-03-20')], { q1_1: 'medical', q1_4: undefined, q1_5: 'Treatment in Oxford at SECRET-CLINIC.' }));
  assert.equal(f.stays.length, 1);
  assert.equal(f.text.includes('SECRET-CLINIC'), false);
  assert.equal(f.text.includes('Main reason for the visit'), false);
  assert.deepEqual(f.places, [], 'no place is taken from the trip description of a medical visit');
});

// ---------------------------------------------------------------------------
// The plan: which day belongs to which stay
// ---------------------------------------------------------------------------

const S = (place, from, to) => ({ town: place, place, from, to, fromText: from, toText: to });

test('planStays: no stay with a place is the trip alone; stays come back in date order; the visit dates being unusable is the trip alone too', () => {
  assert.deepEqual(itinerary.planStays([], '2027-03-15', '2027-03-25'), { mode: 'trip' });
  assert.deepEqual(itinerary.planStays(undefined, '2027-03-15', '2027-03-25'), { mode: 'trip' });
  assert.deepEqual(itinerary.planStays([{ town: null, place: null, from: '2027-03-15', to: '2027-03-18' }], '2027-03-15', '2027-03-25'), { mode: 'trip' });
  assert.deepEqual(itinerary.planStays([S('London', '2027-03-15', '2027-03-18')], undefined, '2027-03-25'), { mode: 'trip' });
  assert.deepEqual(itinerary.planStays([S('London', '2027-03-15', '2027-03-18')], '2027-03-25', '2027-03-15'), { mode: 'trip' });
  const plan = itinerary.planStays([S('Edinburgh', '2027-03-20', '2027-03-22'), S('London', '2027-03-15', '2027-03-18')], '2027-03-15', '2027-03-25');
  assert.equal(plan.mode, 'stays');
  assert.deepEqual(plan.stays.map((s) => s.place), ['London', 'Edinburgh']);
});

test('planStays: a stay that leaves before it arrives, starts before the visit, ends after it, or overlaps another is refused with the questions to fix', () => {
  const bad = (stays) => itinerary.planStays(stays, '2027-03-15', '2027-03-25');
  const refused = { mode: 'invalid', questions: ['6.7c', '6.7d'] };
  assert.deepEqual(bad([S('London', '2027-03-18', '2027-03-15')]), refused, 'leaves before it arrives');
  assert.deepEqual(bad([S('London', '2027-03-18', '2027-03-18')]), refused, 'leaves the day it arrives');
  assert.deepEqual(bad([S('London', '2027-03-10', '2027-03-18')]), refused, 'starts before the visit');
  assert.deepEqual(bad([S('London', '2027-03-20', '2027-03-30')]), refused, 'ends after the visit');
  assert.deepEqual(bad([S('London', '2027-03-15', '2027-03-20'), S('Oxford', '2027-03-19', '2027-03-22')]), refused, 'overlaps the one before');
  assert.deepEqual(bad([S('London', '2027-03-15', '2027-03-25'), S('Oxford', '2027-03-20', '2027-03-22')]), refused, 'inside another');
  assert.deepEqual(bad([S('London', '2027-02-30', '2027-03-18')]), refused, 'not a real date');
  assert.equal(bad([S('London', '2027-03-15', '2027-03-18'), S('Oxford', '2027-03-18', '2027-03-25')]).mode, 'stays', 'touching is fine');
  assert.equal(bad([S('London', '2027-03-15', '2027-03-25')]).mode, 'stays', 'one stay for the whole visit');
});

test('stayOnDay: the arrival day, the days between and the leaving day belong to a stay; the day one leaves and the next arrives belongs to the later one; a gap belongs to none', () => {
  const stays = [S('London', '2027-03-15', '2027-03-18'), S('Edinburgh', '2027-03-18', '2027-03-22'), S('Bath', '2027-03-24', '2027-03-25')];
  const on = (day) => { const s = itinerary.stayOnDay(stays, day); return s ? s.place : null; };
  assert.equal(on('2027-03-15'), 'London');
  assert.equal(on('2027-03-17'), 'London');
  assert.equal(on('2027-03-18'), 'Edinburgh', 'the day of the move belongs to the later stay');
  assert.equal(on('2027-03-22'), 'Edinburgh', 'the leaving day of a stay that nothing follows still belongs to it');
  assert.equal(on('2027-03-23'), null, 'a gap');
  assert.equal(on('2027-03-24'), 'Bath');
  assert.equal(on('2027-03-14'), null, 'before the first stay');
  assert.equal(on('2027-03-26'), null, 'after the last');
  assert.equal(itinerary.stayOnDay(stays, 'not a date'), null);
});

test('the grid lines and the date style: "Town, 15 March to 18 March 2027", and the year on both dates when they differ', () => {
  assert.equal(itinerary.stayRange('2027-03-15', '2027-03-18'), '15 March to 18 March 2027');
  assert.equal(itinerary.stayRange('2026-12-28', '2027-01-03'), '28 December 2026 to 3 January 2027');
  assert.deepEqual(itinerary.stayLines([S('London', '2027-03-15', '2027-03-18'), { ...S(null, '2027-03-18', '2027-03-20'), town: null, place: null }]), ['London, 15 March to 18 March 2027', 'Place not given, 18 March to 20 March 2027']);
});

// ---------------------------------------------------------------------------
// Older configs
// ---------------------------------------------------------------------------

test('an older config that lacks a stay question, or the whole group, never stops the itinerary facts from being built', () => {
  const answers = trip([stay('London', '2027-03-15', '2027-03-20')]);
  for (const missing of [['q6_7c'], ['q6_7d'], ['q6_7c', 'q6_7d'], ['q6_7b'], ['q6_7'], ['q6_7x', 'q6_7y'], ['q6_7', 'q6_7a', 'q6_7b', 'q6_7c', 'q6_7d']]) {
    const old = clone(cfg);
    old.questions = old.questions.filter((q) => !missing.includes(q.id));
    if (missing.includes('q6_7')) old.groups = old.groups.filter((g) => g.id !== 'accommodation');
    let f;
    assert.doesNotThrow(() => { f = build(answers, old); }, `without ${missing.join(', ')}`);
    // Without a question the stays need, the trip alone; without only the 6.7 plan questions the stays are still read.
    const needsStays = missing.some((id) => ['q6_7', 'q6_7b', 'q6_7c', 'q6_7d'].includes(id));
    assert.equal(f.stayPlan.mode, needsStays ? 'trip' : 'stays', `without ${missing.join(', ')}`);
    assert.equal(f.raw.arrival, '2027-03-15');
  }
  // The same config, complete, reads the stay: it is the missing question that made the difference
  assert.equal(build(answers).stayPlan.mode, 'stays');
});

test('an older config whose stay questions have different rules is still checked on the stored dates, never trusted', () => {
  const old = clone(cfg);
  for (const id of ['q6_7c', 'q6_7d']) delete old.questions.find((q) => q.id === id).rules; // no inside-the-visit, no after rule
  delete old.groups.find((g) => g.id === 'accommodation').noOverlap;
  const f = build(trip([stay('London', '2027-03-15', '2027-03-20'), stay('Oxford', '2027-03-18', '2027-03-22')]), old);
  assert.equal(f.stays.length, 2, 'both entries are read');
  assert.equal(f.stayPlan.mode, 'invalid', 'the overlap the old rules let through is refused by the plan');
});

test('the real config: the itinerary allowlist is safe, and the facts builder never throws for an application on any of the older configs', () => {
  assert.deepEqual(itinerary.validateItineraryAllowlist(itinerary.SPECS, cfg), []);
  const fewer = clone(cfg);
  fewer.questions = fewer.questions.filter((q) => !['q1_4', 'q6_7x', 'q6_7y'].includes(q.id));
  assert.doesNotThrow(() => build(trip([stay('London', '2027-03-15', '2027-03-20')]), fewer));
});
