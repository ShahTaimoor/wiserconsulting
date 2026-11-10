'use strict';

// Step 8f: the rules of an admin correction, with no database and no server. The same shared engine that checks the
// applicant's own save checks an admin's change; these tests pin down what that means.

process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const z = require('zod');

const engine = require('../shared/tourist-visa/engine');
const { buildReview } = require('../shared/tourist-visa/view');
const logic = require('../utils/touristVisaChanges');
const { fullAnswers, SECRET_ID } = require('./helpers/touristVisaFixtures');

const cfg = engine.config;
const TODAY = '2026-10-31';

const base = () => fullAnswers();
const run = (changes, existing = base(), config = cfg) => logic.evaluate({ z, cfg: config, existing, parsed: logic.parseChanges(config, changes), today: TODAY });
const refusal = (fn) => { try { fn(); } catch (e) { return [e.statusCode, e.code]; } return null; };

test('the fixture is a complete application: every section passes as it stands', () => {
  const answers = base();
  for (const section of engine.getVisibleSections(cfg, answers)) {
    if (engine.isFilesOnlySection(cfg, section.id)) continue;
    const slice = {};
    for (const key of logic.sectionKeys(cfg, section.id)) if (answers[key] !== undefined) slice[key] = answers[key];
    const result = engine.validateSection(z, cfg, section.id, slice, answers, { today: TODAY });
    assert.deepEqual(result.errors, {}, `section ${section.id}`);
  }
});

// ---------------------------------------------------------------------------
// Reading the request
// ---------------------------------------------------------------------------

test('what an admin can never change has its own code: the ticks, the declaration, documents, status, reference, date and owner', () => {
  const codes = [
    ['q9_11', 'NOT_EDITABLE_DECLARATION'], ['q9_12', 'NOT_EDITABLE_DECLARATION'], ['q9_13', 'NOT_EDITABLE_DECLARATION'], ['q9_14', 'NOT_EDITABLE_DECLARATION'],
    ['declarations.submit', 'NOT_EDITABLE_DECLARATION'], ['declarations', 'NOT_EDITABLE_DECLARATION'],
    ['documents', 'NOT_EDITABLE_DOCUMENTS'], ['q10_6', 'NOT_EDITABLE_DOCUMENTS'], ['q10_7', 'NOT_EDITABLE_DOCUMENTS'],
    ['status', 'NOT_EDITABLE_STATUS'], ['reference', 'NOT_EDITABLE_REFERENCE'], ['submittedAt', 'NOT_EDITABLE_SUBMITTED_AT'],
    ['applicant', 'NOT_EDITABLE_IDENTITY'], ['applicantId', 'NOT_EDITABLE_IDENTITY'], ['user', 'NOT_EDITABLE_IDENTITY'],
  ];
  for (const [questionId, code] of codes) assert.deepEqual(refusal(() => logic.parseChanges(cfg, [{ questionId, value: true }])), [400, code], questionId);
});

test('a request that is not shaped as a list of { questionId, index?, value } is refused with a clear code', () => {
  const bad = [
    [undefined, 'INVALID_REQUEST'], [null, 'INVALID_REQUEST'], [[], 'INVALID_REQUEST'], ['q2_32', 'INVALID_REQUEST'], [{ questionId: 'q2_32' }, 'INVALID_REQUEST'],
    [[{ questionId: 'q2_32' }], 'INVALID_CHANGE'], // no value
    [[{ value: 1 }], 'INVALID_CHANGE'], [[{ questionId: 5, value: 1 }], 'INVALID_CHANGE'], [[null], 'INVALID_CHANGE'], [['q2_32'], 'INVALID_CHANGE'],
    [[{ questionId: 'q2_32', value: 1, extra: true }], 'INVALID_CHANGE'],
    [[{ questionId: 'q2_32', index: 0, value: 1 }], 'INVALID_CHANGE'], // not inside a group
    [[{ questionId: 'q4_8b', value: 'x' }], 'INVALID_CHANGE'], // inside a group, no entry number
    [[{ questionId: 'q4_8b', index: -1, value: 'x' }], 'INVALID_CHANGE'], [[{ questionId: 'q4_8b', index: 1.5, value: 'x' }], 'INVALID_CHANGE'], [[{ questionId: 'q4_8b', index: '0', value: 'x' }], 'INVALID_CHANGE'],
    [[{ questionId: 'parents', index: 0, value: [] }], 'INVALID_CHANGE'], [[{ questionId: 'parents', value: 'x' }], 'INVALID_CHANGE'], [[{ questionId: 'parents', value: [1] }], 'INVALID_CHANGE'],
    [[{ questionId: 'nope', value: 1 }], 'UNKNOWN_QUESTION'], [[{ questionId: '__proto__', value: 1 }], 'UNKNOWN_QUESTION'], [[{ questionId: 'constructor', value: 1 }], 'UNKNOWN_QUESTION'],
    [[{ questionId: 'q2_32', value: 1 }, { questionId: 'q2_32', value: 2 }], 'DUPLICATE_CHANGE'],
    [[{ questionId: 'parents', value: [] }, { questionId: 'q4_8b', index: 0, value: 'x' }], 'DUPLICATE_CHANGE'],
    [Array.from({ length: 31 }, () => ({ questionId: 'q2_32', value: 1 })), 'TOO_MANY_CHANGES'],
  ];
  for (const [changes, code] of bad) assert.equal((refusal(() => logic.parseChanges(cfg, changes)) || [])[1], code, JSON.stringify(changes)?.slice(0, 80));
  // exactly 30 different ones is fine
  const thirty = cfg.questions.filter((q) => !q.group && q.type !== 'ACK' && q.type !== 'FILE').slice(0, 30).map((q) => ({ questionId: q.id, value: null }));
  assert.equal(logic.parseChanges(cfg, thirty).length, 30);
});

test('the reason must be 10 to 1000 characters once trimmed', () => {
  for (const bad of [undefined, null, 5, '', '         ', '123456789', '   123456789   ', 'x'.repeat(1001), `  ${'x'.repeat(1001)}  `]) assert.equal((refusal(() => logic.checkReason(bad)) || [])[1], 'INVALID_REASON', String(bad)?.slice(0, 20));
  assert.equal(logic.checkReason('  1234567890  '), '1234567890');
  assert.equal(logic.checkReason('x'.repeat(1000)).length, 1000);
});

test('entries of a repeating group must be added one after the other', () => {
  const parsed = logic.parseChanges(cfg, [{ questionId: 'q4_8b', index: 2, value: 'Skipped' }]);
  assert.equal((refusal(() => logic.applyChanges(base(), parsed)) || [])[1], 'INVALID_CHANGE');
});

// ---------------------------------------------------------------------------
// Checking a change
// ---------------------------------------------------------------------------

test('a plain correction: the new answer is kept, the old one is the only thing that differs', () => {
  const result = run([{ questionId: 'q2_32', value: { countryCode: '+44', number: '7700 900555' } }]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.items, [{ sectionId: '2D', questionId: 'q2_32', kind: 'edited', old: { countryCode: '+44', number: '7700 900123' }, new: { countryCode: '+44', number: '7700 900555' } }]);
  assert.deepEqual(result.sections, ['2D']);
  assert.equal(result.answers.q2_32.number, '7700 900555');
  assert.equal(result.answers.q3_1, SECRET_ID, 'everything else is untouched');
});

test('the engine normalises what it keeps (an email in capitals is stored in lower case)', () => {
  const result = run([
    { questionId: 'q2_4', value: 'New.Person@Example.com' }, { questionId: 'q2_9', value: 'new.person@example.com' },
    { questionId: 'q2_10', value: 'new.person@example.com' }, { questionId: 'q2_11', value: 'new.person@example.com' },
  ]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.answers.q2_4, 'new.person@example.com');
});

test('a touched section is validated as a whole: changing the email alone fails because the email choices still name the old one', () => {
  const result = run([{ questionId: 'q2_4', value: 'other.person@example.com' }]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.sections, [{ id: '2A', problems: 3 }]);
  assert.deepEqual(Object.keys(result.errors).sort(), ['q2_10', 'q2_11', 'q2_9']);
});

test('a value that does not pass is refused with the section, a count and the engine\'s fixed message, never the value', () => {
  const secret = 'NOT-A-PHONE-NUMBER-MADE-UP';
  const result = run([{ questionId: 'q2_32', value: { countryCode: '+44', number: secret } }]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.sections, [{ id: '2D', problems: 1 }]);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes('7700'), false);
});

test('clearing a required answer fails; clearing an optional one works', () => {
  assert.equal(run([{ questionId: 'q2_32', value: null }]).ok, false);
  const optional = cfg.questions.find((q) => !q.group && !q.required && q.type === 'TXT' && base()[q.id] !== undefined);
  if (optional) assert.equal(run([{ questionId: optional.id, value: null }]).ok, true);
});

test('no change at all gives no items', () => {
  const result = run([{ questionId: 'q2_32', value: { countryCode: '+44', number: '7700 900123' } }]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.items, []);
});

test('answers that become hidden are pruned and listed: "can you give your parents\' details" Yes -> No removes the parents', () => {
  const result = run([{ questionId: 'q4_8', value: false }]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.answers.parents, undefined);
  assert.equal(result.answers.q4_8, false);
  const kinds = Object.fromEntries(result.items.map((i) => [`${i.questionId}${i.index === undefined ? '' : `[${i.index}]`}`, i.kind]));
  assert.equal(kinds.q4_8, 'edited');
  for (const id of ['q4_8a', 'q4_8b', 'q4_8c', 'q4_8d', 'q4_8e', 'q4_8f']) assert.equal(kinds[`${id}[0]`], 'pruned', id);
  const preview = logic.buildPreview(cfg, base(), result.answers, result.items);
  assert.equal(preview.changes.length, 1);
  assert.deepEqual([preview.changes[0].old, preview.changes[0].new], ['Yes', 'No']);
  assert.equal(preview.removed.length, 6);
  assert.ok(preview.removed.every((r) => r.label.startsWith('Parent 1: ')));
  assert.equal(preview.removed.find((r) => r.questionId === 'q4_8b').old, 'Testmother');
  assert.equal(preview.required.length, 0);
});

test('answers hidden in a section the request did not touch are pruned too: married -> single removes the answers of the partner section', () => {
  const married = { ...base(), q2_13: 'married', q4_1: 'Partnerfirst', q4_2: 'Partnerlast', q4_3: '1991-02-03', q4_4: 'GB', q4_5: true, q4_6: true };
  const result = run([{ questionId: 'q2_13', value: 'single' }], married);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.sections, ['2B'], 'only 2B was touched');
  for (const id of ['q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5', 'q4_6']) assert.equal(result.answers[id], undefined, id);
  assert.deepEqual(result.items.filter((i) => i.kind === 'pruned').map((i) => i.questionId), ['q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5', 'q4_6']);
  assert.ok(result.items.filter((i) => i.kind === 'pruned').every((i) => i.sectionId === '4A' && i.new === undefined && i.old !== undefined));
});

test('a follow-up that becomes required must be answered in the same request: "other names" Yes needs at least one entry', () => {
  const without = run([{ questionId: 'q2_3', value: true }]);
  assert.equal(without.ok, false);
  assert.deepEqual(without.sections, [{ id: '2A', problems: 1 }]);
  assert.deepEqual(Object.keys(without.errors), ['otherNames']);

  const withIt = run([{ questionId: 'q2_3', value: true }, { questionId: 'otherNames', value: [{ q2_3a: 'Aliasfirst', q2_3b: 'Aliaslast' }] }]);
  assert.equal(withIt.ok, true, JSON.stringify(withIt));
  assert.deepEqual(withIt.answers.otherNames, [{ q2_3a: 'Aliasfirst', q2_3b: 'Aliaslast' }]);
  const preview = logic.buildPreview(cfg, base(), withIt.answers, withIt.items);
  assert.deepEqual(preview.changes.map((c) => c.questionId), ['q2_3']);
  assert.deepEqual(preview.required.map((r) => [r.questionId, r.index, r.new]), [['q2_3a', 0, 'Aliasfirst'], ['q2_3b', 0, 'Aliaslast']], 'the questions the change made necessary, with what was supplied');
  assert.ok(preview.required.every((r) => r.label.startsWith('Other name 1: ')));
});

test('a section the change makes newly necessary is refused with its id: single -> married needs the partner section (4A)', () => {
  const without = run([{ questionId: 'q2_13', value: 'married' }]);
  assert.equal(without.ok, false);
  assert.deepEqual(without.sections.map((s) => s.id), ['4A']);
  assert.equal(without.sections[0].problems, 6);

  const answers4A = [['q4_1', 'Partnerfirst'], ['q4_2', 'Partnerlast'], ['q4_3', '1991-02-03'], ['q4_4', 'GB'], ['q4_5', true], ['q4_6', true]];
  const withIt = run([{ questionId: 'q2_13', value: 'married' }, ...answers4A.map(([questionId, value]) => ({ questionId, value }))]);
  assert.equal(withIt.ok, true, JSON.stringify(withIt));
  assert.deepEqual(withIt.sections, ['2B', '4A']);
  assert.equal(withIt.answers.q4_1, 'Partnerfirst');
});

test('a follow-up inside an entry: "same nationality" Yes -> No needs the previous nationality', () => {
  const without = run([{ questionId: 'q4_8f', index: 0, value: false }]);
  assert.equal(without.ok, false);
  assert.deepEqual(without.sections, [{ id: '4C', problems: 1 }]);
  assert.deepEqual(Object.keys(without.errors), ['parents.0.q4_8h']);

  const withIt = run([{ questionId: 'q4_8f', index: 0, value: false }, { questionId: 'q4_8h', index: 0, value: 'FR' }]);
  assert.equal(withIt.ok, true, JSON.stringify(withIt));
  assert.equal(withIt.answers.parents[0].q4_8h, 'FR');
  const preview = logic.buildPreview(cfg, base(), withIt.answers, withIt.items);
  assert.deepEqual(preview.changes.map((c) => [c.questionId, c.old, c.new]), [['q4_8f', 'Yes', 'No']]);
  assert.deepEqual(preview.required.map((r) => [r.questionId, r.new]), [['q4_8h', 'France']]);
});

test('a follow-up that was answered is removed when its question is hidden again', () => {
  const result = run([{ questionId: 'q4_8f', index: 0, value: false }, { questionId: 'q4_8h', index: 0, value: 'FR' }]);
  assert.equal(result.ok, true);
  const back = logic.evaluate({ z, cfg, existing: result.answers, parsed: logic.parseChanges(cfg, [{ questionId: 'q4_8f', index: 0, value: true }]), today: TODAY });
  assert.equal(back.ok, true);
  assert.equal(back.answers.parents[0].q4_8h, undefined, 'the previous nationality is no longer asked, so it is removed');
  assert.deepEqual(back.items.map((i) => [i.questionId, i.kind]), [['q4_8f', 'edited'], ['q4_8h', 'pruned']]);
});

test('repeating groups: adding an entry, removing one, and replacing the group are recorded as a structure change plus the answers', () => {
  const second = { q4_8a: 'father', q4_8b: 'Testfather', q4_8c: 'Testsurname', q4_8d: '1960-03-04', q4_8e: 'GB', q4_8f: true };
  const added = run([{ questionId: 'parents', value: [base().parents[0], second] }]);
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.equal(added.answers.parents.length, 2);
  assert.deepEqual(added.items.filter((i) => i.kind === 'structure').map((i) => [i.questionId, i.old, i.new]), [['parents', 1, 2]]);
  assert.equal(added.items.filter((i) => i.kind === 'edited').length, 6, 'the six answers of the new entry');
  const preview = logic.buildPreview(cfg, base(), added.answers, added.items);
  assert.equal(preview.required.length, 0, 'a new entry is not "a question that became required"');
  assert.ok(preview.changes.some((c) => c.label === 'Parent details' && c.old === '1 entry' && c.new === '2 entries'));
  assert.ok(preview.changes.some((c) => c.label === 'Parent 2: Given names' && c.old === 'New entry' && c.new === 'Testfather'));

  const viaMember = run([{ questionId: 'q4_8a', index: 1, value: 'father' }, { questionId: 'q4_8b', index: 1, value: 'Testfather' }, { questionId: 'q4_8c', index: 1, value: 'Testsurname' }, { questionId: 'q4_8d', index: 1, value: '1960-03-04' }, { questionId: 'q4_8e', index: 1, value: 'GB' }, { questionId: 'q4_8f', index: 1, value: true }]);
  assert.equal(viaMember.ok, true, JSON.stringify(viaMember));
  assert.deepEqual(viaMember.answers.parents[1], second);

  const removed = logic.evaluate({ z, cfg, existing: added.answers, parsed: logic.parseChanges(cfg, [{ questionId: 'parents', value: [added.answers.parents[0]] }]), today: TODAY });
  assert.equal(removed.ok, true);
  assert.deepEqual(removed.items.find((i) => i.kind === 'structure'), { sectionId: '4C', questionId: 'parents', kind: 'structure', old: 2, new: 1 });
  assert.equal(removed.items.filter((i) => i.kind === 'edited' && i.new === undefined).length, 6, 'the removed entry\'s answers');

  const tooFew = run([{ questionId: 'parents', value: [] }]);
  assert.equal(tooFew.ok, false);
  assert.deepEqual(tooFew.sections, [{ id: '4C', problems: 1 }]);
});

test('a rule broken in a section the request did not touch is refused; a problem that was already there is not blamed on the change', () => {
  // A stored answer that is already wrong in a section the change does not touch: the change is not blamed for it.
  const broken = { ...base(), q5_1: 'not-a-listed-option' };
  const ok = run([{ questionId: 'q2_32', value: { countryCode: '+44', number: '7700 900555' } }], broken);
  assert.equal(ok.ok, true, 'the phone number can be corrected although section 5 was already wrong');
  // ...but touching that section means it is validated as a whole, like a normal save.
  const fixed = run([{ questionId: 'q5_1', value: 'retired' }], broken);
  assert.equal(fixed.ok, true, 'correcting the section that was wrong works');
  const stillWrong = run([{ questionId: 'q5_1', value: 'not-a-listed-option-either' }], broken);
  assert.equal(stillWrong.ok, false);
  assert.deepEqual(stillWrong.sections, [{ id: '5', problems: 1 }]);
});

test('a change does not touch the Part 9 ticks: they stay exactly as they were, also when their section is edited', () => {
  const result = run([{ questionId: 'q9_1', value: true }, { questionId: 'q9_1a', value: 'Made-up details for the test' }]);
  if (result.ok === false) {
    // whichever follow-up the config asks for, the ticks are never in the list of changes
    assert.equal(result.sections.every((s) => s.id.startsWith('9')), true);
  } else {
    assert.equal(result.answers.q9_11, true);
    assert.equal(result.answers.q9_12, true);
  }
});

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

test('the preview uses the review\'s own wording for old and new values', () => {
  const result = run([{ questionId: 'q1_6', value: '2027-04-02' }, { questionId: 'q1_7', value: '2027-04-20' }, { questionId: 'q6_3', value: { amount: 2500, currency: 'GBP' } }, { questionId: 'q2_14', value: 'FR' }]);
  assert.equal(result.ok, true, JSON.stringify(result));
  const preview = logic.buildPreview(cfg, base(), result.answers, result.items);
  const by = Object.fromEntries(preview.changes.map((c) => [c.questionId, c]));
  assert.deepEqual([by.q1_6.old, by.q1_6.new], ['1 March 2027', '2 April 2027']);
  assert.deepEqual([by.q6_3.old, by.q6_3.new], ['£1,500', '£2,500']);
  assert.deepEqual([by.q2_14.old, by.q2_14.new], ['United Kingdom', 'France']);
  assert.equal(by.q1_6.sectionId, '1');
  assert.ok(by.q1_6.number && by.q1_6.label && by.q1_6.sectionTitle);
  // the same text the review shows
  const review = buildReview(cfg, result.answers, [], {});
  const row = review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows)).find((r) => r.id === 'q6_3');
  assert.equal(row.value, by.q6_3.new);
});

test('the items come out in form order whatever order the request used', () => {
  const result = run([{ questionId: 'q6_3', value: { amount: 2500, currency: 'GBP' } }, { questionId: 'q2_32', value: { countryCode: '+44', number: '7700 900555' } }, { questionId: 'q1_5', value: 'A different test trip.' }]);
  assert.deepEqual(result.items.map((i) => i.questionId), ['q1_5', 'q2_32', 'q6_3']);
});

// ---------------------------------------------------------------------------
// The "corrected by our team" marks
// ---------------------------------------------------------------------------

test('corrections: the latest time of every corrected answer; pruned answers are not marked; a group that changed size marks the group and forgets the entry marks', () => {
  const t = (n) => new Date(Date.UTC(2026, 9, n));
  const marks = logic.correctionsOf(cfg, [
    { at: t(1), changes: [{ questionId: 'q2_32', kind: 'edited' }, { questionId: 'q4_8b', index: 0, kind: 'edited' }, { questionId: 'q4_8c', index: 0, kind: 'pruned' }] },
    { at: t(2), changes: [{ questionId: 'q2_32', kind: 'edited' }] },
    { at: t(3), changes: [{ questionId: 'parents', kind: 'structure' }, { questionId: 'q4_8b', index: 1, kind: 'edited' }] },
    { at: t(4), changes: [{ questionId: 'q5_1', kind: 'pruned' }, { questionId: 'q3_1', kind: 'edited' }] },
  ]);
  assert.deepEqual(marks, { q2_32: t(2), parents: t(3), 'q4_8b[1]': t(3), q3_1: t(4) }, 'q5_1 was only removed, so it is not marked');
});

test('the review builder marks corrected rows with the date only, for plain answers, entry answers and groups, and never shows more', () => {
  const answers = base();
  const when = new Date(Date.UTC(2026, 9, 5));
  const marks = { q2_32: when, 'q4_8b[0]': when, parents: when, q9_11: when };
  const review = buildReview(cfg, answers, [], {}, marks);
  const rows = review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows));
  assert.equal(rows.find((r) => r.id === 'q2_32').correctedByTeam, '5 October 2026');
  const group = rows.find((r) => r.id === 'parents');
  assert.equal(group.correctedByTeam, '5 October 2026');
  const entryRows = group.entries[0].rows;
  assert.equal(entryRows.find((r) => r.id === 'q4_8b').correctedByTeam, '5 October 2026');
  assert.equal(entryRows.find((r) => r.id === 'q4_8c').correctedByTeam, undefined);
  assert.equal(rows.filter((r) => r.correctedByTeam).length, 3, 'the plain answer, the group and the tick (the builder marks whatever it is given a mark for)');
  // without marks nothing changes
  const plain = buildReview(cfg, answers, [], {});
  assert.equal(JSON.stringify(plain).includes('correctedByTeam'), false);
  assert.deepEqual(buildReview(cfg, answers, [], {}, {}), plain);
  assert.deepEqual(buildReview(cfg, answers, [], {}, undefined), plain);
  // a mark that is not a time is ignored
  assert.equal(JSON.stringify(buildReview(cfg, answers, [], {}, { q2_32: 'not a date' })).includes('correctedByTeam'), false);
  // the marked row holds exactly the row's usual fields and the date: no old value, no reason
  const marked = rows.find((r) => r.id === 'q2_32');
  assert.deepEqual(Object.keys(marked).sort(), ['correctedByTeam', 'id', 'kind', 'label', 'number', 'value']);
});
