'use strict';

// Task A: a FILE question (a document slot) may have a showWhen and may be optional (required: false).
// The real config still has only passport and funds, so everything here runs on a small made-up config:
//   passport  required, always on the list
//   salary    required, only for an employed applicant            (conditional, required)
//   bizreg    required, only for a self-employed applicant       (conditional, required)
//   other     optional, always on the list                       (optional)
//   sponsor   optional, only when somebody else pays             (conditional + optional)

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('./engine');
const { buildReview } = require('./view');

const clone = (o) => JSON.parse(JSON.stringify(o));

function testConfig() {
  const file = (n, id, slot, extra = {}) => ({ id, number: n, section: 'D', label: `Label ${slot}`, type: 'FILE', slot, maxFiles: 3, required: true, help: 'h', ...extra });
  return {
    version: 'test',
    limits: { txtMax: 50, lngMax: 200, groupMax: 3 },
    parts: [{ id: '1', title: 'P' }],
    sections: [
      { id: 'A', part: '1', title: 'About you' },
      { id: 'D', part: '1', title: 'Documents' },
    ],
    groups: [],
    questions: [
      { id: 'q1_1', number: '1.1', section: 'A', label: 'Work', type: 'SEL', required: true, options: [{ value: 'employed', label: 'Employed' }, { value: 'self_employed', label: 'Self-employed' }, { value: 'retired', label: 'Retired' }] },
      { id: 'q1_2', number: '1.2', section: 'A', label: 'Does someone else pay?', type: 'YN', required: true },
      file('1.3', 'q1_3', 'passport'),
      file('1.4', 'q1_4', 'salary', { showWhen: { q: 'q1_1', eq: 'employed' } }),
      file('1.5', 'q1_5', 'bizreg', { showWhen: { q: 'q1_1', eq: 'self_employed' } }),
      file('1.6', 'q1_6', 'other', { required: false }),
      file('1.7', 'q1_7', 'sponsor', { required: false, showWhen: { q: 'q1_2', eq: true } }),
    ],
  };
}
const doc = (slot) => ({ id: `d-${slot}-${Math.random()}`, slot });
const slotsOn = (cfg, answers) => engine.getVisibleFileQuestions(cfg, answers).map((q) => q.slot);

test('validateConfig: a FILE question may have a showWhen and required: false; the other rules still hold', () => {
  const cfg = testConfig();
  assert.deepEqual(engine.validateConfig(cfg), []);

  const bad = (mutate, pattern, name) => {
    const c = clone(cfg);
    mutate(c);
    assert.ok(engine.validateConfig(c).some((p) => pattern.test(p)), `${name}: ${JSON.stringify(engine.validateConfig(c))}`);
  };
  bad((c) => { c.questions[3].showWhen = { q: 'q1_99', eq: 'x' }; }, /showWhen/, 'a condition on an unknown question');
  bad((c) => { c.questions[3].showWhen = { q: 'q1_7', eq: true }; }, /showWhen/, 'a condition on a later question');
  bad((c) => { c.questions[3].group = 'g'; }, /a FILE question has no group/, 'a group');
  bad((c) => { c.questions[3].options = [{ value: 'a', label: 'A' }]; }, /a FILE question has no options/, 'options');
  bad((c) => { c.questions[3].rules = { maxLen: 3 }; }, /a FILE question has no rules/, 'rules');
  bad((c) => { c.questions[3].required = 'no'; }, /required must be true or false/, 'a required that is not a boolean');
});

test('getVisibleFileQuestions: a slot with no showWhen is always on the list; a conditional slot follows the answers', () => {
  const cfg = testConfig();
  assert.deepEqual(slotsOn(cfg, {}), ['passport', 'other']);
  assert.deepEqual(slotsOn(cfg, { q1_1: 'employed' }), ['passport', 'salary', 'other']);
  assert.deepEqual(slotsOn(cfg, { q1_1: 'self_employed' }), ['passport', 'bizreg', 'other']);
  assert.deepEqual(slotsOn(cfg, { q1_1: 'retired' }), ['passport', 'other']);
  assert.deepEqual(slotsOn(cfg, { q1_1: 'employed', q1_2: true }), ['passport', 'salary', 'other', 'sponsor']);
  assert.deepEqual(slotsOn(cfg, { q1_2: false }), ['passport', 'other']);
  assert.deepEqual(engine.getVisibleFileQuestions(cfg, { q1_1: 'employed' }, 'D').length, 3);
  assert.deepEqual(engine.getVisibleFileQuestions(cfg, { q1_1: 'employed' }, 'A'), []);
  // the answers are required: guessing "none" would quietly hide every conditional slot
  for (const missing of [undefined, null, 'x', []]) assert.throws(() => engine.getVisibleFileQuestions(cfg, missing), /needs the answers/);
  assert.throws(() => engine.documentsStatus(cfg, [], undefined, undefined), /needs the answers/);
  assert.throws(() => engine.documentsComplete(cfg, []), /needs the answers/);
});

test('documentsStatus: only visible slots are counted, only required ones block, optional ones never do', () => {
  const cfg = testConfig();
  const employed = { q1_1: 'employed' };

  let s = engine.documentsStatus(cfg, [], undefined, employed);
  assert.deepEqual(s.slots.map((x) => [x.slot, x.required, x.count]), [['passport', true, 0], ['salary', true, 0], ['other', false, 0]]);
  assert.equal(s.complete, false);
  assert.equal(s.state, 'not_started');

  // the required conditional slot blocks until it has a file
  s = engine.documentsStatus(cfg, [doc('passport')], undefined, employed);
  assert.equal(s.complete, false);
  assert.equal(s.state, 'in_progress');
  s = engine.documentsStatus(cfg, [doc('passport'), doc('salary')], undefined, employed);
  assert.equal(s.complete, true, 'the optional slot is empty and does not matter');
  assert.equal(s.state, 'complete');

  // the same files for a self-employed applicant: salary is hidden (ignored), the business registration is now required
  s = engine.documentsStatus(cfg, [doc('passport'), doc('salary')], undefined, { q1_1: 'self_employed' });
  assert.deepEqual(s.slots.map((x) => x.slot), ['passport', 'bizreg', 'other']);
  assert.equal(s.complete, false, 'a file in a hidden slot satisfies nothing');
  s = engine.documentsStatus(cfg, [doc('passport'), doc('bizreg')], undefined, { q1_1: 'self_employed' });
  assert.equal(s.complete, true);

  // a hidden required slot never blocks
  s = engine.documentsStatus(cfg, [doc('passport')], undefined, { q1_1: 'retired' });
  assert.equal(s.complete, true);
  assert.equal(engine.documentsComplete(cfg, [doc('passport')], { q1_1: 'retired' }), true);
  assert.equal(engine.documentsComplete(cfg, [doc('passport')], { q1_1: 'employed' }), false);

  // an optional slot with a file but a required slot without one is still in progress; a visible optional slot with no files is "not answered"
  s = engine.documentsStatus(cfg, [doc('other')], undefined, employed);
  assert.equal(s.state, 'in_progress');
  assert.equal(s.complete, false);

  // a conditional, optional slot never blocks, visible or not
  s = engine.documentsStatus(cfg, [doc('passport')], undefined, { q1_1: 'retired', q1_2: true });
  assert.deepEqual(s.slots.map((x) => x.slot), ['passport', 'other', 'sponsor']);
  assert.equal(s.complete, true);

  // per section
  assert.equal(engine.documentsStatus(cfg, [], 'A', employed).slots.length, 0);
  assert.equal(engine.documentsStatus(cfg, [], 'D', employed).slots.length, 3);
});

test('documentsStatus: a section whose visible slots are all optional is complete for submitting, and complete once it has a file', () => {
  const cfg = testConfig();
  for (const q of cfg.questions.filter((x) => x.type === 'FILE')) q.required = false;
  const none = engine.documentsStatus(cfg, [], 'D', {});
  assert.equal(none.complete, true, 'nothing is required, so nothing blocks the submit');
  assert.equal(none.state, 'not_started', 'but nothing has been done in it');
  const one = engine.documentsStatus(cfg, [doc('other')], 'D', {});
  assert.equal(one.complete, true);
  assert.equal(one.state, 'complete');
});

test('a section whose slots are all hidden is not on the list at all', () => {
  const cfg = testConfig();
  cfg.questions = cfg.questions.filter((q) => !['q1_3', 'q1_6'].includes(q.id)); // only conditional slots are left in D
  assert.equal(engine.isSectionVisible(cfg, 'D', { q1_1: 'retired' }), false);
  assert.equal(engine.isSectionVisible(cfg, 'D', { q1_1: 'employed' }), true);
  assert.equal(engine.isFilesOnlySection(cfg, 'D'), true);
});

test('getOrphanDocuments: files in a hidden slot, or in a slot the config does not have, are listed apart and never counted', () => {
  const cfg = testConfig();
  const files = [doc('passport'), doc('salary'), doc('bizreg'), doc('oldslot'), null];
  const orphans = (answers) => engine.getOrphanDocuments(cfg, files, answers).map((d) => d.slot);
  assert.deepEqual(orphans({ q1_1: 'employed' }), ['bizreg', 'oldslot']);
  assert.deepEqual(orphans({ q1_1: 'self_employed' }), ['salary', 'oldslot']);
  assert.deepEqual(orphans({ q1_1: 'retired' }), ['salary', 'bizreg', 'oldslot']);
  assert.deepEqual(engine.getOrphanDocuments(cfg, undefined, {}), []);
  assert.throws(() => engine.getOrphanDocuments(cfg, files), /needs the answers/);
  // switching employed -> self-employed: the salary file stays in the list of orphans, is not required, and does not satisfy bizreg
  const status = engine.documentsStatus(cfg, files, 'D', { q1_1: 'self_employed' });
  assert.equal(status.slots.find((s) => s.slot === 'salary'), undefined);
  assert.equal(status.slots.find((s) => s.slot === 'bizreg').count, 1);
});

test('review page: only the visible slots are printed; an empty optional slot reads "Not answered" and a required one "No files uploaded"', () => {
  const cfg = testConfig();
  const review = (answers, documents) => {
    const rows = buildReview(cfg, answers, documents, {}).parts.flatMap((p) => p.sections).find((s) => s.id === 'D');
    return rows ? rows.rows : null;
  };
  const files = [{ slot: 'passport', name: 'p.pdf', size: 10 }, { slot: 'salary', name: 's.pdf', size: 20 }];

  let rows = review({ q1_1: 'employed' }, files);
  assert.deepEqual(rows.map((r) => r.id), ['q1_3', 'q1_4', 'q1_6']);
  assert.deepEqual(rows.map((r) => r.value), ['1 file', '1 file', 'Not answered']);
  assert.equal(rows[2].optional, true);
  assert.equal(rows[2].empty, true);
  assert.equal(rows[0].optional, undefined);

  rows = review({ q1_1: 'self_employed' }, files);
  assert.deepEqual(rows.map((r) => r.id), ['q1_3', 'q1_5', 'q1_6'], 'the hidden slot is not printed, and neither is its file');
  assert.equal(rows[1].value, 'No files uploaded');
  assert.deepEqual(rows[1].files, []);
  assert.equal(JSON.stringify(rows).includes('s.pdf'), false);

  rows = review({ q1_1: 'retired', q1_2: true }, files);
  assert.deepEqual(rows.map((r) => r.id), ['q1_3', 'q1_6', 'q1_7']);
});

test('the real config keeps only the passport and funds slots, both required and unconditional, with their limits in the config', () => {
  const files = engine.getFileQuestions(engine.config);
  assert.deepEqual(files.map((q) => [q.slot, q.maxFiles, q.required, q.showWhen]), [['passport', 3, true, undefined], ['funds', 10, true, undefined]]);
  assert.deepEqual(engine.getOrphanDocuments(engine.config, [doc('passport'), doc('funds')], {}), []);
  assert.equal(engine.documentsComplete(engine.config, [doc('passport'), doc('funds')], {}), true);
  assert.equal(engine.documentsComplete(engine.config, [doc('passport')], {}), false);
});
