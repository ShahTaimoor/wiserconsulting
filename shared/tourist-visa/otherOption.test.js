'use strict';

// Run with: npm run test:shared   (from the repo root)
// "Other (please write)" (config 1.4.0): a list question with allowOther asks for a written answer when "other" is chosen.
// All answers below are made-up test data.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const z = require(require.resolve('zod', { paths: [path.join(__dirname, '..', '..', 'backend')] }));
const engine = require('./engine');
const view = require('./view');
const cover = require('./coverLetterFacts');
const itinerary = require('./itineraryFacts');
const { config } = engine;

const clone = (o) => JSON.parse(JSON.stringify(o));
const validate = (sectionId, incoming, existing, opts) => engine.validateSection(z, config, sectionId, incoming, existing, { today: '2026-10-28', ...opts });

// The questions that get Other, and the ones that were left out on purpose (with the reason), as reported to the senior.
// 6.7e (who the traveller stays with, config 1.6.0) is one of them: its Other option is shown first. The 18 from config 1.4.0 keep Other last.
const GETS_OTHER = ['q1_1', 'q1_2b', 'q1_3a', 'q1_4', 'q2_3c', 'q2_5', 'q2_8', 'q2_23c', 'q4_7a', 'q6_6b', 'q6_6g', 'q6_7x', 'q6_7e', 'q6_8b', 'q7_2b', 'q7_3c', 'q7_5a', 'q8_2b', 'q8_3b'];
// 10.28a (config 1.6.0) takes its options from the list of places, so its Other is added by the engine, first, and its box asks for a town or city.
const GETS_OTHER_PLACES = ['q10_28a'];
const LEFT_OUT = {
  q2_9: 'its options are the email addresses the applicant entered',
  q2_10: 'its options are the email addresses the applicant entered',
  q2_11: 'its options are the email addresses the applicant entered',
  q2_12: 'sex as shown in the passport',
  q2_13: 'its answer decides whether the partner section (Part 4A) applies',
  q2_28: 'its own Other already opens a details question (2.29)',
  q2_33: 'fixed meaning (where the number is used)',
  q2_34: 'fixed meaning (home, mobile or work)',
  q2_35: 'a fixed set of contact methods (multi-select)',
  q4_8a: 'fixed set of relationships of a parent',
  q5_1: 'its answer decides which employment questions appear, and its Other already opens 5.1k',
  q5_1k: 'its own Other already opens a details question (5.1l)',
  q6_1: 'its answer decides whether the income and savings questions appear',
  q6_5b: 'feeds the cover letter payer summary inline; the written text cannot be given the data-block protection there',
  q6_5d: 'feeds the cover letter payer summary inline; the written text cannot be given the data-block protection there',
  q6_5g: 'feeds the cover letter payer summary inline (multi-select); same reason',
  q7_3d: 'the outcome of an application: a fixed set',
  q7_6b: 'a declaration of breaches, with its own details box',
  q7_7a: 'a declaration of immigration problems, with its own details box',
  q8_1a: 'a fixed list of places that are counted',
  q10_1: 'a declaration (Part 10A): a fixed list with a details box for each choice',
  q10_4: 'its own Other already opens a question that asks which language (10.4a)',
};

const S1 = { q1_1: 'tourism', q1_2: false, q1_3: false, q1_4: 'holiday', q1_5: 'A made-up trip.', q1_6: '2027-03-01', q1_7: '2027-03-15' };
const S1_OTHER = { ...S1, q1_1: 'other', q1_1_other: 'To attend my cousin\'s wedding' };
const TRIP = { q8_2a: 'FR', q8_2b: 'tourism', q8_2c: '2025-07-01', q8_2d: '2025-07-10' };
const S8 = { q8_1: 0, q8_2: true, q8_3: false, otherCountryTrips: [TRIP] };

// ---------------------------------------------------------------------------
// The config
// ---------------------------------------------------------------------------

test('config 1.4.0: exactly the chosen list questions allow Other, and each has the option with the value "other"', () => {
  assert.equal(config.version, '1.6.0');
  const allowing = config.questions.filter((q) => q.allowOther).map((q) => q.id);
  assert.deepEqual(allowing, [...GETS_OTHER, ...GETS_OTHER_PLACES]);
  for (const id of GETS_OTHER) {
    const q = engine.getQuestion(config, id);
    assert.ok(['SEL', 'CHK'].includes(q.type), id);
    const other = q.options.filter((o) => o.value === 'other');
    assert.equal(other.length, 1, `${id} has exactly one option "other"`);
    assert.equal(other[0].label, 'Other (please write)', id);
  }
});

test('config 1.4.0: no Yes/No question and no country selector allows Other, and neither does any question left out on purpose', () => {
  for (const q of config.questions) {
    if (q.type === 'YN' || q.type === 'CTRY') assert.equal(q.allowOther, undefined, `${q.id} (${q.type})`);
  }
  for (const id of Object.keys(LEFT_OUT)) {
    const q = engine.getQuestion(config, id);
    assert.ok(q, id);
    assert.equal(q.allowOther, undefined, `${id}: ${LEFT_OUT[id]}`);
    assert.equal(engine.getQuestion(config, `${id}_other`), undefined, `${id} has no text box`);
  }
  assert.equal(GETS_OTHER.filter((id) => id in LEFT_OUT).length, 0);
});

test('config 1.4.0: every list question is either given Other or listed as left out, with a reason (nothing is forgotten)', () => {
  const listLike = config.questions.filter((q) => !q.otherOf && (q.type === 'SEL' || q.type === 'CHK'));
  const unclassified = listLike.filter((q) => !GETS_OTHER.includes(q.id) && !GETS_OTHER_PLACES.includes(q.id) && !(q.id in LEFT_OUT)).map((q) => q.id);
  assert.deepEqual(unclassified, [], 'a list question was neither given Other nor excluded on purpose');
});

test('the text box of an Other answer: made right after its question, same number, section and group, a required short text', () => {
  for (const id of GETS_OTHER) {
    const q = engine.getQuestion(config, id);
    const box = engine.getQuestion(config, `${id}_other`);
    assert.ok(box, `${id}_other`);
    assert.equal(config.questions[config.questions.indexOf(q) + 1], box, `${id}_other comes right after ${id}`);
    assert.equal(box.number, q.number);
    assert.equal(box.section, q.section);
    assert.equal(box.group, q.group);
    assert.equal(box.type, 'TXT');
    assert.equal(box.required, true);
    assert.equal(box.otherOf, id);
    assert.equal(box.label, 'Please write your answer');
    assert.deepEqual(box.showWhen, { q: id, eq: 'other' });
    assert.equal(box.rules.maxLen, 100);
    if (q.group) {
      const members = config.groups.find((g) => g.id === q.group).questions;
      assert.equal(members[members.indexOf(id) + 1], `${id}_other`, `${id}_other is a member of the group right after ${id}`);
    }
  }
  assert.deepEqual(engine.validateConfig(config), []);
});

test('expandOther: does not change what it is given, can be run again, and adds nothing when no question allows Other', () => {
  const raw = clone(require('./questions.json'));
  const before = JSON.stringify(raw);
  const once = engine.expandOther(raw);
  assert.equal(JSON.stringify(raw), before, 'the input is untouched');
  assert.equal(once.questions.length, raw.questions.length + GETS_OTHER.length + GETS_OTHER_PLACES.length);
  assert.equal(engine.expandOther(once), once, 'an expanded config is returned as it is');
  const none = clone(raw);
  for (const q of none.questions) delete q.allowOther;
  assert.equal(engine.expandOther(none), none);
});

test('a multi-select question that allows Other asks for the text when "other" is ticked (shown only then)', () => {
  const cfg = clone(config);
  const q = cfg.questions.find((x) => x.id === 'q2_35');
  q.options = [...q.options, { value: 'other', label: 'Other (please write)' }];
  q.allowOther = true;
  const expanded = engine.expandOther(cfg);
  const box = expanded.questions.find((x) => x.id === 'q2_35_other');
  assert.deepEqual(box.showWhen, { q: 'q2_35', includes: 'other' });
  assert.deepEqual(engine.validateConfig(expanded), []);
  assert.equal(engine.isVisible(expanded, 'q2_35_other', { q2_35: ['call'] }), false);
  assert.equal(engine.isVisible(expanded, 'q2_35_other', { q2_35: ['call', 'other'] }), true);
  assert.equal(engine.isOtherChosen(q, ['call', 'other']), true);
  assert.equal(engine.isOtherChosen(q, ['call']), false);
  assert.equal(engine.writtenOther(expanded, q, { q2_35: ['call', 'other'], q2_35_other: '  a letter  ' }), 'a letter');
  assert.equal(engine.writtenOther(expanded, q, { q2_35: ['call'], q2_35_other: 'a letter' }), '');
});

// ---------------------------------------------------------------------------
// Validation: Other chosen, with and without text
// ---------------------------------------------------------------------------

test('Other with its written text is accepted, trimmed, and stored next to the choice', () => {
  const r = validate('1', { ...S1_OTHER, q1_1_other: '   To attend my cousin\'s wedding   ' });
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.equal(r.data.q1_1, 'other');
  assert.equal(r.data.q1_1_other, 'To attend my cousin\'s wedding');
  assert.equal('q1_4' in r.data, false, 'the holiday question stays hidden, exactly as with any reason that is not tourism');
});

test('Other without text, with an empty text, or with only spaces, is refused: the text is required', () => {
  for (const text of [undefined, '', '   ', '\t\n']) {
    const r = validate('1', { ...S1, q1_1: 'other', q1_1_other: text });
    assert.equal(r.success, false, JSON.stringify(text));
    assert.deepEqual(r.errors, { q1_1_other: 'This question is required' }, JSON.stringify(text));
  }
});

test('the written text is at most 100 characters, and 100 is allowed', () => {
  assert.equal(validate('1', { ...S1_OTHER, q1_1_other: 'x'.repeat(100) }).success, true);
  const long = validate('1', { ...S1_OTHER, q1_1_other: 'x'.repeat(101) });
  assert.deepEqual(long.errors, { q1_1_other: 'Must be 100 characters or fewer' });
  const spaced = validate('1', { ...S1_OTHER, q1_1_other: `${' '.repeat(50)}${'y'.repeat(100)}${' '.repeat(50)}` });
  assert.equal(spaced.success, true, 'spaces round it do not count');
});

test('angle brackets are refused (no HTML), the message does not repeat the text, and other characters are as in any short answer', () => {
  for (const text of ['<b>bold</b>', 'a < b', 'tickets > 2', '<script>alert(1)</script>']) {
    const r = validate('1', { ...S1_OTHER, q1_1_other: text });
    assert.equal(r.success, false, text);
    assert.equal(r.errors.q1_1_other, 'Do not use the < or > characters');
    assert.equal(JSON.stringify(r.errors).includes('script'), false, 'the answer is never in an error message');
  }
  for (const text of ['Wedding & party (2 days)', 'Café "Les Amis" - 50%', 'L\'été à Paris', 'Visiting Ahmed\'s family; staying 3 nights']) {
    assert.equal(validate('1', { ...S1_OTHER, q1_1_other: text }).success, true, text);
  }
});

test('the text is a plain string: a number, a list or an object in its place is refused', () => {
  for (const bad of [5, true, ['a'], { a: 1 }]) {
    const r = validate('1', { ...S1_OTHER, q1_1_other: bad });
    assert.equal(r.success, false, JSON.stringify(bad));
    assert.ok(r.errors.q1_1_other, JSON.stringify(bad));
  }
});

// ---------------------------------------------------------------------------
// Switching away from Other, stale and tampered text
// ---------------------------------------------------------------------------

test('switching away from Other drops the written text: it is not stored and is listed as removed', () => {
  const r = validate('1', { ...S1, q1_1: 'family_friends', q1_1_other: 'left over text' }, { ...S1_OTHER });
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.equal(r.data.q1_1, 'family_friends');
  assert.equal('q1_1_other' in r.data, false);
  assert.ok(r.removed.includes('q1_1_other'));
  // Also when the old text is only in the stored answers, and the new request does not send it.
  const stored = validate('1', { ...S1, q1_1: 'business' }, { ...S1_OTHER });
  assert.ok(stored.removed.includes('q1_1_other'));
  assert.equal('q1_1_other' in stored.data, false);
});

test('a companion answer sent when Other is not chosen is ignored and dropped (a tampered request cannot keep it)', () => {
  for (const choice of ['tourism', 'business', 'study', 'transit']) {
    const r = validate('1', { ...S1, q1_1: choice, q1_1_other: 'sneaky text' });
    assert.equal(r.success, true, choice + JSON.stringify(r.errors));
    assert.equal('q1_1_other' in r.data, false, choice);
    assert.ok(r.removed.includes('q1_1_other'), choice);
  }
  // Even with an invalid value (too long, brackets): not read at all when it is hidden.
  assert.equal(validate('1', { ...S1, q1_1_other: '<b>' + 'z'.repeat(500) }).success, true);
});

test('pruneAnswers removes a written text whose choice is not Other, even when the choice itself was never given', () => {
  assert.deepEqual(engine.pruneAnswers(config, { q1_1: 'tourism', q1_1_other: 'x' }).removed, ['q1_1_other']);
  assert.deepEqual(engine.pruneAnswers(config, { q1_1_other: 'x' }).removed, ['q1_1_other'], 'no choice at all: the text is not kept either');
  assert.deepEqual(engine.pruneAnswers(config, { q1_1: 'other', q1_1_other: 'x' }).removed, []);
  assert.equal(engine.pruneAnswers(config, { q1_1: 'other', q1_1_other: 'x' }).answers.q1_1_other, 'x');
});

test('inside a repeating group: the text is asked per entry, required per entry, and dropped from an entry that does not choose Other', () => {
  const entry = (patch) => ({ ...TRIP, ...patch });
  const ok = validate('8', { ...S8, otherCountryTrips: [entry({ q8_2b: 'other', q8_2b_other: 'A pilgrimage' }), entry({})] });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  assert.equal(ok.data.otherCountryTrips[0].q8_2b_other, 'A pilgrimage');
  assert.equal('q8_2b_other' in ok.data.otherCountryTrips[1], false);

  const missing = validate('8', { ...S8, otherCountryTrips: [entry({}), entry({ q8_2b: 'other' })] });
  assert.deepEqual(missing.errors, { 'otherCountryTrips.1.q8_2b_other': 'This question is required' });

  const stale = validate('8', { ...S8, otherCountryTrips: [entry({ q8_2b: 'study', q8_2b_other: 'stale text' })] });
  assert.equal(stale.success, true, JSON.stringify(stale.errors));
  assert.equal('q8_2b_other' in stale.data.otherCountryTrips[0], false);

  // The same group closed: nothing of it, text included, is kept.
  assert.deepEqual(engine.pruneAnswers(config, { q8_2: false, otherCountryTrips: [entry({ q8_2b: 'other', q8_2b_other: 'x' })] }).removed, ['otherCountryTrips']);
  // Two groups with Other in the same section do not mix their texts up.
  const both = validate('8', { q8_1: 0, q8_2: true, q8_3: true, otherCountryTrips: [entry({ q8_2b: 'other', q8_2b_other: 'recent text' })], olderCountryTrips: [{ q8_3a: 'DE', q8_3b: 'other', q8_3b_other: 'older text', q8_3c: '2001-05-01', q8_3d: '2001-05-04' }] });
  assert.equal(both.success, true, JSON.stringify(both.errors));
  assert.equal(both.data.otherCountryTrips[0].q8_2b_other, 'recent text');
  assert.equal(both.data.olderCountryTrips[0].q8_3b_other, 'older text');
});

// ---------------------------------------------------------------------------
// Mass assignment: the companion key only exists for a question with Other
// ---------------------------------------------------------------------------

test('a companion key for a question that does not allow Other is refused as an unknown key, never stored', () => {
  for (const [section, base, key] of [
    ['1', S1, 'q1_2_other'], // a Yes/No
    ['1', S1, 'q1_3_other'], // a Yes/No
    ['2B', { q2_12: 'female', q2_13: 'single', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville', q2_17: '1990-01-01', q2_18: false, q2_23: false }, 'q2_12_other'], // left out
    ['2B', { q2_12: 'female', q2_13: 'single', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville', q2_17: '1990-01-01', q2_18: false, q2_23: false }, 'q2_13_other'], // left out
    ['2B', { q2_12: 'female', q2_13: 'single', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville', q2_17: '1990-01-01', q2_18: false, q2_23: false }, 'q2_14_other'], // a country
  ]) {
    const r = validate(section, { ...base, [key]: 'injected' });
    assert.equal(r.success, false, key);
    assert.deepEqual(r.unknownKeys, [key], key);
    assert.equal(key in r.data, false, key);
  }
  // Inside a group entry: a companion of a question without Other.
  const r = validate('8', { ...S8, otherCountryTrips: [{ ...TRIP, q8_2a_other: 'injected' }] });
  assert.deepEqual(r.unknownKeys, ['otherCountryTrips.0.q8_2a_other']);
  assert.equal(r.success, false);
  // A companion of a question that exists in another section is unknown here too.
  assert.deepEqual(validate('1', { ...S1, q8_2b_other: 'x' }).unknownKeys, ['q8_2b_other']);
  // A key that tries to reach the object prototype is never read.
  const proto = validate('1', JSON.parse('{"q1_1":"tourism","q1_2":false,"q1_3":false,"q1_4":"holiday","q1_5":"x","q1_6":"2027-03-01","q1_7":"2027-03-15","__proto__":{"q1_1_other":"x"}}'));
  assert.equal(Object.prototype.hasOwnProperty.call({}, 'q1_1_other'), false);
  assert.equal(proto.data.q1_1, 'tourism');
});

// ---------------------------------------------------------------------------
// What "other" does in every rule that tests a list question (the audit)
// ---------------------------------------------------------------------------

/** Every condition in the config (with the question or group it sits on) that looks at one of the given question ids. */
function conditionsOn(ids) {
  const found = [];
  const walk = (c, where, negated) => {
    if (!c || typeof c !== 'object') return;
    if (c.all || c.any) { (c.all || c.any).forEach((x) => walk(x, where, negated)); return; }
    if (c.not) { walk(c.not, where, !negated); return; }
    if (ids.includes(c.q)) found.push({ where, cond: c, negated });
  };
  for (const q of config.questions) walk(q.showWhen, q.id, false);
  return found;
}

test('audit: no rule anywhere tests the value "other" of a question that allows Other, or negates a test of one (apart from its own text box)', () => {
  const hits = conditionsOn(GETS_OTHER).filter((h) => !config.questions.find((q) => q.id === h.where).otherOf);
  for (const h of hits) {
    assert.equal(h.negated, false, `${h.where}: a "not" rule on ${h.cond.q}`);
    const named = h.cond.eq === 'other' || (Array.isArray(h.cond.in) && h.cond.in.includes('other')) || h.cond.includes === 'other';
    assert.equal(named, false, `${h.where} tests "other" of ${h.cond.q}`);
  }
  // The only rules that test a question that allows Other: 1.1 decides 1.4 (tourism only), and each text box tests its own question.
  assert.deepEqual(hits.map((h) => `${h.where} <- ${h.cond.q} ${JSON.stringify(h.cond).replace(/"q":"[^"]+",?/, '')}`), ['q1_4 <- q1_1 {"eq":"tourism"}']);
});

test('audit: choosing Other for 1.1 shows exactly what any other reason that is not tourism shows (1.4 stays hidden), and tourism still opens 1.4', () => {
  assert.equal(engine.isVisible(config, 'q1_4', { q1_1: 'tourism' }), true);
  assert.equal(engine.isVisible(config, 'q1_4', { q1_1: 'other' }), false);
  assert.equal(engine.isVisible(config, 'q1_4', { q1_1: 'business' }), false);
  assert.equal(engine.isVisible(config, 'q1_1_other', { q1_1: 'other' }), true);
  assert.equal(engine.isVisible(config, 'q1_1_other', { q1_1: 'tourism' }), false);
  assert.equal(engine.isVisible(config, 'q1_1_other', {}), false);
  // 1.4 itself allows Other: it is asked only for tourism, and its own text only when 1.4 is Other.
  assert.equal(engine.isVisible(config, 'q1_4_other', { q1_1: 'tourism', q1_4: 'other' }), true);
  assert.equal(engine.isVisible(config, 'q1_4_other', { q1_1: 'business', q1_4: 'other' }), false, 'hidden with its question, even if a stale 1.4 is stored');
});

test('audit: the questions left out keep working exactly as they did, including the ones whose own Other opens a follow-up', () => {
  // 2.13 has no Other, so it cannot be chosen; the partner section still follows the listed values only.
  assert.equal(validate('2B', { q2_12: 'female', q2_13: 'other', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville', q2_17: '1990-01-01', q2_18: false, q2_23: false }).errors.q2_13, 'Choose from the listed options');
  assert.equal(engine.isVisible(config, 'q4_1', { q2_13: 'married' }), true);
  assert.equal(engine.isVisible(config, 'q4_1', { q2_13: 'single' }), false);
  // Their own Other opens their own follow-up, as before, and has no text box of ours.
  assert.equal(engine.isVisible(config, 'q2_29', { q2_28: 'other' }), true);
  assert.equal(engine.isVisible(config, 'q2_29', { q2_28: 'owned' }), false);
  assert.equal(engine.isVisible(config, 'q5_1k', { q5_1: 'other' }), true);
  assert.equal(engine.isVisible(config, 'q5_1l', { q5_1: 'other', q5_1k: 'other' }), true);
  assert.equal(engine.isVisible(config, 'q5_1b', { q5_1: 'other' }), false);
  assert.equal(engine.isVisible(config, 'q10_4a', { q10_4: 'other' }), true);
  assert.equal(engine.isVisible(config, 'q10_4a', { q10_4: 'english' }), false);
  assert.equal(engine.isVisible(config, 'q6_1a', { q6_1: 'other_income' }), true);
  assert.equal(engine.isVisible(config, 'q6_2', { q6_1: 'none' }), false);
});

test('validateConfig refuses Other where it would be unclear, and checks the text boxes', () => {
  const q = (c, id) => c.questions.find((x) => x.id === id);
  const bad = (mutate, pattern) => {
    const c = clone(config);
    mutate(c);
    const errors = engine.validateConfig(c);
    assert.ok(errors.some((e) => pattern.test(e)), `${pattern}: ${JSON.stringify(errors)}`);
  };
  bad((c) => { q(c, 'q1_2').allowOther = true; }, /allowOther is only for SEL or CHK/);
  bad((c) => { q(c, 'q2_14').allowOther = true; }, /allowOther is only for SEL or CHK/);
  bad((c) => { q(c, 'q2_9').allowOther = true; }, /allowOther is only for SEL or CHK questions with their own option list/);
  bad((c) => { q(c, 'q2_13').allowOther = true; }, /allowOther needs an option with the value "other"/);
  bad((c) => { q(c, 'q1_1').allowOther = 'yes'; }, /allowOther must be true or left out/);
  bad((c) => { q(c, 'q1_1').options.find((o) => o.value === 'other').exclusive = true; }, /Other option cannot be exclusive/);
  bad((c) => { q(c, 'q1_4').showWhen = { q: 'q1_1', in: ['tourism', 'other'] }; }, /tests the value "other" of q1_1/);
  bad((c) => { q(c, 'q1_4').showWhen = { not: { q: 'q1_1', eq: 'business' } }; }, /a "not" rule on q1_1, which allows Other/);
  bad((c) => { q(c, 'q4_1').showWhen = { q: 'q2_5', eq: 'other' }; }, /tests the value "other" of q2_5/);
  bad((c) => { q(c, 'q1_1_other').type = 'LNG'; }, /must be a required TXT question/);
  bad((c) => { q(c, 'q1_1_other').required = false; }, /must be a required TXT question/);
  bad((c) => { q(c, 'q1_1_other').number = '9.9'; }, /must have the number, section and group of q1_1/);
  bad((c) => { q(c, 'q1_1_other').otherOf = 'q1_2'; }, /otherOf q1_2 is not a question that allows Other/);
  bad((c) => { q(c, 'q1_1_other').id = 'q1_1_text'; }, /must be called q1_1_other/);
  // A rule on a question that does not allow Other may still say "other" (an existing option such as 2.28's).
  const fine = clone(config);
  assert.deepEqual(engine.validateConfig(fine), []);
});

// ---------------------------------------------------------------------------
// The review and the descriptions of an answer
// ---------------------------------------------------------------------------

const rowsOf = (review) => review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows));

test('the review shows "Other: <the words>" on the question itself, never a row for the text box, never the bare label', () => {
  const review = view.buildReview(config, S1_OTHER, [], {}, {});
  const rows = rowsOf(review);
  const row = rows.find((r) => r.id === 'q1_1');
  assert.equal(row.value, 'Other: To attend my cousin\'s wedding');
  assert.equal(rows.some((r) => r.id === 'q1_1_other'), false);
  assert.equal(JSON.stringify(review).includes('Other (please write)'), false);
  assert.equal(JSON.stringify(review).includes('Please write your answer'), false);
  // Not Other: the option's own label, and no text box.
  const plain = rowsOf(view.buildReview(config, { ...S1, q1_1_other: 'stale' }, [], {}, {}));
  assert.equal(plain.find((r) => r.id === 'q1_1').value, 'Tourism or holiday');
  assert.equal(JSON.stringify(plain).includes('stale'), false, 'a stale text is never shown');
  // An older answer with Other and no text: just "Other".
  assert.equal(rowsOf(view.buildReview(config, { ...S1, q1_1: 'other' }, [], {}, {})).find((r) => r.id === 'q1_1').value, 'Other');
});

test('the review shows an Other answer inside a repeating group entry, with the text of that entry', () => {
  const answers = { ...S8, otherCountryTrips: [{ ...TRIP, q8_2b: 'other', q8_2b_other: 'A pilgrimage' }, TRIP] };
  const group = rowsOf(view.buildReview(config, answers, [], {}, {})).find((r) => r.id === 'otherCountryTrips');
  assert.equal(group.entries[0].rows.find((r) => r.id === 'q8_2b').value, 'Other: A pilgrimage');
  assert.equal(group.entries[1].rows.find((r) => r.id === 'q8_2b').value, 'Tourism or holiday');
  for (const e of group.entries) assert.equal(e.rows.some((r) => r.id === 'q8_2b_other'), false);
});

test('describeValue (used for the corrections and the history): the same words, taken from the answers it is given', () => {
  const q = engine.getQuestion(config, 'q1_1');
  assert.equal(view.describeValue(config, q, 'other', S1_OTHER, null), 'Other: To attend my cousin\'s wedding');
  assert.equal(view.describeValue(config, q, 'other', { q1_1: 'other' }, null), 'Other');
  assert.equal(view.describeValue(config, q, 'business', S1_OTHER, null), 'Business');
});

// ---------------------------------------------------------------------------
// The facts for the AI (cover letter and itinerary)
// ---------------------------------------------------------------------------

const FACT_BASE = { q1_1: 'other', q1_1_other: 'Attending the wedding of my friend Ahmed Khan, call +44 7700 900123 or ahmed@example.com', q1_6: '2027-03-01', q1_7: '2027-03-15', q2_1: 'Ahmed', q2_2: 'Khan' };
const submittedAt = new Date('2026-11-01T12:00:00Z');

for (const [name, build] of [['cover letter', (a) => cover.buildFacts(config, a, { submittedAt })], ['itinerary', (a) => itinerary.buildItineraryFacts(config, a, { submittedAt })]]) {
  test(`${name}: an Other reason is sent as the applicant's own words in a data block, redacted like other free text, never as "other"`, () => {
    const built = build(FACT_BASE);
    assert.ok(built.values.purpose, 'there is a purpose fact');
    assert.equal(built.raw.purpose, 'other', 'the template still knows the choice; the AI only ever sees the text');
    // The AI sees tokens, not the name, the number or the email.
    for (const secret of ['Ahmed', 'Khan', '7700', 'ahmed@example.com']) assert.equal(built.text.includes(secret), false, `${secret} reached the facts`);
    assert.match(built.values.purpose, /^Attending the wedding of my friend \[R\d+\], call \[R\d+\] or \[R\d+\]$/);
    // The redactions hold the real text, for the server to put back.
    assert.ok(Object.values(built.redactions).includes('ahmed@example.com'));
    // In a delimited data block, like the other free text; and flagged as the applicant's own words.
    assert.ok(built.text.includes('<data name="Main reason for the visit">'), built.text);
    const item = built.sections.flatMap((s) => s.items).find((i) => i.key === 'purpose');
    assert.equal(item.free, true);
    assert.equal(item.data, true);
    assert.equal(/Main reason for the visit: [Oo]ther|\bOTHER\b|Other \(please write\)/.test(built.text), false);
    assert.equal(built.text.includes('"other"'), false);
  });

  test(`${name}: markup in an Other answer is stripped before it is sent, and a very long one is cut`, () => {
    // (The form refuses angle brackets; an answer saved some other way is still cleaned.)
    const built = build({ ...FACT_BASE, q1_1_other: 'A <b>big</b> wedding <script>x()</script> `now`' });
    assert.equal(/[<>`]/.test(built.values.purpose.replace('</data>', '')), false, built.values.purpose);
    const long = build({ ...FACT_BASE, q1_1_other: `${'word '.repeat(300)}` });
    assert.ok(long.values.purpose.length <= 504, String(long.values.purpose.length));
  });

  test(`${name}: an Other answer with nothing written, a stale text, or a hidden question sends no fact at all`, () => {
    assert.equal(build({ ...FACT_BASE, q1_1_other: undefined }).values.purpose, undefined);
    assert.equal(build({ ...FACT_BASE, q1_1_other: '   ' }).values.purpose, undefined);
    // A text left behind a choice that is not Other is never read.
    const plain = build({ ...FACT_BASE, q1_1: 'business', q1_1_other: 'leftover words' });
    assert.equal(plain.values.purpose, 'Business');
    assert.equal(plain.text.includes('leftover'), false);
    // The medical visit is still withheld as before.
    assert.equal(build({ ...FACT_BASE, q1_1: 'medical', q1_1_other: 'treatment words' }).values.purpose, undefined);
  });
}

test('cover letter: the reason for a holiday visit written as Other is a data block as well, and the choices that are not Other read as before', () => {
  const built = cover.buildFacts(config, { q1_1: 'tourism', q1_4: 'other', q1_4_other: 'A music festival', q1_6: '2027-03-01', q1_7: '2027-03-15' }, { submittedAt });
  assert.equal(built.values.holidayReason, 'A music festival');
  assert.ok(built.text.includes('<data name="Reason for the holiday visit">\nA music festival\n</data>'), built.text);
  const plain = cover.buildFacts(config, { q1_1: 'tourism', q1_4: 'event', q1_6: '2027-03-01', q1_7: '2027-03-15' }, { submittedAt });
  assert.match(plain.values.holidayReason, /^Attending an event/);
  assert.match(plain.text, /- Reason for the holiday visit: Attending an event/);
});

test('the allowlists refuse to read the text box of an Other directly, or an Other question any way but as a plain value', () => {
  const spec = (id, extra = {}) => ({ key: `k_${id}`, section: 'The visit', label: 'x', kind: 'value', id, ...extra });
  const problems = cover.validateAllowlist([...cover.SPECS, spec('q1_1_other')]);
  assert.ok(problems.some((p) => p.startsWith('q1_1_other:') && /Other can only be read through its own question/.test(p)), JSON.stringify(problems));
  assert.ok(itinerary.validateItineraryAllowlist([...itinerary.SPECS, spec('q1_1_other')]).some((p) => p.startsWith('q1_1_other:')));
  // A question that allows Other read as a list field or a count is refused.
  const asList = { key: 'k', section: 'x', label: 'l', kind: 'list', group: 'payers', gate: 'q6_5', fields: [{ id: 'q6_6b', label: 'who' }] };
  assert.ok(cover.validateAllowlist([...cover.SPECS, asList]).some((p) => /q6_6b: allows Other, which only a value fact can carry/.test(p)));
  assert.deepEqual(cover.validateAllowlist(), []);
  assert.deepEqual(itinerary.validateItineraryAllowlist(), []);
});

test('the questions the cover letter and the itinerary read that allow Other are exactly the ones whose Other is carried as data', () => {
  const readByCover = cover.allowedIds().filter((id) => engine.getQuestion(config, id).allowOther);
  assert.deepEqual(readByCover.sort(), ['q1_1', 'q1_4', 'q6_7x']);
  const readByItinerary = itinerary.allowedIds().filter((id) => engine.getQuestion(config, id).allowOther);
  // The itinerary alone also reads who the traveller stays with (6.7e) and the places they plan to visit (10.28a), as choices: what is written under Other is
  // never read for 6.7e, and for 10.28a only when it is the name of a town or city, and then as data.
  assert.deepEqual(readByItinerary.sort(), ['q10_28a', 'q1_1', 'q1_4', 'q6_7e', 'q6_7x']);
  // None of the payer questions (read inline in the letter) has Other: that is why they were left out.
  for (const id of ['q6_5b', 'q6_5d', 'q6_5g']) assert.equal(engine.getQuestion(config, id).allowOther, undefined, id);
});

// ---------------------------------------------------------------------------
// An application saved under an older config (no Other at all)
// ---------------------------------------------------------------------------

test('a config from before Other (no allowOther, no text boxes) still validates, reviews and reads an answer "other" exactly as it did', () => {
  const old = clone(config);
  old.version = '1.3.0';
  old.questions = old.questions.filter((q) => !q.otherOf);
  for (const q of old.questions) {
    delete q.allowOther;
    delete q.otherPosition; delete q.otherKind; delete q.otherLabel; // the 1.6.0 settings of Other are not known there either
    if (q.id === 'q1_1') q.options.find((o) => o.value === 'other').label = 'Another reason';
  }
  for (const g of old.groups) g.questions = g.questions.filter((id) => !id.endsWith('_other'));
  assert.deepEqual(engine.validateConfig(old), []);
  const r = engine.validateSection(z, old, '1', { ...S1, q1_1: 'other' }, {}, { today: '2026-10-28' });
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.equal(rowsOf(view.buildReview(old, { ...S1, q1_1: 'other' }, [], {}, {})).find((x) => r && x.id === 'q1_1').value, 'Another reason');
  // The old config does not know the text box: a key for it is an unknown key there.
  assert.deepEqual(engine.validateSection(z, old, '1', { ...S1, q1_1: 'other', q1_1_other: 'x' }, {}, { today: '2026-10-28' }).unknownKeys, ['q1_1_other']);
  // The facts for an old application: the fixed words as before (nothing written exists).
  const facts = cover.buildFacts(old, { q1_1: 'other', q6_7: false, q6_7x: 'other', q1_6: '2027-03-01', q1_7: '2027-03-15' }, { submittedAt });
  assert.equal(facts.values.purpose, 'Another reason');
  assert.equal(facts.values.accommodationPlan, 'somewhere else');
});

// ---------------------------------------------------------------------------
// Every question that allows Other: the same behaviour, one loop
// ---------------------------------------------------------------------------

test('every question that allows Other behaves the same: Other needs the text, anything else drops it', () => {
  for (const id of GETS_OTHER) {
    const q = engine.getQuestion(config, id);
    const box = `${id}_other`;
    // visibility follows the choice (for a question inside a group, with the group open)
    const grp = q.group ? config.groups.find((g) => g.id === q.group) : null;
    const entryWith = (value, text) => ({ [id]: value, ...(text !== undefined ? { [box]: text } : {}) });
    const flat = grp && grp.gate ? { [grp.gate]: true } : {};
    // The question itself (and its group) must be shown for the text to be asked.
    if (!q.showWhen && (!grp || grp.gate)) {
      assert.equal(engine.isVisible(config, box, { ...flat }, grp ? entryWith('other') : null) === false || !!grp, true, id);
    }
    assert.equal(engine.isVisible(config, box, { ...flat }, grp ? entryWith(q.options[0].value) : null), false, `${box} is hidden for a plain choice`);
    assert.equal(engine.writtenOther(config, q, grp ? flat : { [id]: 'other', [box]: ' words ' }, grp ? entryWith('other', ' words ') : null), 'words', id);
    assert.equal(engine.writtenOther(config, q, grp ? flat : { [id]: q.options[0].value, [box]: 'words' }, grp ? entryWith(q.options[0].value, 'words') : null), '', id);
  }
});
