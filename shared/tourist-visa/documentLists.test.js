'use strict';

// Config 1.5.0: the document lists. 22 slots in section 10D; employment (5.1) decides which employment documents are on the list,
// and marital status (2.13), dependants (4.7) and "someone else pays" (6.5) decide which on-the-list documents are needed.
// The expected side is written out by hand in backend/tests/helpers/documentSlots.js (the senior's two lists).

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('./engine');
const { buildReview } = require('./view');
const { SLOT_LIST, SLOT_IDS, shownSlots, neededSlots, answersFor } = require('../../backend/tests/helpers/documentSlots');

const { config } = engine;
const clone = (o) => JSON.parse(JSON.stringify(o));
const doc = (slot) => ({ id: `d-${slot}`, slot });
const EMPLOYMENTS = ['employed', 'self_employed', 'retired', 'student', 'homemaker', 'unemployed', 'other'];

test('the exact list: 22 slots, in this order, with these ids, numbers, labels and maximums', () => {
  const files = engine.getFileQuestions(config);
  assert.deepEqual(files.map((q) => [q.id, q.number, q.slot, q.label, q.maxFiles]), SLOT_LIST.map((s) => [s.id, s.number, s.slot, s.label, s.max]));
  assert.equal(new Set(SLOT_IDS).size, 22);
  for (const id of SLOT_IDS) assert.match(id, /^[a-z]+$/);
  for (const q of files) {
    assert.equal(q.section, '10D', q.id);
    assert.equal(q.type, 'FILE');
    assert.ok(q.help && q.help.length > 20, `${q.id} has help text`);
  }
  assert.deepEqual(engine.validateConfig(config), []);
});

test('passport and funds keep their slot ids, question ids and file limits (only the labels changed)', () => {
  const byId = Object.fromEntries(config.questions.map((q) => [q.id, q]));
  assert.deepEqual([byId.q10_6.slot, byId.q10_6.number, byId.q10_6.maxFiles], ['passport', '10.6', 3]);
  assert.deepEqual([byId.q10_7.slot, byId.q10_7.number, byId.q10_7.maxFiles], ['funds', '10.7', 10]);
  assert.equal(byId.q10_6.label, 'New passport with entry and exit stamps');
  assert.equal(byId.q10_7.label, 'Personal bank statement');
});

test('no existing question was renumbered or renamed: every question outside 10.8 to 10.27 is as it was', () => {
  const NEW = new Set(SLOT_LIST.filter((s) => !['q10_6', 'q10_7'].includes(s.id)).map((s) => s.id));
  const others = config.questions.filter((q) => !NEW.has(q.id));
  assert.ok(others.length > 100);
  assert.deepEqual([...NEW].sort(), Array.from({ length: 20 }, (_, i) => `q10_${i + 8}`).sort());
});

test('the three situations: self-employed, employed and the others see exactly the right slots, and exactly the right ones are needed', () => {
  const base = { married: false, children: false, sponsor: false };
  const wantSelf = ['hotels', 'flight', 'familyparents', 'businessreg', 'chambercard', 'taxpayer', 'funds', 'businessbank', 'property', 'passport', 'nic'];
  const wantEmployed = ['hotels', 'flight', 'familyparents', 'appointment', 'confirmation', 'noc', 'salary', 'taxpayer', 'funds', 'property', 'passport', 'nic'];
  const wantShared = ['hotels', 'flight', 'familyparents', 'taxpayer', 'funds', 'property', 'passport', 'nic'];
  assert.deepEqual(neededSlots({ ...base, employment: 'self_employed' }), wantSelf, 'the helper agrees with the written list');
  assert.deepEqual(neededSlots({ ...base, employment: 'employed' }), wantEmployed);
  for (const e of ['retired', 'student', 'homemaker', 'unemployed', 'other']) assert.deepEqual(neededSlots({ ...base, employment: e }), wantShared, e);
  assert.deepEqual(neededSlots({ ...base, employment: undefined }), wantShared, 'not answered yet: the shared documents');

  for (const employment of [...EMPLOYMENTS, undefined]) {
    const ctx = { ...base, employment };
    const answers = answersFor(ctx);
    const visible = engine.getVisibleFileQuestions(config, answers).map((q) => q.slot);
    assert.deepEqual(visible, shownSlots(ctx), `shown for ${employment}`);
    const status = engine.documentsStatus(config, [], undefined, answers);
    assert.deepEqual(status.slots.filter((s) => s.required).map((s) => s.slot), neededSlots(ctx), `needed for ${employment}`);
  }
  // how many are on the list: 14 shared, plus 3 for the self-employed (22 - 5 employed-only), plus 5 for the employed (22 - 3 self-employed-only)
  assert.equal(shownSlots({ employment: 'retired' }).length, 14, 'shared documents only');
  assert.equal(shownSlots({ employment: 'self_employed' }).length, 14 + 3);
  assert.equal(shownSlots({ employment: 'employed' }).length, 14 + 5);
});

test('every combination of employment, marital status, dependants and sponsor: the shown and needed slots match the lists, and the submit rule follows', () => {
  let cases = 0;
  for (const employment of [...EMPLOYMENTS, undefined]) {
    for (const married of [false, true]) {
      for (const children of [false, true]) {
        for (const sponsor of [false, true]) {
          const ctx = { employment, married, children, sponsor };
          const answers = answersFor(ctx);
          const status = engine.documentsStatus(config, [], undefined, answers);
          assert.deepEqual(status.slots.map((s) => s.slot), shownSlots(ctx), JSON.stringify(ctx));
          assert.deepEqual(status.slots.filter((s) => s.required).map((s) => s.slot), neededSlots(ctx), JSON.stringify(ctx));
          // exactly the needed slots with a file: complete; one needed slot short: not complete; optional slots add nothing
          const needed = neededSlots(ctx);
          assert.equal(engine.documentsComplete(config, needed.map(doc), answers), true, `complete ${JSON.stringify(ctx)}`);
          assert.equal(engine.documentsComplete(config, needed.slice(1).map(doc), answers), false, `one short ${JSON.stringify(ctx)}`);
          const optionalOnly = shownSlots(ctx).filter((s) => !needed.includes(s));
          assert.equal(engine.documentsComplete(config, optionalOnly.map(doc), answers), false, 'only optional files never complete it');
          cases += 1;
        }
      }
    }
  }
  assert.equal(cases, 8 * 8);
});

test('requiredWhen: married, children and someone else pays each turn a slot from optional to needed, and back', () => {
  const needed = (answers, slot) => engine.documentsStatus(config, [], undefined, answers).slots.find((s) => s.slot === slot).required;
  const retired = { q5_1: 'retired' };
  // married (2.13 is married or civil partnership)
  for (const [value, expected] of [['single', false], ['married', true], ['civil_partnership', true], ['unmarried_partner', false], ['separated', false], ['divorced', false], ['widowed', false]]) {
    assert.equal(needed({ ...retired, q2_13: value, q4_7: false }, 'marriage'), expected, `marriage when ${value}`);
    assert.equal(needed({ ...retired, q2_13: value, q4_7: false }, 'familyspouse'), expected, `familyspouse when ${value} and no children`);
  }
  // children (4.7 is Yes)
  for (const slot of ['formb', 'school']) {
    assert.equal(needed({ ...retired, q2_13: 'single', q4_7: true }, slot), true, `${slot} with children`);
    assert.equal(needed({ ...retired, q2_13: 'single', q4_7: false }, slot), false, `${slot} without`);
    assert.equal(needed({ ...retired, q2_13: 'married', q4_7: false }, slot), false, `${slot}: married alone does not need it`);
    assert.equal(needed({ ...retired }, slot), false, `${slot}: 4.7 not answered`);
  }
  assert.equal(needed({ ...retired, q2_13: 'single', q4_7: true }, 'familyspouse'), true, 'familyspouse: children alone');
  assert.equal(needed({ ...retired, q2_13: 'married', q4_7: true }, 'familyspouse'), true, 'familyspouse: both');
  assert.equal(needed({ ...retired, q2_13: 'single', q4_7: false }, 'familyspouse'), false, 'familyspouse: neither');
  // someone else pays (6.5): only an employed applicant has the sponsorship slot at all
  assert.equal(needed({ q5_1: 'employed', q6_5: true }, 'sponsorship'), true);
  assert.equal(needed({ q5_1: 'employed', q6_5: false }, 'sponsorship'), false);
  assert.equal(needed({ q5_1: 'employed' }, 'sponsorship'), false);
  assert.equal(engine.getVisibleFileQuestions(config, { q5_1: 'self_employed', q6_5: true }).some((q) => q.slot === 'sponsorship'), false, 'self-employed: no sponsorship slot, even with a sponsor');
  assert.equal(engine.getVisibleFileQuestions(config, { q5_1: 'retired', q6_5: true }).some((q) => q.slot === 'sponsorship'), false);
  // the slots that are always optional
  for (const slot of ['oldpassports', 'other']) assert.equal(needed({ q5_1: 'employed', q6_5: true, q2_13: 'married', q4_7: true }, slot), false, slot);
});

test('a slot that is hidden is never required, even when its requiredWhen is met', () => {
  const cfg = clone(config);
  const sponsorship = cfg.questions.find((q) => q.slot === 'sponsorship');
  assert.ok(sponsorship.showWhen && sponsorship.requiredWhen);
  const answers = { q5_1: 'retired', q6_5: true }; // someone pays, but the slot is shown only to the employed
  const status = engine.documentsStatus(cfg, [], undefined, answers);
  assert.equal(status.slots.some((s) => s.slot === 'sponsorship'), false);
  assert.equal(engine.documentsComplete(cfg, neededSlots({ employment: 'retired', sponsor: true }).map(doc), answers), true);
});

test('requiredWhen: switching the answer and back changes the slot from needed to optional and back, and the files stay counted', () => {
  const files = [...neededSlots({ employment: 'retired' }), 'marriage'].map(doc);
  const single = answersFor({ employment: 'retired', married: false });
  const married = answersFor({ employment: 'retired', married: true });
  assert.equal(engine.documentsComplete(config, files, single), true, 'an optional slot with a file is fine');
  assert.equal(engine.documentsComplete(config, files, married), false, 'married: familyspouse is now needed too');
  assert.equal(engine.documentsComplete(config, [...files, doc('familyspouse')], married), true);
  assert.equal(engine.documentsComplete(config, [...files, doc('familyspouse')], single), true, 'and back: nothing is lost');
  assert.deepEqual(engine.getOrphanDocuments(config, [...files, doc('familyspouse')], married), []);
});

test('switching 5.1 after uploading: the employment files become files from a different list, never block, and come back when 5.1 does', () => {
  const employed = answersFor({ employment: 'employed' });
  const selfEmployed = answersFor({ employment: 'self_employed' });
  const files = neededSlots({ employment: 'employed' }).map(doc);
  assert.equal(engine.documentsComplete(config, files, employed), true);
  assert.deepEqual(engine.getOrphanDocuments(config, files, employed), []);

  // employed -> self-employed: appointment, confirmation, noc and salary are no longer on the list
  assert.deepEqual(engine.getOrphanDocuments(config, files, selfEmployed).map((d) => d.slot), ['appointment', 'confirmation', 'noc', 'salary']);
  assert.equal(engine.documentsComplete(config, files, selfEmployed), false, 'the business documents are now needed');
  const withBusiness = [...files, ...['businessreg', 'chambercard', 'businessbank'].map(doc)];
  assert.equal(engine.documentsComplete(config, withBusiness, selfEmployed), true, 'the orphans do not block');

  // employed -> retired
  assert.equal(engine.documentsComplete(config, files, answersFor({ employment: 'retired' })), true);
  assert.deepEqual(engine.getOrphanDocuments(config, files, answersFor({ employment: 'retired' })).map((d) => d.slot), ['appointment', 'confirmation', 'noc', 'salary']);
  // and back to employed: they are on the list again
  assert.deepEqual(engine.getOrphanDocuments(config, files, employed), []);
});

test('validateConfig: requiredWhen needs required: false, a valid rule that refers to an earlier question, and is only for FILE questions', () => {
  const bad = (mutate, pattern, name) => {
    const c = clone(config);
    mutate(c);
    assert.ok(engine.validateConfig(c).some((p) => pattern.test(p)), `${name}: ${JSON.stringify(engine.validateConfig(c))}`);
  };
  const marriage = (c) => c.questions.find((q) => q.slot === 'marriage');
  bad((c) => { marriage(c).required = true; }, /requiredWhen must have required: false/, 'required: true with requiredWhen');
  bad((c) => { marriage(c).requiredWhen = { q: 'q99_9', eq: true }; }, /requiredWhen/, 'unknown question');
  bad((c) => { marriage(c).requiredWhen = { q: 'q10_27', eq: true }; }, /requiredWhen/, 'a later question');
  bad((c) => { marriage(c).requiredWhen = { eq: true }; }, /requiredWhen/, 'no question');
  bad((c) => { c.questions.find((q) => q.id === 'q5_1').requiredWhen = { q: 'q2_13', eq: 'married' }; }, /only for FILE questions/, 'on another type');
  const ok = clone(config);
  marriage(ok).requiredWhen = { all: [{ q: 'q2_13', in: ['married'] }, { not: { q: 'q4_7', eq: true } }] };
  assert.deepEqual(engine.validateConfig(ok), []);
});

test('the review: files under each visible slot in the config order; an empty optional slot says "Not answered", an empty needed one "No files uploaded"', () => {
  const ctx = { employment: 'employed', married: true, children: false, sponsor: false };
  const answers = answersFor(ctx);
  const files = [{ slot: 'hotels', name: 'london.pdf', size: 1000 }, { slot: 'salary', name: 'jan.pdf', size: 2000 }, { slot: 'businessreg', name: 'hidden.pdf', size: 3000 }];
  const section = buildReview(config, answers, files, {}).parts.flatMap((p) => p.sections).find((s) => s.id === '10D');
  assert.deepEqual(section.rows.map((r) => r.id), SLOT_LIST.filter((s) => shownSlots(ctx).includes(s.slot)).map((s) => s.id), 'visible slots only, in order');
  const row = (slot) => section.rows.find((r) => r.id === SLOT_LIST.find((s) => s.slot === slot).id);
  assert.deepEqual(row('hotels').files.map((f) => f.name), ['london.pdf']);
  assert.equal(row('hotels').value, '1 file');
  assert.equal(row('flight').value, 'No files uploaded');
  assert.equal(row('flight').optional, undefined);
  assert.equal(row('marriage').value, 'No files uploaded', 'married: needed');
  assert.equal(row('oldpassports').value, 'Not answered');
  assert.equal(row('oldpassports').optional, true);
  assert.equal(row('formb').value, 'Not answered', 'no children: optional');
  assert.equal(row('formb').optional, true);
  assert.equal(JSON.stringify(section).includes('hidden.pdf'), false, 'a file of a hidden slot is not printed');
  // children flips the same slot to needed
  const withChildren = buildReview(config, answersFor({ ...ctx, children: true }), files, {}).parts.flatMap((p) => p.sections).find((s) => s.id === '10D');
  const formb = withChildren.rows.find((r) => r.id === 'q10_13');
  assert.equal(formb.value, 'No files uploaded');
  assert.equal(formb.optional, undefined);
});
