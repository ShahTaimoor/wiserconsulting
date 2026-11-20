'use strict';

// Run with: npm run test:shared   (from the repo root)
// The Family name is optional (config 1.2.0): some people have one name only. All names below are made-up test data.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const z = require(require.resolve('zod', { paths: [path.join(__dirname, '..', '..', 'backend')] }));
const engine = require('./engine');
const view = require('./view');
const coverLetterFacts = require('./coverLetterFacts');

const { config } = engine;
const validate = (sectionId, incoming, existing) => engine.validateSection(z, config, sectionId, incoming, existing, { today: '2026-10-28' });

const S2A = {
  q2_1: 'Testfirst', q2_2: 'Testlast', q2_3: false,
  q2_4: 'test.applicant@example.com', q2_5: 'me', q2_6: false,
  q2_9: 'test.applicant@example.com', q2_10: 'test.applicant@example.com', q2_11: 'test.applicant@example.com',
};

/** Every "Family name" question and the given-name question next to it. */
const PAIRS = [
  { given: 'q1_3b', family: 'q1_3c' },
  { given: 'q2_1', family: 'q2_2' },
  { given: 'q2_3a', family: 'q2_3b' },
  { given: 'q4_1', family: 'q4_2' },
  { given: 'q4_7b', family: 'q4_7c' },
  { given: 'q4_8b', family: 'q4_8c' },
  { given: 'q6_6c', family: 'q6_6d' },
];
const question = (id) => config.questions.find((q) => q.id === id);

test('config 1.2.0: every Family name question is optional and every Given names question next to it stays required', () => {
  assert.equal(config.version, '1.6.0');
  for (const { given, family } of PAIRS) {
    assert.equal(question(family).required, false, `${family} is optional`);
    assert.equal(question(given).required, true, `${given} is still required`);
  }
  // Nothing else with the label "Family name" was missed.
  const labelled = config.questions.filter((q) => /^family name/i.test(q.label)).map((q) => q.id).sort();
  assert.deepEqual(labelled, PAIRS.map((p) => p.family).sort());
});

test('fullName: both parts, the given name only, the family name only, and neither', () => {
  assert.equal(view.fullName('Testfirst', 'Testlast'), 'Testfirst Testlast');
  assert.equal(view.fullName('Testfirst', ''), 'Testfirst');
  assert.equal(view.fullName('Testfirst', undefined), 'Testfirst');
  assert.equal(view.fullName('Testfirst'), 'Testfirst');
  assert.equal(view.fullName('', 'Testlast'), 'Testlast');
  assert.equal(view.fullName(undefined, 'Testlast'), 'Testlast');
  assert.equal(view.fullName('', ''), '');
  assert.equal(view.fullName(), '');
  assert.equal(view.fullName(undefined, null), '');
});

test('fullName: whitespace-only and non-text parts are skipped, and there is never a stray space, comma, "undefined" or "null"', () => {
  assert.equal(view.fullName('  Testfirst  ', '   '), 'Testfirst');
  assert.equal(view.fullName('   ', '  Testlast '), 'Testlast');
  assert.equal(view.fullName('Test  Middle', ' Testlast'), 'Test Middle Testlast', 'runs of spaces are made single');
  assert.equal(view.fullName('\n\t', ' '), '', 'other kinds of white space count as empty');
  assert.equal(view.fullName('Testfirst', null), 'Testfirst');
  assert.equal(view.fullName(42, { a: 1 }, ['x']), '', 'a value that is not text is not a name part');
  for (const [a, b] of [[undefined, undefined], [null, null], ['Testfirst', undefined], [undefined, 'Testlast'], ['', ' ']]) {
    assert.doesNotMatch(view.fullName(a, b), /undefined|null|NaN|,|^\s|\s$|\s\s/);
  }
  assert.equal(view.fullName('Null', 'Undefined'), 'Null Undefined', 'a name that really is the word is kept as typed');
});

for (const [label, value] of [['missing', undefined], ['empty', ''], ['whitespace only', '   ']]) {
  test(`section 2A: Family name ${label} is accepted and not stored`, () => {
    const incoming = { ...S2A };
    if (value === undefined) delete incoming.q2_2; else incoming.q2_2 = value;
    const result = validate('2A', incoming);
    assert.equal(result.success, true, JSON.stringify(result.errors));
    assert.equal('q2_2' in result.data, false, 'an empty answer is not stored');
    assert.equal(result.data.q2_1, 'Testfirst');
    assert.deepEqual(result.errors, {});
  });
}

test('section 2A: a normal Family name is stored trimmed, and the Given name(s) is still required', () => {
  const normal = validate('2A', { ...S2A, q2_2: '  Testlast  ' });
  assert.equal(normal.success, true);
  assert.equal(normal.data.q2_2, 'Testlast');

  for (const given of [undefined, '', '   ']) {
    const incoming = { ...S2A, q2_1: given };
    const result = validate('2A', incoming);
    assert.equal(result.success, false, `given name ${JSON.stringify(given)}`);
    assert.equal(result.errors.q2_1, 'This question is required');
    assert.equal(result.errors.q2_2, undefined);
  }
});

test('a Family name is still checked when it is typed: too long is refused', () => {
  const result = validate('2A', { ...S2A, q2_2: 'x'.repeat(config.limits.txtMax + 1) });
  assert.equal(result.success, false);
  assert.ok(result.errors.q2_2);
});

test('other names, partner, companions, dependants, parents and relatives: an entry with only a given name is accepted, one with no given name is not', () => {
  const other = validate('2A', { ...S2A, q2_3: true, otherNames: [{ q2_3a: 'Alias' }, { q2_3a: 'Alias', q2_3b: '   ' }] });
  assert.equal(other.success, true, JSON.stringify(other.errors));
  assert.deepEqual(other.data.otherNames.map((e) => Object.keys(e)), [['q2_3a'], ['q2_3a']]);
  const noGiven = validate('2A', { ...S2A, q2_3: true, otherNames: [{ q2_3b: 'Onlyfamily' }] });
  assert.deepEqual(Object.keys(noGiven.errors), ['otherNames.0.q2_3a']);

  const partner = { q4_1: 'Testpartner', q4_3: '1991-02-03', q4_4: 'GB', q4_5: true, q4_6: false };
  assert.equal(validate('4A', partner, { q2_13: 'married' }).success, true, 'partner without a family name');
  assert.deepEqual(Object.keys(validate('4A', { ...partner, q4_1: '' }, { q2_13: 'married' }).errors), ['q4_1']);

  const companion = { q1_3a: 'friend', q1_3b: 'Testcompanion' };
  const S1 = { q1_1: 'tourism', q1_2: false, q1_3: true, q1_4: 'holiday', q1_5: 'Test trip for automated tests.', q1_6: '2027-03-01', q1_7: '2027-03-15' };
  assert.equal(validate('1', { ...S1, companions: [companion] }).success, true);
  assert.deepEqual(Object.keys(validate('1', { ...S1, companions: [{ ...companion, q1_3b: '' }] }).errors), ['companions.0.q1_3b']);

  const parent = { q4_8a: 'mother', q4_8b: 'Testmother', q4_8d: '1962-01-02', q4_8e: 'GB', q4_8f: true };
  assert.equal(validate('4C', { q4_8: true, parents: [parent] }).success, true);

  const relative = { q6_6b: 'sibling', q6_6c: 'Testrelative', q6_6f: 'GB', q6_6g: 'british_citizen' };
  assert.equal(validate('6B', { q6_6: true, ukFamily: [relative] }).success, true);
  assert.deepEqual(Object.keys(validate('6B', { q6_6: true, ukFamily: [{ ...relative, q6_6c: '' }] }).errors), ['ukFamily.0.q6_6c']);
});

test('the review page: an applicant with no Family name shows "Not answered" for it, with no "undefined" or "null" anywhere', () => {
  const review = view.buildReview(config, { q2_1: 'Mononame', q2_13: 'single' }, [], {});
  const row = review.parts.flatMap((p) => p.sections).find((s) => s.id === '2A').rows.find((r) => r.id === 'q2_2');
  assert.equal(row.value, 'Not answered');
  assert.equal(row.empty, true);
  assert.doesNotMatch(JSON.stringify(review), /undefined|"null"|NaN/);
});

test('the cover letter name placeholder: the given name alone when there is no Family name, both when there are, nothing when neither', () => {
  const values = (a, b) => coverLetterFacts.tokenValues(config, { q2_1: a, q2_2: b });
  assert.equal(values('Testfirst', 'Testlast').NAME, 'Testfirst Testlast');
  assert.equal(values('Testfirst', undefined).NAME, 'Testfirst');
  assert.equal(values('Testfirst', '').NAME, 'Testfirst');
  assert.equal(values('Testfirst', '   ').NAME, 'Testfirst');
  assert.equal(values(undefined, undefined).NAME, undefined);
  assert.equal(values('Test  First', 'Testlast').NAME, 'Test First Testlast', 'no double space');
});
