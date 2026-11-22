'use strict';

// Config 1.6.0, the questions for the itinerary: "Do you already know which places you will visit?" (10.28) with its group of places (10.28a to 10.28c,
// section 10E), and "Who are you staying with?" (6.7e) in the Place of stay group. Run with: node --test shared/tourist-visa/plannedPlaces.test.js
// Made-up data only.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const z = require(require.resolve('zod', { paths: [path.join(__dirname, '..', '..', 'backend')] }));
const engine = require('./engine');
const view = require('./view');
const cover = require('./coverLetterFacts');
const itinerary = require('./itineraryFacts');
const places = require('./places');

const { config } = engine;
const clone = (o) => JSON.parse(JSON.stringify(o));
const SUBMITTED = new Date('2026-11-03T10:00:00Z');
const validate = (sectionId, incoming, existing = TRIP) => engine.validateSection(z, config, sectionId, incoming, existing, { today: '2026-10-28' });

// Section 1 as saved: arrive 2027-03-01, leave 2027-03-15. 6.7 is No, which is what opens the new section.
const TRIP = { q1_6: '2027-03-01', q1_7: '2027-03-15', q6_7: false };
const place = (name, from, to, extra = {}) => ({ q10_28a: name, q10_28b: from, q10_28c: to, ...extra });
const planned = (...entries) => ({ q10_28: true, plannedPlaces: entries });
const other = (text, from = '2027-03-01', to = '2027-03-05') => place('other', from, to, { q10_28a_other: text });

// ---------------------------------------------------------------------------
// The section: where it is and when it shows
// ---------------------------------------------------------------------------

test('the new section is the second-last one, the documents section is still last, and no existing section or question id moved', () => {
  const ids = config.sections.map((s) => s.id);
  assert.deepEqual(ids.slice(-4), ['10C', '10F', '10E', '10D']); // 10F, the bank activity (config 1.7.0), came after this section
  assert.equal(ids[ids.length - 1], '10D');
  assert.equal(ids[ids.length - 2], '10E');
  assert.equal(config.sections.find((s) => s.id === '10E').title, 'Your plans in the UK');
  assert.equal(config.sections.find((s) => s.id === '10E').part, '10');
  // Every id of section 10D and of every other section is where it was: the numbers of the older questions are untouched.
  const documents = config.questions.filter((q) => q.section === '10D' && !q.otherOf).map((q) => q.number);
  assert.ok(documents.includes('10.6') && documents.includes('10.7') && documents.includes('10.27'), 'the document questions keep their numbers');
  assert.equal(engine.getQuestion(config, 'q6_7d').number, '6.7d');
  assert.equal(engine.getQuestion(config, 'q6_7y').number, '6.7y');
  assert.deepEqual(config.questions.filter((q) => q.section === '10E' && !q.otherOf).map((q) => q.number), ['10.28', '10.28a', '10.28b', '10.28c']);
});

test('the questions of the new section sit together in the list, right before the document questions (nothing of 10D is split)', () => {
  const sectionOrder = config.questions.map((q) => q.section);
  const runs = sectionOrder.filter((id, i) => id !== sectionOrder[i - 1]);
  assert.equal(runs.filter((id) => id === '10E').length, 1, '10E is one run of questions');
  assert.equal(runs.filter((id) => id === '10D').length, 1, '10D is one run of questions');
  assert.deepEqual(runs.slice(-4), ['10C', '10F', '10E', '10D']);
});

test('6.7 Yes hides the whole new section; 6.7 No shows it, and the planned places only after "Yes"', () => {
  const visible = (answers) => engine.getVisibleQuestions(config, '10E', answers).map((q) => q.id).filter((id) => !id.endsWith('_other'));
  assert.deepEqual(visible({ q6_7: true }), []);
  assert.deepEqual(visible({}), [], 'before 6.7 is answered there is nothing to ask');
  assert.equal(engine.isSectionVisible(config, '10E', { q6_7: true }), false);
  assert.equal(engine.isSectionVisible(config, '10E', {}), false);
  assert.equal(engine.isSectionVisible(config, '10E', { q6_7: false }), true);
  assert.deepEqual(visible({ q6_7: false }), ['q10_28']);
  assert.deepEqual(visible({ q6_7: false, q10_28: false }), ['q10_28']);
  assert.deepEqual(visible({ q6_7: false, q10_28: true }), ['q10_28', 'q10_28a', 'q10_28b', 'q10_28c']);
  assert.equal(engine.getVisibleSections(config, { q6_7: true }).some((s) => s.id === '10E'), false);
});

test('6.7y (which area or city) is the fallback: shown with 6.7 No and no planned places, hidden once the places are known and with 6.7 Yes', () => {
  const shown = (answers) => engine.isVisible(config, 'q6_7y', answers);
  assert.equal(shown({ q6_7: false }), true, 'planned places not answered yet');
  assert.equal(shown({ q6_7: false, q10_28: false }), true);
  assert.equal(shown({ q6_7: false, q10_28: true }), false);
  assert.equal(shown({ q6_7: true }), false);
  // It stays optional and is not required just because it is shown.
  assert.equal(engine.getQuestion(config, 'q6_7y').required, false);
});

test('required fields: the Yes/No is required with 6.7 No; a Yes needs at least one place, and each place needs all three answers', () => {
  assert.equal(validate('10E', {}).errors.q10_28, 'This question is required');
  assert.equal(validate('10E', { q10_28: false }).success, true);
  assert.equal(validate('10E', { q10_28: true }).errors.plannedPlaces, 'Add at least one entry');
  const blank = validate('10E', { q10_28: true, plannedPlaces: [{}] });
  assert.deepEqual(Object.keys(blank.errors).sort(), ['plannedPlaces.0.q10_28a', 'plannedPlaces.0.q10_28b', 'plannedPlaces.0.q10_28c']);
  assert.equal(validate('10E', planned(place('London', '2027-03-01', '2027-03-05'))).success, true);
  for (const q of ['q10_28a', 'q10_28b', 'q10_28c']) {
    const entry = place('London', '2027-03-01', '2027-03-05');
    delete entry[q];
    assert.equal(validate('10E', planned(entry)).errors[`plannedPlaces.0.${q}`], 'This question is required', q);
  }
});

test('the section is empty and not required while 6.7 is Yes: nothing is asked and nothing is stored', () => {
  const r = validate('10E', {}, { ...TRIP, q6_7: true });
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.deepEqual(r.data, {});
  const withJunk = validate('10E', { q10_28: true, plannedPlaces: [place('London', '2027-03-01', '2027-03-02')] }, { ...TRIP, q6_7: true });
  assert.equal(withJunk.success, true);
  assert.deepEqual(withJunk.data, {}, 'the hidden answers are not kept');
});

// ---------------------------------------------------------------------------
// The place: the list, and Other
// ---------------------------------------------------------------------------

test('the place list is the 93 places of the fixed list, A to Z, then nothing else; Other is added and shown FIRST', () => {
  const options = engine.resolveOptions(config, 'q10_28a', {}, {});
  assert.equal(options[0].value, 'other');
  assert.equal(options[0].label, 'Other (please write)');
  const rest = options.slice(1);
  assert.equal(rest.length, places.PLACES.length);
  assert.deepEqual(rest.map((o) => o.value), [...places.PLACES].sort((a, b) => a.localeCompare(b, 'en')));
  assert.deepEqual(rest.map((o) => o.label), rest.map((o) => o.value));
  assert.equal(new Set(rest.map((o) => o.value)).size, rest.length, 'no place twice');
});

test('a place from the list is accepted, and a value that is not on the list is refused', () => {
  assert.equal(validate('10E', planned(place('Bath', '2027-03-01', '2027-03-04'))).success, true);
  assert.equal(validate('10E', planned(place('Atlantis', '2027-03-01', '2027-03-04'))).errors['plannedPlaces.0.q10_28a'], 'Choose from the listed options');
});

test('an Other place: the box is asked for, labelled for a town or city, up to 100 characters, and a list place drops it', () => {
  const box = engine.getQuestion(config, 'q10_28a_other');
  assert.equal(box.label, 'Name of the town or city');
  assert.equal(box.number, '10.28a');
  assert.equal(box.group, 'plannedPlaces');
  assert.equal(box.rules.maxLen, 100);
  assert.equal(box.rules.townName, true);
  assert.deepEqual(box.showWhen, { q: 'q10_28a', eq: 'other' });
  assert.equal(validate('10E', planned(place('other', '2027-03-01', '2027-03-04'))).errors['plannedPlaces.0.q10_28a_other'], 'This question is required');
  assert.equal(validate('10E', planned(other('Stoke on Trent'))).success, true);
  const dropped = validate('10E', planned(place('London', '2027-03-01', '2027-03-04', { q10_28a_other: 'Stoke on Trent' })));
  assert.equal(dropped.success, true);
  assert.equal(dropped.data.plannedPlaces[0].q10_28a_other, undefined, 'the written text is dropped when a list place is chosen');
});

test('the server enforces the town check on a written place: digits, an address, a hotel word, HTML, commas and brackets are refused with the plain message', () => {
  const MESSAGE = 'Write only the name of a town or city';
  const refused = (text) => validate('10E', planned(other(text))).errors['plannedPlaces.0.q10_28a_other'];
  assert.equal(refused('Bristol 2'), MESSAGE, 'a digit');
  assert.equal(refused('12 Acacia Avenue'), MESSAGE, 'an address');
  assert.equal(refused('Oxford Street'), MESSAGE, 'a street');
  assert.equal(refused('Hilton Hotel'), MESSAGE, 'a hotel word');
  assert.equal(refused('Premier Inn London'), MESSAGE, 'a hotel');
  assert.equal(refused('<b>Bath</b>'), 'Do not use the < or > characters', 'HTML is refused by the box rule');
  assert.equal(refused('London, UK'), MESSAGE, 'a comma');
  assert.equal(refused('Bath (UK)'), MESSAGE, 'a bracket');
  assert.equal(refused('The Royal Borough Of Kensington'), MESSAGE, 'more than three words');
  assert.equal(refused('A'), MESSAGE, 'one letter');
  assert.equal(refused('x'.repeat(101)), 'Must be 100 characters or fewer', 'a long text is never accepted');
  assert.equal(refused('x'.repeat(41)), MESSAGE, 'a long single word is not a town either');
  for (const ok of ['Bristol', 'Stoke on Trent', 'Weston super Mare', "Bishop's Stortford", 'Royal Leamington Spa', 'Hampton Court']) assert.equal(refused(ok), undefined, ok);
});

test('the town check is the same one the itinerary makes again: places.isTownName', () => {
  for (const text of ['Bristol', 'Stoke on Trent', 'Hampton Court']) assert.equal(places.isTownName(text), true, text);
  for (const text of ['', '  ', 'London 2', 'Flat Four', 'Hotel Rio', '<i>x</i>', 'A', undefined, null, 5]) assert.equal(places.isTownName(text), false, String(text));
});

// ---------------------------------------------------------------------------
// The dates
// ---------------------------------------------------------------------------

test('the dates: inside the visit (1.6 to 1.7), leave on or after arrival, both end days allowed', () => {
  const check = (from, to) => validate('10E', planned(place('London', from, to))).errors;
  assert.deepEqual(check('2027-03-01', '2027-03-15'), {}, 'the whole visit');
  assert.deepEqual(check('2027-03-05', '2027-03-05'), {}, 'a day trip: leave the day you arrive');
  assert.equal(check('2027-02-28', '2027-03-05')['plannedPlaces.0.q10_28b'], 'Must be on or after the date in question 1.6');
  assert.equal(check('2027-03-02', '2027-03-16')['plannedPlaces.0.q10_28c'], 'Must be on or before the date in question 1.7');
  assert.equal(check('2027-03-16', '2027-03-20')['plannedPlaces.0.q10_28b'], 'Must be on or before the date in question 1.7');
  assert.equal(check('2027-03-06', '2027-03-05')['plannedPlaces.0.q10_28c'], 'Must be on or after the date in question 10.28b');
});

test('overlap: two places may touch on a day or leave a gap, but may not overlap, whatever order they are in', () => {
  const errors = (...ranges) => validate('10E', planned(...ranges.map(([a, b]) => place('London', a, b)))).errors;
  assert.deepEqual(errors(['2027-03-01', '2027-03-05'], ['2027-03-05', '2027-03-09']), {}, 'touching');
  assert.deepEqual(errors(['2027-03-01', '2027-03-05'], ['2027-03-07', '2027-03-09']), {}, 'a gap');
  assert.deepEqual(errors(['2027-03-07', '2027-03-09'], ['2027-03-01', '2027-03-05']), {}, 'order does not matter');
  const overlap = 'Overlaps the dates of Place you will visit 1';
  assert.equal(errors(['2027-03-01', '2027-03-06'], ['2027-03-05', '2027-03-09'])['plannedPlaces.1.q10_28b'], overlap);
  assert.equal(errors(['2027-03-05', '2027-03-09'], ['2027-03-01', '2027-03-06'])['plannedPlaces.1.q10_28b'], overlap);
  assert.equal(errors(['2027-03-01', '2027-03-10'], ['2027-03-03', '2027-03-04'])['plannedPlaces.1.q10_28b'], overlap, 'inside another');
});

test('the trip-date rules wait until section 1 has been saved', () => {
  const body = planned(place('London', '2030-01-01', '2030-01-09'));
  assert.equal(validate('10E', body, { q6_7: false }).success, true);
  assert.equal(validate('10E', body).success, false);
});

test('the cap: ten places are accepted and an eleventh is refused', () => {
  const day = (n) => `2027-03-${String(n).padStart(2, '0')}`;
  const ten = Array.from({ length: 10 }, (_, i) => place('London', day(i + 1), day(i + 1)));
  assert.equal(validate('10E', planned(...ten)).success, true);
  const eleven = [...ten, place('Bath', day(11), day(11))];
  const r = validate('10E', planned(...eleven));
  assert.equal(r.success, false);
  assert.match(r.errors.plannedPlaces, /10/);
});

// ---------------------------------------------------------------------------
// Who they stay with (6.7e)
// ---------------------------------------------------------------------------

const STAY = { q6_7a: 'Test Hotel', q6_7b: { line1: '2 Test Road', town: 'Testtown', country: 'GB' }, q6_7c: '2027-03-01', q6_7d: '2027-03-08', q6_7e: 'family' };
const stays = (...entries) => ({ q6_7: true, accommodation: entries });
const validateStay = (body) => validate('6C', body, { q1_6: '2027-03-01', q1_7: '2027-03-15' });

test('6.7e: a required list inside the Place of stay group, with the Other mechanism; each choice is accepted', () => {
  const q = engine.getQuestion(config, 'q6_7e');
  assert.equal(q.label, 'Who are you staying with?');
  assert.equal(q.required, true);
  assert.equal(q.group, 'accommodation');
  assert.deepEqual(config.groups.find((g) => g.id === 'accommodation').questions, ['q6_7a', 'q6_7b', 'q6_7c', 'q6_7d', 'q6_7e', 'q6_7e_other']);
  assert.deepEqual(q.options.map((o) => o.value), ['paid_stay', 'family', 'friends', 'other']);
  const { q6_7e, ...without } = STAY;
  assert.equal(validateStay(stays(without)).errors['accommodation.0.q6_7e'], 'This question is required');
  for (const choice of ['paid_stay', 'family', 'friends']) assert.equal(validateStay(stays({ ...STAY, q6_7e: choice })).success, true, choice);
  assert.equal(validateStay(stays({ ...STAY, q6_7e: 'strangers' })).errors['accommodation.0.q6_7e'], 'Choose from the listed options');
});

test('6.7e Other: the box is required, up to 100 characters, shown under the question, and dropped for the other choices', () => {
  assert.equal(validateStay(stays({ ...STAY, q6_7e: 'other' })).errors['accommodation.0.q6_7e_other'], 'This question is required');
  assert.equal(validateStay(stays({ ...STAY, q6_7e: 'other', q6_7e_other: 'A made-up host' })).success, true);
  assert.equal(validateStay(stays({ ...STAY, q6_7e: 'other', q6_7e_other: 'x'.repeat(101) })).errors['accommodation.0.q6_7e_other'], 'Must be 100 characters or fewer');
  const dropped = validateStay(stays({ ...STAY, q6_7e: 'family', q6_7e_other: 'ignored' }));
  assert.equal(dropped.data.accommodation[0].q6_7e_other, undefined);
  const box = engine.getQuestion(config, 'q6_7e_other');
  assert.equal(config.questions[config.questions.indexOf(engine.getQuestion(config, 'q6_7e')) + 1], box, 'the box comes right after the question');
  assert.equal(box.label, 'Please write your answer', 'a plain text box (no town rule)');
  assert.equal(box.rules.townName, undefined);
});

// ---------------------------------------------------------------------------
// Other is first in the new lists and last in the existing ones
// ---------------------------------------------------------------------------

test('Other is the first option of the two new lists, and still the last option of every existing list that allows it', () => {
  for (const id of ['q6_7e', 'q10_28a']) {
    const options = engine.resolveOptions(config, id, {}, {});
    assert.equal(options[0].value, 'other', `${id}: Other is first`);
    assert.equal(options.filter((o) => o.value === 'other').length, 1, id);
  }
  assert.deepEqual(engine.resolveOptions(config, 'q6_7e', {}, {}).map((o) => o.value), ['other', 'paid_stay', 'family', 'friends']);
  const existing = config.questions.filter((q) => q.allowOther && !['q6_7e', 'q10_28a'].includes(q.id));
  assert.equal(existing.length, 19, 'the 18 of config 1.4.0 and 10.37e (config 1.7.0), none of which has a position setting');
  assert.equal(existing.filter((q) => engine.resolveOptions(config, q.id, {}, {})[0].value === 'other').length, 0, 'none of them starts with Other');
  assert.equal(existing.filter((q) => { const o = engine.resolveOptions(config, q.id, {}, {}); return o[o.length - 1].value === 'other'; }).length >= 18, true, 'Other is still last in them');
  for (const q of existing) {
    assert.equal(q.otherPosition, undefined, `${q.id} has no position setting`);
    // Exactly the list as it is written in the config (the Other option where it was put, which for most is last): the engine moves nothing.
    assert.deepEqual(engine.resolveOptions(config, q.id, {}, {}).map((o) => o.value), q.options.map((o) => o.value), `${q.id}: the list is as written`);
  }
});

test('otherPosition is a generic setting: "first" moves Other up, "last" and nothing leave the list as written, and a bad value is refused', () => {
  const c = clone(config);
  const q = c.questions.find((x) => x.id === 'q1_1');
  const asWritten = engine.resolveOptions(engine.expandOther(c), 'q1_1', {}, {}).map((o) => o.value);
  q.otherPosition = 'first';
  assert.equal(engine.resolveOptions(c, 'q1_1', {}, {})[0].value, 'other');
  assert.deepEqual(engine.resolveOptions(c, 'q1_1', {}, {}).slice(1).map((o) => o.value), asWritten.filter((v) => v !== 'other'));
  q.otherPosition = 'last';
  assert.deepEqual(engine.resolveOptions(c, 'q1_1', {}, {}).map((o) => o.value), asWritten);
  q.otherPosition = 'middle';
  assert.ok(engine.validateConfig(c).some((p) => /otherPosition must be "first" or "last"/.test(p)));
  q.otherPosition = 'first';
  delete q.allowOther;
  assert.ok(engine.validateConfig(clone(c)).some((p) => /otherPosition is only for a question that allows Other/.test(p)));
});

// ---------------------------------------------------------------------------
// Answers that stop applying
// ---------------------------------------------------------------------------

test('switching 6.7: answers of the questions that become hidden are dropped by the usual rule', () => {
  const answers = { ...TRIP, q10_28: true, plannedPlaces: [place('Bath', '2027-03-01', '2027-03-04')], q6_7y: 'Somewhere' };
  // 6.7 goes to Yes: the new section and its places disappear (and 6.7y was already hidden once the places were known).
  const toYes = engine.pruneAnswers(config, { ...answers, q6_7: true, accommodation: [STAY] });
  assert.deepEqual(toYes.removed.sort(), ['plannedPlaces', 'q10_28', 'q6_7y']);
  assert.deepEqual(Object.keys(toYes.answers).sort(), ['accommodation', 'q1_6', 'q1_7', 'q6_7']);
  // 6.7 goes to No: the stays go and the places are asked.
  const toNo = engine.pruneAnswers(config, { ...answers, accommodation: [STAY] });
  assert.deepEqual(toNo.removed.sort(), ['accommodation', 'q6_7y']);
  // The planned-places answer goes to No: the places go and 6.7y comes back.
  const toNoPlaces = engine.pruneAnswers(config, { ...TRIP, q10_28: false, plannedPlaces: [place('Bath', '2027-03-01', '2027-03-04')], q6_7y: 'Somewhere' });
  assert.deepEqual(toNoPlaces.removed, ['plannedPlaces']);
  assert.equal(toNoPlaces.answers.q6_7y, 'Somewhere');
  // Through a section save: choosing No for the places removes them.
  const saved = validate('10E', { q10_28: false }, { ...TRIP, q10_28: true, plannedPlaces: [place('Bath', '2027-03-01', '2027-03-04')] });
  assert.equal(saved.success, true);
  assert.deepEqual(saved.removed, ['plannedPlaces']);
});

test('an answer that waits for a gate that was never answered is kept, one that is settled by an answered gate is dropped', () => {
  // An older draft (saved before 10.28 existed) with 6.7 No and a 6.7y answer: 10.28 is unanswered, so 6.7y waits and is kept.
  const old = engine.pruneAnswers(config, { ...TRIP, q6_7y: 'Oxford' });
  assert.deepEqual(old.removed, []);
  assert.equal(old.answers.q6_7y, 'Oxford');
  // With 6.7 Yes it is settled (hidden), whatever 10.28 says.
  assert.deepEqual(engine.pruneAnswers(config, { q6_7: true, q6_7y: 'Oxford' }).removed, ['q6_7y']);
});

// ---------------------------------------------------------------------------
// The review page and the cover letter
// ---------------------------------------------------------------------------

test('the review shows the section, the places with their dates, and a written place as "Other: ..."', () => {
  const answers = { ...TRIP, ...planned(place('Bath', '2027-03-01', '2027-03-04'), other('Stoke on Trent', '2027-03-04', '2027-03-06')) };
  const review = view.buildReview(config, answers, [], {}, {});
  const sections = review.parts.flatMap((p) => p.sections);
  const section = sections.find((s) => s.id === '10E');
  assert.ok(section, 'the section is on the review');
  assert.equal(section.title, 'Your plans in the UK');
  const group = section.rows.find((r) => r.id === 'plannedPlaces');
  assert.equal(group.entries.length, 2);
  const valueOf = (entry, id) => entry.rows.find((r) => r.id === id).value;
  assert.equal(valueOf(group.entries[0], 'q10_28a'), 'Bath');
  assert.equal(valueOf(group.entries[1], 'q10_28a'), 'Other: Stoke on Trent');
  assert.equal(valueOf(group.entries[0], 'q10_28b'), '1 March 2027');
  assert.equal(valueOf(group.entries[1], 'q10_28c'), '6 March 2027');
  // With 6.7 Yes the section is not on the review at all.
  const yes = view.buildReview(config, { ...TRIP, q6_7: true }, [], {}, {});
  assert.equal(yes.parts.flatMap((p) => p.sections).some((s) => s.id === '10E'), false);
});

test('the cover letter refuses every new id, with the reason, and never reads them', () => {
  const ids = ['q6_7e', 'q6_7e_other', 'q10_28', 'q10_28a', 'q10_28a_other', 'q10_28b', 'q10_28c'];
  const spec = (id) => ({ key: `probe_${id}`, section: 'Probe', label: 'Probe', kind: 'value', id });
  assert.deepEqual(cover.validateAllowlist(), []);
  for (const id of ids) {
    assert.equal(cover.allowedIds().includes(id), false, `${id} is not a cover letter fact`);
    assert.ok(cover.validateAllowlist([...cover.SPECS, spec(id)]).some((p) => p.startsWith(`${id}:`)), `the cover letter refuses ${id}`);
  }
  const reasons = Object.entries(cover.EXCLUDED_IDS).filter(([, list]) => list.includes('q10_28a'));
  assert.equal(reasons.length, 1);
  assert.match(reasons[0][0], /plans to visit/);
  // The facts of a cover letter with planned places and "who with" answers carry none of it.
  const answers = { q1_1: 'tourism', q1_4: 'holiday', q1_6: '2027-03-01', q1_7: '2027-03-15', q6_7: false, ...planned(other('Stoke on Trent'), place('Bath', '2027-03-06', '2027-03-08')) };
  const built = cover.buildFacts(config, answers, { submittedAt: SUBMITTED });
  assert.equal(built.text.includes('Stoke on Trent'), false);
  assert.equal(built.text.includes('Bath'), false);
});

// ---------------------------------------------------------------------------
// The itinerary: the places behave exactly like stays
// ---------------------------------------------------------------------------

const baseTrip = (extra = {}) => ({ q1_1: 'tourism', q1_4: 'holiday', q1_5: 'Nothing specific.', q1_6: '2027-03-15', q1_7: '2027-03-25', q6_7: false, ...extra });
const build = (answers, c = config) => itinerary.buildItineraryFacts(c, answers, { submittedAt: SUBMITTED });

test('one planned place, several, a gap and touching places make the same plan the same stays make', () => {
  const one = build(baseTrip(planned(place('London', '2027-03-15', '2027-03-25'))));
  assert.equal(one.stayPlan.mode, 'stays');
  assert.deepEqual(one.stays.map((s) => [s.place, s.from, s.to]), [['London', '2027-03-15', '2027-03-25']]);
  assert.match(one.text, /Place 1: London, from 15 March 2027 to 25 March 2027/);

  const several = build(baseTrip(planned(place('Edinburgh', '2027-03-20', '2027-03-22'), place('London', '2027-03-15', '2027-03-18'), place('Bath', '2027-03-18', '2027-03-19'))));
  assert.deepEqual(itinerary.planStays(several.stays, '2027-03-15', '2027-03-25').stays.map((s) => s.place), ['London', 'Bath', 'Edinburgh'], 'in date order, touching is fine');
  assert.equal(itinerary.stayOnDay(several.stayPlan.stays, '2027-03-18').place, 'Bath', 'the day one leaves and the next arrives belongs to the later one');
  assert.equal(itinerary.stayOnDay(several.stayPlan.stays, '2027-03-24'), null, 'a gap belongs to no place');

  // The same data as stays gives the same plan (the stays code path is shared).
  const asStays = build({ ...baseTrip(), q6_7: true, accommodation: [
    { q6_7a: 'x', q6_7b: { line1: 'x', town: 'London', country: 'GB' }, q6_7c: '2027-03-15', q6_7d: '2027-03-18', q6_7e: 'family' },
    { q6_7a: 'x', q6_7b: { line1: 'x', town: 'Bath', country: 'GB' }, q6_7c: '2027-03-18', q6_7d: '2027-03-19', q6_7e: 'family' },
    { q6_7a: 'x', q6_7b: { line1: 'x', town: 'Edinburgh', country: 'GB' }, q6_7c: '2027-03-20', q6_7d: '2027-03-22', q6_7e: 'family' }] });
  const shape = (f) => f.stayPlan.stays.map((s) => [s.place, s.from, s.to]);
  assert.deepEqual(shape(several), shape(asStays));
});

test('a place written under Other that passes the town check goes in as the applicant\'s own words in a data block, never in a line or a heading', () => {
  const f = build(baseTrip(planned(place('London', '2027-03-15', '2027-03-18'), other('Stoke on Trent', '2027-03-19', '2027-03-22'))));
  assert.deepEqual(f.stays.map((s) => [s.place, s.written === true]), [['London', false], ['Stoke on Trent', true]]);
  assert.equal(f.stays[1].label, 'Place 2 written by the applicant');
  assert.match(f.text, /Place 2: a place written by the applicant \(see the written places\), from 19 March 2027 to 22 March 2027/);
  assert.match(f.text, /<data name="Places written by the applicant">\nPlace 2: Stoke on Trent\n<\/data>/);
  assert.equal(f.text.split('Stoke on Trent').length - 1, 1, 'the words appear once, in the data block');
  assert.equal(f.stayPlan.mode, 'stays');
});

test('a place the server does not accept as a town (an address, a hotel, HTML, digits) is an unusable place: no words of it reach the facts', () => {
  for (const bad of ['12 Acacia Avenue', 'Premier Inn London', '<b>Bath</b>', 'Room 5', 'London, UK']) {
    // The form refuses these; a hand-made answer that gets past it is still not read.
    const f = build(baseTrip(planned(place('London', '2027-03-15', '2027-03-18'), other(bad, '2027-03-19', '2027-03-22'))));
    assert.equal(JSON.stringify(f).includes(bad), false, `${bad} is in the facts`);
    assert.equal(f.text.includes('Avenue'), false);
    assert.deepEqual(f.stays.map((s) => s.place), ['London', null], bad);
    assert.match(f.text, /Place 2: place not given/);
  }
  // Only unusable places: the itinerary is built from the trip alone, exactly as it is without places.
  const only = build(baseTrip(planned(other('12 Acacia Avenue'))));
  assert.equal(only.stayPlan.mode, 'trip');
});

test('planned places answered No, or 6.7 Yes: the facts are exactly the ones they were before (6.7y, or the stays)', () => {
  const noPlaces = build(baseTrip({ q10_28: false, q6_7y: 'Oxford', q6_7x: 'not_decided' }));
  assert.deepEqual(noPlaces.stays, []);
  assert.equal(noPlaces.stayPlan.mode, 'trip');
  assert.match(noPlaces.text, /Oxford/);
  // Places left over under 6.7 Yes are not read (the gate is closed).
  const yes = build({ ...baseTrip(), q6_7: true, accommodation: [{ q6_7a: 'x', q6_7b: { line1: 'x', town: 'Reading', country: 'GB' }, q6_7c: '2027-03-15', q6_7d: '2027-03-20', q6_7e: 'friends' }], ...planned(place('Bath', '2027-03-21', '2027-03-22')) });
  assert.deepEqual(yes.stays.map((s) => s.place), ['Reading']);
  assert.equal(yes.text.includes('Bath'), false);
});

test('who a traveller stays with is read as neutral words only; the words typed under Other never are', () => {
  const stay = (who, extra = {}) => ({ q6_7a: 'SECRET-HOTEL', q6_7b: { line1: 'SECRET-STREET', town: 'London', country: 'GB' }, q6_7c: '2027-03-15', q6_7d: '2027-03-18', q6_7e: who, ...extra });
  const text = (...entries) => build({ ...baseTrip(), q6_7: true, accommodation: entries }).text;
  assert.match(text(stay('family')), /Stay 1: London, from 15 March 2027 to 18 March 2027, with family/);
  assert.match(text(stay('friends')), /, with friends/);
  assert.match(text(stay('paid_stay')), /, in a paid stay/);
  const elsewhere = text(stay('other', { q6_7e_other: 'SECRET-HOST-NAME' }));
  assert.match(elsewhere, /, elsewhere/);
  assert.equal(elsewhere.includes('SECRET'), false);
  assert.equal(text(stay('family', { q6_7e_other: 'SECRET-LEFTOVER' })).includes('SECRET'), false);
});

test('an application saved under an older config (no 6.7e, no section 10E) still builds its facts, with no new question needed', () => {
  const old = clone(require('./questions.json'));
  old.version = '1.5.0';
  old.questions = old.questions.filter((q) => !['q6_7e', 'q10_28', 'q10_28a', 'q10_28b', 'q10_28c'].includes(q.id));
  old.sections = old.sections.filter((s) => s.id !== '10E');
  old.groups = old.groups.filter((g) => g.id !== 'plannedPlaces');
  old.groups.find((g) => g.id === 'accommodation').questions = ['q6_7a', 'q6_7b', 'q6_7c', 'q6_7d'];
  old.questions.find((q) => q.id === 'q6_7y').showWhen = { q: 'q6_7', eq: false };
  const oldConfig = engine.expandOther(old);
  assert.deepEqual(engine.validateConfig(oldConfig), []);
  const f = itinerary.buildItineraryFacts(oldConfig, { ...baseTrip(), q6_7: true, accommodation: [{ q6_7a: 'x', q6_7b: { line1: 'x', town: 'London', country: 'GB' }, q6_7c: '2027-03-15', q6_7d: '2027-03-18' }] }, { submittedAt: SUBMITTED });
  assert.deepEqual(f.stays.map((s) => s.place), ['London']);
  assert.equal(/with (family|friends)|in a paid stay|elsewhere/.test(f.text), false, 'no who-with words exist in an old application');
  assert.match(f.text, /Stay 1: London, from 15 March 2027 to 18 March 2027$/m);
  // The old config does not have the new questions at all.
  assert.equal(engine.getQuestion(oldConfig, 'q10_28'), undefined);
  assert.equal(oldConfig.sections.some((s) => s.id === '10E'), false);
});
