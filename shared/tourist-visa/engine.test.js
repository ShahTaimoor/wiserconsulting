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

/** A copy of the config with drafts put back on a question, a group and both wordings, for proving that the draft mechanism still works. */
const withDrafts = () => {
  const c = clone(config);
  c.questions.find((q) => q.id === 'q2_33').draft = 'Draft: a default we chose for the telephone questions.';
  c.questions.find((q) => q.id === 'q2_35').draft = 'Draft: a default we chose for how to be contacted.';
  c.groups.find((g) => g.id === 'parents').draft = 'Draft: a default we chose for the parents group.';
  c.declarations.submit.draft = 'Draft: wording awaiting approval.';
  c.afterSubmit.draft = 'Draft: wording awaiting approval.';
  return c;
};
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
  for (const l of 'abcdefghijkl') expected.add(`5.1${l}`); // other employment statuses (7c)
  expected.add('6.1a');
  for (const l of 'bcdefg') { expected.add(`6.5${l}`); expected.add(`6.6${l}`); } // payers and relatives in the UK (7c)
  expected.add('6.7x'); expected.add('6.7y');
  for (const l of 'bcde') expected.add(`6.8${l}`);
  // Part 7 (7d): 7.2, 7.3a and 7.6a became groups of follow-ups; 7.2 itself is no longer a question.
  for (const i of [1, 3, 4, 5, 6, 7]) expected.add(`7.${i}`);
  for (const l of 'abc') { expected.add(`7.2${l}`); expected.add(`7.5${l}`); }
  for (const l of 'bcdef') expected.add(`7.3${l}`);
  for (const l of 'bcd') expected.add(`7.6${l}`);
  for (const l of 'abcd') expected.add(`7.7${l}`);
  for (let i = 1; i <= 2; i++) expected.add(`8.${i}`);
  expected.add('8.1a');
  // Part 9 (8b-1): ten Yes/No questions with a details box each, and four declaration ticks.
  for (let i = 1; i <= 14; i++) expected.add(`9.${i}`);
  for (let i = 1; i <= 10; i++) expected.add(`9.${i}a`);
  for (const l of 'abcd') expected.add(`8.2${l}`);
  // Part 10A to 10C (8b-2): the penalties checklist with a details box per choice, two extra-information boxes, language and NI number.
  for (let i = 1; i <= 5; i++) expected.add(`10.${i}`);
  for (const l of 'abcdef') expected.add(`10.1${l}`);
  expected.add('10.4a'); expected.add('10.5a');
  // Part 10D (8c-2): the two document questions.
  expected.add('10.6'); expected.add('10.7');
  const actual = new Set(config.questions.map((q) => q.number));
  assert.deepEqual([...actual].sort(), [...expected].sort());
  assert.equal(config.questions.length, expected.size);
});

test('config: sections are 1, 2A-2D, 3, 4A-4C, 5, 6A-6D, 7, 8, 9A-9C, 10A-10D and every question belongs to one', () => {
  assert.deepEqual(
    config.sections.map((s) => s.id),
    ['1', '2A', '2B', '2C', '2D', '3', '4A', '4B', '4C', '5', '6A', '6B', '6C', '6D', '7', '8', '9A', '9B', '9C', '10A', '10B', '10C', '10D']
  );
  assert.deepEqual(config.parts.map((p) => p.id), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
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

test('config 1.0.0: the design was approved as final, so no draft marker is left anywhere', () => {
  assert.equal(config.version, '1.0.0');
  assert.deepEqual(config.questions.filter((q) => q.draft).map((q) => q.number), []);
  assert.deepEqual(config.groups.filter((g) => g.draft).map((g) => g.id), []);
  assert.equal(config.declarations.submit.draft, undefined);
  assert.equal(config.afterSubmit.draft, undefined);
  assert.equal(JSON.stringify(config).includes('"draft"'), false, 'no draft key anywhere in the file');
  assert.ok(config.declarations.submit.text.length > 100, 'the final declaration is still there');
  assert.ok(config.afterSubmit.steps.length >= 2, 'and so is the text shown after submitting');
});

test('config: no tbc is left anywhere', () => {
  assert.deepEqual(config.questions.filter((q) => q.tbc).map((q) => q.number), []);
  assert.deepEqual(config.groups.filter((g) => g.tbc).map((g) => g.id), []);
  assert.deepEqual(engine.getReleaseBlockers(config), []);
});

test('draft items: nothing is a draft today, and a draft put back is listed by section and leaves its section releasable but held', () => {
  assert.deepEqual(engine.getDraftItems(config), []);
  for (const s of config.sections) assert.equal(engine.isSectionReleasable(config, s.id), true, s.id);
  const c = withDrafts();
  const items = engine.getDraftItems(c);
  assert.deepEqual(items.map((s) => s.sectionId), ['2D', '4C']);
  assert.deepEqual(items.find((s) => s.sectionId === '2D').items.map((i) => i.number), ['2.33', '2.35']);
  assert.ok(items.every((s) => s.items.every((i) => i.draft && i.id && (i.number === null || typeof i.number === 'string'))));
  for (const id of ['2D', '4C']) assert.equal(engine.isSectionReleasable(c, id), true, `${id} has only drafts`);
  assert.deepEqual(engine.getReleaseBlockers(c), []);
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

// The ten Part 9 Yes/No questions and their ten details boxes (the four ticks are not sensitive).
const PART9_SENSITIVE = Array.from({ length: 10 }, (_, i) => [`9.${i + 1}`, `9.${i + 1}a`]).flat();
// Part 10: the penalties checklist and its six details boxes, the National Insurance Yes/No and the number itself.
const PART10_SENSITIVE = ['10.1', '10.1a', '10.1b', '10.1c', '10.1d', '10.1e', '10.1f', '10.5', '10.5a'];

test('config: sensitive questions are the ID number, passport number, licence number, treatment text, the three Part 7 fields the Part 9 answers and the Part 10 answers', () => {
  assert.deepEqual(config.questions.filter((q) => q.sensitive).map((q) => q.number), ['2.19', '2.30a', '2.31b', '3.1', '7.2c', '7.3f', '7.6d', ...PART9_SENSITIVE, ...PART10_SENSITIVE]);
});

test('config: validateConfig reports broken configs', () => {
  const cases = [
    ['duplicate id', (c) => { c.questions[1].id = c.questions[0].id; }, /Duplicate question id/],
    ['number not matching id', (c) => { c.questions[0].number = '9.9'; }, /does not match id/],
    ['unknown section', (c) => { c.questions[0].section = 'ZZ'; }, /unknown section/],
    ['unknown type', (c) => { c.questions[0].type = 'XYZ'; }, /unknown type/],
    ['SEL without options', (c) => { delete c.questions[0].options; }, /needs options/],
    ['showWhen on unknown question', (c) => { c.questions[3].showWhen = { q: 'q99_99', eq: 'x' }; }, /unknown question/],
    ['showWhen on a later question', (c) => { c.questions[0].showWhen = { q: 'q1_2', eq: true }; }, /earlier question/],
    ['condition without eq/in', (c) => { c.questions[3].showWhen = { q: 'q1_1' }; }, /exactly one of eq, in/],
    ['after on a non-date', (c) => { c.questions[0].rules = { after: 'q1_6' }; }, /needs a DATE or MY/],
    ['unknown group', (c) => { c.questions[0].group = 'nope'; }, /unknown group/],
    ['group with an unknown gate', (c) => { c.groups[0].gate = 'q99_99'; }, /unknown gate/],
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

test('release gate: with no tbc flag left nothing is blocked and every section is releasable', () => {
  assert.deepEqual(engine.getReleaseBlockers(config), []);
  for (const s of config.sections) assert.equal(engine.isSectionReleasable(config, s.id), true, s.id);
});

test('release gate: a section is blocked while it has a tbc flag and releasable once the flag is gone', () => {
  const c = clone(config);
  c.questions.find((q) => q.id === 'q8_1').tbc = 'Still unknown.';
  c.questions.find((q) => q.id === 'q7_4').tbc = 'Still unknown.';
  const blockers = engine.getReleaseBlockers(c);
  assert.deepEqual(blockers.map((b) => b.sectionId), ['7', '8']);
  assert.ok(blockers.every((b) => b.items.every((i) => i.tbc)));
  assert.equal(engine.isSectionReleasable(c, '8'), false);
  delete c.questions.find((q) => q.id === 'q8_1').tbc;
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
  const r = validate('1', { ...S1, q2_1: 'Testfirst', q99_99: 'x' });
  assert.equal(r.success, false);
  assert.deepEqual(r.unknownKeys.sort(), ['q2_1', 'q99_99']);
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
  const rest = ['5', '6A', '6B', '6C', '6D', '7', '8', '9A', '9B', '9C', '10A', '10B', '10C', '10D'];
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
    ['onOrBefore on an unknown question', (c) => { q(c, 'q6_7c').rules.onOrBefore = 'q99_99'; }, /unknown question/],
    ['onOrAfter on a later question', (c) => { q(c, 'q1_6').rules = { onOrAfter: 'q6_7c' }; }, /earlier question/],
    ['AMT max above the hard limit', (c) => { q(c, 'q6_3').rules.max = 5e9; }, /rules.max must be from 0/],
    ['AMT max negative', (c) => { q(c, 'q6_3').rules.max = -1; }, /rules.max must be from 0/],
    ['AMT min', (c) => { q(c, 'q6_3').rules.min = -5; }, /never negative/],
    ['max on a text question', (c) => { q(c, 'q5_3').rules = { max: 5 }; }, /only for NUM and AMT/],
    ['max that is not a number', (c) => { q(c, 'q6_3').rules.max = '5'; }, /must be a number/],
    ['noOverlap on a missing member', (c) => { g(c).noOverlap.end = 'q99_99'; }, /noOverlap.end must be a DATE member/],
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
const VISA = { q7_2a: '2023-06', q7_2b: 'visitor', q7_2c: 'MADE-UP-VISA-REF-1' };
const LEAVE = { q7_3b: '2022-03', q7_3c: 'work', q7_3d: 'granted', q7_3e: '2022-05', q7_3f: 'MADE-UP-LEAVE-REF-2' };
const BREACH = { q7_6b: 'overstayed', q7_6c: '2020-02', q7_6d: 'Made-up details of what happened.' };
const S7 = {
  q7_1: true, ukVisas: [VISA], q7_3: false, q7_4: true, q7_5: 2,
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

test('part 7 gate 7.1: the visa list only opens for Yes, needs one entry, allows ten and is pruned for No', () => {
  assert.equal(validate('7', { ...NO7, q7_1: true }).errors.ukVisas, 'Add at least one entry');
  const ten = validate('7', { ...NO7, q7_1: true, ukVisas: Array.from({ length: 10 }, () => VISA) });
  assert.equal(ten.success, true, JSON.stringify(ten.errors));
  assert.equal(validate('7', { ...NO7, q7_1: true, ukVisas: Array.from({ length: 11 }, () => VISA) }).errors.ukVisas, 'You can add up to 10 entries');
  const blank = validate('7', { ...NO7, q7_1: true, ukVisas: [{}] });
  assert.deepEqual(Object.keys(blank.errors).sort(), ['ukVisas.0.q7_2a', 'ukVisas.0.q7_2b'], 'the reference is optional');
  const r = validate('7', { ...NO7, ukVisas: [VISA] }, { ukVisas: [VISA] });
  assert.equal(r.success, true);
  assert.deepEqual(r.removed, ['ukVisas']);
  assert.equal(r.data.ukVisas, undefined);
  assert.deepEqual(engine.pruneAnswers(config, { q7_1: false, ukVisas: [VISA] }).removed, ['ukVisas']);
});

test('part 7 gate 7.3: the leave-to-remain list only opens for Yes, allows five and is pruned for No', () => {
  const yes = (list) => validate('7', { ...NO7, q7_3: true, ukLeaveApplications: list });
  assert.equal(validate('7', { ...NO7, q7_3: true }).errors.ukLeaveApplications, 'Add at least one entry');
  assert.equal(yes([LEAVE]).success, true);
  assert.equal(yes(Array.from({ length: 5 }, () => LEAVE)).success, true);
  assert.equal(yes(Array.from({ length: 6 }, () => LEAVE)).errors.ukLeaveApplications, 'You can add up to 5 entries');
  const blank = yes([{}]);
  assert.deepEqual(Object.keys(blank.errors).sort(), ['ukLeaveApplications.0.q7_3b', 'ukLeaveApplications.0.q7_3c', 'ukLeaveApplications.0.q7_3d'], 'decision date and reference are optional');
  const minimal = yes([{ q7_3b: '2022-03', q7_3c: 'study', q7_3d: 'waiting' }]);
  assert.equal(minimal.success, true, JSON.stringify(minimal.errors));
  const no = validate('7', { ...NO7, ukLeaveApplications: [LEAVE] }, { ukLeaveApplications: [LEAVE] });
  assert.deepEqual(no.removed, ['ukLeaveApplications']);
  assert.deepEqual(engine.pruneAnswers(config, { q7_3: false, ukLeaveApplications: [LEAVE] }).removed, ['ukLeaveApplications']);
});

test('part 7 gate 7.6: the breaches list only opens for Yes, allows five and is pruned for No', () => {
  const yes = (list) => validate('7', { ...NO7, q7_6: true, breaches: list });
  assert.equal(validate('7', { ...NO7, q7_6: true }).errors.breaches, 'Add at least one entry');
  assert.equal(yes([BREACH]).success, true);
  assert.equal(yes(Array.from({ length: 6 }, () => BREACH)).errors.breaches, 'You can add up to 5 entries');
  assert.deepEqual(Object.keys(yes([{}]).errors).sort(), ['breaches.0.q7_6b', 'breaches.0.q7_6c', 'breaches.0.q7_6d'], 'all three are required');
  assert.equal(yes([{ ...BREACH, q7_6b: 'made_up' }]).errors['breaches.0.q7_6b'], 'Choose from the listed options');
  const no = validate('7', { ...NO7, breaches: [BREACH] }, { breaches: [BREACH] });
  assert.deepEqual(no.removed, ['breaches']);
  assert.deepEqual(engine.pruneAnswers(config, { q7_6: false, breaches: [BREACH] }).removed, ['breaches']);
});

test('part 7: the single date (7.2) and the two placeholder boxes (7.3a, 7.6a) are gone, and their old values are left alone', () => {
  for (const id of ['q7_2', 'q7_3a', 'q7_6a']) assert.equal(config.questions.some((q) => q.id === id), false, id);
  // Old saved values are unknown keys: never validated, never pruned.
  const old = { q7_1: true, q7_2: '2023-06', q7_3: true, q7_3a: 'old text', q7_6: true, q7_6a: 'old text' };
  assert.deepEqual(engine.pruneAnswers(config, old).removed, []);
  const r = validate('7', { q7_1: true, q7_3: true, q7_4: false, q7_6: true, q7_7: false, ukVisas: [VISA], ukLeaveApplications: [LEAVE], breaches: [BREACH] }, old);
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.equal(r.removed.length, 0);
  assert.equal(Object.keys(r.data).some((k) => ['q7_2', 'q7_3a', 'q7_6a'].includes(k)), false, 'the old keys are not part of what is saved');
  // Sending an old key again is refused as an unknown key.
  assert.deepEqual(validate('7', { ...NO7, q7_2: '2023-06' }).unknownKeys, ['q7_2']);
  // A Yes with no list entries yet is not valid: the old text answered nothing the new questions ask.
  const stale = validate('7', { ...NO7, q7_1: true, q7_3: true, q7_6: true }, old);
  assert.deepEqual(Object.keys(stale.errors).sort(), ['breaches', 'ukLeaveApplications', 'ukVisas']);
});

test('part 7 gate 7.4: 7.5 and the visits only show for Yes and are pruned for No', () => {
  assert.equal(validate('7', { ...NO7, q7_4: true }).errors.q7_5, 'This question is required');
  const r = validate('7', { ...S7, q7_4: false }, S7);
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.deepEqual(r.removed.sort(), ['q7_5', 'ukVisits']);
  assert.equal(r.data.ukVisits, undefined);
  assert.deepEqual(engine.pruneAnswers(config, { q7_4: false, q7_5: 2, ukVisits: [VISIT, VISIT] }).removed.sort(), ['q7_5', 'ukVisits']);
});

test('count-driven group: 7.5 sets exactly how many visits are asked for, up to the 20 most recent', () => {
  const base = { ...NO7, q7_4: true };
  const visits = (n, count = n) => validate('7', { ...base, q7_5: count, ukVisits: Array.from({ length: n }, () => VISIT) });
  assert.equal(visits(1).success, true);
  assert.equal(visits(20).success, true, 'the limit itself is allowed');
  assert.equal(visits(1, 2).errors.ukVisits, 'Give details for exactly 2 visits');
  assert.equal(visits(3, 2).errors.ukVisits, 'Give details for exactly 2 visits');
  assert.equal(visits(2, 1).errors.ukVisits, 'Give details for exactly 1 visit');
  assert.equal(validate('7', { ...base, q7_5: 2 }).errors.ukVisits, 'Give details for exactly 2 visits', 'no entries sent at all');
});

test('count-driven group: a count above 20 (up to 99) asks for the 20 most recent visits and no more', () => {
  const base = { ...NO7, q7_4: true };
  const visits = (n, count) => validate('7', { ...base, q7_5: count, ukVisits: Array.from({ length: n }, () => VISIT) });
  assert.equal(visits(20, 21).success, true, 'a count of 21 lists 20');
  assert.equal(visits(20, 99).success, true, 'a count of 99 lists 20');
  assert.equal(visits(20, 99).data.q7_5, 99, 'the number the applicant gave is kept as it is');
  assert.equal(visits(20, 99).data.ukVisits.length, 20);
  assert.equal(visits(19, 99).errors.ukVisits, 'Give details for your 20 most recent visits');
  assert.equal(visits(21, 99).errors.ukVisits, 'Give details for your 20 most recent visits');
  assert.equal(validate('7', { ...base, q7_5: 50 }).errors.ukVisits, 'Give details for your 20 most recent visits', 'no entries sent at all');
  assert.equal(visits(20, 100).errors.q7_5, 'Number is too large', '99 is the highest count');
  assert.deepEqual(Object.keys(visits(20, 100).errors), ['q7_5']);
});

test('count-driven group: each entry is checked like any other; a bad count shows only its own error', () => {
  const blank = validate('7', { ...NO7, q7_4: true, q7_5: 2, ukVisits: [VISIT, {}] });
  assert.deepEqual(Object.keys(blank.errors).sort(), ['ukVisits.1.q7_5a', 'ukVisits.1.q7_5b', 'ukVisits.1.q7_5c']);
  const bad = (count) => validate('7', { ...NO7, q7_4: true, q7_5: count, ukVisits: [VISIT] });
  assert.deepEqual(Object.keys(bad(0).errors), ['q7_5']);
  assert.equal(bad(0).errors.q7_5, 'Number is too small');
  assert.deepEqual(Object.keys(bad(100).errors), ['q7_5']);
  assert.equal(bad(100).errors.q7_5, 'Number is too large');
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

test('look-back: 7.2a, 7.3b, 7.5b and 8.2d must be within the past 10 years; 7.6c and 7.7c have no look-back', () => {
  const visitOn = (month) => validate('7', { ...NO7, q7_4: true, q7_5: 1, ukVisits: [{ ...VISIT, q7_5b: month }] }).errors['ukVisits.0.q7_5b'];
  assert.equal(visitOn('2016-10'), undefined, 'the whole month ten years ago counts');
  assert.equal(visitOn('2016-09'), 'Must be within the past 10 years');
  assert.equal(visitOn('2026-10'), undefined, 'this month is fine');
  assert.equal(visitOn('2026-11'), 'Cannot be in the future');
  const visaOn = (month) => validate('7', { ...NO7, q7_1: true, ukVisas: [{ ...VISA, q7_2a: month }] }).errors['ukVisas.0.q7_2a'];
  assert.equal(visaOn('2016-09'), 'Must be within the past 10 years');
  assert.equal(visaOn('2016-10'), undefined);
  assert.equal(visaOn('2026-11'), 'Cannot be in the future');
  const leaveOn = (month) => validate('7', { ...NO7, q7_3: true, ukLeaveApplications: [{ ...LEAVE, q7_3b: month, q7_3e: undefined }] }).errors['ukLeaveApplications.0.q7_3b'];
  assert.equal(leaveOn('2016-09'), 'Must be within the past 10 years');
  assert.equal(leaveOn('2016-10'), undefined);
  const breachOn = (month) => validate('7', { ...NO7, q7_6: true, breaches: [{ ...BREACH, q7_6c: month }] }).errors['breaches.0.q7_6c'];
  assert.equal(breachOn('1995-01'), undefined, '7.6 says "ever", so there is no 10-year limit');
  assert.equal(breachOn('2026-11'), 'Cannot be in the future');
  const problemOn = (month) => validate('7', { ...NO7, q7_7: true, immigrationProblems: [{ ...PROBLEM, q7_7c: month }] }).errors['immigrationProblems.0.q7_7c'];
  assert.equal(problemOn('1995-01'), undefined, '7.7 says "ever", so there is no 10-year limit');
  assert.equal(problemOn('2026-11'), 'Cannot be in the future');
});

test('7.3e: the decision date may not be before the application date and is optional', () => {
  const decided = (patch) => validate('7', { ...NO7, q7_3: true, ukLeaveApplications: [{ ...LEAVE, ...patch }] }).errors['ukLeaveApplications.0.q7_3e'];
  assert.equal(decided({}), undefined);
  assert.equal(decided({ q7_3e: '2022-03' }), undefined, 'the same month is fine');
  assert.equal(decided({ q7_3e: '2022-02' }), 'Must be on or after the date in question 7.3b');
  assert.equal(decided({ q7_3e: '2026-11' }), 'Cannot be in the future');
  assert.equal(decided({ q7_3e: undefined }), undefined);
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

test('part 8: 8.1a (which places) only shows when 8.1 is above zero, is optional and is pruned when 8.1 goes back to 0', () => {
  const places = ['australia', 'canada', 'new_zealand', 'usa', 'switzerland', 'eea'];
  assert.deepEqual(config.questions.find((q) => q.id === 'q8_1a').options.map((o) => o.value), places);
  assert.equal(engine.isVisible(config, 'q8_1a', {}), false, 'not before 8.1 is answered');
  assert.equal(engine.isVisible(config, 'q8_1a', { q8_1: 0 }), false);
  assert.equal(engine.isVisible(config, 'q8_1a', { q8_1: 1 }), true);
  assert.equal(engine.isVisible(config, 'q8_1a', { q8_1: 1000 }), true);
  assert.equal(engine.isVisible(config, 'q8_1a', { q8_1: '3' }), false, 'a text value is not a number');
  assert.equal(validate('8', { q8_1: 3, q8_2: false }).success, true, 'optional');
  const ok = validate('8', { q8_1: 3, q8_1a: ['usa', 'eea'], q8_2: false });
  assert.equal(ok.success, true, JSON.stringify(ok.errors));
  assert.deepEqual(ok.data.q8_1a, ['usa', 'eea']);
  assert.ok(validate('8', { q8_1: 3, q8_1a: ['mars'], q8_2: false }).errors.q8_1a);
  const back = validate('8', { q8_1: 0, q8_1a: ['usa'], q8_2: false }, { q8_1: 3, q8_1a: ['usa'] });
  assert.deepEqual(back.removed, ['q8_1a']);
  assert.equal(back.data.q8_1a, undefined);
  assert.deepEqual(engine.pruneAnswers(config, { q8_1: 0, q8_1a: ['usa'] }).removed, ['q8_1a']);
  // Keep until answered: an 8.1 never given does not remove an earlier 8.1a.
  assert.deepEqual(engine.pruneAnswers(config, { q8_1a: ['usa'] }).removed, []);
});

test('part 8: 8.1 carries the EEA help list of 30 countries (27 EU states, Iceland, Liechtenstein, Norway)', () => {
  const help = config.questions.find((q) => q.id === 'q8_1').helpCountries;
  assert.ok(help.summary.length > 10);
  assert.equal(help.countries.length, 30);
  assert.equal(new Set(help.countries).size, 30);
  const known = new Set(engine.getCountries().map((c) => c.code));
  for (const code of help.countries) assert.ok(known.has(code), code);
  for (const code of ['IS', 'LI', 'NO']) assert.ok(help.countries.includes(code), code);
  for (const code of ['GB', 'CH', 'US']) assert.ok(!help.countries.includes(code), `${code} is not in the EEA`);
});

test('config: sensitive fields of Part 7 sit inside groups and are optional or required as chosen', () => {
  const q = (id) => config.questions.find((x) => x.id === id);
  for (const id of ['q7_2c', 'q7_3f', 'q7_6d']) assert.equal(q(id).sensitive, true, id);
  assert.equal(q('q7_2c').required, false);
  assert.equal(q('q7_3f').required, false);
  assert.equal(q('q7_6d').required, true);
  for (const id of ['q7_2c', 'q7_3f', 'q7_6d']) assert.ok(q(id).group, `${id} lives in a group`);
  // Nothing already stored in earlier steps was made sensitive in this one.
  assert.deepEqual(config.questions.filter((x) => x.sensitive && !['7', '9A', '9B', '9C', '10A', '10C'].includes(x.section)).map((x) => x.number), ['2.19', '2.30a', '2.31b', '3.1']);
  // None of the follow-ups asks about identity or passport numbers.
  assert.ok(!config.questions.some((x) => x.section === '7' && /passport|identity|national id/i.test(x.label)));
});

test('config: validateConfig checks count-driven groups, items and the look-back rule', () => {
  const q = (c, id) => c.questions.find((x) => x.id === id);
  const g = (c) => c.groups.find((x) => x.id === 'ukVisits');
  const cases = [
    ['unknown count question', (c) => { g(c).count = 'q99_99'; }, /unknown count question/],
    ['count question not a number', (c) => { g(c).count = 'q7_4'; }, /must be a NUM question/],
    ['count question in another section', (c) => { q(c, 'q7_5').section = '8'; }, /same section/],
    ['count question without a minimum', (c) => { delete q(c, 'q7_5').rules.min; }, /rules.min of at least 1/],
    ['count question allowing zero', (c) => { q(c, 'q7_5').rules.min = 0; }, /rules.min of at least 1/],
    ['count question without a maximum', (c) => { delete q(c, 'q7_5').rules.max; }, /rules.max/],
    ['count maximum below the minimum', (c) => { q(c, 'q7_5').rules.max = 0; }, /rules.max/],
    ['count group without a gate', (c) => { delete g(c).gate; }, /needs a Yes\/No gate/],
    ['count group with a minimum', (c) => { g(c).min = 2; }, /min is not used with count/],
    ['empty items', (c) => { q(c, 'q7_6').items = []; }, /items must be a non-empty list/],
    ['blank item', (c) => { q(c, 'q7_6').items = ['ok', ' ']; }, /items must be a non-empty list/],
    ['withinYears on a text question', (c) => { q(c, 'q8_1').rules.withinYears = 10; }, /needs a DATE or MY/],
    ['withinYears of zero', (c) => { q(c, 'q7_2a').rules.withinYears = 0; }, /whole number from 1 to 100/],
    ['withinYears that is not whole', (c) => { q(c, 'q7_2a').rules.withinYears = 2.5; }, /whole number from 1 to 100/],
    ['gt that is not a number', (c) => { q(c, 'q8_1a').showWhen.gt = 'zero'; }, /"gt" must be a number/],
    ['gt on a question that is not a number', (c) => { q(c, 'q8_1a').showWhen = { q: 'q7_4', gt: 0 }; }, /"gt" needs a NUM question/],
    ['gt together with eq', (c) => { q(c, 'q8_1a').showWhen.eq = 1; }, /exactly one of eq, in, gt/],
    ['helpCountries without a summary', (c) => { q(c, 'q8_1').helpCountries.summary = ' '; }, /helpCountries needs a summary/],
    ['helpCountries with no countries', (c) => { q(c, 'q8_1').helpCountries.countries = []; }, /helpCountries needs a list of country codes/],
    ['helpCountries with an unknown code', (c) => { q(c, 'q8_1').helpCountries.countries.push('ZZ'); }, /unknown country code ZZ/],
    ['helpCountries listing a country twice', (c) => { q(c, 'q8_1').helpCountries.countries.push('FR'); }, /lists a country twice/],
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

test('drafts can still sit on any question or group; getDraftItems lists groups too, with no number', () => {
  const items = engine.getDraftItems(withDrafts());
  assert.ok(items.find((s) => s.sectionId === '4C').items.some((i) => i.id === 'parents' && i.number === null), 'the group is listed with no number');
  for (const s of items) for (const i of s.items) assert.ok(i.draft && i.draft.length > 20, i.id);
});

test('getHeldSections: nothing is held today; a section is held again by a tbc flag, a draft or draft wording', () => {
  assert.deepEqual(engine.getHeldSections(config), []);
  const held = engine.getHeldSections(withDrafts());
  assert.deepEqual(held.map((h) => h.sectionId), ['2D', '4C', 'declarations']);
  assert.deepEqual(held.find((h) => h.sectionId === '2D'), { sectionId: '2D', tbc: 0, draft: 2 });
  assert.deepEqual(held.find((h) => h.sectionId === '4C'), { sectionId: '4C', tbc: 0, draft: 1 });
  assert.deepEqual(held.find((h) => h.sectionId === 'declarations'), { sectionId: 'declarations', tbc: 0, draft: 2 }, 'the submit declaration and the text after submitting');

  const c = clone(config);
  // A single draft on a group is enough to hold its section.
  c.groups.find((g) => g.id === 'parents').draft = 'Draft: test';
  assert.deepEqual(engine.getHeldSections(c), [{ sectionId: '4C', tbc: 0, draft: 1 }]);
  // So is a single tbc.
  c.groups.find((g) => g.id === 'parents').draft = undefined;
  c.questions.find((q) => q.id === 'q3_1').tbc = 'x';
  assert.deepEqual(engine.getHeldSections(c).map((h) => h.sectionId), ['3']);
  assert.deepEqual(engine.getHeldSections(c)[0], { sectionId: '3', tbc: 1, draft: 0 });
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

test('Parts 5 and 6 carry no tbc and nothing is held', () => {
  assert.deepEqual(config.questions.filter((q) => PART56.includes(q.section) && q.tbc), []);
  assert.deepEqual(config.groups.filter((g) => PART56.includes(g.section) && g.tbc), []);
  assert.deepEqual(engine.getDraftItems(config).filter((s) => PART56.includes(s.sectionId)), []);
  assert.deepEqual(engine.getHeldSections(config).filter((h) => PART56.includes(h.sectionId)), []);
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

// ---------------------------------------------------------------------------
// Step 8b-1: engine additions (includes, exclusive option, pattern rule)
// ---------------------------------------------------------------------------

const NI_PATTERN = { regex: '^[A-Za-z]{2}\\s?\\d{2}\\s?\\d{2}\\s?\\d{2}\\s?[A-Za-z]$', message: 'Enter a National Insurance number such as AB 12 34 56 C' };
const chkCfg = () => mk([
  { id: 'q1_1', number: '1.1', type: 'CHK', options: [{ value: 'a', label: 'Apples' }, { value: 'b', label: 'Bananas' }, { value: 'none', label: 'None of these', exclusive: true }] },
  { id: 'q1_1a', number: '1.1a', type: 'TXT', showWhen: { q: 'q1_1', includes: 'a' } },
  { id: 'q1_2', number: '1.2', type: 'TXT', rules: { pattern: NI_PATTERN } },
]);

test('includes condition: shown only while the ticked list contains the value', () => {
  const cfg = chkCfg();
  assert.deepEqual(engine.validateConfig(cfg), []);
  const shown = (answers) => engine.isVisible(cfg, 'q1_1a', answers);
  assert.equal(shown({ q1_1: ['a'] }), true);
  assert.equal(shown({ q1_1: ['b', 'a'] }), true);
  assert.equal(shown({ q1_1: ['b'] }), false);
  assert.equal(shown({ q1_1: ['none'] }), false);
  assert.equal(shown({}), false, 'not answered');
  assert.equal(shown({ q1_1: 'a' }), false, 'a text value is not a list');
  assert.equal(shown({ q1_1: [] }), false);
});

test('includes condition: unticking removes the details, and an unanswered checklist keeps what is stored', () => {
  const cfg = chkCfg();
  assert.deepEqual(engine.pruneAnswers(cfg, { q1_1: ['b'], q1_1a: 'details' }).removed, ['q1_1a']);
  assert.deepEqual(engine.pruneAnswers(cfg, { q1_1: ['a'], q1_1a: 'details' }).removed, []);
  assert.deepEqual(engine.pruneAnswers(cfg, { q1_1a: 'details' }).removed, [], 'waits until the checklist is answered');
  const r = vs(cfg, { q1_1: ['b'], q1_2: 'AB123456C', q1_1a: 'stale' }, { q1_1: ['a'], q1_1a: 'stale' });
  assert.equal(r.unknownKeys.length, 0);
  assert.equal(r.success, true, JSON.stringify(r.errors));
});

test('includes condition: validateConfig checks it', () => {
  const cases = [
    ['on a question that is not a checklist', (c) => { c.questions[1].showWhen = { q: 'q1_2', includes: 'a' }; }, /"includes" needs a CHK question/],
    ['with a value that is not an option', (c) => { c.questions[1].showWhen = { q: 'q1_1', includes: 'zzz' }; }, /is not an option of q1_1/],
    ['together with eq', (c) => { c.questions[1].showWhen = { q: 'q1_1', includes: 'a', eq: 'a' }; }, /exactly one of eq, in, gt, includes/],
    ['with a value that is not text', (c) => { c.questions[1].showWhen = { q: 'q1_1', includes: 5 }; }, /"includes" must be an option value/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const c = clone(chkCfg());
    mutate(c);
    const problems = engine.validateConfig(c);
    assert.ok(problems.some((p) => pattern.test(p)), `${name}: got ${JSON.stringify(problems)}`);
  }
});

test('exclusive option: it cannot be ticked together with another choice, and alone it is fine', () => {
  const cfg = chkCfg();
  const check = (value) => vs(cfg, { q1_1: value, q1_2: 'AB123456C' }).errors.q1_1;
  assert.equal(check(['none']), undefined);
  assert.equal(check(['a']), undefined);
  assert.equal(check(['a', 'b']), undefined);
  assert.equal(check(['a', 'none']), '"None of these" cannot be chosen together with other options');
  assert.equal(check(['none', 'a', 'b']), '"None of these" cannot be chosen together with other options');
  assert.equal(check([]), 'This question is required');
  assert.equal(check(['made_up']), 'Choose from the listed options');
});

test('exclusive option: validateConfig checks it', () => {
  const cases = [
    ['two exclusive options', (c) => { c.questions[0].options[0].exclusive = true; }, /at most one option can be exclusive/],
    ['exclusive that is not true or false', (c) => { c.questions[0].options[2].exclusive = 'yes'; }, /exclusive must be true or false/],
    ['exclusive on a dropdown', (c) => { c.questions[0].type = 'SEL'; c.questions[1].showWhen = undefined; }, /an exclusive option is only for CHK/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const c = clone(chkCfg());
    mutate(c);
    const problems = engine.validateConfig(c);
    assert.ok(problems.some((p) => pattern.test(p)), `${name}: got ${JSON.stringify(problems)}`);
  }
});

test('pattern rule: the whole answer must match, with the configured message', () => {
  const cfg = chkCfg();
  const check = (value) => vs(cfg, { q1_1: ['b'], q1_2: value }).errors.q1_2;
  for (const ok of ['AB123456C', 'ab123456c', 'AB 12 34 56 C', ' AB123456C ']) assert.equal(check(ok), undefined, ok);
  for (const bad of ['AB12', 'AB1234567C', '12345678A', 'AB123456C and more', 'A B123456C']) assert.equal(check(bad), 'Enter a National Insurance number such as AB 12 34 56 C', bad);
  assert.equal(check(''), 'This question is required');
  assert.equal(check(undefined), 'This question is required');
});

test('pattern rule: validateConfig checks it', () => {
  const cases = [
    ['on a long text question', (c) => { c.questions[2].type = 'LNG'; }, /rules.pattern is only for TXT/],
    ['without a message', (c) => { c.questions[2].rules.pattern.message = ' '; }, /rules.pattern needs a regex and a message/],
    ['without a regex', (c) => { delete c.questions[2].rules.pattern.regex; }, /rules.pattern needs a regex and a message/],
    ['not anchored at the start', (c) => { c.questions[2].rules.pattern.regex = '[A-Z]{2}$'; }, /must match the whole answer/],
    ['not anchored at the end', (c) => { c.questions[2].rules.pattern.regex = '^[A-Z]{2}'; }, /must match the whole answer/],
    ['not a valid expression', (c) => { c.questions[2].rules.pattern.regex = '^([A-Z$'; }, /not a valid expression/],
    ['too long', (c) => { c.questions[2].rules.pattern.regex = '^' + 'a'.repeat(250) + '$'; }, /regex is too long/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const c = clone(chkCfg());
    mutate(c);
    const problems = engine.validateConfig(c);
    assert.ok(problems.some((p) => pattern.test(p)), `${name}: got ${JSON.stringify(problems)}`);
  }
});

// ---------------------------------------------------------------------------
// Step 8b-1: Part 9 (sections 9A, 9B, 9C)
// ---------------------------------------------------------------------------

const S9A = { q9_11: true, q9_1: false, q9_12: true, q9_2: false };
const S9B = { q9_13: true, q9_3: false, q9_4: false, q9_5: false, q9_14: true, q9_6: false, q9_7: false };
const S9C = { q9_8: false, q9_9: false, q9_10: false };
const DETAILS9 = 'Made-up details of what happened.';

test('part 9: each section validates with every answer No and every tick given', () => {
  for (const [section, answers] of [['9A', S9A], ['9B', S9B], ['9C', S9C]]) {
    const r = validate(section, answers);
    assert.equal(r.success, true, `${section}: ${JSON.stringify(r.errors)}`);
    assert.deepEqual(r.data, answers);
  }
});

test('part 9: every Yes/No question and every tick is required, in section order', () => {
  assert.deepEqual(Object.keys(validate('9A', {}).errors).sort(), ['q9_1', 'q9_11', 'q9_12', 'q9_2']);
  assert.deepEqual(Object.keys(validate('9B', {}).errors).sort(), ['q9_13', 'q9_14', 'q9_3', 'q9_4', 'q9_5', 'q9_6', 'q9_7']);
  assert.deepEqual(Object.keys(validate('9C', {}).errors).sort(), ['q9_10', 'q9_8', 'q9_9']);
  assert.deepEqual(engine.getVisibleQuestions(config, '9A', {}).map((q) => q.number), ['9.11', '9.1', '9.12', '9.2']);
  assert.deepEqual(engine.getVisibleQuestions(config, '9B', {}).map((q) => q.number), ['9.13', '9.3', '9.4', '9.5', '9.14', '9.6', '9.7']);
  assert.deepEqual(engine.getVisibleQuestions(config, '9C', {}).map((q) => q.number), ['9.8', '9.9', '9.10']);
});

test('part 9: a declaration tick must be ticked; an untouched or false tick stops the section', () => {
  for (const [section, base, id] of [['9A', S9A, 'q9_11'], ['9A', S9A, 'q9_12'], ['9B', S9B, 'q9_13'], ['9B', S9B, 'q9_14']]) {
    assert.equal(validate(section, { ...base, [id]: false }).errors[id], 'You must tick this box to continue', `${id} false`);
    assert.equal(validate(section, { ...base, [id]: undefined }).errors[id], 'This question is required', `${id} untouched`);
  }
});

test('part 9: the ticks carry their guidance and are our own wording', () => {
  for (const id of ['q9_11', 'q9_12', 'q9_13', 'q9_14']) {
    const q = config.questions.find((x) => x.id === id);
    assert.equal(q.type, 'ACK', id);
    assert.equal(q.required, true, id);
    assert.ok(q.help && q.help.length > 150, `${id} has guidance`);
    assert.equal(q.draft, undefined, `${id} is final`);
    assert.equal(q.sensitive, undefined, `${id}: the tick itself is not encrypted`);
  }
  // None of the wording is copied from the official guidance: it must not contain its stock phrases.
  const all = config.questions.filter((q) => q.section.startsWith('9')).map((q) => `${q.label} ${q.help || ''}`).join(' ');
  assert.ok(!/gov\.uk/i.test(all));
});

test('wording hashes: every Part 9 tick and the final declaration have exactly the hash they had before the draft markers were removed, so every tick and declaration already given stays valid', () => {
  const crypto = require('node:crypto');
  const BEFORE = {
    q9_11: '1480306fdcedaaac124e2b576871a60958192bdc15dc6c685e9dddfb6e78ec0f',
    q9_12: '5fc20121296e6cf35366239b3d946c5126c64dd84b363fde301b0ee9b5e3883a',
    q9_13: '93de899ec95363f7d20408c1990e2d07400e4693c08f0e49d24fcd2338951bc3',
    q9_14: '9195a0cbe850dbd753a163e23050ac9e16e9e35ca5632f22c3cc384f72720fbf',
    'declarations.submit': 'ba987cf2b54255d648605386afb9a756f9f8a62dbbe0bbf4a68d045c30dc0e8a',
  };
  // The same way the server hashes the wording of a tick (touristVisaApplicationService.wordingHash).
  const hashOf = (id) => crypto.createHash('sha256').update(engine.wordingOf(config, id), 'utf8').digest('hex');
  for (const [id, hash] of Object.entries(BEFORE)) assert.equal(hashOf(id), hash, `${id}: the wording hash changed`);
  // Every declaration tick in the config is pinned: a new or changed one must be added here on purpose.
  assert.deepEqual(config.questions.filter((q) => q.type === 'ACK').map((q) => q.id), ['q9_11', 'q9_12', 'q9_13', 'q9_14']);
  // The marker is not part of the wording: putting a draft note back (or removing it) never changes a hash.
  const c = withDrafts();
  c.questions.find((q) => q.id === 'q9_11').draft = 'Draft: a note that must not change the hash.';
  assert.equal(crypto.createHash('sha256').update(engine.wordingOf(c, 'q9_11'), 'utf8').digest('hex'), BEFORE.q9_11);
  assert.equal(crypto.createHash('sha256').update(engine.wordingOf(c, 'declarations.submit'), 'utf8').digest('hex'), BEFORE['declarations.submit']);
});

// One test per new gate: Yes needs details, details are kept with a Yes and removed with a No, on the server rules.
const GATES9 = [
  ['q9_1', '9A', S9A], ['q9_2', '9A', S9A],
  ['q9_3', '9B', S9B], ['q9_4', '9B', S9B], ['q9_5', '9B', S9B], ['q9_6', '9B', S9B], ['q9_7', '9B', S9B],
  ['q9_8', '9C', S9C], ['q9_9', '9C', S9C], ['q9_10', '9C', S9C],
];
for (const [gate, section, base] of GATES9) {
  const follow = `${gate}a`;
  test(`part 9 gate ${gate.slice(1).replace('_', '.')}: Yes asks for the details, No removes them`, () => {
    assert.equal(validate(section, { ...base, [gate]: true }).errors[follow], 'This question is required');
    assert.equal(validate(section, { ...base, [gate]: true, [follow]: '  ' }).errors[follow], 'This question is required');
    const yes = validate(section, { ...base, [gate]: true, [follow]: DETAILS9 });
    assert.equal(yes.success, true, JSON.stringify(yes.errors));
    assert.equal(yes.data[follow], DETAILS9);
    assert.equal(validate(section, { ...base, [gate]: true, [follow]: 'x'.repeat(2001) }).errors[follow], 'Must be 2000 characters or fewer');
    assert.equal(validate(section, { ...base, [gate]: true, [follow]: 'x'.repeat(2000) }).success, true, '2,000 characters is the limit itself');

    const no = validate(section, { ...base, [follow]: 'stale details' }, { ...base, [gate]: true, [follow]: 'stale details' });
    assert.equal(no.success, true, JSON.stringify(no.errors));
    assert.deepEqual(no.removed, [follow]);
    assert.equal(no.data[follow], undefined);
    assert.deepEqual(engine.pruneAnswers(config, { [gate]: false, [follow]: 'x' }).removed, [follow]);
    assert.deepEqual(engine.pruneAnswers(config, { [gate]: true, [follow]: 'x' }).removed, []);
    // An answer never given does not remove stored details (they wait for the gate).
    assert.deepEqual(engine.pruneAnswers(config, { [follow]: 'x' }).removed, []);
  });
}

test('part 9: a Yes opens only its own details box', () => {
  const shown = (answers) => engine.getVisibleQuestions(config, '9B', answers).map((q) => q.number);
  assert.deepEqual(shown({ ...S9B, q9_4: true }), ['9.13', '9.3', '9.4', '9.4a', '9.5', '9.14', '9.6', '9.7']);
  assert.deepEqual(shown({ ...S9B, q9_3: true, q9_7: true }), ['9.13', '9.3', '9.3a', '9.4', '9.5', '9.14', '9.6', '9.7', '9.7a']);
});

test('part 9: all new answers are sensitive and required; the details are long text of at most 2,000 characters', () => {
  for (const q of config.questions.filter((x) => x.section.startsWith('9') && x.type !== 'ACK')) {
    assert.equal(q.sensitive, true, `${q.number} is encrypted`);
    assert.equal(q.required, true, q.number);
    if (q.type === 'LNG') assert.equal(q.rules.maxLen, 2000, q.number);
  }
  assert.equal(config.questions.filter((x) => x.section.startsWith('9')).length, 24);
});

test('part 9: sections 9A to 9C always apply and do not change the other sections', () => {
  for (const id of ['9A', '9B', '9C']) assert.equal(engine.isSectionVisible(config, id, {}), true, id);
  assert.equal(validate('8', S8).success, true, 'Part 8 is unchanged');
});

test('part 9: an application saved before Part 9 existed has no 9.x answers and nothing to prune', () => {
  assert.deepEqual(engine.pruneAnswers(config, { ...S7, ...S8 }).removed, []);
});

// ---------------------------------------------------------------------------
// Step 8b-1: wording of declarations
// ---------------------------------------------------------------------------

test('wordingOf: the tick text and its guidance, whitespace-normalised; it changes when either changes', () => {
  const q = config.questions.find((x) => x.id === 'q9_11');
  assert.equal(engine.wordingOf(config, 'q9_11'), `${q.label}\n${q.help}`);
  assert.equal(engine.wordingOf(config, 'q99_99'), '');
  const c = clone(config);
  const before = engine.wordingOf(c, 'q9_11');
  c.questions.find((x) => x.id === 'q9_11').help += ' More.';
  assert.notEqual(engine.wordingOf(c, 'q9_11'), before);
  const d = clone(config);
  d.questions.find((x) => x.id === 'q9_11').label = '  I   have   read   it  ';
  assert.equal(engine.wordingOf(d, 'q9_11').split('\n')[0], 'I have read it');
});

test('declarations: the submit wording is kept in the config and is approved; a draft put back holds the form back again', () => {
  assert.ok(config.declarations.submit.text.length > 100);
  assert.deepEqual(engine.getWordingDrafts(config), []);
  assert.equal(engine.getHeldSections(config).some((h) => h.sectionId === 'declarations'), false);
  const c = clone(config);
  c.declarations.submit.draft = 'Draft: wording awaiting approval.';
  assert.deepEqual(engine.getWordingDrafts(c).map((w) => w.id), ['declarations.submit']);
  assert.equal(engine.getHeldSections(c).some((h) => h.sectionId === 'declarations'), true);
  c.afterSubmit.draft = 'Draft: wording awaiting approval.';
  assert.deepEqual(engine.getWordingDrafts(c).map((w) => w.id), ['declarations.submit', 'afterSubmit']);
  delete c.declarations.submit.draft;
  assert.deepEqual(engine.getWordingDrafts(c).map((w) => w.id), ['afterSubmit'], 'the text after submitting holds it back on its own');
  assert.equal(engine.getHeldSections(c).some((h) => h.sectionId === 'declarations'), true);
  delete c.afterSubmit.draft;
  assert.deepEqual(engine.getWordingDrafts(c), []);
});

test('declarations: validateConfig checks the wording block and that every tick is required', () => {
  const cases = [
    ['declarations that is not an object', (c) => { c.declarations = []; }, /declarations must be an object/],
    ['declaration without text', (c) => { c.declarations.submit.text = ' '; }, /declarations.submit: text is required/],
    ['empty draft note', (c) => { c.declarations.submit.draft = ''; }, /declarations.submit: draft must be a non-empty string/],
    ['optional tick', (c) => { c.questions.find((q) => q.id === 'q9_11').required = false; }, /an ACK question must be required/],
    ['no final declaration', (c) => { delete c.declarations.submit; }, /declarations.submit is required/],
    ['after-submit text that is not an object', (c) => { c.afterSubmit = 'text'; }, /afterSubmit must be an object/],
    ['after-submit text with no steps', (c) => { c.afterSubmit.steps = []; }, /afterSubmit.steps must be a list of non-empty texts/],
    ['after-submit text with a blank step', (c) => { c.afterSubmit.steps = ['One', ' ']; }, /afterSubmit.steps must be a list of non-empty texts/],
    ['after-submit text with an empty draft note', (c) => { c.afterSubmit.draft = ''; }, /afterSubmit.draft must be a non-empty string/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const c = clone(config);
    mutate(c);
    const problems = engine.validateConfig(c);
    assert.ok(problems.some((p) => pattern.test(p)), `${name}: got ${JSON.stringify(problems)}`);
  }
});

// ---------------------------------------------------------------------------
// Step 8b-1: the release check script
// ---------------------------------------------------------------------------

test('release check: the approved config exits 0 and says everything is releasable', () => {
  const { spawnSync } = require('node:child_process');
  const script = path.join(__dirname, '..', '..', 'scripts', 'check-tourist-visa-release.js');
  const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, new RegExp(`Tourist Visa config ${config.version.replace(/\./g, '\\.')}`));
  assert.match(run.stdout, /Tourist Visa config 1\.0\.0/);
  for (const id of ['1', '2A', '3', '9A', '9B', '9C', '10A', '10B', '10C', '10D']) assert.match(run.stdout, new RegExp(`section ${id}: .*: releasable`), id);
  assert.doesNotMatch(run.stdout, /NEEDS SENIOR REVIEW|BLOCKED/);
  assert.match(run.stdout, /23 sections: 0 blocked, 0 need senior review only, 23 clean\./);
  assert.match(run.stdout, /Submit: final declaration approved wording; text shown after submitting approved wording\./);
  assert.match(run.stdout, /All sections are releasable\./);
  assert.equal(run.stderr, '', 'nothing is reported as open');
});

test('release check: one draft marker put back makes it exit 2 and name the item; one tbc makes it exit 1', () => {
  const { spawnSync } = require('node:child_process');
  const os = require('node:os');
  const fs = require('node:fs');
  const script = path.join(__dirname, '..', '..', 'scripts', 'check-tourist-visa-release.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-release-one-'));
  try {
    const runWith = (mutate) => {
      const c = clone(config);
      mutate(c);
      const file = path.join(dir, 'questions.json');
      fs.writeFileSync(file, JSON.stringify(c));
      return spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
    };
    const draft = runWith((c) => { c.questions.find((q) => q.id === 'q3_1').draft = 'Draft: one default we chose.'; });
    assert.equal(draft.status, 2, 'one draft on one question');
    assert.match(draft.stdout, /section 3: .*NEEDS SENIOR REVIEW \(1 draft\)/);
    assert.match(draft.stdout, /23 sections: 0 blocked, 1 need senior review only, 22 clean\./);
    assert.match(draft.stderr, /3\.1: Draft: one default we chose\./);
    assert.equal(runWith((c) => { c.groups.find((g) => g.id === 'parents').draft = 'Draft: x.'; }).status, 2, 'one draft on a group');
    assert.equal(runWith((c) => { c.declarations.submit.draft = 'Draft: x.'; }).status, 2, 'draft declaration wording');
    assert.equal(runWith((c) => { c.afterSubmit.draft = 'Draft: x.'; }).status, 2, 'draft text after submitting');
    const tbc = runWith((c) => { c.questions.find((q) => q.id === 'q3_1').tbc = 'A real unknown.'; });
    assert.equal(tbc.status, 1, 'one tbc');
    assert.match(tbc.stdout, /section 3: .*BLOCKED \(1 open tbc item\)/);
    assert.match(tbc.stderr, /3\.1: A real unknown\./);
    assert.equal(runWith((c) => { c.groups.find((g) => g.id === 'parents').tbc = 'x'; }).status, 1, 'a tbc on a group');
    assert.equal(runWith(() => {}).status, 0, 'and the unchanged config is clear');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('release check: on a config file it exits 1 for a tbc, 2 for a draft or for wording alone, and 0 only when everything is clear', () => {
  const { spawnSync } = require('node:child_process');
  const os = require('node:os');
  const fs = require('node:fs');
  const script = path.join(__dirname, '..', '..', 'scripts', 'check-tourist-visa-release.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-release-'));
  try {
    const exitFor = (mutate) => {
      const c = clone(config);
      mutate(c);
      const file = path.join(dir, 'questions.json');
      fs.writeFileSync(file, JSON.stringify(c));
      return spawnSync(process.execPath, [script, file], { encoding: 'utf8' }).status;
    };
    assert.equal(exitFor(() => {}), 0, 'nothing open');
    assert.equal(exitFor((c) => { c.declarations.submit.draft = 'Draft: wording'; }), 2, 'the declaration wording alone');
    assert.equal(exitFor((c) => { c.afterSubmit.draft = 'Draft: wording'; }), 2, 'the text after submitting alone');
    assert.equal(exitFor((c) => { c.questions.find((q) => q.id === 'q9_1').draft = 'Draft: x'; }), 2, 'a question draft');
    assert.equal(exitFor((c) => { c.questions.find((q) => q.id === 'q9_1').tbc = 'x'; c.declarations.submit.draft = 'Draft: wording'; }), 1, 'a tbc beats everything');
    assert.equal(exitFor((c) => { c.questions[0].type = 'XYZ'; }), 1, 'an invalid config');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Step 8b-2: the normalize rule, and Part 10A to 10C
// ---------------------------------------------------------------------------

const normCfg = () => mk([
  { id: 'q1_1', number: '1.1', type: 'TXT', rules: { normalize: 'uppercase_no_spaces', maxLen: 12 } },
  { id: 'q1_2', number: '1.2', type: 'TXT', rules: { normalize: 'uppercase_no_spaces', pattern: { regex: '^[A-Z]{2}[0-9]{2}$', message: 'Enter two letters then two numbers' } } },
  { id: 'q1_3', number: '1.3', type: 'TXT', rules: { pattern: { regex: '^[A-Z]{2}$', message: 'Enter two capital letters' } } },
]);

test('normalize rule: the answer is stored without spaces and in capitals', () => {
  const cfg = normCfg();
  assert.deepEqual(engine.validateConfig(cfg), []);
  const r = vs(cfg, { q1_1: '  ab 12\t cd  ', q1_2: 'ab 1 2', q1_3: 'AB' });
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.deepEqual(r.data, { q1_1: 'AB12CD', q1_2: 'AB12', q1_3: 'AB' });
});

test('normalize rule: the pattern is checked on the tidied answer; without the rule the answer is left as typed', () => {
  const cfg = normCfg();
  assert.equal(vs(cfg, { q1_1: 'x', q1_2: 'a b 1 2', q1_3: 'AB' }).success, true);
  assert.equal(vs(cfg, { q1_1: 'x', q1_2: 'abc12', q1_3: 'AB' }).errors.q1_2, 'Enter two letters then two numbers');
  assert.equal(vs(cfg, { q1_1: 'x', q1_2: 'AB12', q1_3: 'ab' }).errors.q1_3, 'Enter two capital letters', 'no normalize: small letters stay as typed');
  assert.equal(vs(cfg, { q1_1: 'x', q1_2: 'AB12', q1_3: 'A B' }).errors.q1_3, 'Enter two capital letters', 'no normalize: the space stays');
});

test('normalize rule: blank is still required and the length limit counts what was typed', () => {
  const cfg = normCfg();
  assert.equal(vs(cfg, { q1_2: 'AB12', q1_3: 'AB' }).errors.q1_1, 'This question is required');
  assert.equal(vs(cfg, { q1_1: '   ', q1_2: 'AB12', q1_3: 'AB' }).errors.q1_1, 'This question is required');
  assert.equal(vs(cfg, { q1_1: 'a b c d e f g h i', q1_2: 'AB12', q1_3: 'AB' }).errors.q1_1, 'Must be 12 characters or fewer', 'spaces count: 17 typed characters');
  assert.equal(vs(cfg, { q1_1: 'a b c d e f', q1_2: 'AB12', q1_3: 'AB' }).success, true);
});

test('normalize rule: validateConfig checks it', () => {
  const cases = [
    ['on a long text question', (c) => { c.questions[0].type = 'LNG'; }, /rules.normalize is only for TXT/],
    ['with a name that does not exist', (c) => { c.questions[0].rules.normalize = 'lowercase'; }, /rules.normalize must be one of uppercase_no_spaces/],
    ['with a built-in property name', (c) => { c.questions[0].rules.normalize = 'constructor'; }, /rules.normalize must be one of/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const c = clone(normCfg());
    mutate(c);
    const problems = engine.validateConfig(c);
    assert.ok(problems.some((p) => pattern.test(p)), `${name}: got ${JSON.stringify(problems)}`);
  }
});

// Valid made-up answers for the three new sections.
const S10A = { q10_1: ['none'] };
const S10C = { q10_4: 'english', q10_5: false };
const DETAILS10 = 'Made-up details of what happened.';
const CHOICES10 = [
  ['conviction', 'q10_1a'], ['driving', 'q10_1b'], ['arrest_charge', 'q10_1c'],
  ['out_of_court', 'q10_1d'], ['civil_judgment', 'q10_1e'], ['immigration_penalty', 'q10_1f'],
];

test('part 10: each new section validates with the simplest valid answers', () => {
  for (const [section, answers] of [['10A', S10A], ['10B', {}], ['10C', S10C]]) {
    const r = validate(section, answers);
    assert.equal(r.success, true, `${section}: ${JSON.stringify(r.errors)}`);
    assert.deepEqual(r.data, answers);
  }
});

test('part 10: what is required, in section order', () => {
  assert.deepEqual(Object.keys(validate('10A', {}).errors), ['q10_1']);
  assert.deepEqual(validate('10B', {}).errors, {}, '10.2 and 10.3 are optional');
  assert.deepEqual(Object.keys(validate('10C', {}).errors).sort(), ['q10_4', 'q10_5']);
  assert.deepEqual(engine.getVisibleQuestions(config, '10A', {}).map((q) => q.number), ['10.1']);
  assert.deepEqual(engine.getVisibleQuestions(config, '10B', {}).map((q) => q.number), ['10.2', '10.3']);
  assert.deepEqual(engine.getVisibleQuestions(config, '10C', {}).map((q) => q.number), ['10.4', '10.5']);
  for (const id of ['10A', '10B', '10C']) assert.equal(engine.isSectionVisible(config, id, {}), true, id);
});

test('10.1: six choices and one exclusive "None of these", in this order', () => {
  const q = config.questions.find((x) => x.id === 'q10_1');
  assert.deepEqual(q.options.map((o) => o.value), [...CHOICES10.map((c) => c[0]), 'none']);
  assert.deepEqual(q.options.filter((o) => o.exclusive).map((o) => o.value), ['none']);
  assert.equal(q.options.find((o) => o.value === 'none').label, 'None of these');
});

test('10.1: "None of these" cannot be ticked with another choice, and alone it needs no details', () => {
  const msg = '"None of these" cannot be chosen together with other options';
  assert.equal(validate('10A', { q10_1: ['none'] }).success, true);
  assert.equal(validate('10A', { q10_1: ['none', 'conviction'], q10_1a: DETAILS10 }).errors.q10_1, msg);
  assert.equal(validate('10A', { q10_1: ['driving', 'none'], q10_1b: DETAILS10 }).errors.q10_1, msg);
  assert.equal(validate('10A', { q10_1: [] }).errors.q10_1, 'This question is required');
  assert.equal(validate('10A', { q10_1: ['made_up'] }).errors.q10_1, 'Choose from the listed options');
  assert.deepEqual(engine.getVisibleQuestions(config, '10A', S10A).map((q) => q.number), ['10.1']);
});

for (const [choice, follow] of CHOICES10) {
  test(`10.1 gate ${choice}: ticking it asks for its own details, unticking removes them`, () => {
    const own = { q10_1: [choice] };
    assert.equal(validate('10A', own).errors[follow], 'This question is required');
    assert.equal(validate('10A', { ...own, [follow]: '  ' }).errors[follow], 'This question is required');
    const ok = validate('10A', { ...own, [follow]: DETAILS10 });
    assert.equal(ok.success, true, JSON.stringify(ok.errors));
    assert.deepEqual(ok.data, { ...own, [follow]: DETAILS10 });
    assert.equal(validate('10A', { ...own, [follow]: 'x'.repeat(2001) }).errors[follow], 'Must be 2000 characters or fewer');
    assert.equal(validate('10A', { ...own, [follow]: 'x'.repeat(2000) }).success, true);
    // only its own box opens
    assert.deepEqual(engine.getVisibleQuestions(config, '10A', own).map((q) => q.id), ['q10_1', follow]);

    // Unticking removes the box and the answer; ticking "None of these" instead does the same.
    const other = CHOICES10.find((c) => c[0] !== choice);
    for (const [after, rest] of [[['none'], {}], [[other[0]], { [other[1]]: DETAILS10 }]]) {
      const stored = { q10_1: [choice], [follow]: 'stale details' };
      const r = validate('10A', { q10_1: after, [follow]: 'stale details', ...rest }, stored);
      assert.equal(r.success, true, JSON.stringify(r.errors));
      assert.deepEqual(r.removed, [follow]);
      assert.equal(r.data[follow], undefined);
    }
    assert.deepEqual(engine.pruneAnswers(config, { q10_1: ['none'], [follow]: 'x' }).removed, [follow]);
    assert.deepEqual(engine.pruneAnswers(config, { q10_1: [choice], [follow]: 'x' }).removed, []);
    assert.deepEqual(engine.pruneAnswers(config, { [follow]: 'x' }).removed, [], 'waits until the checklist is answered');
  });
}

test('10.1: several choices ticked at once ask for every box; unticking one keeps the others', () => {
  const all = CHOICES10.map((c) => c[0]);
  assert.deepEqual(engine.getVisibleQuestions(config, '10A', { q10_1: all }).map((q) => q.number), ['10.1', '10.1a', '10.1b', '10.1c', '10.1d', '10.1e', '10.1f']);
  assert.deepEqual(Object.keys(validate('10A', { q10_1: all }).errors).sort(), CHOICES10.map((c) => c[1]).sort());
  const stored = { q10_1: ['conviction', 'driving'], q10_1a: 'first', q10_1b: 'second' };
  const r = validate('10A', { q10_1: ['driving'], q10_1a: 'first', q10_1b: 'second' }, stored);
  assert.equal(r.success, true, JSON.stringify(r.errors));
  assert.deepEqual(r.removed, ['q10_1a']);
  assert.deepEqual(r.data, { q10_1: ['driving'], q10_1b: 'second' });
});

test('10B: the two boxes are optional, always shown, and 10.3 stands alone', () => {
  assert.deepEqual(validate('10B', { q10_3: DETAILS10 }).data, { q10_3: DETAILS10 });
  assert.deepEqual(validate('10B', { q10_2: DETAILS10 }).data, { q10_2: DETAILS10 });
  assert.deepEqual(validate('10B', { q10_2: DETAILS10, q10_3: 'More.' }).data, { q10_2: DETAILS10, q10_3: 'More.' });
  assert.equal(validate('10B', { q10_2: '   ', q10_3: '' }).success, true, 'blank boxes are left out');
  assert.deepEqual(validate('10B', { q10_2: '   ' }).data, {});
  for (const id of ['q10_2', 'q10_3']) {
    assert.equal(validate('10B', { [id]: 'x'.repeat(2001) }).errors[id], 'Must be 2000 characters or fewer');
    assert.equal(validate('10B', { [id]: 'x'.repeat(2000) }).success, true);
    const q = config.questions.find((x) => x.id === id);
    assert.equal(q.showWhen, undefined, `${id} has no condition`);
    assert.equal(q.sensitive, undefined, `${id} is not encrypted`);
    assert.equal(q.required, false);
  }
});

test('10.4: the draft language list; Other asks which language, and a change removes it', () => {
  const q = config.questions.find((x) => x.id === 'q10_4');
  assert.deepEqual(q.options.map((o) => o.label), ['English', 'Urdu', 'Punjabi', 'Pashto', 'Hindi', 'Arabic', 'Bengali', 'Chinese (Mandarin)', 'Spanish', 'French', 'Other']);
  for (const o of q.options.filter((x) => x.value !== 'other')) {
    assert.equal(validate('10C', { q10_4: o.value, q10_5: false }).success, true, o.value);
    assert.deepEqual(engine.getVisibleQuestions(config, '10C', { q10_4: o.value }).map((x) => x.number), ['10.4', '10.5'], o.value);
  }
  assert.equal(validate('10C', { q10_4: 'klingon', q10_5: false }).errors.q10_4, 'Choose from the listed options');
  assert.equal(validate('10C', { q10_4: 'other', q10_5: false }).errors.q10_4a, 'This question is required');
  assert.equal(validate('10C', { q10_4: 'other', q10_4a: '  ', q10_5: false }).errors.q10_4a, 'This question is required');
  const ok = validate('10C', { q10_4: 'other', q10_4a: 'Sindhi', q10_5: false });
  assert.deepEqual(ok.data, { q10_4: 'other', q10_4a: 'Sindhi', q10_5: false });
  assert.equal(validate('10C', { q10_4: 'other', q10_4a: 'x'.repeat(101), q10_5: false }).errors.q10_4a, 'Must be 100 characters or fewer');
  const back = validate('10C', { q10_4: 'urdu', q10_4a: 'Sindhi', q10_5: false }, { q10_4: 'other', q10_4a: 'Sindhi', q10_5: false });
  assert.equal(back.success, true);
  assert.deepEqual(back.removed, ['q10_4a']);
  assert.deepEqual(back.data, { q10_4: 'urdu', q10_5: false });
});

const ni = (value) => validate('10C', { q10_4: 'english', q10_5: true, q10_5a: value });
const NI_MESSAGE = 'Enter a National Insurance number in the format AB 12 34 56 C';

test('10.5: a valid National Insurance number is stored in capitals with no spaces', () => {
  for (const [typed, stored] of [
    ['AB123456C', 'AB123456C'], ['ab123456c', 'AB123456C'], ['AB 12 34 56 C', 'AB123456C'], ['ab 12 34 56 c', 'AB123456C'],
    ['  jg 10 37 59 a  ', 'JG103759A'], ['AB  12  34  56  D', 'AB123456D'], ['CE 00 00 01 B', 'CE000001B'], ['PZ 99 99 99 A', 'PZ999999A'],
    ['Ab123456a', 'AB123456A'], ['EA 11 22 33 B', 'EA112233B'],
  ]) {
    const r = ni(typed);
    assert.equal(r.success, true, `${typed}: ${JSON.stringify(r.errors)}`);
    assert.equal(r.data.q10_5a, stored, typed);
  }
});

test('10.5: the invalid prefixes BG, GB, KN, NK, NT, TN and ZZ are rejected in any case and with spaces', () => {
  for (const prefix of ['BG', 'GB', 'KN', 'NK', 'NT', 'TN', 'ZZ']) {
    for (const typed of [`${prefix}123456C`, `${prefix.toLowerCase()}123456c`, `${prefix[0]} ${prefix[1]} 12 34 56 C`]) {
      const r = ni(typed);
      assert.equal(r.success, false, typed);
      assert.equal(r.errors.q10_5a, NI_MESSAGE, typed);
    }
  }
});

test('10.5: letters that are never used, a wrong length or a wrong last letter are rejected', () => {
  const bad = [
    'DA123456C', 'FA123456C', 'IA123456C', 'QA123456C', 'UA123456C', 'VA123456C', // first letter
    'AD123456C', 'AF123456C', 'AI123456C', 'AO123456C', 'AQ123456C', 'AU123456C', 'AV123456C', // second letter
    'AB12345C', 'AB1234567C', 'AB123456', 'AB123456CC', 'A123456C', 'ABC123456C', 'AB 12 34 56', // length
    'AB123456E', 'AB123456Z', 'AB1234561', // last letter
    '12345678A', 'AB-12-34-56-C', 'AB123456C.', 'AB12A456C', // other shapes
  ];
  for (const typed of bad) assert.equal(ni(typed).errors.q10_5a, NI_MESSAGE, typed);
  assert.equal(ni('').errors.q10_5a, 'This question is required');
  assert.equal(ni('   ').errors.q10_5a, 'This question is required');
  assert.equal(ni(undefined).errors.q10_5a, 'This question is required');
  assert.equal(ni('A'.repeat(31)).errors.q10_5a, 'Must be 30 characters or fewer');
});

test('10.5: the error never repeats what was typed', () => {
  for (const typed of ['GB123456C', 'secret-value-123', 'AB123456E']) assert.ok(!JSON.stringify(ni(typed).errors).includes(typed));
});

test('10.5: No removes a stored number; Yes asks for it', () => {
  assert.equal(validate('10C', { ...S10C, q10_5: true }).errors.q10_5a, 'This question is required');
  const stored = { ...S10C, q10_5: true, q10_5a: 'AB123456C' };
  const no = validate('10C', { ...S10C, q10_5a: 'AB123456C' }, stored);
  assert.equal(no.success, true, JSON.stringify(no.errors));
  assert.deepEqual(no.removed, ['q10_5a']);
  assert.deepEqual(no.data, S10C);
  assert.deepEqual(engine.pruneAnswers(config, { q10_5: false, q10_5a: 'AB123456C' }).removed, ['q10_5a']);
  assert.deepEqual(engine.pruneAnswers(config, { q10_5: true, q10_5a: 'AB123456C' }).removed, []);
  assert.deepEqual(engine.pruneAnswers(config, { q10_5a: 'AB123456C' }).removed, []);
});

test('part 10: the encrypted fields are exactly 10.1, its six boxes, 10.5 and the number', () => {
  const part10 = config.questions.filter((q) => ['10A', '10B', '10C'].includes(q.section));
  assert.equal(part10.length, 13);
  assert.deepEqual(part10.filter((q) => q.sensitive).map((q) => q.number), PART10_SENSITIVE);
  assert.deepEqual(part10.filter((q) => !q.sensitive).map((q) => q.number), ['10.2', '10.3', '10.4', '10.4a']);
  for (const q of part10) assert.equal(q.draft, undefined, `${q.number} is final`);
  for (const q of part10.filter((x) => x.type === 'LNG')) assert.equal(q.rules.maxLen, 2000, q.number);
  assert.equal(config.questions.filter((q) => q.sensitive).length, 36, '27 earlier fields and 9 new ones');
  // The only FILE questions are 10.6 and 10.7 (section 10D), and they store nothing.
  assert.deepEqual(config.questions.filter((q) => q.type === 'FILE').map((q) => q.number), ['10.6', '10.7']);
});

test('part 10: the new sections do not change the earlier ones', () => {
  assert.equal(validate('8', S8).success, true);
  assert.equal(validate('9A', S9A).success, true);
  assert.deepEqual(engine.getVisibleSections(config, {}).map((s) => s.id).slice(-5), ['9C', '10A', '10B', '10C', '10D']);
});

// ---------------------------------------------------------------------------
// Step 8c-2: the FILE question type, the document status rules and section 10D
// ---------------------------------------------------------------------------

const fileCfg = () => mk([
  { id: 'q1_1', number: '1.1', type: 'FILE', slot: 'passport' },
  { id: 'q1_2', number: '1.2', type: 'FILE', slot: 'funds' },
]);
const doc = (slot) => ({ id: `d-${slot}`, slot });

test('FILE question: a valid config, always shown, stores nothing and is not an answer key', () => {
  const cfg = fileCfg();
  assert.deepEqual(engine.validateConfig(cfg), []);
  assert.deepEqual(engine.getVisibleQuestions(cfg, 'S', {}).map((q) => q.id), ['q1_1', 'q1_2']);
  const empty = vs(cfg, {});
  assert.equal(empty.success, true, 'a draft can be saved without files: required means required at submit');
  assert.deepEqual(empty.data, {});
  assert.deepEqual(empty.errors, {});
  // A file question has no answer to send: its id is refused like any other key that does not belong.
  const sent = vs(cfg, { q1_1: 'passport.pdf' });
  assert.deepEqual(sent.unknownKeys, ['q1_1']);
  assert.deepEqual(sent.data, {});
  // And nothing is ever pruned or kept for it.
  assert.deepEqual(engine.pruneAnswers(cfg, { q1_1: 'x' }).removed, []);
});

test('FILE question: validateConfig checks it', () => {
  const cases = [
    ['without a slot', (c) => { delete c.questions[0].slot; }, /needs a slot/],
    ['with an odd slot name', (c) => { c.questions[0].slot = 'Pass port'; }, /needs a slot/],
    ['two questions on one slot', (c) => { c.questions[1].slot = 'passport'; }, /slot passport is already used by q1_1/],
    ['with options', (c) => { c.questions[0].options = [{ value: 'a', label: 'A' }]; }, /a FILE question has no options/],
    ['with rules', (c) => { c.questions[0].rules = { maxLen: 5 }; }, /a FILE question has no rules/],
    ['with a condition', (c) => { c.questions[0].showWhen = { q: 'q1_2', eq: true }; }, /a FILE question has no showWhen/],
    ['sensitive', (c) => { c.questions[0].sensitive = true; }, /cannot be sensitive/],
    ['a slot on another type', (c) => { c.questions[0].type = 'TXT'; }, /slot is only for FILE questions/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const c = clone(fileCfg());
    mutate(c);
    const problems = engine.validateConfig(c);
    assert.ok(problems.some((p) => pattern.test(p)), `${name}: got ${JSON.stringify(problems)}`);
  }
});

test('documentsStatus: not started with no files, in progress with one slot, complete with every slot', () => {
  const cfg = fileCfg();
  const status = (documents) => engine.documentsStatus(cfg, documents);
  assert.deepEqual(status([]).state, 'not_started');
  assert.deepEqual(status(undefined).state, 'not_started');
  assert.deepEqual(status([doc('passport')]).state, 'in_progress');
  assert.deepEqual(status([doc('funds'), doc('funds')]).state, 'in_progress');
  assert.deepEqual(status([doc('passport'), doc('funds')]).state, 'complete');
  assert.deepEqual(status([doc('passport'), doc('passport'), doc('passport'), doc('funds')]).state, 'complete');
  assert.deepEqual(status([doc('visa'), null, {}]).state, 'not_started', 'a file in an unknown slot counts for nothing');
  assert.deepEqual(status([doc('passport'), doc('passport'), doc('funds')]).slots, [
    { questionId: 'q1_1', number: '1.1', slot: 'passport', count: 2 },
    { questionId: 'q1_2', number: '1.2', slot: 'funds', count: 1 },
  ]);
  assert.equal(status([doc('passport')]).complete, false);
  assert.equal(status([doc('passport'), doc('funds')]).complete, true);
});

test('documentsComplete is the rule step 8d uses: every slot needs at least one file', () => {
  const cfg = fileCfg();
  assert.equal(engine.documentsComplete(cfg, []), false);
  assert.equal(engine.documentsComplete(cfg, [doc('passport')]), false);
  assert.equal(engine.documentsComplete(cfg, [doc('funds')]), false);
  assert.equal(engine.documentsComplete(cfg, [doc('passport'), doc('funds')]), true);
  assert.equal(engine.documentsComplete(config, [doc('passport'), doc('funds')]), true, 'on the real config');
  assert.equal(engine.documentsComplete(config, [doc('passport')]), false);
});

test('isFilesOnlySection: only a section made of file questions has nothing to save', () => {
  assert.equal(engine.isFilesOnlySection(fileCfg(), 'S'), true);
  assert.equal(engine.isFilesOnlySection(config, '10D'), true);
  for (const id of ['1', '3', '10A', '10B', '10C']) assert.equal(engine.isFilesOnlySection(config, id), false, id);
  const mixed = mk([{ id: 'q1_1', number: '1.1', type: 'FILE', slot: 'passport' }, { id: 'q1_2', number: '1.2', type: 'TXT' }]);
  assert.equal(engine.isFilesOnlySection(mixed, 'S'), false);
  assert.equal(engine.isFilesOnlySection(config, 'nope'), false);
});

test('section 10D: Part 10, always shown, two file questions in the passport and funds slots, both required to submit', () => {
  assert.deepEqual(config.sections.find((s) => s.id === '10D'), { id: '10D', part: '10', title: 'Documents' });
  assert.equal(engine.isSectionVisible(config, '10D', {}), true);
  const files = engine.getFileQuestions(config);
  assert.deepEqual(files.map((q) => [q.number, q.section, q.slot, q.required]), [['10.6', '10D', 'passport', true], ['10.7', '10D', 'funds', true]]);
  assert.deepEqual(engine.getFileQuestions(config, '10D').length, 2);
  assert.deepEqual(engine.getFileQuestions(config, '10C'), []);
  assert.deepEqual(engine.getVisibleQuestions(config, '10D', {}).map((q) => q.number), ['10.6', '10.7']);
  assert.equal(config.questions.find((q) => q.id === 'q10_6').label, 'Your passport or travel document');
  assert.equal(config.questions.find((q) => q.id === 'q10_7').label, 'Evidence of funds');
  for (const q of files) {
    assert.equal(q.draft, undefined, `${q.number} is final`);
    assert.equal(q.sensitive, undefined, `${q.number} stores no answer`);
  }
});

test('section 10D: nothing to validate or save, and its question ids are not answer keys', () => {
  const r = validate('10D', {});
  assert.equal(r.success, true);
  assert.deepEqual(r.errors, {});
  assert.deepEqual(r.data, {});
  assert.deepEqual(validate('10D', { q10_6: 'x' }).unknownKeys, ['q10_6']);
  assert.deepEqual(validate('10D', { q10_7: true }).unknownKeys, ['q10_7']);
  const status = engine.documentsStatus(config, [doc('passport')], '10D');
  assert.equal(status.state, 'in_progress');
  assert.deepEqual(status.slots.map((s) => [s.slot, s.count]), [['passport', 1], ['funds', 0]]);
});

test('section 10D: the guidance states the limits the backend enforces (3 passport files, 10 funds files)', () => {
  const { SLOTS } = require('../../backend/config/touristVisaDocuments');
  const files = engine.getFileQuestions(config);
  assert.deepEqual(files.map((q) => q.slot).sort(), Object.keys(SLOTS).sort(), 'the config and the backend know the same slots');
  for (const q of files) assert.ok(q.help.includes(`up to ${SLOTS[q.slot].max} files`), `${q.number}: ${q.help}`);
});
