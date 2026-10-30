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
  q1_1: 'tourism', q1_2: false, q1_3: false, q1_4: 'holiday',
  q1_5: 'Test trip for automated tests.', q1_6: '2027-03-01', q1_7: '2027-03-15',
};
const S2A = {
  q2_1: 'Testfirst', q2_2: 'Testlast', q2_3: false,
  q2_4: 'test.applicant@example.com', q2_5: 'me', q2_6: false,
  q2_9: 'test.applicant@example.com', q2_10: 'test.applicant@example.com', q2_11: 'test.applicant@example.com',
};
const ADDRESS = { line1: '1 Test Street', town: 'Testville', country: 'GB' };
const S2B = {
  q2_12: 'female', q2_13: 'single', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville',
  q2_17: '1990-01-01', q2_18: false, q2_23: false,
};
const S2C = {
  q2_24: ADDRESS, q2_25: true, q2_27: { years: 2, months: 3 }, q2_28: 'owned', q2_30: false, q2_31: false,
};
const S2D = {
  q2_32: { countryCode: '+44', number: '7700 900123' }, q2_33: 'in_uk', q2_34: 'mobile', q2_35: ['call'],
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

test('config: the real Parts 1-6 config is structurally valid', () => {
  assert.deepEqual(engine.validateConfig(config), []);
});

test('config: covers exactly the questions of Parts 1 to 8 in the spec (plus the follow-ups added for the Yes paths)', () => {
  const expected = new Set();
  for (let i = 1; i <= 7; i++) expected.add(`1.${i}`);
  for (let i = 1; i <= 35; i++) expected.add(`2.${i}`);
  expected.add('2.3a');
  expected.add('2.3b');
  expected.add('2.3c');
  for (const l of 'bcde') expected.add(`2.23${l}`); // follow-ups of the other-nationality group (7b)
  expected.add('2.30a');
  for (const l of 'abcde') expected.add(`2.31${l}`);
  expected.add('1.2a'); expected.add('1.2b');
  for (const l of 'abcde') expected.add(`1.3${l}`);
  expected.add('4.8'); expected.add('4.8g'); expected.add('4.8h'); expected.add('4.8i');
  for (let i = 1; i <= 4; i++) expected.add(`3.${i}`);
  for (let i = 1; i <= 7; i++) expected.add(`4.${i}`);
  for (const l of 'abcdef') { expected.add(`4.7${l}`); expected.add(`4.8${l}`); }
  for (let i = 1; i <= 9; i++) expected.add(`5.${i}`);
  for (let i = 1; i <= 8; i++) expected.add(`6.${i}`);
  for (const l of 'abcd') expected.add(`6.7${l}`);
  for (const n of ['7.3', '7.6']) expected.add(`${n}a`); // placeholder follow-ups added in step 6c, not in the spec (Part 7 is not drafted yet)
  for (const l of 'abcdefghijkl') expected.add(`5.1${l}`); // other employment statuses (7c)
  expected.add('6.1a');
  for (const l of 'bcdefg') { expected.add(`6.5${l}`); expected.add(`6.6${l}`); } // payers and relatives in the UK (7c)
  expected.add('6.7x'); expected.add('6.7y');
  for (const l of 'bcde') expected.add(`6.8${l}`);
  for (let i = 1; i <= 7; i++) expected.add(`7.${i}`);
  for (const l of 'abc') expected.add(`7.5${l}`);
  for (const l of 'abcd') expected.add(`7.7${l}`);
  for (let i = 1; i <= 2; i++) expected.add(`8.${i}`);
  for (const l of 'abcd') expected.add(`8.2${l}`);
  const actual = new Set(config.questions.map((q) => q.number));
  assert.deepEqual([...actual].sort(), [...expected].sort());
  assert.equal(config.questions.length, expected.size);
});

test('config: sections are 1, 2A-2D, 3, 4A-4C, 5, 6A-6D, 7, 8 and every question belongs to one', () => {
  assert.deepEqual(
    config.sections.map((s) => s.id),
    ['1', '2A', '2B', '2C', '2D', '3', '4A', '4B', '4C', '5', '6A', '6B', '6C', '6D', '7', '8']
  );
  assert.deepEqual(config.parts.map((p) => p.id), ['1', '2', '3', '4', '5', '6', '7', '8']);
  const ids = new Set(config.sections.map((s) => s.id));
  assert.ok(config.questions.every((q) => ids.has(q.section)));
});

test('config: no option is a [TBC] placeholder or a tbc_ value any more', () => {
  for (const q of config.questions) {
    for (const o of Array.isArray(q.options) ? q.options : []) {
      assert.ok(!o.label.includes('[TBC]'), `${q.number}: ${o.label}`);
      assert.ok(!/^tbc_/.test(o.value), `${q.number}: ${o.value}`);
    }
  }
});

test('config: the drafts are exactly the defaults we chose, each with a note', () => {
  const drafts = config.questions.filter((q) => q.draft);
  assert.deepEqual(
    drafts.map((q) => q.number),
    ['1.1', '1.2', '1.3', '1.4', '2.5', '2.7', '2.8', '2.12', '2.13', '2.23', '2.28', '2.29', '2.30', '2.31', '2.33', '2.35', '4.1', '4.7a', '4.8a', '4.8f', '5.1', '5.9', '6.1', '6.5', '6.6', '6.7', '6.8', '7.5a', '7.7a', '8.2b']
  );
  assert.deepEqual(config.groups.filter((g) => g.draft).map((g) => g.id), ['otherNames', 'parents', 'accommodation']);
  for (const x of [...drafts, ...config.groups.filter((g) => g.draft)]) assert.ok(x.draft.length > 20, x.id);
});

test('config: Parts 1 to 6 have no tbc left (only drafts); only Parts 7 and 8 still do', () => {
  const done = ['1', '2A', '2B', '2C', '2D', '3', '4A', '4B', '4C', '5', '6A', '6B', '6C', '6D'];
  assert.deepEqual(config.questions.filter((q) => done.includes(q.section) && q.tbc).map((q) => q.number), []);
  assert.deepEqual(config.groups.filter((g) => done.includes(g.section) && g.tbc).map((g) => g.id), []);
  assert.deepEqual(engine.getReleaseBlockers(config).map((b) => b.sectionId), ['7', '8']);
});

test('draft items: getDraftItems lists them by section, and a draft alone leaves a section releasable but held', () => {
  const items = engine.getDraftItems(config);
  assert.equal(items.reduce((n, s) => n + s.items.length, 0), 33, '30 questions and 3 groups');
  assert.deepEqual(items.find((s) => s.sectionId === '2D').items.map((i) => i.number), ['2.33', '2.35']);
  assert.ok(items.every((s) => s.items.every((i) => i.draft && i.id && (i.number === null || typeof i.number === 'string'))));
  for (const id of ['1', '2A', '2B', '2C', '2D', '4A', '4B', '4C', '5', '6A', '6B', '6C', '6D']) {
    assert.equal(engine.isSectionReleasable(config, id), true, `${id} has only drafts`);
    assert.equal(items.some((s) => s.sectionId === id), true);
  }
  assert.equal(engine.isSectionReleasable(config, '7'), false, '7 still has real unknowns');
});

test('config: placeholder options are rejected', () => {
  for (const [mutate, name] of [
    [(c) => { c.questions.find((q) => q.id === 'q1_1').options[0].value = 'tbc_x'; }, 'tbc_ value'],
    [(c) => { c.questions.find((q) => q.id === 'q1_1').options[1].label = '[TBC] Other'; }, '[TBC] label'],
  ]) {
    const c = clone(config);
    mutate(c);
    assert.ok(engine.validateConfig(c).some((p) => /still a placeholder/.test(p)), name);
  }
});

test('options: every draft list offers stable snake_case values', () => {
  for (const q of config.questions.filter((x) => x.draft && Array.isArray(x.options))) {
    for (const o of q.options) assert.match(o.value, /^[a-z][a-z_]*$/, `${q.number}: ${o.value}`);
    assert.equal(new Set(q.options.map((o) => o.value)).size, q.options.length, q.number);
  }
});

test('options: the answers that open something are on the lists (2.13 -> 4A, 5.1 -> 5.2-5.9, 6.1 -> 6.2, 1.1 -> 1.4, 2.28 -> 2.29)', () => {
  const values = (id) => config.questions.find((x) => x.id === id).options.map((o) => o.value);
  for (const v of ['married', 'civil_partnership', 'unmarried_partner', 'single', 'separated', 'divorced', 'widowed']) assert.ok(values('q2_13').includes(v), v);
  assert.ok(values('q5_1').includes('employed'));
  for (const v of ['savings', 'savings_and_income', 'other_income', 'none']) assert.ok(values('q6_1').includes(v), v);
  assert.ok(values('q1_1').includes('tourism'));
  assert.ok(values('q2_28').includes('other'));
  assert.ok(values('q2_35').includes('call') && values('q2_35').includes('sms'), '2.35 keeps the two choices the printout shows');
});

test('gates with the real values: each 2.13 status decides section 4A, each 5.1 status its block, each 6.1 answer 6.2', () => {
  const sections = (answers) => engine.getVisibleSections(config, answers).map((s) => s.id);
  const partner = { single: false, married: true, civil_partnership: true, unmarried_partner: true, separated: false, divorced: false, widowed: false };
  for (const [status, shows] of Object.entries(partner)) assert.equal(sections({ q2_13: status }).includes('4A'), shows, status);
  const sectionFive = (status) => engine.getVisibleQuestions(config, '5', { q5_1: status }).map((x) => x.id);
  const expected = { employed: 9, self_employed: 6, student: 4, retired: 3, homemaker: 2, unemployed: 2, other: 2 };
  for (const [status, count] of Object.entries(expected)) assert.equal(sectionFive(status).length, count, status);
  const savings = (v) => engine.getVisibleQuestions(config, '6A', { q6_1: v }).some((x) => x.id === 'q6_2');
  assert.deepEqual(['savings', 'savings_and_income', 'other_income', 'none'].map(savings), [true, true, false, false]);
});

test('compatibility: an answer saved with an old placeholder value is refused as not on the list and hides what it used to open', () => {
  assert.equal(validate('2B', { ...S2B, q2_13: 'tbc_married' }).errors.q2_13, 'Choose from the listed options');
  assert.equal(validate('5', { q5_1: 'tbc_employed' }).errors.q5_1, 'Choose from the listed options');
  assert.equal(validate('1', { ...S1, q1_4: 'tbc_a' }).errors.q1_4, 'Choose from the listed options');
  assert.equal(engine.isSectionVisible(config, '4A', { q2_13: 'tbc_married' }), false, 'an old value no longer shows 4A');
  assert.deepEqual(engine.getVisibleQuestions(config, '5', { q5_1: 'tbc_employed' }).map((x) => x.id), ['q5_1'], 'an old value shows only 5.1');
});

test('config: sensitive questions are the ID number, passport number, licence number and treatment text only', () => {
  assert.deepEqual(config.questions.filter((q) => q.sensitive).map((q) => q.number), ['2.19', '2.30a', '2.31b', '3.1']);
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

test('release gate: only sections with open tbc flags (7 and 8) are blocked; all the others are releasable', () => {
  const blockers = engine.getReleaseBlockers(config);
  assert.deepEqual(blockers.map((b) => b.sectionId), ['7', '8']);
  for (const s of config.sections) assert.equal(engine.isSectionReleasable(config, s.id), !['7', '8'].includes(s.id));
  assert.ok(blockers.every((b) => b.items.every((i) => i.tbc)));
});

test('release gate: a section is releasable once its tbc flags are gone', () => {
  const c = clone(config);
  for (const q of c.questions) if (q.section === '8') delete q.tbc;
  assert.equal(engine.isSectionReleasable(c, '8'), true);
  assert.equal(engine.isSectionReleasable(c, '7'), false);
});

test('release gate: a tbc on a repeating group blocks its section', () => {
  const c = clone(config);
  assert.equal(engine.isSectionReleasable(c, '4C'), true);
  c.groups.find((g) => g.id === 'parents').tbc = 'x';
  assert.equal(engine.isSectionReleasable(c, '4C'), false);
  delete c.groups.find((g) => g.id === 'parents').tbc;
  assert.equal(engine.isSectionReleasable(c, '4C'), true);
});

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

test('visibility: 1.4 only appears for the tourism option of 1.1', () => {
  assert.equal(engine.isVisible(config, 'q1_4', {}), false);
  assert.equal(engine.isVisible(config, 'q1_4', { q1_1: 'other' }), false);
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
  assert.equal(engine.isVisible(config, 'q2_29', { q2_28: 'owned' }), false);
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
    q1_1: 'other', q1_4: 'holiday', q2_6: false, q2_7: 'b@example.com', q2_18: true, q2_19: 'ID-FAKE', evil: 1,
  });
  assert.deepEqual(answers, { q1_1: 'other', q2_6: false, q2_18: true, q2_19: 'ID-FAKE' });
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
  const other = validate('1', { ...S1, q1_1: 'other' }, { q1_4: 'holiday' });
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
    ...S2A, q2_6: true, q2_7: 'second@example.com', q2_8: 'other', q2_10: 'second@example.com',
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
  assert.match(validate('2A', { ...S2A, q2_3: true, otherNames: entries }).errors.otherNames, /up to 10 entries/);
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
const DEPENDANT = { q4_7a: 'son', q4_7b: 'Testchild', q4_7c: 'Testsurname', q4_7d: '2015-06-07', q4_7e: true, q4_7f: false };
const PARENT = { q4_8a: 'mother', q4_8b: 'Testmother', q4_8c: 'Testsurname', q4_8d: '1962-01-02', q4_8e: 'GB', q4_8f: true };

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

test('4A: the spouse or partner questions follow 2.13 (placeholder statuses)', () => {
  const ids = ['q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5', 'q4_6'];
  for (const status of ['married', 'unmarried_partner']) {
    for (const id of ids) assert.equal(engine.isVisible(config, id, { q2_13: status }), true, `${id} for ${status}`);
  }
  for (const answers of [{ q2_13: 'single' }, {}]) {
    for (const id of ids) assert.equal(engine.isVisible(config, id, answers), false);
  }
});

test('4A: valid partner details pass, and all of them are required when shown', () => {
  const ok = validate('4A', PARTNER, { q2_13: 'married' });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  const empty = validate('4A', {}, { q2_13: 'unmarried_partner' });
  assert.deepEqual(Object.keys(empty.errors), ['q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5', 'q4_6']);
  assert.equal(validate('4A', { ...PARTNER, q4_3: '2090-01-01' }, { q2_13: 'married' }).errors.q4_3, 'Cannot be in the future');
});

test('4A: when 2.13 does not indicate a partner the section is hidden and stored answers are removed', () => {
  const single = { q2_13: 'single' };
  assert.equal(engine.isSectionVisible(config, '4A', single), false);
  assert.equal(engine.isSectionVisible(config, '4A', { q2_13: 'married' }), true);
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

test('4C: entries are validated one by one with errors on the right entry and field', () => {
  const r = validate('4C', { q4_8: true, parents: [PARENT, { q4_8a: 'father', q4_8b: 'Testfather', q4_8e: 'ZZ' }] });
  assert.deepEqual(Object.keys(r.errors).sort(), ['parents.1.q4_8c', 'parents.1.q4_8d', 'parents.1.q4_8e', 'parents.1.q4_8f']);
  assert.equal(r.errors['parents.1.q4_8e'], 'Choose a country from the list');
});

test('4C: pruning keeps the parents of a Yes and strips unknown entry keys', () => {
  const { answers, removed } = engine.pruneAnswers(config, { q4_8: true, parents: [{ ...PARENT, stray: 'x' }] });
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
  const rest = ['5', '6A', '6B', '6C', '6D', '7', '8'];
  assert.deepEqual(visible({}), ['1', '2A', '2B', '2C', '2D', '3', '4B', '4C', ...rest]);
  assert.deepEqual(visible({ q2_13: 'single' }), ['1', '2A', '2B', '2C', '2D', '3', '4B', '4C', ...rest]);
  assert.deepEqual(visible({ q2_13: 'married' }), ['1', '2A', '2B', '2C', '2D', '3', '4A', '4B', '4C', ...rest]);
  assert.deepEqual(visible({ q2_13: 'unmarried_partner' }), ['1', '2A', '2B', '2C', '2D', '3', '4A', '4B', '4C', ...rest]);
});

test('prune: changing 2.13 removes the spouse or partner answers held in another section', () => {
  const before = { q2_13: 'married', ...PARTNER, q4_7: false };
  assert.equal(engine.pruneAnswers(config, before).answers.q4_1, 'Testpartner');
  const after = engine.pruneAnswers(config, { ...before, q2_13: 'single' });
  assert.deepEqual(after.removed.sort(), ['q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5', 'q4_6']);
  assert.deepEqual(after.answers, { q2_13: 'single', q4_7: false });
});

test('compatibility: answers saved before step 6a (config 0.1.0) still validate unchanged', () => {
  for (const [section, answers] of [['1', S1], ['2A', S2A], ['2B', S2B], ['2C', S2C], ['2D', S2D]]) {
    const r = validate(section, answers);
    assert.equal(r.success, true, `${section}: ${JSON.stringify(r.errors)}`);
  }
  // 2.13 values saved earlier are still on the list.
  assert.equal(validate('2B', { ...S2B, q2_13: 'married' }).success, true);
});

// ---------------------------------------------------------------------------
// Step 6b: Parts 5 and 6 (employment, money, family in the UK, accommodation)
// ---------------------------------------------------------------------------

const gbp = (amount) => ({ amount, currency: 'GBP' });
const EMPLOYED = {
  q5_1: 'employed', q5_2: '2019-04', q5_3: 'Test Employer Ltd', q5_4: ADDRESS,
  q5_5: { countryCode: '+44', number: '20 7946 0000' }, q5_6: 'Test Analyst',
  q5_7: gbp(2500), q5_8: 'Made-up description of a made-up job.', q5_9: 'Previous Test Co',
};
const S6A = { q6_1: 'savings', q6_2: gbp(8000), q6_3: gbp(1500), q6_4: gbp(900), q6_5: false };
const STAY = {
  q6_7a: 'Test Hotel', q6_7b: { line1: '2 Test Road', town: 'Testtown', country: 'GB' },
  q6_7c: '2027-03-01', q6_7d: '2027-03-08',
};
const stayOn = (from, to) => ({ ...STAY, q6_7c: from, q6_7d: to });
// Section 1 as saved: arrive 2027-03-01, leave 2027-03-15.
const TRIP = { q1_6: S1.q1_6, q1_7: S1.q1_7 };

test('part 5: the employed path needs 5.2 to 5.8 and takes an optional 5.9', () => {
  assert.equal(validate('5', EMPLOYED).success, true);
  const { q5_9, ...withoutPrevious } = EMPLOYED;
  assert.equal(validate('5', withoutPrevious).success, true);
  const empty = validate('5', { q5_1: 'employed' });
  assert.deepEqual(Object.keys(empty.errors).sort(), ['q5_2', 'q5_3', 'q5_4', 'q5_5', 'q5_6', 'q5_7', 'q5_8']);
});

test('part 5: an unknown status is refused, and 5.1 is the only question that is always required', () => {
  assert.deepEqual(Object.keys(validate('5', {}).errors), ['q5_1']);
  assert.equal(validate('5', { q5_1: 'bogus' }).errors.q5_1, 'Choose from the listed options');
});

test('part 5 gate: changing 5.1 away from employed removes 5.2 to 5.9', () => {
  const r = validate('5', { ...EMPLOYED, q5_1: 'retired' }, EMPLOYED);
  assert.equal(r.success, true);
  assert.deepEqual(r.removed.sort(), ['q5_2', 'q5_3', 'q5_4', 'q5_5', 'q5_6', 'q5_7', 'q5_8', 'q5_9']);
  assert.deepEqual(r.data, { q5_1: 'retired' });
  const pruned = engine.pruneAnswers(config, { ...EMPLOYED, q5_1: 'unemployed' });
  assert.deepEqual(pruned.answers, { q5_1: 'unemployed' });
  assert.equal(pruned.removed.length, 8);
});

test('part 5: the start date is a month and year and cannot be in the future', () => {
  assert.equal(validate('5', { ...EMPLOYED, q5_2: '2026-10' }).success, true);
  assert.equal(validate('5', { ...EMPLOYED, q5_2: '2026-11' }).errors.q5_2, 'Cannot be in the future');
  assert.equal(validate('5', { ...EMPLOYED, q5_2: '2019-13' }).errors.q5_2, 'Enter a real month and year');
});

test('part 5: employer address and telephone use the normal address and phone checks', () => {
  assert.ok(validate('5', { ...EMPLOYED, q5_4: { line1: '1 Test Street' } }).errors['q5_4.town']);
  assert.ok(validate('5', { ...EMPLOYED, q5_5: { countryCode: '44', number: '123' } }).errors['q5_5.countryCode']);
});

test('money: negative, too large, over-precise and foreign-currency amounts are rejected', () => {
  const earns = (a) => validate('5', { ...EMPLOYED, q5_7: a }).errors['q5_7.amount'];
  assert.equal(earns(gbp(-1)), 'Cannot be negative');
  assert.equal(earns(gbp(-0.01)), 'Cannot be negative');
  assert.equal(earns(gbp(1000000.01)), 'Amount cannot be more than 1,000,000');
  assert.equal(earns(gbp(1000000)), undefined);
  assert.equal(earns(gbp(0)), undefined);
  assert.equal(earns(gbp(10.005)), 'Use at most two decimal places');
  assert.equal(earns(gbp(10.5)), undefined);
  assert.ok(validate('5', { ...EMPLOYED, q5_7: { amount: 5, currency: 'USD' } }).errors['q5_7.currency']);
  assert.equal(validate('5', { ...EMPLOYED, q5_7: { amount: '5', currency: 'GBP' } }).errors['q5_7.amount'], 'Enter a valid answer');
  assert.equal(validate('5', { ...EMPLOYED, q5_7: { amount: null, currency: 'GBP' } }).success, false);
  assert.equal(validate('5', { ...EMPLOYED, q5_7: { amount: 5, currency: 'GBP', extra: 1 } }).success, false);
});

test('money: each amount question has its own maximum', () => {
  const max = (n) => config.questions.find((q) => q.number === n).rules.max;
  assert.deepEqual(['5.7', '6.2', '6.3', '6.4'].map(max), [1e6, 1e8, 1e6, 1e6]);
  assert.equal(validate('6A', { ...S6A, q6_2: gbp(100000000) }).success, true);
  assert.equal(validate('6A', { ...S6A, q6_2: gbp(100000001) }).errors['q6_2.amount'], 'Amount cannot be more than 100,000,000');
  assert.equal(validate('6A', { ...S6A, q6_3: gbp(1000001) }).errors['q6_3.amount'], 'Amount cannot be more than 1,000,000');
  assert.equal(validate('6A', { ...S6A, q6_4: gbp(-5) }).errors['q6_4.amount'], 'Cannot be negative');
});

test('money: an AMT question without its own rules.max keeps the 1,000,000,000 default', () => {
  const cfg = mk([{ id: 'q1_1', number: '1.1', type: 'AMT' }]);
  assert.equal(vs(cfg, { q1_1: gbp(1e9) }).success, true);
  assert.equal(vs(cfg, { q1_1: gbp(1e9 + 1) }).errors['q1_1.amount'], 'Amount cannot be more than 1,000,000,000');
});

test('part 6A: 6.2 only appears when 6.1 includes savings', () => {
  assert.equal(validate('6A', S6A).success, true);
  assert.equal(validate('6A', { ...S6A, q6_1: 'savings_and_income' }).success, true);
  assert.equal(validate('6A', { ...S6A, q6_2: undefined }).errors.q6_2, 'This question is required');
  for (const v of ['other_income', 'none']) {
    const { q6_2, ...rest } = S6A;
    const r = validate('6A', { ...rest, q6_1: v });
    assert.equal(r.success, true, `${v}: ${JSON.stringify(r.errors)}`);
    assert.equal(r.data.q6_2, undefined);
  }
  assert.deepEqual(Object.keys(validate('6A', {}).errors).sort(), ['q6_1', 'q6_3', 'q6_4', 'q6_5']);
});

test('part 6A gate: changing 6.1 to an answer without savings removes 6.2', () => {
  const r = validate('6A', { ...S6A, q6_1: 'none' }, S6A);
  assert.equal(r.success, true);
  assert.deepEqual(r.removed, ['q6_2']);
  assert.equal(r.data.q6_2, undefined);
  const pruned = engine.pruneAnswers(config, { ...S6A, q6_1: 'other_income' });
  assert.deepEqual(pruned.removed, ['q6_2']);
  assert.equal(pruned.answers.q6_2, undefined);
});

test('parts 6B and 6D: one required Yes/No each', () => {
  assert.equal(validate('6B', { q6_6: false }).success, true);
  assert.equal(validate('6B', {}).errors.q6_6, 'This question is required');
  assert.equal(validate('6D', { q6_8: false }).success, true);
  assert.equal(validate('6D', {}).errors.q6_8, 'This question is required');
});

test('part 6C: a Yes on 6.7 needs at least one place of stay; a No asks for the accommodation plans', () => {
  assert.equal(validate('6C', { q6_7: false, q6_7x: 'not_decided' }).success, true);
  assert.equal(validate('6C', { q6_7: true }).errors.accommodation, 'Add at least one entry');
  const ok = validate('6C', { q6_7: true, accommodation: [STAY] }, TRIP);
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  const blank = validate('6C', { q6_7: true, accommodation: [{}] }, TRIP);
  assert.deepEqual(Object.keys(blank.errors).sort(), [
    'accommodation.0.q6_7a', 'accommodation.0.q6_7b', 'accommodation.0.q6_7c', 'accommodation.0.q6_7d',
  ]);
});

test('part 6C gate: changing 6.7 to No removes every place of stay', () => {
  const r = validate('6C', { q6_7: false, q6_7x: 'not_decided', accommodation: [STAY] }, { accommodation: [STAY] });
  assert.equal(r.success, true);
  assert.deepEqual(r.removed, ['accommodation']);
  assert.deepEqual(r.data, { q6_7: false, q6_7x: 'not_decided' });
  const pruned = engine.pruneAnswers(config, { q6_7: false, accommodation: [STAY, STAY] });
  assert.deepEqual(pruned.removed, ['accommodation']);
  assert.deepEqual(pruned.answers, { q6_7: false });
});

test('part 6C: a stay must fall inside the travel dates of 1.6 and 1.7 (a cross-section rule)', () => {
  const check = (from, to) => validate('6C', { q6_7: true, accommodation: [stayOn(from, to)] }, TRIP).errors;
  assert.deepEqual(check('2027-03-01', '2027-03-15'), {}); // the whole trip: both end days are allowed
  assert.equal(check('2027-02-28', '2027-03-05')['accommodation.0.q6_7c'], 'Must be on or after the date in question 1.6');
  assert.equal(check('2027-03-02', '2027-03-16')['accommodation.0.q6_7d'], 'Must be on or before the date in question 1.7');
  assert.equal(check('2027-03-16', '2027-03-20')['accommodation.0.q6_7c'], 'Must be on or before the date in question 1.7');
  assert.equal(check('2027-03-05', '2027-03-05')['accommodation.0.q6_7d'], 'Must be after the date in question 6.7c');
  assert.equal(check('2027-03-06', '2027-03-05')['accommodation.0.q6_7d'], 'Must be after the date in question 6.7c');
});

test('part 6C: the trip-date rules wait until section 1 has been saved', () => {
  const body = { q6_7: true, accommodation: [stayOn('2030-01-01', '2030-01-09')] };
  const r = validate('6C', body, {});
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.equal(validate('6C', body, TRIP).success, false);
});

test('part 6C: stays may meet on one day or leave a gap, but may not overlap', () => {
  const stays = (...ranges) => ({ q6_7: true, accommodation: ranges.map(([a, b]) => stayOn(a, b)) });
  const errors = (...ranges) => validate('6C', stays(...ranges), TRIP).errors;
  assert.deepEqual(errors(['2027-03-01', '2027-03-05'], ['2027-03-05', '2027-03-09']), {});
  assert.deepEqual(errors(['2027-03-01', '2027-03-05'], ['2027-03-07', '2027-03-09']), {});
  assert.deepEqual(errors(['2027-03-07', '2027-03-09'], ['2027-03-01', '2027-03-05']), {}); // order does not matter
  const overlap = 'Overlaps the dates of Place of stay 1';
  assert.equal(errors(['2027-03-01', '2027-03-06'], ['2027-03-05', '2027-03-09'])['accommodation.1.q6_7c'], overlap);
  assert.equal(errors(['2027-03-05', '2027-03-09'], ['2027-03-01', '2027-03-06'])['accommodation.1.q6_7c'], overlap);
  assert.equal(errors(['2027-03-01', '2027-03-10'], ['2027-03-03', '2027-03-04'])['accommodation.1.q6_7c'], overlap);
  assert.equal(
    errors(['2027-03-01', '2027-03-04'], ['2027-03-06', '2027-03-08'], ['2027-03-03', '2027-03-07'])['accommodation.2.q6_7c'],
    overlap
  );
  // The message names the entry, never an answer.
  assert.ok(!JSON.stringify(errors(['2027-03-01', '2027-03-06'], ['2027-03-05', '2027-03-09'])).includes('2027'));
});

test('dates: onOrAfter and onOrBefore allow the same day and follow the same rules as after', () => {
  const bad = mk([
    { id: 'q1_1', number: '1.1', type: 'DATE', rules: { onOrAfter: 'q1_2' } },
    { id: 'q1_2', number: '1.2', type: 'DATE' },
  ]);
  assert.ok(engine.validateConfig(bad).some((p) => /must refer to an earlier question/.test(p)));

  const ok = mk([
    { id: 'q1_1', number: '1.1', type: 'DATE' },
    { id: 'q1_2', number: '1.2', type: 'DATE' },
    { id: 'q1_3', number: '1.3', type: 'DATE', rules: { onOrAfter: 'q1_1', onOrBefore: ['q1_2'] } },
  ]);
  assert.deepEqual(engine.validateConfig(ok), []);
  assert.equal(vs(ok, { q1_1: '2027-01-01', q1_2: '2027-01-10', q1_3: '2027-01-01' }).success, true);
  assert.equal(vs(ok, { q1_1: '2027-01-01', q1_2: '2027-01-10', q1_3: '2027-01-10' }).success, true);
  assert.equal(
    vs(ok, { q1_1: '2027-01-02', q1_2: '2027-01-10', q1_3: '2027-01-01' }).errors.q1_3,
    'Must be on or after the date in question 1.1'
  );
  assert.equal(
    vs(ok, { q1_1: '2027-01-01', q1_2: '2027-01-10', q1_3: '2027-01-11' }).errors.q1_3,
    'Must be on or before the date in question 1.2'
  );
});

test('config: validateConfig checks the new date, amount and group rules', () => {
  const q = (c, id) => c.questions.find((x) => x.id === id);
  const g = (c) => c.groups.find((x) => x.id === 'accommodation');
  const cases = [
    ['onOrAfter on a non-date', (c) => { q(c, 'q6_3').rules.onOrAfter = 'q1_6'; }, /rules.onOrAfter needs a DATE or MY/],
    ['onOrBefore on an unknown question', (c) => { q(c, 'q6_7c').rules.onOrBefore = 'q9_9'; }, /unknown question/],
    ['onOrAfter on a later question', (c) => { q(c, 'q1_6').rules = { onOrAfter: 'q6_7c' }; }, /earlier question/],
    ['AMT max above the hard limit', (c) => { q(c, 'q6_3').rules.max = 5e9; }, /rules.max must be from 0/],
    ['AMT max negative', (c) => { q(c, 'q6_3').rules.max = -1; }, /rules.max must be from 0/],
    ['AMT min', (c) => { q(c, 'q6_3').rules.min = -5; }, /never negative/],
    ['max on a text question', (c) => { q(c, 'q5_3').rules = { max: 5 }; }, /only for NUM and AMT/],
    ['max that is not a number', (c) => { q(c, 'q6_3').rules.max = '5'; }, /must be a number/],
    ['noOverlap on a missing member', (c) => { g(c).noOverlap.end = 'q9_9'; }, /noOverlap.end must be a DATE member/],
    ['noOverlap on a non-date', (c) => { g(c).noOverlap.start = 'q6_7a'; }, /noOverlap.start must be a DATE member/],
    ['noOverlap on the same question twice', (c) => { g(c).noOverlap.end = 'q6_7c'; }, /must differ/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const c = clone(config);
    mutate(c);
    const problems = engine.validateConfig(c);
    assert.ok(problems.some((p) => pattern.test(p)), `${name}: got ${JSON.stringify(problems)}`);
  }
});

test('sections: Parts 5 and 6 are always shown', () => {
  for (const id of ['5', '6A', '6B', '6C', '6D', '7', '8']) assert.equal(engine.isSectionVisible(config, id, {}), true);
});

test('compatibility: answers saved under config 0.2.0 (Parts 1-4) still validate unchanged', () => {
  const sections = [
    ['1', S1], ['2A', S2A], ['2B', S2B], ['2C', S2C], ['2D', S2D], ['3', S3],
    ['4B', { q4_7: true, dependants: [DEPENDANT] }], ['4C', { q4_8: true, parents: [PARENT] }],
  ];
  for (const [section, answers] of sections) {
    const r = validate(section, answers, section === '3' ? S1 : undefined);
    assert.equal(r.success, true, `${section}: ${JSON.stringify(r.errors)}`);
  }
  assert.equal(validate('4A', PARTNER, { q2_13: 'married' }).success, true);
});

// ---------------------------------------------------------------------------
// Step 6c: Parts 7 and 8 (travel history), plus the new "Please give details" follow-ups
// ---------------------------------------------------------------------------
// validate() fixes "today" at 2026-10-28, so the 10-year window starts on 2016-10-28.

const VISIT = { q7_5a: 'tourism', q7_5b: '2024-05', q7_5c: { weeks: 2 } };
const PROBLEM = { q7_7a: 'refused_visa', q7_7b: 'GB', q7_7c: '2015-03', q7_7d: 'Made-up details of what happened.' };
const S7 = {
  q7_1: true, q7_2: '2023-06', q7_3: false, q7_4: true, q7_5: 2,
  ukVisits: [VISIT, { ...VISIT, q7_5b: '2022-08', q7_5c: { days: 4 } }],
  q7_6: false, q7_7: true, immigrationProblems: [PROBLEM],
};
const TRIP8 = { q8_2a: 'FR', q8_2b: 'tourism', q8_2c: '2024-07-01', q8_2d: '2024-07-10' };
const S8 = { q8_1: 3, q8_2: true, otherCountryTrips: [TRIP8] };
const NO7 = { q7_1: false, q7_3: false, q7_4: false, q7_6: false, q7_7: false };

test('part 7: a complete section validates; every Yes/No answered No needs nothing more', () => {
  const r = validate('7', S7);
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.equal(validate('7', NO7).success, true);
  assert.deepEqual(Object.keys(validate('7', {}).errors).sort(), ['q7_1', 'q7_3', 'q7_4', 'q7_6', 'q7_7']);
});

test('part 7 gate 7.1: the application date only shows for Yes and is pruned for No', () => {
  assert.equal(validate('7', { ...NO7, q7_1: true }).errors.q7_2, 'This question is required');
  const r = validate('7', { ...NO7, q7_2: '2023-06' }, { q7_2: '2023-06' });
  assert.equal(r.success, true);
  assert.deepEqual(r.removed, ['q7_2']);
  assert.equal(r.data.q7_2, undefined);
  assert.deepEqual(engine.pruneAnswers(config, { q7_1: false, q7_2: '2023-06' }).removed, ['q7_2']);
});

test('part 7 gates 7.3 and 7.6: a Yes needs the details box, a No removes it', () => {
  for (const [gate, follow] of [['q7_3', 'q7_3a'], ['q7_6', 'q7_6a']]) {
    assert.equal(validate('7', { ...NO7, [gate]: true }).errors[follow], 'This question is required', gate);
    const yes = validate('7', { ...NO7, [gate]: true, [follow]: 'Made-up details' });
    assert.equal(yes.success, true, `${gate}: ${JSON.stringify(yes.errors)}`);
    const no = validate('7', { ...NO7, [follow]: 'stale details' }, { [follow]: 'stale details' });
    assert.deepEqual(no.removed, [follow], gate);
    assert.equal(no.data[follow], undefined);
    assert.deepEqual(engine.pruneAnswers(config, { [gate]: false, [follow]: 'x' }).removed, [follow]);
  }
});

test('part 7 gate 7.4: 7.5 and the visits only show for Yes and are pruned for No', () => {
  assert.equal(validate('7', { ...NO7, q7_4: true }).errors.q7_5, 'This question is required');
  const r = validate('7', { ...S7, q7_4: false }, S7);
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.deepEqual(r.removed.sort(), ['q7_5', 'ukVisits']);
  assert.equal(r.data.ukVisits, undefined);
  assert.deepEqual(engine.pruneAnswers(config, { q7_4: false, q7_5: 2, ukVisits: [VISIT, VISIT] }).removed.sort(), ['q7_5', 'ukVisits']);
});

test('count-driven group: 7.5 sets exactly how many visits are asked for', () => {
  const base = { ...NO7, q7_4: true };
  const visits = (n, count = n) => validate('7', { ...base, q7_5: count, ukVisits: Array.from({ length: n }, () => VISIT) });
  assert.equal(visits(1).success, true);
  assert.equal(visits(20).success, true, 'the limit itself is allowed');
  assert.equal(visits(1, 2).errors.ukVisits, 'Give details for exactly 2 visits');
  assert.equal(visits(3, 2).errors.ukVisits, 'Give details for exactly 2 visits');
  assert.equal(visits(2, 1).errors.ukVisits, 'Give details for exactly 1 visit');
  assert.equal(validate('7', { ...base, q7_5: 2 }).errors.ukVisits, 'Give details for exactly 2 visits', 'no entries sent at all');
});

test('count-driven group: each entry is checked like any other; a bad count shows only its own error', () => {
  const blank = validate('7', { ...NO7, q7_4: true, q7_5: 2, ukVisits: [VISIT, {}] });
  assert.deepEqual(Object.keys(blank.errors).sort(), ['ukVisits.1.q7_5a', 'ukVisits.1.q7_5b', 'ukVisits.1.q7_5c']);
  const bad = (count) => validate('7', { ...NO7, q7_4: true, q7_5: count, ukVisits: [VISIT] });
  assert.deepEqual(Object.keys(bad(0).errors), ['q7_5']);
  assert.equal(bad(0).errors.q7_5, 'Number is too small');
  assert.deepEqual(Object.keys(bad(21).errors), ['q7_5']);
  assert.equal(bad(21).errors.q7_5, 'Number is too large');
  assert.equal(bad(1.5).errors.q7_5, 'Enter a whole number');
  assert.equal(bad(-2).errors.q7_5, 'Number is too small');
  assert.deepEqual(Object.keys(bad(undefined).errors), ['q7_5']);
});

test('count-driven group: changing the count to a smaller number needs the shorter list', () => {
  const stored = { ...S7 };
  assert.equal(validate('7', { ...S7, q7_5: 1 }, stored).errors.ukVisits, 'Give details for exactly 1 visit');
  const ok = validate('7', { ...S7, q7_5: 1, ukVisits: [VISIT] }, stored);
  assert.equal(ok.success, true);
  assert.equal(ok.data.ukVisits.length, 1);
});

test('look-back: 7.2, 7.5b and 8.2d must be within the past 10 years; 7.7c has no look-back', () => {
  const visitOn = (month) => validate('7', { ...NO7, q7_4: true, q7_5: 1, ukVisits: [{ ...VISIT, q7_5b: month }] }).errors['ukVisits.0.q7_5b'];
  assert.equal(visitOn('2016-10'), undefined, 'the whole month ten years ago counts');
  assert.equal(visitOn('2016-09'), 'Must be within the past 10 years');
  assert.equal(visitOn('2026-10'), undefined, 'this month is fine');
  assert.equal(visitOn('2026-11'), 'Cannot be in the future');
  assert.equal(validate('7', { ...NO7, q7_1: true, q7_2: '2016-09' }).errors.q7_2, 'Must be within the past 10 years');
  assert.equal(validate('7', { ...NO7, q7_1: true, q7_2: '2016-10' }).errors.q7_2, undefined);
  const problemOn = (month) => validate('7', { ...NO7, q7_7: true, immigrationProblems: [{ ...PROBLEM, q7_7c: month }] }).errors['immigrationProblems.0.q7_7c'];
  assert.equal(problemOn('1995-01'), undefined, '7.7 says "ever", so there is no 10-year limit');
  assert.equal(problemOn('2026-11'), 'Cannot be in the future');
});

test('look-back: the day matters for a full date, and 29 February moves to 28 February', () => {
  const leave = (d, today) => validate('8', { q8_1: 0, q8_2: true, otherCountryTrips: [{ ...TRIP8, q8_2c: '2000-01-01', q8_2d: d }] }, undefined, { today }).errors['otherCountryTrips.0.q8_2d'];
  assert.equal(leave('2016-10-28', '2026-10-28'), undefined);
  assert.equal(leave('2016-10-27', '2026-10-28'), 'Must be within the past 10 years');
  assert.equal(leave('2018-02-28', '2028-02-29'), undefined);
  assert.equal(leave('2018-02-27', '2028-02-29'), 'Must be within the past 10 years');
});

test('7.5c is one number and one unit', () => {
  const dur = (v) => validate('7', { ...NO7, q7_4: true, q7_5: 1, ukVisits: [{ ...VISIT, q7_5c: v }] }).errors['ukVisits.0.q7_5c'];
  assert.equal(dur({ months: 3 }), undefined);
  assert.equal(dur({ years: 1, months: 2 }), 'Enter a number and a unit');
  assert.equal(dur({ days: 0 }), 'Enter a number above zero');
});

test('part 7 gate 7.7: the immigration-problem group is closed for No and pruned', () => {
  assert.equal(validate('7', { ...NO7, q7_7: true }).errors.immigrationProblems, 'Add at least one entry');
  const two = validate('7', { ...NO7, q7_7: true, immigrationProblems: [PROBLEM, { ...PROBLEM, q7_7b: 'FR' }] });
  assert.equal(two.success, true, JSON.stringify(two.errors));
  const blank = validate('7', { ...NO7, q7_7: true, immigrationProblems: [{}] });
  assert.deepEqual(Object.keys(blank.errors).sort(), [
    'immigrationProblems.0.q7_7a', 'immigrationProblems.0.q7_7b', 'immigrationProblems.0.q7_7c', 'immigrationProblems.0.q7_7d',
  ]);
  const no = validate('7', { ...NO7, immigrationProblems: [PROBLEM] }, { immigrationProblems: [PROBLEM] });
  assert.deepEqual(no.removed, ['immigrationProblems']);
  assert.deepEqual(engine.pruneAnswers(config, { q7_7: false, immigrationProblems: [PROBLEM] }).removed, ['immigrationProblems']);
});

test('part 7: the five and eight listed items are part of 7.6 and 7.7, not separate questions', () => {
  const q = (n) => config.questions.find((x) => x.number === n);
  assert.equal(q('7.6').items.length, 5);
  assert.equal(q('7.7').items.length, 8);
  assert.equal(q('8.1').items.length, 6);
  assert.match(q('7.6').items[1], /beyond the validity of your visa/);
});

test('part 8: 8.1 is a count from 0 to 1000 and needs no follow-up', () => {
  const n = (v) => validate('8', { q8_1: v, q8_2: false }).errors.q8_1;
  assert.equal(n(0), undefined);
  assert.equal(n(1000), undefined);
  assert.equal(n(-1), 'Number is too small');
  assert.equal(n(1001), 'Number is too large');
  assert.equal(n(2.5), 'Enter a whole number');
  assert.deepEqual(validate('8', { q8_1: 4, q8_2: false }).data, { q8_1: 4, q8_2: false });
  assert.equal(validate('8', {}).errors.q8_1, 'This question is required');
});

test('part 8 gate 8.2: trips only for Yes, at least one, pruned for No', () => {
  assert.equal(validate('8', { q8_1: 0, q8_2: true }).errors.otherCountryTrips, 'Add at least one entry');
  const ok = validate('8', S8);
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  const two = validate('8', { ...S8, otherCountryTrips: [TRIP8, { ...TRIP8, q8_2a: 'DE', q8_2c: '2023-01-05', q8_2d: '2023-01-09' }] });
  assert.equal(two.success, true);
  const no = validate('8', { q8_1: 3, q8_2: false, otherCountryTrips: [TRIP8] }, S8);
  assert.deepEqual(no.removed, ['otherCountryTrips']);
  assert.deepEqual(engine.pruneAnswers(config, { q8_2: false, otherCountryTrips: [TRIP8] }).removed, ['otherCountryTrips']);
});

test('part 8: dates of a trip are real past dates, the leave date follows the entry date, and trips may overlap', () => {
  const errs = (patch) => validate('8', { ...S8, otherCountryTrips: [{ ...TRIP8, ...patch }] }).errors;
  assert.equal(errs({ q8_2d: '2024-07-01' })['otherCountryTrips.0.q8_2d'], 'Must be after the date in question 8.2c');
  assert.equal(errs({ q8_2c: '2030-01-01', q8_2d: '2030-01-05' })['otherCountryTrips.0.q8_2c'], 'Cannot be in the future');
  assert.equal(errs({ q8_2d: '2030-01-05' })['otherCountryTrips.0.q8_2d'], 'Cannot be in the future');
  assert.equal(errs({ q8_2d: '2015-01-05', q8_2c: '2015-01-01' })['otherCountryTrips.0.q8_2d'], 'Must be within the past 10 years');
  assert.equal(errs({ q8_2c: '2014-01-01', q8_2d: '2020-01-05' })['otherCountryTrips.0.q8_2d'], undefined, 'a stay that began earlier and ended inside the window counts');
  assert.equal(errs({ q8_2a: 'ZZ' })['otherCountryTrips.0.q8_2a'], 'Choose a country from the list');
  const overlapping = validate('8', { ...S8, otherCountryTrips: [TRIP8, { ...TRIP8, q8_2a: 'DE', q8_2c: '2024-07-05', q8_2d: '2024-07-12' }] });
  assert.equal(overlapping.success, true, 'only places of stay in the UK are checked for overlap');
});

test('the placeholder details boxes that remain (7.3a and 7.6a) are required, go away with a No and carry a tbc flag', () => {
  const seven = (a) => validate('7', { q7_1: false, q7_3: false, q7_4: false, q7_6: false, q7_7: false, ...a });
  assert.equal(seven({ q7_3: true }).errors.q7_3a, 'This question is required');
  assert.equal(seven({ q7_3: true, q7_3a: 'Made-up details' }).success, true);
  assert.deepEqual(seven({ q7_3a: 'stale' }).removed, ['q7_3a']);
  assert.deepEqual(engine.pruneAnswers(config, { q7_3: false, q7_3a: 'x', q7_6: false, q7_6a: 'y' }).removed.sort(), ['q7_3a', 'q7_6a']);
  for (const id of ['q7_3a', 'q7_6a']) {
    const q = config.questions.find((x) => x.id === id);
    assert.equal(q.type, 'LNG', id);
    assert.equal(q.label, 'Please give details', id);
    assert.ok(q.tbc, `${id} carries a tbc flag`);
    assert.equal(q.sensitive, undefined, id);
  }
  // None of the follow-ups asks about identity or passport numbers.
  assert.ok(!config.questions.some((q) => q.section === '7' && /passport|identity|national id/i.test(q.label)));
});

test('config: validateConfig checks count-driven groups, items and the look-back rule', () => {
  const q = (c, id) => c.questions.find((x) => x.id === id);
  const g = (c) => c.groups.find((x) => x.id === 'ukVisits');
  const cases = [
    ['unknown count question', (c) => { g(c).count = 'q9_9'; }, /unknown count question/],
    ['count question not a number', (c) => { g(c).count = 'q7_4'; }, /must be a NUM question/],
    ['count question in another section', (c) => { q(c, 'q7_5').section = '8'; }, /same section/],
    ['count question without a minimum', (c) => { delete q(c, 'q7_5').rules.min; }, /rules.min of at least 1/],
    ['count question allowing zero', (c) => { q(c, 'q7_5').rules.min = 0; }, /rules.min of at least 1/],
    ['count question above the group limit', (c) => { q(c, 'q7_5').rules.max = 21; }, /no larger than the group limit/],
    ['count group without a gate', (c) => { delete g(c).gate; }, /needs a Yes\/No gate/],
    ['count group with a minimum', (c) => { g(c).min = 2; }, /min is not used with count/],
    ['empty items', (c) => { q(c, 'q7_6').items = []; }, /items must be a non-empty list/],
    ['blank item', (c) => { q(c, 'q7_6').items = ['ok', ' ']; }, /items must be a non-empty list/],
    ['withinYears on a text question', (c) => { q(c, 'q8_1').rules.withinYears = 10; }, /needs a DATE or MY/],
    ['withinYears of zero', (c) => { q(c, 'q7_2').rules.withinYears = 0; }, /whole number from 1 to 100/],
    ['withinYears that is not whole', (c) => { q(c, 'q7_2').rules.withinYears = 2.5; }, /whole number from 1 to 100/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const c = clone(config);
    mutate(c);
    const problems = engine.validateConfig(c);
    assert.ok(problems.some((p) => pattern.test(p)), `${name}: got ${JSON.stringify(problems)}`);
  }
});

test('sections: Parts 7 and 8 are always shown', () => {
  for (const id of ['7', '8']) assert.equal(engine.isSectionVisible(config, id, {}), true);
});

test('compatibility: answers saved under config 0.3.0 (Parts 1-6) still validate where nothing new is asked', () => {
  assert.equal(validate('5', EMPLOYED).success, true);
  assert.equal(validate('6A', S6A).success, true);
  assert.equal(validate('6B', { q6_6: false }).success, true);
  assert.equal(validate('6D', { q6_8: false }).success, true);
  assert.equal(validate('6C', { q6_7: true, accommodation: [STAY] }, TRIP).success, true);
});

// ---------------------------------------------------------------------------
// Step 7b: Parts 1-4 follow-ups, drafts on any question or group, and the client gate rule
// ---------------------------------------------------------------------------

const COMPANION = { q1_3a: 'friend', q1_3b: 'Testcompanion', q1_3c: 'Testsurname' };
const NATIONALITY = { q2_23b: 'FR', q2_23c: 'birth', q2_23d: true };
const TREATMENT = { q2_31a: '2023-04', q2_31b: 'Made-up treatment description', q2_31d: true };
const PARENTS_YES = { q4_8: true, parents: [PARENT] };

test('1.2: Yes asks for the organiser (required) and the kind of group (optional); No removes both', () => {
  const yes = validate('1', { ...S1, q1_2: true });
  assert.deepEqual(Object.keys(yes.errors), ['q1_2a']);
  const ok = validate('1', { ...S1, q1_2: true, q1_2a: 'Test Tours Ltd' });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  assert.equal(validate('1', { ...S1, q1_2: true, q1_2a: 'Test Tours Ltd', q1_2b: 'tour' }).success, true);
  assert.equal(validate('1', { ...S1, q1_2: true, q1_2a: 'x', q1_2b: 'nonsense' }).errors.q1_2b, 'Choose from the listed options');
  const no = validate('1', { ...S1, q1_2: false, q1_2a: 'stale', q1_2b: 'tour' }, { q1_2a: 'stale', q1_2b: 'tour' });
  assert.equal(no.success, true);
  assert.deepEqual(no.removed.sort(), ['q1_2a', 'q1_2b']);
  assert.equal(no.data.q1_2a, undefined);
  assert.deepEqual(engine.pruneAnswers(config, { q1_2: false, q1_2a: 'x', q1_2b: 'tour' }).removed.sort(), ['q1_2a', 'q1_2b']);
});

test('1.3: Yes opens up to 10 companions (relationship, names required; birth date and nationality optional)', () => {
  assert.equal(validate('1', { ...S1, q1_3: true }).errors.companions, 'Add at least one entry');
  const ok = validate('1', { ...S1, q1_3: true, companions: [COMPANION] });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  const full = validate('1', { ...S1, q1_3: true, companions: [{ ...COMPANION, q1_3d: '1990-02-03', q1_3e: 'GB' }] });
  assert.equal(full.success, true);
  const blank = validate('1', { ...S1, q1_3: true, companions: [{}] });
  assert.deepEqual(Object.keys(blank.errors).sort(), ['companions.0.q1_3a', 'companions.0.q1_3b', 'companions.0.q1_3c']);
  assert.equal(validate('1', { ...S1, q1_3: true, companions: [{ ...COMPANION, q1_3d: '2090-01-01' }] }).errors['companions.0.q1_3d'], 'Cannot be in the future');
  assert.equal(validate('1', { ...S1, q1_3: true, companions: [{ ...COMPANION, q1_3a: 'partner' }] }).errors['companions.0.q1_3a'], 'Choose from the listed options');
  const eleven = Array.from({ length: 11 }, () => COMPANION);
  assert.match(validate('1', { ...S1, q1_3: true, companions: eleven }).errors.companions, /up to 10 entries/);
  assert.equal(validate('1', { ...S1, q1_3: true, companions: Array.from({ length: 10 }, () => COMPANION) }).success, true);
});

test('1.3 gate: changing to No removes every companion', () => {
  const r = validate('1', { ...S1, q1_3: false, companions: [COMPANION] }, { companions: [COMPANION] });
  assert.equal(r.success, true);
  assert.deepEqual(r.removed, ['companions']);
  assert.deepEqual(engine.pruneAnswers(config, { q1_3: false, companions: [COMPANION] }).removed, ['companions']);
  // No passport number is asked of a companion.
  const labels = config.questions.filter((q) => q.group === 'companions').map((q) => q.label.toLowerCase());
  assert.ok(!labels.some((l) => /passport|identity|document|number/.test(l)));
});

test('2.3c: an optional reason for each other name; up to 10 names', () => {
  const entry = { q2_3a: 'A', q2_3b: 'B' };
  assert.equal(validate('2A', { ...S2A, q2_3: true, otherNames: [entry] }).success, true, 'old entries without a reason still validate');
  assert.equal(validate('2A', { ...S2A, q2_3: true, otherNames: [{ ...entry, q2_3c: 'maiden_name' }] }).success, true);
  assert.equal(validate('2A', { ...S2A, q2_3: true, otherNames: [{ ...entry, q2_3c: 'x' }] }).errors['otherNames.0.q2_3c'], 'Choose from the listed options');
  assert.equal(config.groups.find((g) => g.id === 'otherNames').max, 10);
});

test('2.23: Yes opens up to 5 other nationalities with country, how acquired and whether still held', () => {
  assert.equal(validate('2B', { ...S2B, q2_23: true }).errors.otherNationalities, 'Add at least one entry');
  const ok = validate('2B', { ...S2B, q2_23: true, otherNationalities: [NATIONALITY] });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  const blank = validate('2B', { ...S2B, q2_23: true, otherNationalities: [{}] });
  assert.deepEqual(Object.keys(blank.errors).sort(), ['otherNationalities.0.q2_23b', 'otherNationalities.0.q2_23c', 'otherNationalities.0.q2_23d']);
  assert.equal(validate('2B', { ...S2B, q2_23: true, otherNationalities: [{ ...NATIONALITY, q2_23b: 'ZZ' }] }).errors['otherNationalities.0.q2_23b'], 'Choose a country from the list');
  assert.match(validate('2B', { ...S2B, q2_23: true, otherNationalities: Array.from({ length: 6 }, () => NATIONALITY) }).errors.otherNationalities, /up to 5 entries/);
});

test('2.23e: the date a nationality ended shows only when it is no longer held, is optional and cannot be in the future', () => {
  const entry = (patch) => ({ ...S2B, q2_23: true, otherNationalities: [{ ...NATIONALITY, ...patch }] });
  assert.equal(validate('2B', entry({ q2_23d: false })).success, true, 'optional');
  assert.equal(validate('2B', entry({ q2_23d: false, q2_23e: '2015-06' })).success, true);
  assert.equal(validate('2B', entry({ q2_23d: false, q2_23e: '2090-06' })).errors['otherNationalities.0.q2_23e'], 'Cannot be in the future');
  const held = validate('2B', entry({ q2_23d: true, q2_23e: '2015-06' }));
  assert.equal(held.success, true);
  assert.equal(held.data.otherNationalities[0].q2_23e, undefined, 'dropped while the nationality is still held');
  const pruned = engine.pruneAnswers(config, { q2_23: true, otherNationalities: [{ ...NATIONALITY, q2_23e: '2015-06' }] });
  assert.equal(pruned.answers.otherNationalities[0].q2_23e, undefined);
});

test('2.23 gate: changing to No removes the nationalities; the old single details box no longer exists', () => {
  const r = validate('2B', { ...S2B, q2_23: false, otherNationalities: [NATIONALITY] }, { otherNationalities: [NATIONALITY] });
  assert.equal(r.success, true);
  assert.deepEqual(r.removed, ['otherNationalities']);
  assert.deepEqual(engine.pruneAnswers(config, { q2_23: false, otherNationalities: [NATIONALITY] }).removed, ['otherNationalities']);
  assert.equal(config.questions.some((q) => q.id === 'q2_23a'), false);
  // No identity or passport numbers of another country are asked, anywhere in the group.
  const labels = config.questions.filter((q) => q.group === 'otherNationalities').map((q) => q.label.toLowerCase());
  assert.ok(!labels.some((l) => /passport|identity|document|number/.test(l)), labels.join(' | '));
});

test('2.29: shown for with_family_or_friends, employer_provided and other, required then; hidden for owned and rented', () => {
  for (const [v, shown] of Object.entries({ owned: false, rented: false, with_family_or_friends: true, employer_provided: true, other: true })) {
    assert.equal(engine.isVisible(config, 'q2_29', { q2_28: v }), shown, v);
    const r = validate('2C', { ...S2C, q2_28: v });
    assert.equal(r.errors.q2_29, shown ? 'This question is required' : undefined, v);
  }
  const closed = validate('2C', { ...S2C, q2_28: 'owned', q2_29: 'stale' }, { q2_29: 'stale' });
  assert.deepEqual(closed.removed, ['q2_29']);
});

test('2.30a: the licence number is optional, only asked on Yes, limited to 30 characters and stored encrypted', () => {
  const q = config.questions.find((x) => x.id === 'q2_30a');
  assert.deepEqual([q.required, q.sensitive, q.rules.maxLen], [false, true, 30]);
  assert.equal(validate('2C', { ...S2C, q2_30: true }).success, true, 'optional');
  assert.equal(validate('2C', { ...S2C, q2_30: true, q2_30a: 'TESTL12345678901' }).success, true);
  assert.equal(validate('2C', { ...S2C, q2_30: true, q2_30a: 'x'.repeat(31) }).errors.q2_30a, 'Must be 30 characters or fewer');
  const no = validate('2C', { ...S2C, q2_30: false, q2_30a: 'TESTL1' }, { q2_30a: 'TESTL1' });
  assert.deepEqual(no.removed, ['q2_30a']);
});

test('2.31: Yes opens up to 5 treatments; the amount owing shows only when the costs were not paid in full', () => {
  assert.equal(validate('2C', { ...S2C, q2_31: true }).errors.medicalTreatments, 'Add at least one entry');
  const ok = validate('2C', { ...S2C, q2_31: true, medicalTreatments: [TREATMENT] });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  const blank = validate('2C', { ...S2C, q2_31: true, medicalTreatments: [{}] });
  assert.deepEqual(Object.keys(blank.errors).sort(), ['medicalTreatments.0.q2_31a', 'medicalTreatments.0.q2_31b', 'medicalTreatments.0.q2_31d']);
  const unpaid = (patch) => validate('2C', { ...S2C, q2_31: true, medicalTreatments: [{ ...TREATMENT, q2_31d: false, ...patch }] });
  assert.equal(unpaid({}).success, true, 'the amount is optional');
  assert.equal(unpaid({ q2_31e: gbp(250.5) }).success, true);
  assert.equal(unpaid({ q2_31e: gbp(-1) }).errors['medicalTreatments.0.q2_31e.amount'], 'Cannot be negative');
  assert.equal(unpaid({ q2_31e: gbp(100001) }).errors['medicalTreatments.0.q2_31e.amount'], 'Amount cannot be more than 100,000');
  const paid = validate('2C', { ...S2C, q2_31: true, medicalTreatments: [{ ...TREATMENT, q2_31e: gbp(5) }] });
  assert.equal(paid.data.medicalTreatments[0].q2_31e, undefined, 'dropped when the costs were paid in full');
  assert.equal(validate('2C', { ...S2C, q2_31: true, medicalTreatments: [{ ...TREATMENT, q2_31a: '2090-01' }] }).errors['medicalTreatments.0.q2_31a'], 'Cannot be in the future');
  assert.match(validate('2C', { ...S2C, q2_31: true, medicalTreatments: Array.from({ length: 6 }, () => TREATMENT) }).errors.medicalTreatments, /up to 5 entries/);
  assert.equal(validate('2C', { ...S2C, q2_31: true, medicalTreatments: [{ ...TREATMENT, q2_31b: 'x'.repeat(501) }] }).errors['medicalTreatments.0.q2_31b'], 'Must be 500 characters or fewer');
});

test('2.31 gate: changing to No removes the treatments; the treatment text is a sensitive (encrypted) field', () => {
  const r = validate('2C', { ...S2C, q2_31: false, medicalTreatments: [TREATMENT] }, { medicalTreatments: [TREATMENT] });
  assert.deepEqual(r.removed, ['medicalTreatments']);
  assert.deepEqual(engine.pruneAnswers(config, { q2_31: false, medicalTreatments: [TREATMENT] }).removed, ['medicalTreatments']);
  assert.equal(config.questions.find((q) => q.id === 'q2_31b').sensitive, true);
  assert.equal(config.questions.find((q) => q.id === 'q2_31c').sensitive, undefined);
});

test('4.8 gate: Yes opens 1 to 4 parents; No asks an optional reason; each answer removes the other', () => {
  assert.equal(validate('4C', {}).errors.q4_8, 'This question is required');
  assert.equal(validate('4C', { q4_8: true }).errors.parents, 'Add at least one entry');
  assert.equal(validate('4C', PARENTS_YES).success, true);
  assert.match(validate('4C', { q4_8: true, parents: Array.from({ length: 5 }, () => PARENT) }).errors.parents, /up to 4 entries/);
  assert.equal(validate('4C', { q4_8: true, parents: Array.from({ length: 4 }, () => PARENT) }).success, true);
  // No: the reason is optional and the parents are not asked.
  assert.equal(validate('4C', { q4_8: false }).success, true);
  assert.equal(validate('4C', { q4_8: false, q4_8g: 'I was adopted' }).success, true);
  const no = validate('4C', { q4_8: false, parents: [PARENT], q4_8g: 'x' }, { parents: [PARENT] });
  assert.deepEqual(no.removed, ['parents']);
  const yes = validate('4C', { ...PARENTS_YES, q4_8g: 'stale' }, { q4_8g: 'stale' });
  assert.deepEqual(yes.removed, ['q4_8g']);
  assert.deepEqual(engine.pruneAnswers(config, { q4_8: false, parents: [PARENT] }).removed, ['parents']);
  assert.deepEqual(engine.pruneAnswers(config, { q4_8: true, q4_8g: 'x', parents: [PARENT] }).removed, ['q4_8g']);
  assert.equal(engine.isSectionVisible(config, '4C', {}), true);
});

test('4.8f: a No asks for the previous nationality (required) and when it changed (optional); a Yes removes them', () => {
  const entry = (patch) => ({ q4_8: true, parents: [{ ...PARENT, ...patch }] });
  assert.equal(validate('4C', entry({ q4_8f: false })).errors['parents.0.q4_8h'], 'This question is required');
  assert.equal(validate('4C', entry({ q4_8f: false, q4_8h: 'FR' })).success, true);
  assert.equal(validate('4C', entry({ q4_8f: false, q4_8h: 'FR', q4_8i: '2001-05' })).success, true);
  assert.equal(validate('4C', entry({ q4_8f: false, q4_8h: 'FR', q4_8i: '2090-05' })).errors['parents.0.q4_8i'], 'Cannot be in the future');
  const same = validate('4C', entry({ q4_8f: true, q4_8h: 'FR', q4_8i: '2001-05' }));
  assert.equal(same.success, true);
  assert.deepEqual(Object.keys(same.data.parents[0]).filter((k) => k === 'q4_8h' || k === 'q4_8i'), []);
});

test('drafts can sit on any question or group; getDraftItems lists groups too, with no number', () => {
  const items = engine.getDraftItems(config);
  const sectionOne = items.find((s) => s.sectionId === '1').items;
  assert.deepEqual(sectionOne.map((i) => i.number), ['1.1', '1.2', '1.3', '1.4']);
  const twoA = items.find((s) => s.sectionId === '2A').items;
  assert.ok(twoA.some((i) => i.id === 'otherNames' && i.number === null), 'the other-names group is listed');
  assert.ok(items.find((s) => s.sectionId === '4C').items.some((i) => i.id === 'parents' && i.number === null));
  // A draft needs a note.
  for (const s of items) for (const i of s.items) assert.ok(i.draft && i.draft.length > 20, i.id);
});

test('getHeldSections: a section is held while it has a tbc flag or a draft; nothing held means ready', () => {
  const held = engine.getHeldSections(config);
  assert.deepEqual(held.map((h) => h.sectionId), ['1', '2A', '2B', '2C', '2D', '4A', '4B', '4C', '5', '6A', '6B', '6C', '6D', '7', '8']);
  assert.deepEqual(held.find((h) => h.sectionId === '3'), undefined, 'section 3 has neither');
  assert.deepEqual(held.find((h) => h.sectionId === '2D'), { sectionId: '2D', tbc: 0, draft: 2 });
  assert.deepEqual(held.find((h) => h.sectionId === '6B'), { sectionId: '6B', tbc: 0, draft: 1 });
  assert.deepEqual(held.find((h) => h.sectionId === '5'), { sectionId: '5', tbc: 0, draft: 2 });
  assert.deepEqual(held.find((h) => h.sectionId === '7'), { sectionId: '7', tbc: 6, draft: 2 });

  const c = clone(config);
  for (const q of c.questions) { delete q.tbc; delete q.draft; }
  for (const g of c.groups) { delete g.tbc; delete g.draft; }
  assert.deepEqual(engine.getHeldSections(c), []);

  // A single draft on a group is enough to hold its section.
  c.groups.find((g) => g.id === 'parents').draft = 'Draft: test';
  assert.deepEqual(engine.getHeldSections(c), [{ sectionId: '4C', tbc: 0, draft: 1 }]);
  // So is a single tbc.
  c.groups.find((g) => g.id === 'parents').draft = undefined;
  c.questions.find((q) => q.id === 'q3_1').tbc = 'x';
  assert.deepEqual(engine.getHeldSections(c).map((h) => h.sectionId), ['3']);
});

test('config: validateConfig checks the draft marker on questions and groups', () => {
  const cases = [
    ['draft on a text question is allowed', (c) => { c.questions.find((q) => q.id === 'q2_1').draft = 'Draft: test'; }, null],
    ['draft on a group is allowed', (c) => { c.groups[0].draft = 'Draft: test'; }, null],
    ['empty draft on a question', (c) => { c.questions.find((q) => q.id === 'q2_1').draft = ''; }, /draft must be a non-empty string/],
    ['blank draft on a question', (c) => { c.questions.find((q) => q.id === 'q2_1').draft = '   '; }, /draft must be a non-empty string/],
    ['empty draft on a group', (c) => { c.groups[0].draft = ''; }, /draft must be a non-empty string/],
    ['non-text draft on a group', (c) => { c.groups[0].draft = true; }, /draft must be a non-empty string/],
    ['tbc_ option value', (c) => { c.questions.find((q) => q.id === 'q1_1').options[0].value = 'tbc_x'; }, /still a placeholder/],
    ['[TBC] option label', (c) => { c.questions.find((q) => q.id === 'q1_1').options[1].label = '[TBC] Other'; }, /still a placeholder/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const c = clone(config);
    mutate(c);
    const problems = engine.validateConfig(c);
    if (pattern === null) assert.deepEqual(problems, [], name);
    else assert.ok(problems.some((p) => pattern.test(p)), `${name}: got ${JSON.stringify(problems)}`);
  }
});

test('compatibility: answers saved under config 0.5.0 keep validating, except a Yes that now needs its follow-up', () => {
  assert.equal(validate('1', S1).success, true);
  assert.equal(validate('2A', S2A).success, true);
  assert.equal(validate('2B', S2B).success, true);
  assert.equal(validate('2C', S2C).success, true);
  assert.equal(validate('2C', { ...S2C, q2_28: 'owned' }).success, true);
  // These were fine before and now need the follow-up, so the section shows "Needs review".
  assert.equal(validate('1', { ...S1, q1_2: true }).success, false);
  assert.equal(validate('1', { ...S1, q1_3: true }).success, false);
  assert.equal(validate('2B', { ...S2B, q2_23: true }).success, false);
  assert.equal(validate('2C', { ...S2C, q2_28: 'with_family_or_friends' }).success, false);
  assert.equal(validate('2C', { ...S2C, q2_31: true }).success, false);
  assert.equal(validate('4C', { parents: [PARENT] }).success, false, 'the new Yes/No in front of the parents is unanswered');
  assert.equal(validate('4C', PARENTS_YES).success, true);
});

// ---------------------------------------------------------------------------
// Step 7b: answers hidden only because their gate was never answered are kept
// ---------------------------------------------------------------------------

test('prune: answers saved before a Yes/No was put in front of them are kept until that Yes/No is answered', () => {
  // The parents were saved when 4C had no gate; 4.8 has never been answered.
  const waiting = engine.pruneAnswers(config, { parents: [PARENT] });
  assert.deepEqual(waiting.removed, [], 'nothing is removed');
  assert.equal(waiting.answers.parents, undefined, 'and they are not treated as shown');
  // Once the gate is answered No they are hidden by a changed gate, and are removed.
  assert.deepEqual(engine.pruneAnswers(config, { q4_8: false, parents: [PARENT] }).removed, ['parents']);
  // Once it is answered Yes they are kept and shown.
  const yes = engine.pruneAnswers(config, { q4_8: true, parents: [PARENT] });
  assert.deepEqual(yes.removed, []);
  assert.equal(yes.answers.parents.length, 1);
});

test('prune: a single question whose controlling answer is missing is kept; one whose answer hides it is removed', () => {
  assert.deepEqual(engine.pruneAnswers(config, { q2_29: 'old text' }).removed, [], '2.28 has not been answered');
  assert.deepEqual(engine.pruneAnswers(config, { q2_28: 'owned', q2_29: 'old text' }).removed, ['q2_29']);
  assert.deepEqual(engine.pruneAnswers(config, { q2_28: 'other', q2_29: 'text' }).removed, []);
});

test('prune: a condition that combines several questions waits if any of them is unanswered', () => {
  const cfg = mk([
    { id: 'q1_1', number: '1.1', type: 'YN' },
    { id: 'q1_2', number: '1.2', type: 'YN' },
    { id: 'q1_3', number: '1.3', type: 'TXT', showWhen: { all: [{ q: 'q1_1', eq: true }, { not: { q: 'q1_2', eq: true } }] } },
  ]);
  assert.deepEqual(engine.validateConfig(cfg), []);
  assert.deepEqual(engine.pruneAnswers(cfg, { q1_1: true, q1_3: 'x' }).removed, [], 'q1_2 unanswered');
  assert.deepEqual(engine.pruneAnswers(cfg, { q1_2: false, q1_3: 'x' }).removed, [], 'q1_1 unanswered');
  assert.deepEqual(engine.pruneAnswers(cfg, { q1_1: true, q1_2: false, q1_3: 'x' }).removed, [], 'shown');
  assert.deepEqual(engine.pruneAnswers(cfg, { q1_1: false, q1_2: false, q1_3: 'x' }).removed, ['q1_3'], 'both answered and hidden');
});

test('prune: saving a different section does not remove the parents of an application saved before 4.8 existed', () => {
  // validateSection never touches another section's keys, so only pruneAnswers could delete them.
  const stored = { ...S1, parents: [PARENT] };
  const r = validate('2A', S2A, stored);
  assert.equal(r.success, true);
  assert.deepEqual(r.removed, []);
  const { removed } = engine.pruneAnswers(config, { ...stored, ...r.data });
  assert.deepEqual(removed, []);
});

// ---------------------------------------------------------------------------
// Step 7c: Parts 5 and 6 follow-ups (employment statuses, other income, who is paying,
// family in the UK, no UK address, public funds)
// ---------------------------------------------------------------------------

const SELF_EMPLOYED = { q5_1: 'self_employed', q5_1a: 'Test Business Ltd', q5_1b: '2020-03', q5_1c: ADDRESS, q5_1d: 'Made-up description of a made-up business.', q5_1e: gbp(3000) };
const STUDENT = { q5_1: 'student', q5_1f: 'Test University' };
const PAYER = { q6_5b: 'relative', q6_5c: 'Testpayer', q6_5d: 'parent', q6_5e: 'GB' };
const RELATIVE = { q6_6b: 'sibling', q6_6c: 'Testrelative', q6_6d: 'Testsurname', q6_6f: 'GB', q6_6g: 'british_citizen' };
const FUNDS = { q6_8b: 'housing_benefit', q6_8c: '2023-01' };
const PART56 = ['5', '6A', '6B', '6C', '6D'];

test('5.1 self-employed: business name, start, address, what it does and monthly income are all required', () => {
  const blank = validate('5', { q5_1: 'self_employed' });
  assert.deepEqual(Object.keys(blank.errors).sort(), ['q5_1a', 'q5_1b', 'q5_1c', 'q5_1d', 'q5_1e']);
  const ok = validate('5', SELF_EMPLOYED);
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  assert.equal(validate('5', { ...SELF_EMPLOYED, q5_1b: '2090-01' }).errors.q5_1b, 'Cannot be in the future');
  assert.equal(validate('5', { ...SELF_EMPLOYED, q5_1e: gbp(-1) }).errors['q5_1e.amount'], 'Cannot be negative');
  assert.equal(validate('5', { ...SELF_EMPLOYED, q5_1e: gbp(1000001) }).errors['q5_1e.amount'], 'Amount cannot be more than 1,000,000');
  assert.equal(validate('5', { ...SELF_EMPLOYED, q5_1e: gbp(0) }).success, true, 'zero is a real answer');
  assert.equal(validate('5', { ...SELF_EMPLOYED, q5_1d: 'x'.repeat(2000) }).success, true);
  assert.equal(validate('5', { ...SELF_EMPLOYED, q5_1d: 'x'.repeat(2001) }).errors.q5_1d, 'Must be 2000 characters or fewer');
  assert.ok(validate('5', { ...SELF_EMPLOYED, q5_1c: { line1: '1 Test Street' } }).errors['q5_1c.town']);
});

test('5.1 student: only the institution is required; its address and the course are optional', () => {
  assert.deepEqual(Object.keys(validate('5', { q5_1: 'student' }).errors), ['q5_1f']);
  assert.equal(validate('5', STUDENT).success, true);
  const full = validate('5', { ...STUDENT, q5_1g: ADDRESS, q5_1h: 'Made-up course' });
  assert.equal(full.success, true, JSON.stringify(full.errors));
  assert.equal(full.data.q5_1h, 'Made-up course');
  assert.equal(validate('5', { ...STUDENT, q5_1f: 'x'.repeat(201) }).errors.q5_1f, 'Must be 200 characters or fewer');
});

test('5.1 retired: nothing is required; the retirement date cannot be in the future; the pension cannot be negative', () => {
  assert.equal(validate('5', { q5_1: 'retired' }).success, true);
  assert.equal(validate('5', { q5_1: 'retired', q5_1i: '2018-06', q5_1j: gbp(900) }).success, true);
  assert.equal(validate('5', { q5_1: 'retired', q5_1i: '2090-06' }).errors.q5_1i, 'Cannot be in the future');
  assert.equal(validate('5', { q5_1: 'retired', q5_1j: gbp(-5) }).errors['q5_1j.amount'], 'Cannot be negative');
  assert.equal(validate('5', { q5_1: 'retired', q5_1j: gbp(1000001) }).errors['q5_1j.amount'], 'Amount cannot be more than 1,000,000');
});

test('5.1 homemaker, not working and other: an optional list, and a required description when the answer is "other"', () => {
  for (const status of ['homemaker', 'unemployed', 'other']) {
    assert.equal(validate('5', { q5_1: status }).success, true, `${status}: the list is optional`);
    assert.equal(validate('5', { q5_1: status, q5_1k: 'spouse_partner' }).success, true, status);
    assert.equal(validate('5', { q5_1: status, q5_1k: 'nonsense' }).errors.q5_1k, 'Choose from the listed options', status);
    assert.equal(validate('5', { q5_1: status, q5_1k: 'other' }).errors.q5_1l, 'This question is required', status);
    assert.equal(validate('5', { q5_1: status, q5_1k: 'other', q5_1l: 'Made-up support' }).success, true, status);
  }
  assert.equal(validate('5', { q5_1: 'unemployed', q5_1k: 'other', q5_1l: 'x'.repeat(2001) }).errors.q5_1l, 'Must be 2000 characters or fewer');
  for (const v of ['spouse_partner', 'parents_family', 'savings', 'benefits_pension']) {
    assert.equal(engine.isVisible(config, 'q5_1l', { q5_1: 'unemployed', q5_1k: v }), false, v);
  }
  // The block belongs to those three statuses only.
  assert.equal(engine.isVisible(config, 'q5_1k', { q5_1: 'employed' }), false);
  assert.equal(engine.isVisible(config, 'q5_1k', { q5_1: 'student' }), false);
});

test('5.1 gate: changing the status removes the answers of the block that no longer applies', () => {
  const remove = (from, patch, existing) => validate('5', { ...from, ...patch }, existing).removed.sort();
  assert.deepEqual(remove(EMPLOYED, { q5_1: 'retired' }, EMPLOYED), ['q5_2', 'q5_3', 'q5_4', 'q5_5', 'q5_6', 'q5_7', 'q5_8', 'q5_9']);
  assert.deepEqual(remove(SELF_EMPLOYED, { q5_1: 'student', q5_1f: 'Test University' }, SELF_EMPLOYED), ['q5_1a', 'q5_1b', 'q5_1c', 'q5_1d', 'q5_1e']);
  assert.deepEqual(remove({ ...STUDENT, q5_1g: ADDRESS, q5_1h: 'x' }, { q5_1: 'retired' }, { ...STUDENT, q5_1g: ADDRESS, q5_1h: 'x' }), ['q5_1f', 'q5_1g', 'q5_1h']);
  const retired = { q5_1: 'retired', q5_1i: '2018-06', q5_1j: gbp(900) };
  assert.deepEqual(remove(retired, { q5_1: 'homemaker' }, retired), ['q5_1i', 'q5_1j']);
  const supported = { q5_1: 'homemaker', q5_1k: 'other', q5_1l: 'Made-up support' };
  assert.deepEqual(remove(supported, { q5_1: 'employed', ...EMPLOYED }, supported), ['q5_1k', 'q5_1l']);
  // Changing only the list answer removes only the description.
  assert.deepEqual(remove(supported, { q5_1k: 'savings' }, supported), ['q5_1l']);
  // The same through pruneAnswers, which the server runs over the whole application.
  assert.deepEqual(engine.pruneAnswers(config, { ...SELF_EMPLOYED, q5_1: 'employed' }).removed.sort(), ['q5_1a', 'q5_1b', 'q5_1c', 'q5_1d', 'q5_1e']);
});

test('5.1 keep-until-answered: an old "employed" application keeps every employer answer, with or without 5.1', () => {
  // The application as step 6b saved it: 5.1 = employed and the employer answers.
  const kept = engine.pruneAnswers(config, { ...EMPLOYED });
  assert.deepEqual(kept.removed, []);
  assert.equal(Object.keys(kept.answers).length, Object.keys(EMPLOYED).length, 'nothing is dropped');
  assert.equal(validate('5', EMPLOYED).success, true, 'and the section still validates, so it stays saved');
  // Saving another section never removes them.
  assert.deepEqual(validate('6A', S6A, EMPLOYED).removed, []);
  // Even if the status itself were missing, answers that wait for it are not removed.
  const withoutStatus = { ...EMPLOYED };
  delete withoutStatus.q5_1;
  assert.deepEqual(engine.pruneAnswers(config, withoutStatus).removed, [], 'waiting for 5.1');
  // A status that is answered and hides them does remove them.
  assert.equal(engine.pruneAnswers(config, { ...EMPLOYED, q5_1: 'student' }).removed.length, 8);
});

test('6.1a: the monthly other income is optional and shows only when other income applies', () => {
  const income = (v, extra = {}) => validate('6A', { ...S6A, q6_1: v, ...(v === 'savings' || v === 'savings_and_income' ? {} : { q6_2: undefined }), ...extra });
  for (const v of ['other_income', 'savings_and_income']) {
    assert.equal(engine.isVisible(config, 'q6_1a', { q6_1: v }), true, v);
    assert.equal(income(v).success, true, `${v}: optional`);
    assert.equal(income(v, { q6_1a: gbp(400) }).success, true, v);
  }
  for (const v of ['savings', 'none']) assert.equal(engine.isVisible(config, 'q6_1a', { q6_1: v }), false, v);
  assert.equal(income('other_income', { q6_1a: gbp(-1) }).errors['q6_1a.amount'], 'Cannot be negative');
  assert.equal(income('other_income', { q6_1a: gbp(1000001) }).errors['q6_1a.amount'], 'Amount cannot be more than 1,000,000');
  const closed = validate('6A', { ...S6A, q6_1: 'none', q6_2: undefined, q6_1a: gbp(5) }, { ...S6A, q6_1a: gbp(5) });
  assert.deepEqual(closed.removed.sort(), ['q6_1a', 'q6_2']);
});

test('6.5: Yes opens up to 5 payers; who, name, relationship and country are required; amount and what it covers are optional', () => {
  const six = (payers, extra = {}) => validate('6A', { ...S6A, q6_5: true, payers, ...extra });
  assert.equal(validate('6A', { ...S6A, q6_5: true }).errors.payers, 'Add at least one entry');
  const ok = six([PAYER]);
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  assert.deepEqual(Object.keys(six([{}]).errors).sort(), ['payers.0.q6_5b', 'payers.0.q6_5c', 'payers.0.q6_5d', 'payers.0.q6_5e']);
  assert.equal(six([{ ...PAYER, q6_5f: gbp(1500), q6_5g: ['travel', 'living_costs'] }]).success, true);
  assert.equal(six([{ ...PAYER, q6_5f: gbp(-1) }]).errors['payers.0.q6_5f.amount'], 'Cannot be negative');
  assert.equal(six([{ ...PAYER, q6_5f: gbp(1000001) }]).errors['payers.0.q6_5f.amount'], 'Amount cannot be more than 1,000,000');
  assert.equal(six([{ ...PAYER, q6_5g: ['travel', 'travel'] }]).errors['payers.0.q6_5g'], 'Each choice can only be selected once');
  assert.equal(six([{ ...PAYER, q6_5g: ['nonsense'] }]).errors['payers.0.q6_5g'], 'Choose from the listed options');
  assert.equal(six([{ ...PAYER, q6_5e: 'ZZ' }]).errors['payers.0.q6_5e'], 'Choose a country from the list');
  assert.equal(six([{ ...PAYER, q6_5b: 'nonsense' }]).errors['payers.0.q6_5b'], 'Choose from the listed options');
  assert.match(six(Array.from({ length: 6 }, () => PAYER)).errors.payers, /up to 5 entries/);
  assert.equal(six(Array.from({ length: 5 }, () => PAYER)).success, true);
});

test('6.5 gate: changing to No removes every payer', () => {
  const r = validate('6A', { ...S6A, q6_5: false, payers: [PAYER] }, { payers: [PAYER] });
  assert.equal(r.success, true);
  assert.deepEqual(r.removed, ['payers']);
  assert.deepEqual(engine.pruneAnswers(config, { q6_5: false, payers: [PAYER] }).removed, ['payers']);
});

test('6.6: Yes opens up to 10 relatives; the birth date is optional, everything else is required', () => {
  const six = (relatives) => validate('6B', { q6_6: true, ukFamily: relatives });
  assert.equal(validate('6B', { q6_6: true }).errors.ukFamily, 'Add at least one entry');
  assert.equal(six([RELATIVE]).success, true);
  assert.deepEqual(Object.keys(six([{}]).errors).sort(), ['ukFamily.0.q6_6b', 'ukFamily.0.q6_6c', 'ukFamily.0.q6_6d', 'ukFamily.0.q6_6f', 'ukFamily.0.q6_6g']);
  assert.equal(six([{ ...RELATIVE, q6_6e: '1985-04-02' }]).success, true);
  assert.equal(six([{ ...RELATIVE, q6_6e: '2090-01-01' }]).errors['ukFamily.0.q6_6e'], 'Cannot be in the future');
  assert.equal(six([{ ...RELATIVE, q6_6g: 'nonsense' }]).errors['ukFamily.0.q6_6g'], 'Choose from the listed options');
  for (const status of ['british_citizen', 'settled', 'pre_settled', 'work', 'student', 'visitor', 'protection', 'other', 'dont_know']) {
    assert.equal(six([{ ...RELATIVE, q6_6g: status }]).success, true, status);
  }
  assert.match(six(Array.from({ length: 11 }, () => RELATIVE)).errors.ukFamily, /up to 10 entries/);
  assert.equal(six(Array.from({ length: 10 }, () => RELATIVE)).success, true);
});

test('6.6 gate: changing to No removes every relative', () => {
  const r = validate('6B', { q6_6: false, ukFamily: [RELATIVE] }, { ukFamily: [RELATIVE] });
  assert.deepEqual(r.removed, ['ukFamily']);
  assert.deepEqual(engine.pruneAnswers(config, { q6_6: false, ukFamily: [RELATIVE] }).removed, ['ukFamily']);
});

test('6.7 No: accommodation plans are required and the area is optional; a Yes removes both and asks for the stays', () => {
  assert.equal(validate('6C', { q6_7: false }).errors.q6_7x, 'This question is required');
  assert.equal(validate('6C', { q6_7: false, q6_7x: 'not_decided' }).success, true);
  assert.equal(validate('6C', { q6_7: false, q6_7x: 'paid_stay', q6_7y: 'Test City' }).success, true);
  for (const v of ['not_decided', 'paid_stay', 'family_friends', 'address_unknown', 'other']) {
    assert.equal(validate('6C', { q6_7: false, q6_7x: v }).success, true, v);
  }
  assert.equal(validate('6C', { q6_7: false, q6_7x: 'nonsense' }).errors.q6_7x, 'Choose from the listed options');
  assert.equal(validate('6C', { q6_7: false, q6_7x: 'other', q6_7y: 'x'.repeat(201) }).errors.q6_7y, 'Must be 200 characters or fewer');
  const yes = validate('6C', { q6_7: true, accommodation: [STAY], q6_7x: 'not_decided', q6_7y: 'Test City' }, { ...TRIP, q6_7x: 'not_decided', q6_7y: 'Test City' });
  assert.equal(yes.success, true, JSON.stringify(yes.errors));
  assert.deepEqual(yes.removed.sort(), ['q6_7x', 'q6_7y']);
  assert.deepEqual(engine.pruneAnswers(config, { q6_7: true, q6_7x: 'not_decided', q6_7y: 'x', accommodation: [STAY] }).removed.sort(), ['q6_7x', 'q6_7y']);
});

test('6.8: Yes opens up to 5 public-funds entries; type and start are required; the end and the amount are optional', () => {
  const six = (funds) => validate('6D', { q6_8: true, publicFunds: funds });
  assert.equal(validate('6D', { q6_8: true }).errors.publicFunds, 'Add at least one entry');
  assert.equal(six([FUNDS]).success, true);
  assert.deepEqual(Object.keys(six([{}]).errors).sort(), ['publicFunds.0.q6_8b', 'publicFunds.0.q6_8c']);
  assert.equal(six([{ ...FUNDS, q6_8d: '2023-06', q6_8e: gbp(250) }]).success, true);
  assert.equal(six([{ ...FUNDS, q6_8d: '2023-01' }]).success, true, 'it may stop in the same month it started');
  assert.equal(six([{ ...FUNDS, q6_8d: '2022-12' }]).errors['publicFunds.0.q6_8d'], 'Must be on or after the date in question 6.8c');
  assert.equal(six([{ ...FUNDS, q6_8c: '2090-01' }]).errors['publicFunds.0.q6_8c'], 'Cannot be in the future');
  assert.equal(six([{ ...FUNDS, q6_8d: '2090-01' }]).errors['publicFunds.0.q6_8d'], 'Cannot be in the future');
  assert.equal(six([{ ...FUNDS, q6_8e: gbp(-1) }]).errors['publicFunds.0.q6_8e.amount'], 'Cannot be negative');
  assert.equal(six([{ ...FUNDS, q6_8b: 'nonsense' }]).errors['publicFunds.0.q6_8b'], 'Choose from the listed options');
  for (const type of ['housing_benefit', 'universal_credit', 'child_benefit', 'council_tax_reduction', 'other']) {
    assert.equal(six([{ ...FUNDS, q6_8b: type }]).success, true, type);
  }
  assert.match(six(Array.from({ length: 6 }, () => FUNDS)).errors.publicFunds, /up to 5 entries/);
});

test('6.8 gate: changing to No removes every entry', () => {
  const r = validate('6D', { q6_8: false, publicFunds: [FUNDS] }, { publicFunds: [FUNDS] });
  assert.deepEqual(r.removed, ['publicFunds']);
  assert.deepEqual(engine.pruneAnswers(config, { q6_8: false, publicFunds: [FUNDS] }).removed, ['publicFunds']);
});

test('the old placeholder boxes 6.5a, 6.6a and 6.8a no longer exist, and nothing in Parts 5 and 6 is encrypted', () => {
  for (const id of ['q6_5a', 'q6_6a', 'q6_8a']) assert.equal(config.questions.some((q) => q.id === id), false, id);
  assert.deepEqual(config.questions.filter((q) => PART56.includes(q.section) && q.sensitive), []);
  // Their old values are unknown keys: pruning leaves them alone (they are not "hidden", they have no question).
  const { removed } = engine.pruneAnswers(config, { q6_5: true, q6_5a: 'old text', q6_6: false, q6_6a: 'old text', q6_8: true, q6_8a: 'old text' });
  assert.deepEqual(removed, []);
});

test('Parts 5 and 6 carry drafts and no tbc; every draft says what the default is', () => {
  assert.deepEqual(config.questions.filter((q) => PART56.includes(q.section) && q.tbc), []);
  assert.deepEqual(config.groups.filter((g) => PART56.includes(g.section) && g.tbc), []);
  const items = engine.getDraftItems(config).filter((s) => PART56.includes(s.sectionId));
  assert.deepEqual(items.map((s) => [s.sectionId, s.items.map((i) => i.number || i.id)]), [
    ['5', ['5.1', '5.9']], ['6A', ['6.1', '6.5']], ['6B', ['6.6']], ['6C', ['accommodation', '6.7']], ['6D', ['6.8']],
  ]);
  for (const s of items) for (const i of s.items) assert.match(i.draft, /^Draft/, i.id);
  for (const id of ['q5_1d', 'q5_1l']) assert.equal(config.questions.find((q) => q.id === id).rules.maxLen, 2000, id);
});

test('compatibility: answers saved under config 0.6.0 keep validating, except a Yes or No that now needs its follow-up', () => {
  assert.equal(validate('5', EMPLOYED).success, true);
  assert.equal(validate('5', { q5_1: 'retired' }).success, true);
  assert.equal(validate('5', { q5_1: 'homemaker' }).success, true);
  assert.equal(validate('6A', S6A).success, true);
  assert.equal(validate('6B', { q6_6: false }).success, true);
  assert.equal(validate('6D', { q6_8: false }).success, true);
  assert.equal(validate('6C', { q6_7: true, accommodation: [STAY] }, TRIP).success, true);
  // These were fine before and now need a follow-up, so the section shows "Needs review".
  assert.equal(validate('5', { q5_1: 'self_employed' }).success, false);
  assert.equal(validate('5', { q5_1: 'student' }).success, false);
  assert.equal(validate('6A', { ...S6A, q6_5: true }).success, false);
  assert.equal(validate('6B', { q6_6: true }).success, false);
  assert.equal(validate('6C', { q6_7: false }).success, false);
  assert.equal(validate('6D', { q6_8: true }).success, false);
});
