'use strict';

// Run with: npm run test:shared   (from the repo root)
// All answers below are made-up test data.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const z = require(require.resolve('zod', { paths: [path.join(__dirname, '..', '..', 'backend')] }));
const engine = require('./engine');
const { config } = engine;

const clone = (o) => JSON.parse(JSON.stringify(o));
const deepFreeze = (o) => {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};
const validate = (sectionId, incoming, existing, opts) =>
  engine.validateSection(z, config, sectionId, incoming, existing, { today: '2026-10-28', ...opts });

/** Small config for question types the real Parts 1-2 do not use yet. */
function mk(questions, groups = []) {
  return {
    version: 'test',
    limits: { txtMax: 50, lngMax: 200, groupMax: 3 },
    parts: [{ id: '1', title: 'P' }],
    sections: [{ id: 'S', part: '1', title: 'S' }],
    groups: groups.map((g) => ({ section: 'S', entryLabel: 'Entry', max: 3, ...g })),
    questions: questions.map((q) => ({ section: 'S', required: true, label: 'L', ...q })),
  };
}
const vs = (cfg, incoming, existing, opts) =>
  engine.validateSection(z, cfg, 'S', incoming, existing, { today: '2026-10-28', ...opts });

// Valid made-up answers per section.
const S1 = {
  q1_1: 'tourism', q1_2: false, q1_3: false, q1_4: 'tbc_a',
  q1_5: 'Test trip for automated tests.', q1_6: '2027-03-01', q1_7: '2027-03-15',
};
const S2A = {
  q2_1: 'Testfirst', q2_2: 'Testlast', q2_3: false,
  q2_4: 'test.applicant@example.com', q2_5: 'tbc_self', q2_6: false,
  q2_9: 'test.applicant@example.com', q2_10: 'test.applicant@example.com', q2_11: 'test.applicant@example.com',
};
const ADDRESS = { line1: '1 Test Street', town: 'Testville', country: 'GB' };
const S2B = {
  q2_12: 'tbc_a', q2_13: 'tbc_single', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville',
  q2_17: '1990-01-01', q2_18: false, q2_23: false,
};
const S2C = {
  q2_24: ADDRESS, q2_25: true, q2_27: { years: 2, months: 3 }, q2_28: 'tbc_owned', q2_30: false, q2_31: false,
};
const S2D = {
  q2_32: { countryCode: '+44', number: '7700 900123' }, q2_33: 'tbc_a', q2_34: 'mobile', q2_35: ['call'],
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

test('config: the real Parts 1-4 config is structurally valid', () => {
  assert.deepEqual(engine.validateConfig(config), []);
});

test('config: covers exactly the questions of Parts 1 to 4 in the spec (plus the 2.23 follow-up)', () => {
  const expected = new Set();
  for (let i = 1; i <= 7; i++) expected.add(`1.${i}`);
  for (let i = 1; i <= 35; i++) expected.add(`2.${i}`);
  expected.add('2.3a');
  expected.add('2.3b');
  expected.add('2.23a'); // placeholder follow-up added in step 6a, not in the spec
  for (let i = 1; i <= 4; i++) expected.add(`3.${i}`);
  for (let i = 1; i <= 7; i++) expected.add(`4.${i}`);
  for (const l of 'abcdef') { expected.add(`4.7${l}`); expected.add(`4.8${l}`); }
  const actual = new Set(config.questions.map((q) => q.number));
  assert.deepEqual([...actual].sort(), [...expected].sort());
  assert.equal(config.questions.length, expected.size);
});

test('config: sections are 1, 2A-2D, 3, 4A-4C and every question belongs to one', () => {
  assert.deepEqual(config.sections.map((s) => s.id), ['1', '2A', '2B', '2C', '2D', '3', '4A', '4B', '4C']);
  assert.deepEqual(config.parts.map((p) => p.id), ['1', '2', '3', '4']);
  const ids = new Set(config.sections.map((s) => s.id));
  assert.ok(config.questions.every((q) => ids.has(q.section)));
});

test('config: every [TBC] placeholder option sits on a question flagged tbc', () => {
  for (const q of config.questions) {
    if (Array.isArray(q.options) && q.options.some((o) => o.label.includes('[TBC]'))) {
      assert.ok(q.tbc, `${q.number} has [TBC] options but no tbc flag`);
    }
  }
});

test('config: sensitive questions are the national ID number and the passport number only', () => {
  assert.deepEqual(config.questions.filter((q) => q.sensitive).map((q) => q.number), ['2.19', '3.1']);
});

test('config: validateConfig reports broken configs', () => {
  const cases = [
    ['duplicate id', (c) => { c.questions[1].id = c.questions[0].id; }, /Duplicate question id/],
    ['number not matching id', (c) => { c.questions[0].number = '9.9'; }, /does not match id/],
    ['unknown section', (c) => { c.questions[0].section = 'ZZ'; }, /unknown section/],
    ['unknown type', (c) => { c.questions[0].type = 'XYZ'; }, /unknown type/],
    ['SEL without options', (c) => { delete c.questions[0].options; }, /needs options/],
    ['showWhen on unknown question', (c) => { c.questions[3].showWhen = { q: 'q9_9', eq: 'x' }; }, /unknown question/],
    ['showWhen on a later question', (c) => { c.questions[0].showWhen = { q: 'q1_2', eq: true }; }, /earlier question/],
    ['condition without eq/in', (c) => { c.questions[3].showWhen = { q: 'q1_1' }; }, /exactly one of eq, in/],
    ['after on a non-date', (c) => { c.questions[0].rules = { after: 'q1_6' }; }, /needs a DATE or MY/],
    ['unknown group', (c) => { c.questions[0].group = 'nope'; }, /unknown group/],
    ['group with an unknown gate', (c) => { c.groups[0].gate = 'q9_9'; }, /unknown gate/],
    ['group min of zero', (c) => { c.groups[0].min = 0; }, /min must be an integer/],
    ['group min above max', (c) => { c.groups[0].min = 5; c.groups[0].max = 3; }, /min must be an integer/],
    ['group gate not YN', (c) => { c.groups[0].gate = 'q2_1'; }, /must be a YN question/],
    ['group max above limit', (c) => { c.groups[0].max = 999; }, /max must be/],
    ['empty tbc', (c) => { c.questions[0].tbc = ''; }, /tbc must be a non-empty string/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const c = clone(config);
    mutate(c);
    const problems = engine.validateConfig(c);
    assert.ok(problems.some((p) => pattern.test(p)), `${name}: got ${JSON.stringify(problems)}`);
  }
});

// ---------------------------------------------------------------------------
// Release gate
// ---------------------------------------------------------------------------

test('release gate: every section with open tbc flags is blocked; the passport section has none', () => {
  const blockers = engine.getReleaseBlockers(config);
  assert.deepEqual(blockers.map((b) => b.sectionId), ['1', '2A', '2B', '2C', '2D', '4A', '4B', '4C']);
  for (const s of config.sections) assert.equal(engine.isSectionReleasable(config, s.id), s.id === '3');
  assert.ok(blockers.every((b) => b.items.every((i) => i.tbc)));
});

test('release gate: a section is releasable once its tbc flags are gone', () => {
  const c = clone(config);
  for (const q of c.questions) if (q.section === '2D') delete q.tbc;
  assert.equal(engine.isSectionReleasable(c, '2D'), true);
  assert.equal(engine.isSectionReleasable(c, '2A'), false);
});

test('release gate: a tbc on a repeating group blocks its section', () => {
  const c = clone(config);
  for (const q of c.questions) if (q.section === '2A') delete q.tbc;
  assert.equal(engine.isSectionReleasable(c, '2A'), false); // otherNames group is still tbc
  delete c.groups[0].tbc;
  assert.equal(engine.isSectionReleasable(c, '2A'), true);
});

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

test('visibility: 1.4 only appears for the tourism option of 1.1', () => {
  assert.equal(engine.isVisible(config, 'q1_4', {}), false);
  assert.equal(engine.isVisible(config, 'q1_4', { q1_1: 'tbc_other' }), false);
  assert.equal(engine.isVisible(config, 'q1_4', { q1_1: 'tourism' }), true);
});

test('visibility: 2.7 and 2.8 appear only when 2.6 is Yes', () => {
  for (const id of ['q2_7', 'q2_8']) {
    assert.equal(engine.isVisible(config, id, {}), false);
    assert.equal(engine.isVisible(config, id, { q2_6: false }), false);
    assert.equal(engine.isVisible(config, id, { q2_6: true }), true);
  }
});

test('visibility: ID card details 2.19-2.22 follow 2.18', () => {
  for (const id of ['q2_19', 'q2_20', 'q2_21', 'q2_22']) {
    assert.equal(engine.isVisible(config, id, { q2_18: false }), false);
    assert.equal(engine.isVisible(config, id, { q2_18: true }), true);
  }
});

test('visibility: 2.26 is asked only when 2.25 is No; 2.29 only for the Other option', () => {
  assert.equal(engine.isVisible(config, 'q2_26', { q2_25: true }), false);
  assert.equal(engine.isVisible(config, 'q2_26', { q2_25: false }), true);
  assert.equal(engine.isVisible(config, 'q2_29', { q2_28: 'tbc_owned' }), false);
  assert.equal(engine.isVisible(config, 'q2_29', { q2_28: 'other' }), true);
});

test('visibility: other-name fields (group members) follow the 2.3 gate', () => {
  assert.deepEqual(engine.getVisibleQuestions(config, '2A', { q2_3: false }).map((q) => q.id).filter((id) => id.startsWith('q2_3')), ['q2_3']);
  const ids = engine.getVisibleQuestions(config, '2A', { q2_3: true }).map((q) => q.id);
  assert.ok(ids.includes('q2_3a') && ids.includes('q2_3b'));
});

test('visibility: operators in, all, any, not; hidden targets never match', () => {
  const cfg = mk([
    { id: 'q1_1', number: '1.1', type: 'SEL', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }] },
    { id: 'q1_2', number: '1.2', type: 'YN' },
    { id: 'q1_3', number: '1.3', type: 'TXT', showWhen: { q: 'q1_1', in: ['a', 'b'] } },
    { id: 'q1_4', number: '1.4', type: 'TXT', showWhen: { all: [{ q: 'q1_1', eq: 'a' }, { q: 'q1_2', eq: true }] } },
    { id: 'q1_5', number: '1.5', type: 'TXT', showWhen: { any: [{ q: 'q1_1', eq: 'c' }, { q: 'q1_2', eq: true }] } },
    { id: 'q1_6', number: '1.6', type: 'TXT', showWhen: { not: { q: 'q1_1', eq: 'a' } } },
    { id: 'q1_7', number: '1.7', type: 'TXT', showWhen: { q: 'q1_3', eq: 'x' } }, // depends on a hidden question
  ]);
  assert.deepEqual(engine.validateConfig(cfg), []);
  const vis = (id, a) => engine.isVisible(cfg, id, a);
  assert.equal(vis('q1_3', { q1_1: 'b' }), true);
  assert.equal(vis('q1_3', { q1_1: 'c' }), false);
  assert.equal(vis('q1_4', { q1_1: 'a', q1_2: true }), true);
  assert.equal(vis('q1_4', { q1_1: 'a', q1_2: false }), false);
  assert.equal(vis('q1_5', { q1_1: 'a', q1_2: true }), true);
  assert.equal(vis('q1_5', { q1_1: 'a', q1_2: false }), false);
  assert.equal(vis('q1_6', { q1_1: 'b' }), true);
  assert.equal(vis('q1_6', { q1_1: 'a' }), false);
  assert.equal(vis('q1_7', { q1_1: 'c', q1_3: 'x' }), false); // q1_3 is hidden, so its stale answer is ignored
});

test('options: 2.9-2.11 offer only the addresses actually entered', () => {
  const opts = (a) => engine.resolveOptions(config, 'q2_9', a).map((o) => o.value);
  assert.deepEqual(opts({}), []);
  assert.deepEqual(opts({ q2_4: 'a@example.com' }), ['a@example.com']);
  assert.deepEqual(opts({ q2_4: 'a@example.com', q2_6: true, q2_7: 'b@example.com' }), ['a@example.com', 'b@example.com']);
  assert.deepEqual(opts({ q2_4: 'a@example.com', q2_6: false, q2_7: 'stale@example.com' }), ['a@example.com']);
  assert.deepEqual(opts({ q2_4: 'a@example.com', q2_6: true, q2_7: 'a@example.com' }), ['a@example.com']);
});

test('options: country questions use the shared country list', () => {
  const list = engine.resolveOptions(config, 'q2_14', {});
  assert.ok(list.length > 240);
  assert.deepEqual(list.find((o) => o.value === 'GB'), { value: 'GB', label: 'United Kingdom' });
  assert.equal(new Set(list.map((o) => o.value)).size, list.length);
});

// ---------------------------------------------------------------------------
// pruneAnswers
// ---------------------------------------------------------------------------

test('prune: drops answers to hidden questions and unknown keys, across sections', () => {
  const { answers, removed } = engine.pruneAnswers(config, {
    q1_1: 'tbc_other', q1_4: 'tbc_a', q2_6: false, q2_7: 'b@example.com', q2_18: true, q2_19: 'ID-FAKE', evil: 1,
  });
  assert.deepEqual(answers, { q1_1: 'tbc_other', q2_6: false, q2_18: true, q2_19: 'ID-FAKE' });
  assert.deepEqual(removed.sort(), ['q1_4', 'q2_7']);
});

test('prune: removes a whole repeating group when its gate is not Yes, and filters entry keys', () => {
  const entries = [{ q2_3a: 'Testname', q2_3b: 'Testsurname', stray: 'x' }];
  const closed = engine.pruneAnswers(config, { q2_3: false, otherNames: entries });
  assert.deepEqual(closed.answers, { q2_3: false });
  assert.deepEqual(closed.removed, ['otherNames']);
  const open = engine.pruneAnswers(config, { q2_3: true, otherNames: entries });
  assert.deepEqual(open.answers.otherNames, [{ q2_3a: 'Testname', q2_3b: 'Testsurname' }]);
});

test('prune: a change in Part 2 hides dependent answers anywhere in the application', () => {
  const cfg = mk([
    { id: 'q1_1', number: '1.1', type: 'YN' },
    { id: 'q1_2', number: '1.2', type: 'TXT', showWhen: { q: 'q1_1', eq: true } },
  ]);
  const { answers } = engine.pruneAnswers(cfg, { q1_1: false, q1_2: 'stale' });
  assert.deepEqual(answers, { q1_1: false });
});

// ---------------------------------------------------------------------------
// validateSection: real sections
// ---------------------------------------------------------------------------

test('section 1: valid answers pass and are returned normalised', () => {
  const r = validate('1', { ...S1, q1_5: '  Test trip.  ' });
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.equal(r.data.q1_5, 'Test trip.');
  assert.deepEqual(r.errors, {});
  assert.deepEqual(r.removed, []);
});

test('section 1: empty submission lists every required question except hidden 1.4', () => {
  const r = validate('1', {});
  assert.equal(r.success, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['q1_1', 'q1_2', 'q1_3', 'q1_5', 'q1_6', 'q1_7']);
  assert.ok(Object.values(r.errors).every((m) => m === 'This question is required'));
});

test('section 1: choosing tourism makes 1.4 required; other reasons hide and discard it', () => {
  const without = validate('1', { ...S1, q1_4: undefined });
  assert.deepEqual(Object.keys(without.errors), ['q1_4']);
  const other = validate('1', { ...S1, q1_1: 'tbc_other' }, { q1_4: 'tbc_a' });
  assert.equal(other.success, true, JSON.stringify(other.errors));
  assert.equal('q1_4' in other.data, false);
  assert.deepEqual(other.removed, ['q1_4']);
});

test('section 1: the leave date must be after the arrival date', () => {
  const same = validate('1', { ...S1, q1_7: S1.q1_6 });
  assert.match(same.errors.q1_7, /after the date in question 1\.6/);
  const before = validate('1', { ...S1, q1_7: '2027-02-01' });
  assert.ok(before.errors.q1_7);
  assert.equal(validate('1', { ...S1, q1_7: '2027-03-02' }).success, true);
});

test('section 1: impossible and badly formatted dates are rejected', () => {
  assert.equal(validate('1', { ...S1, q1_6: '2027-02-30' }).errors.q1_6, 'Enter a real date');
  assert.equal(validate('1', { ...S1, q1_6: '01/03/2027' }).errors.q1_6, 'Enter a full date');
  assert.equal(validate('1', { ...S1, q1_6: 20270301 }).errors.q1_6, 'Enter a valid answer');
});

test('section 1: a value outside the option list is rejected', () => {
  assert.equal(validate('1', { ...S1, q1_1: 'not-an-option' }).errors.q1_1, 'Choose from the listed options');
});

test('section 1: a Yes/No question must be a real boolean', () => {
  assert.equal(validate('1', { ...S1, q1_2: 'yes' }).errors.q1_2, 'Enter a valid answer');
});

test('section 1: long text over the limit is rejected', () => {
  const r = validate('1', { ...S1, q1_5: 'x'.repeat(config.limits.lngMax + 1) });
  assert.match(r.errors.q1_5, /characters or fewer/);
});

test('section 2A: valid answers pass; emails are trimmed and lower-cased', () => {
  const r = validate('2A', { ...S2A, q2_4: '  Test.Applicant@Example.COM ' });
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.equal(r.data.q2_4, 'test.applicant@example.com');
});

test('section 2A: 2.9-2.11 must pick one of the entered addresses', () => {
  const bad = validate('2A', { ...S2A, q2_9: 'someone.else@example.com' });
  assert.equal(bad.errors.q2_9, 'Choose from the listed options');
  const two = validate('2A', {
    ...S2A, q2_6: true, q2_7: 'second@example.com', q2_8: 'tbc_other', q2_10: 'second@example.com',
  });
  assert.equal(two.success, true, JSON.stringify(two.errors));
  const hidden = validate('2A', { ...S2A, q2_7: 'second@example.com', q2_10: 'second@example.com' });
  assert.equal(hidden.errors.q2_10, 'Choose from the listed options'); // 2.7 is hidden because 2.6 is No
  assert.deepEqual(hidden.removed, ['q2_7']);
});

test('section 2A: an invalid email address is rejected', () => {
  assert.equal(validate('2A', { ...S2A, q2_4: 'not-an-email' }).errors.q2_4, 'Enter a valid email address');
});

test('section 2A: answering Yes to 2.3 requires at least one other-name entry', () => {
  const none = validate('2A', { ...S2A, q2_3: true });
  assert.equal(none.errors.otherNames, 'Add at least one entry');
  const empty = validate('2A', { ...S2A, q2_3: true, otherNames: [] });
  assert.equal(empty.errors.otherNames, 'Add at least one entry');
});

test('section 2A: other-name entries are validated one by one', () => {
  const r = validate('2A', {
    ...S2A, q2_3: true,
    otherNames: [{ q2_3a: 'Alias', q2_3b: 'One' }, { q2_3a: 'Alias' }, { q2_3a: '', q2_3b: '' }],
  });
  assert.equal(r.success, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['otherNames.1.q2_3b', 'otherNames.2.q2_3a', 'otherNames.2.q2_3b']);
  const ok = validate('2A', { ...S2A, q2_3: true, otherNames: [{ q2_3a: ' Alias ', q2_3b: 'One' }] });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  assert.deepEqual(ok.data.otherNames, [{ q2_3a: 'Alias', q2_3b: 'One' }]);
});

test('section 2A: more entries than the group maximum are rejected', () => {
  const entries = Array.from({ length: config.groups[0].max + 1 }, () => ({ q2_3a: 'A', q2_3b: 'B' }));
  assert.match(validate('2A', { ...S2A, q2_3: true, otherNames: entries }).errors.otherNames, /up to 20 entries/);
});

test('section 2A: switching 2.3 to No discards stored entries', () => {
  const r = validate('2A', { ...S2A, q2_3: false, otherNames: [{ q2_3a: 'A', q2_3b: 'B' }] }, { otherNames: [{ q2_3a: 'A', q2_3b: 'B' }] });
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.equal('otherNames' in r.data, false);
  assert.deepEqual(r.removed, ['otherNames']);
});

test('section 2A: unknown entry fields are reported, not stored', () => {
  const r = validate('2A', { ...S2A, q2_3: true, otherNames: [{ q2_3a: 'A', q2_3b: 'B', extra: 'x' }] });
  assert.equal(r.success, false);
  assert.deepEqual(r.unknownKeys, ['otherNames.0.extra']);
  assert.deepEqual(r.data.otherNames, [{ q2_3a: 'A', q2_3b: 'B' }]);
});

test('section 2B: valid answers pass', () => {
  const r = validate('2B', S2B);
  assert.equal(r.success, true, JSON.stringify(r.errors));
});

test('section 2B: ID number and authority are required when 2.18 is Yes; issue and expiry dates are optional', () => {
  const missing = validate('2B', { ...S2B, q2_18: true });
  assert.deepEqual(Object.keys(missing.errors).sort(), ['q2_19', 'q2_20']);
  const idOnly = { ...S2B, q2_18: true, q2_19: 'FAKE-ID-0001', q2_20: 'Test Authority' };
  assert.equal(validate('2B', idOnly).success, true);
  const ok = validate('2B', { ...idOnly, q2_21: '2020-01-01', q2_22: '2030-01-01' });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  const hidden = validate('2B', { ...S2B, q2_19: 'FAKE-ID-0001' }, { q2_20: 'old' });
  assert.deepEqual(hidden.removed.sort(), ['q2_19', 'q2_20']);
});

test('section 2B: 2.22 must follow 2.21 only when both are filled in', () => {
  const id = { ...S2B, q2_18: true, q2_19: 'FAKE-ID-0001', q2_20: 'Test Authority' };
  const order = validate('2B', { ...id, q2_21: '2020-01-01', q2_22: '2019-01-01' });
  assert.match(order.errors.q2_22, /after the date in question 2\.21/);
  assert.ok(validate('2B', { ...id, q2_21: '2020-01-01', q2_22: '2020-01-01' }).errors.q2_22); // same day is not after
  // Only one of the two filled in: the rule does not run.
  assert.equal(validate('2B', { ...id, q2_22: '2019-01-01' }).success, true);
  assert.equal(validate('2B', { ...id, q2_21: '2020-01-01' }).success, true);
  // A filled-in date is still checked on its own.
  assert.equal(validate('2B', { ...id, q2_22: '2019-02-30' }).errors.q2_22, 'Enter a real date');
  assert.equal(validate('2B', { ...id, q2_21: '2026-10-29' }).errors.q2_21, 'Cannot be in the future');
  // Blank strings count as not filled in.
  assert.equal(validate('2B', { ...id, q2_21: '', q2_22: '2019-01-01' }).success, true);
});

test('section 2B: dates of birth and ID issue dates cannot be in the future', () => {
  assert.equal(validate('2B', { ...S2B, q2_17: '2026-10-29' }).errors.q2_17, 'Cannot be in the future');
  assert.equal(validate('2B', { ...S2B, q2_17: '2026-10-28' }).success, true);
});

test('section 2B: countries must come from the country list', () => {
  assert.equal(validate('2B', { ...S2B, q2_14: 'XX' }).errors.q2_14, 'Choose a country from the list');
  assert.equal(validate('2B', { ...S2B, q2_14: 'United Kingdom' }).errors.q2_14, 'Choose a country from the list');
});

test('section 2C: valid answers pass; postcode and region are optional', () => {
  const r = validate('2C', S2C);
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.deepEqual(r.data.q2_27, { years: 2, months: 3 });
});

test('section 2C: address fields are checked individually', () => {
  const r = validate('2C', { ...S2C, q2_24: { town: 'Testville', country: 'ZZ' } });
  assert.equal(r.errors['q2_24.line1'], 'This question is required');
  assert.equal(r.errors['q2_24.country'], 'Choose a country from the list');
  assert.equal(validate('2C', { ...S2C, q2_24: { ...ADDRESS, extra: 'x' } }).success, false);
});

test('section 2C: 2.26 is required only when 2.25 is No', () => {
  const no = validate('2C', { ...S2C, q2_25: false });
  assert.equal(no.errors.q2_26, 'This question is required');
  const done = validate('2C', { ...S2C, q2_25: false, q2_26: ADDRESS });
  assert.equal(done.success, true, JSON.stringify(done.errors));
  const yes = validate('2C', { ...S2C, q2_26: ADDRESS }, { q2_26: ADDRESS });
  assert.deepEqual(yes.removed, ['q2_26']);
});

test('section 2C: duration needs both years and months, and months stay under 12', () => {
  assert.equal(validate('2C', { ...S2C, q2_27: { years: 2 } }).errors.q2_27, 'Enter years and months');
  assert.match(validate('2C', { ...S2C, q2_27: { years: 1, months: 12 } }).errors.q2_27, /11 or fewer/);
  assert.equal(validate('2C', { ...S2C, q2_27: { years: 0, months: 0 } }).success, true);
  assert.equal(validate('2C', { ...S2C, q2_27: { years: -1, months: 0 } }).success, false);
  assert.equal(validate('2C', { ...S2C, q2_27: { years: 1.5, months: 0 } }).success, false);
});

test('section 2C: the Other ownership option requires living-situation details', () => {
  const r = validate('2C', { ...S2C, q2_28: 'other' });
  assert.deepEqual(Object.keys(r.errors), ['q2_29']);
  assert.equal(validate('2C', { ...S2C, q2_28: 'other', q2_29: 'Lives with a test relative.' }).success, true);
});

test('section 2D: valid answers pass', () => {
  const r = validate('2D', S2D);
  assert.equal(r.success, true, JSON.stringify(r.errors));
});

test('section 2D: telephone number and contact checklist are checked', () => {
  assert.equal(validate('2D', { ...S2D, q2_32: { countryCode: '44', number: '7700 900123' } }).errors['q2_32.countryCode'], 'Enter a country code such as +44');
  assert.equal(validate('2D', { ...S2D, q2_32: { countryCode: '+44', number: 'call me' } }).errors['q2_32.number'], 'Use digits, spaces, brackets and hyphens only');
  assert.equal(validate('2D', { ...S2D, q2_32: { countryCode: '+44', number: '12' } }).errors['q2_32.number'], 'Enter a valid telephone number');
  assert.equal(validate('2D', { ...S2D, q2_35: [] }).errors.q2_35, 'This question is required');
  assert.equal(validate('2D', { ...S2D, q2_35: ['fax'] }).errors.q2_35, 'Choose from the listed options');
  assert.equal(validate('2D', { ...S2D, q2_35: ['call', 'call'] }).success, false);
});

// ---------------------------------------------------------------------------
// validateSection: behaviour that applies to every section
// ---------------------------------------------------------------------------

test('section save replaces the section: omitted answers count as unanswered', () => {
  const r = validate('1', { ...S1, q1_5: undefined }, { q1_5: 'old answer from an earlier save' });
  assert.equal(r.errors.q1_5, 'This question is required');
});

test('section save uses answers from other sections for conditions', () => {
  // Part 2B-style dependency on another section, using a synthetic two-section config.
  const cfg = clone(mk([
    { id: 'q1_1', number: '1.1', type: 'YN' },
    { id: 'q2_1', number: '2.1', type: 'TXT', section: 'T', showWhen: { q: 'q1_1', eq: true } },
  ]));
  cfg.sections.push({ id: 'T', part: '1', title: 'T' });
  assert.deepEqual(engine.validateConfig(cfg), []);
  const on = engine.validateSection(z, cfg, 'T', {}, { q1_1: true });
  assert.equal(on.errors.q2_1, 'This question is required');
  const off = engine.validateSection(z, cfg, 'T', { q2_1: 'stale' }, { q1_1: false });
  assert.equal(off.success, true);
  assert.deepEqual(off.removed, ['q2_1']);
});

test('keys that do not belong to the section are reported and never accepted', () => {
  const r = validate('1', { ...S1, q2_1: 'Testfirst', q9_9: 'x' });
  assert.equal(r.success, false);
  assert.deepEqual(r.unknownKeys.sort(), ['q2_1', 'q9_9']);
  assert.equal('q2_1' in r.data, false);
});

test('prototype pollution attempts are reported and have no effect', () => {
  const evil = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"x": 1}}');
  const r = validate('1', { ...S1, ...evil });
  assert.equal(r.success, false);
  assert.equal({}.polluted, undefined);
  const nested = validate('2C', { ...S2C, q2_24: JSON.parse('{"line1":"a","town":"b","country":"GB","__proto__":{"polluted":true}}') });
  assert.equal({}.polluted, undefined);
  assert.equal(nested.success, true, JSON.stringify(nested.errors));
});

test('inputs are never mutated', () => {
  const incoming = deepFreeze(clone({ ...S2A, q2_3: true, otherNames: [{ q2_3a: 'A', q2_3b: 'B' }] }));
  const existing = deepFreeze(clone({ ...S1, ...S2B }));
  assert.doesNotThrow(() => validate('2A', incoming, existing));
  assert.doesNotThrow(() => engine.pruneAnswers(config, existing));
});

test('error messages never contain submitted values', () => {
  const secret = 'SECRET-PASSPORT-9999';
  const r = validate('2B', {
    ...S2B, q2_14: secret, q2_17: secret, q2_18: true, q2_19: secret.repeat(40),
    q2_20: 'x', q2_21: secret, q2_22: secret,
  });
  assert.equal(r.success, false);
  assert.ok(Object.keys(r.errors).length >= 4);
  assert.equal(JSON.stringify(r.errors).includes('SECRET'), false);
  const e = validate('2A', { ...S2A, q2_4: secret, q2_9: secret });
  assert.equal(JSON.stringify(e.errors).includes('SECRET'), false);
});

test('validateSection rejects an unknown section id and tolerates a non-object body', () => {
  assert.throws(() => validate('9Z', {}), /Unknown section/);
  const r = validate('1', 'not an object');
  assert.equal(r.success, false);
  assert.ok(r.errors.q1_1);
});

// ---------------------------------------------------------------------------
// Types not used by Parts 1-2 yet (exercised on a synthetic config)
// ---------------------------------------------------------------------------

test('types: MY, NUM, AMT, ACK and single-unit DUR', () => {
  const cfg = mk([
    { id: 'q1_1', number: '1.1', type: 'MY', rules: { notFuture: true } },
    { id: 'q1_2', number: '1.2', type: 'NUM', rules: { max: 20 } },
    { id: 'q1_3', number: '1.3', type: 'AMT' },
    { id: 'q1_4', number: '1.4', type: 'ACK' },
    { id: 'q1_5', number: '1.5', type: 'DUR', rules: { units: ['days', 'weeks', 'months', 'years'] } },
  ]);
  assert.deepEqual(engine.validateConfig(cfg), []);
  const good = { q1_1: '2026-05', q1_2: 3, q1_3: { amount: 1250.5, currency: 'GBP' }, q1_4: true, q1_5: { weeks: 2 } };
  const ok = vs(cfg, good);
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  assert.equal(vs(cfg, { ...good, q1_1: '2026-13' }).errors.q1_1, 'Enter a real month and year');
  assert.equal(vs(cfg, { ...good, q1_1: '2026-11' }).errors.q1_1, 'Cannot be in the future');
  assert.equal(vs(cfg, { ...good, q1_1: '2026-10' }).success, true);
  assert.equal(vs(cfg, { ...good, q1_2: 21 }).errors.q1_2, 'Number is too large');
  assert.equal(vs(cfg, { ...good, q1_2: 1.5 }).errors.q1_2, 'Enter a whole number');
  assert.equal(vs(cfg, { ...good, q1_2: '3' }).errors.q1_2, 'Enter a valid answer');
  assert.equal(vs(cfg, { ...good, q1_3: { amount: 1.234, currency: 'GBP' } }).errors['q1_3.amount'], 'Use at most two decimal places');
  assert.ok(vs(cfg, { ...good, q1_3: { amount: 5, currency: 'USD' } }).errors['q1_3.currency']);
  assert.equal(vs(cfg, { ...good, q1_4: false }).errors.q1_4, 'You must tick this box to continue');
  assert.equal(vs(cfg, { ...good, q1_5: { weeks: 1, days: 2 } }).errors.q1_5, 'Enter a number and a unit');
  assert.equal(vs(cfg, { ...good, q1_5: { weeks: 0 } }).errors.q1_5, 'Enter a number above zero');
});

test('types: after accepts several earlier questions', () => {
  const cfg = mk([
    { id: 'q1_1', number: '1.1', type: 'DATE' },
    { id: 'q1_2', number: '1.2', type: 'DATE' },
    { id: 'q1_3', number: '1.3', type: 'DATE', rules: { after: ['q1_1', 'q1_2'] } },
  ]);
  assert.deepEqual(engine.validateConfig(cfg), []);
  assert.equal(vs(cfg, { q1_1: '2027-01-01', q1_2: '2027-06-01', q1_3: '2027-07-01' }).success, true);
  assert.ok(vs(cfg, { q1_1: '2027-01-01', q1_2: '2027-06-01', q1_3: '2027-03-01' }).errors.q1_3);
});

test('types: after reads an answer stored in another section', () => {
  const cfg = mk([{ id: 'q1_1', number: '1.1', type: 'DATE' }, { id: 'q2_1', number: '2.1', type: 'DATE', section: 'T', rules: { after: 'q1_1' } }]);
  cfg.sections.push({ id: 'T', part: '1', title: 'T' });
  assert.deepEqual(engine.validateConfig(cfg), []);
  const r = engine.validateSection(z, cfg, 'T', { q2_1: '2027-01-01' }, { q1_1: '2027-05-01' });
  assert.match(r.errors.q2_1, /question 1\.1/);
  assert.equal(engine.validateSection(z, cfg, 'T', { q2_1: '2027-01-01' }, {}).success, true); // other not answered yet
});

test('groups: a member can depend on a sibling answer inside the same entry', () => {
  const cfg = mk(
    [
      { id: 'q1_1', number: '1.1', type: 'YN' },
      { id: 'q1_2', number: '1.2', type: 'SEL', group: 'trips', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
      { id: 'q1_3', number: '1.3', type: 'TXT', group: 'trips', showWhen: { q: 'q1_2', eq: 'b' } },
      { id: 'q1_4', number: '1.4', type: 'DATE', group: 'trips' },
      { id: 'q1_5', number: '1.5', type: 'DATE', group: 'trips', rules: { after: 'q1_4' } },
    ],
    [{ id: 'trips', gate: 'q1_1', questions: ['q1_2', 'q1_3', 'q1_4', 'q1_5'] }]
  );
  assert.deepEqual(engine.validateConfig(cfg), []);
  const entries = [
    { q1_2: 'a', q1_4: '2020-01-01', q1_5: '2020-01-10' },
    { q1_2: 'b', q1_3: 'Detail', q1_4: '2021-01-01', q1_5: '2021-01-10' },
  ];
  const ok = vs(cfg, { q1_1: true, trips: entries });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  const bad = vs(cfg, {
    q1_1: true,
    trips: [{ q1_2: 'b', q1_4: '2021-02-01', q1_5: '2021-01-01' }, { q1_2: 'a', q1_3: 'stale', q1_4: '2020-01-01', q1_5: '2020-01-10' }],
  });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['trips.0.q1_3', 'trips.0.q1_5']);
  assert.deepEqual(bad.data.trips[1], { q1_2: 'a', q1_4: '2020-01-01', q1_5: '2020-01-10' }); // stale q1_3 dropped
  assert.equal(vs(cfg, { q1_1: true, trips: new Array(4).fill(entries[0]) }).errors.trips, 'You can add up to 3 entries');
});

test('FILE questions are skipped here; uploads are validated by the document endpoints', () => {
  const cfg = mk([{ id: 'q1_1', number: '1.1', type: 'FILE' }, { id: 'q1_2', number: '1.2', type: 'YN' }]);
  assert.equal(vs(cfg, { q1_2: true }).success, true);
});

// ---------------------------------------------------------------------------
// Step 6a: Parts 3 and 4, optional gate and min on groups, section visibility
// ---------------------------------------------------------------------------

const S3 = { q3_1: 'FAKE-PASSPORT-001', q3_2: 'Test Passport Office', q3_3: '2022-05-01', q3_4: '2032-05-01' };
const PARTNER = { q4_1: 'Testpartner', q4_2: 'Testsurname', q4_3: '1991-02-03', q4_4: 'GB', q4_5: true, q4_6: false };
const DEPENDANT = { q4_7a: 'tbc_child', q4_7b: 'Testchild', q4_7c: 'Testsurname', q4_7d: '2015-06-07', q4_7e: true, q4_7f: false };
const PARENT = { q4_8a: 'tbc_mother', q4_8b: 'Testmother', q4_8c: 'Testsurname', q4_8d: '1962-01-02', q4_8e: 'GB', q4_8f: true };

test('part 3: valid passport details pass; every question is required', () => {
  const ok = validate('3', S3, { q1_7: '2027-03-15' });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  assert.deepEqual(validate('3', {}).errors, {
    q3_1: 'This question is required', q3_2: 'This question is required',
    q3_3: 'This question is required', q3_4: 'This question is required',
  });
});

test('part 3: 3.4 must be after the issue date (3.3)', () => {
  const r = validate('3', { ...S3, q3_4: '2022-05-01' });
  assert.equal(r.errors.q3_4, 'Must be after the date in question 3.3');
  assert.equal(validate('3', { ...S3, q3_4: '2020-01-01' }).success, false);
});

test('part 3: 3.4 must also be after the planned leave date in 1.7, a rule across sections', () => {
  const leave = '2027-03-15';
  assert.equal(validate('3', { ...S3, q3_4: leave }, { q1_7: leave }).errors.q3_4, 'Must be after the date in question 1.7');
  assert.equal(validate('3', { ...S3, q3_4: '2027-03-14' }, { q1_7: leave }).errors.q3_4, 'Must be after the date in question 1.7');
  assert.equal(validate('3', { ...S3, q3_4: '2027-03-16' }, { q1_7: leave }).success, true);
});

test('part 3: the leave-date check waits until section 1 has a leave date', () => {
  assert.equal(validate('3', { ...S3, q3_4: '2023-01-01' }, {}).success, true);
  assert.equal(validate('3', { ...S3, q3_4: '2023-01-01' }, { q1_7: '2027-03-15' }).success, false);
});

test('part 3: the issue date cannot be in the future', () => {
  assert.equal(validate('3', { ...S3, q3_3: '2026-10-29', q3_4: '2033-01-01' }).errors.q3_3, 'Cannot be in the future');
});

test('part 3: only the passport number is flagged sensitive for encryption', () => {
  assert.deepEqual(config.questions.filter((q) => q.section === '3' && q.sensitive).map((q) => q.id), ['q3_1']);
});

test('2.23a: shown only when 2.23 is Yes, required then, discarded when it changes', () => {
  assert.equal(engine.isVisible(config, 'q2_23a', { q2_23: false }), false);
  assert.equal(engine.isVisible(config, 'q2_23a', { q2_23: true }), true);
  assert.equal(validate('2B', { ...S2B, q2_23: true }).errors.q2_23a, 'This question is required');
  const ok = validate('2B', { ...S2B, q2_23: true, q2_23a: 'Plain test details' });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  assert.equal(ok.data.q2_23a, 'Plain test details');
  const closed = validate('2B', { ...S2B, q2_23: false, q2_23a: 'stale' }, { q2_23a: 'stale' });
  assert.equal(closed.success, true);
  assert.equal('q2_23a' in closed.data, false);
  assert.deepEqual(closed.removed, ['q2_23a']);
});

test('2.23a is one plain text box: no question about another country identity or passport numbers', () => {
  const q = config.questions.find((x) => x.id === 'q2_23a');
  assert.equal(q.type, 'LNG');
  assert.ok(q.tbc);
  const followUps = config.questions.filter((x) => x.showWhen && x.showWhen.q === 'q2_23').map((x) => x.id);
  assert.deepEqual(followUps, ['q2_23a']);
});

test('4A: the spouse or partner questions follow 2.13 (placeholder statuses)', () => {
  const ids = ['q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5', 'q4_6'];
  for (const status of ['tbc_married', 'tbc_partner']) {
    for (const id of ids) assert.equal(engine.isVisible(config, id, { q2_13: status }), true, `${id} for ${status}`);
  }
  for (const answers of [{ q2_13: 'tbc_single' }, {}]) {
    for (const id of ids) assert.equal(engine.isVisible(config, id, answers), false);
  }
});

test('4A: valid partner details pass, and all of them are required when shown', () => {
  const ok = validate('4A', PARTNER, { q2_13: 'tbc_married' });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  const empty = validate('4A', {}, { q2_13: 'tbc_partner' });
  assert.deepEqual(Object.keys(empty.errors), ['q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5', 'q4_6']);
  assert.equal(validate('4A', { ...PARTNER, q4_3: '2090-01-01' }, { q2_13: 'tbc_married' }).errors.q4_3, 'Cannot be in the future');
});

test('4A: when 2.13 does not indicate a partner the section is hidden and stored answers are removed', () => {
  const single = { q2_13: 'tbc_single' };
  assert.equal(engine.isSectionVisible(config, '4A', single), false);
  assert.equal(engine.isSectionVisible(config, '4A', { q2_13: 'tbc_married' }), true);
  const r = validate('4A', PARTNER, { ...single, ...PARTNER });
  assert.equal(r.success, true);
  assert.deepEqual(r.data, {});
  assert.deepEqual(r.removed.sort(), ['q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5', 'q4_6']);
});

test('4B: a Yes to 4.7 needs at least one dependant, each fully answered', () => {
  assert.equal(validate('4B', { q4_7: false }).success, true);
  assert.equal(validate('4B', { q4_7: true }).errors.dependants, 'Add at least one entry');
  const ok = validate('4B', { q4_7: true, dependants: [DEPENDANT, { ...DEPENDANT, q4_7e: false, q4_7f: true }] });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  assert.equal(ok.data.dependants[1].q4_7f, true);
  const bad = validate('4B', { q4_7: true, dependants: [{ ...DEPENDANT, q4_7d: '2090-01-01', q4_7e: undefined }] });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['dependants.0.q4_7d', 'dependants.0.q4_7e']);
});

test('4B: answering No to 4.7 discards the dependants', () => {
  const r = validate('4B', { q4_7: false, dependants: [DEPENDANT] }, { dependants: [DEPENDANT] });
  assert.equal(r.success, true);
  assert.equal('dependants' in r.data, false);
  assert.deepEqual(r.removed, ['dependants']);
});

test('4C: the parents group has no Yes/No question; it is always open and needs at least one parent', () => {
  const group = config.groups.find((g) => g.id === 'parents');
  assert.equal(group.gate, undefined);
  assert.equal(group.min, 1);
  assert.equal(engine.isSectionVisible(config, '4C', {}), true);
  assert.equal(validate('4C', {}).errors.parents, 'Add at least one entry');
  assert.equal(validate('4C', { parents: [] }).errors.parents, 'Add at least one entry');
  const one = validate('4C', { parents: [PARENT] });
  assert.equal(one.success, true, JSON.stringify(one.errors));
  const two = validate('4C', { parents: [PARENT, { ...PARENT, q4_8a: 'tbc_father', q4_8f: false }] });
  assert.equal(two.success, true);
  assert.equal(two.data.parents.length, 2);
});

test('4C: entries are validated one by one with errors on the right entry and field', () => {
  const r = validate('4C', { parents: [PARENT, { q4_8a: 'tbc_father', q4_8b: 'Testfather', q4_8e: 'ZZ' }] });
  assert.deepEqual(Object.keys(r.errors).sort(), ['parents.1.q4_8c', 'parents.1.q4_8d', 'parents.1.q4_8e', 'parents.1.q4_8f']);
  assert.equal(r.errors['parents.1.q4_8e'], 'Choose a country from the list');
});

test('4C: pruning keeps an always-open group and strips unknown entry keys', () => {
  const { answers, removed } = engine.pruneAnswers(config, { parents: [{ ...PARENT, stray: 'x' }] });
  assert.deepEqual(answers.parents, [PARENT]);
  assert.deepEqual(removed, []);
});

test('groups: a group without a gate is valid config, a larger min is enforced, and min must fit max', () => {
  const cfg = mk(
    [{ id: 'q1_1', number: '1.1', type: 'TXT', group: 'people' }],
    [{ id: 'people', questions: ['q1_1'], min: 2 }]
  );
  assert.deepEqual(engine.validateConfig(cfg), []);
  assert.equal(vs(cfg, {}).errors.people, 'Add at least 2 entries');
  assert.equal(vs(cfg, { people: [{ q1_1: 'a' }] }).errors.people, 'Add at least 2 entries');
  assert.equal(vs(cfg, { people: [{ q1_1: 'a' }, { q1_1: 'b' }] }).success, true);
  assert.equal(vs(cfg, { people: [{ q1_1: 'a' }, {}] }).errors['people.1.q1_1'], 'This question is required');
  cfg.groups[0].min = 4; // above max (3)
  assert.ok(engine.validateConfig(cfg).some((p) => /min must be an integer/.test(p)));
});

test('sections: a section is hidden exactly when none of its questions is visible', () => {
  const cfg = mk([
    { id: 'q1_1', number: '1.1', type: 'YN' },
    { id: 'q2_1', number: '2.1', type: 'TXT', section: 'T', showWhen: { q: 'q1_1', eq: true } },
    { id: 'q2_2', number: '2.2', type: 'TXT', section: 'T', showWhen: { q: 'q1_1', eq: true } },
  ]);
  cfg.sections.push({ id: 'T', part: '1', title: 'T' });
  assert.deepEqual(engine.getVisibleSections(cfg, { q1_1: true }).map((s) => s.id), ['S', 'T']);
  assert.deepEqual(engine.getVisibleSections(cfg, { q1_1: false }).map((s) => s.id), ['S']);
  assert.deepEqual(engine.getVisibleSections(cfg, {}).map((s) => s.id), ['S']);
  assert.throws(() => engine.isSectionVisible(cfg, 'nope', {}), /Unknown section/);
});

test('sections: on the real config only 4A can be hidden, and only by 2.13', () => {
  const visible = (answers) => engine.getVisibleSections(config, answers).map((s) => s.id);
  assert.deepEqual(visible({}), ['1', '2A', '2B', '2C', '2D', '3', '4B', '4C']);
  assert.deepEqual(visible({ q2_13: 'tbc_single' }), ['1', '2A', '2B', '2C', '2D', '3', '4B', '4C']);
  assert.deepEqual(visible({ q2_13: 'tbc_married' }), ['1', '2A', '2B', '2C', '2D', '3', '4A', '4B', '4C']);
  assert.deepEqual(visible({ q2_13: 'tbc_partner' }), ['1', '2A', '2B', '2C', '2D', '3', '4A', '4B', '4C']);
});

test('prune: changing 2.13 removes the spouse or partner answers held in another section', () => {
  const before = { q2_13: 'tbc_married', ...PARTNER, q4_7: false };
  assert.equal(engine.pruneAnswers(config, before).answers.q4_1, 'Testpartner');
  const after = engine.pruneAnswers(config, { ...before, q2_13: 'tbc_single' });
  assert.deepEqual(after.removed.sort(), ['q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5', 'q4_6']);
  assert.deepEqual(after.answers, { q2_13: 'tbc_single', q4_7: false });
});

test('compatibility: answers saved before step 6a (config 0.1.0) still validate unchanged', () => {
  for (const [section, answers] of [['1', S1], ['2A', S2A], ['2B', S2B], ['2C', S2C], ['2D', S2D]]) {
    const r = validate(section, answers);
    assert.equal(r.success, true, `${section}: ${JSON.stringify(r.errors)}`);
  }
  // 2.13 values saved earlier are still on the list.
  assert.equal(validate('2B', { ...S2B, q2_13: 'tbc_married' }).success, true);
});
