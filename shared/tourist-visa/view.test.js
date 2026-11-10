'use strict';

// Tests for the review builder (shared/tourist-visa/view.js). Made-up answers only.
// Run with: npm run test:shared

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('./engine');
const view = require('./view');

const { config } = engine;
const { buildReview } = view;

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
};

const sectionOf = (review, id) => review.parts.flatMap((p) => p.sections).find((s) => s.id === id);
const rowOf = (review, sectionId, rowId) => sectionOf(review, sectionId).rows.find((r) => r.id === rowId);
const allRows = (review) => review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows));
const flatten = (rows) => rows.flatMap((r) => [r, ...(r.entries || []).flatMap((e) => flatten(e.rows))]);

const SINGLE = { q2_13: 'single' };

test('parts and sections come in form order, with only the ones that apply', () => {
  const review = buildReview(config, SINGLE, [], {});
  assert.deepEqual(review.parts.map((p) => p.id), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  const sections = review.parts.flatMap((p) => p.sections.map((s) => s.id));
  assert.deepEqual(sections, ['1', '2A', '2B', '2C', '2D', '3', '4B', '4C', '5', '6A', '6B', '6C', '6D', '7', '8', '9A', '9B', '9C', '10A', '10B', '10C', '10D'], '4A is left out without a partner');
  assert.equal(review.parts[0].title, 'Travel information');

  const married = buildReview(config, { q2_13: 'married' }, [], {});
  assert.ok(married.parts.flatMap((p) => p.sections.map((s) => s.id)).includes('4A'));
  assert.deepEqual(buildReview(config, undefined, undefined, undefined).parts.length, 10, 'nothing given: every section that always applies');
});

test('questions that are hidden by an answer are left out, and appear when the answer opens them', () => {
  const ids = (answers) => sectionOf(buildReview(config, answers, [], {}), '2B').rows.map((r) => r.id);
  assert.equal(ids({ q2_18: false }).includes('q2_19'), false, 'the ID card number is hidden when there is no ID card');
  assert.equal(ids({ q2_18: true, q2_19: 'FAKE-ID-0001' }).includes('q2_19'), true);
  // A hidden answer that is still stored does not show.
  assert.equal(ids({ q2_18: false, q2_19: 'FAKE-ID-0001' }).includes('q2_19'), false);
});

test('option labels, not codes: a dropdown, a country and a tick list', () => {
  const review = buildReview(config, { q1_1: 'tourism', q2_14: 'GB', q2_35: ['call', 'messaging_app'] }, [], {});
  assert.equal(rowOf(review, '1', 'q1_1').value, 'Tourism or holiday');
  assert.equal(rowOf(review, '2B', 'q2_14').value, engine.getCountries().find((c) => c.code === 'GB').name);
  const contact = rowOf(review, '2D', 'q2_35');
  assert.deepEqual(contact.items, ['Telephone call', 'Messaging app, for example WhatsApp']);
  assert.equal(contact.value, 'Telephone call; Messaging app, for example WhatsApp');
  // A value that is no longer an option is shown as it is, never lost.
  assert.equal(rowOf(buildReview(config, { q1_1: 'old_value' }, [], {}), '1', 'q1_1').value, 'old_value');
});

test('dates, months, amounts, durations, addresses and telephone numbers are written out', () => {
  const review = buildReview(config, {
    q1_6: '2027-03-01', q1_7: '2027-12-25',
    q5_1: 'employed', q5_2: '2019-04',
    q6_3: { amount: 1500, currency: 'GBP' }, q6_4: { amount: 1234.5, currency: 'GBP' },
    q2_27: { years: 2, months: 3 },
    q2_24: { line1: '1 Test Street', line2: 'Flat 2', town: 'Testville', postcode: 'TE1 1ST', country: 'GB' },
    q2_32: { countryCode: '+44', number: '7700 900123' },
  }, [], {});
  assert.equal(rowOf(review, '1', 'q1_6').value, '1 March 2027');
  assert.equal(rowOf(review, '1', 'q1_7').value, '25 December 2027');
  assert.equal(rowOf(review, '5', 'q5_2').value, 'April 2019');
  assert.equal(rowOf(review, '6A', 'q6_3').value, '£1,500');
  assert.equal(rowOf(review, '6A', 'q6_4').value, '£1,234.50');
  assert.equal(rowOf(review, '2C', 'q2_27').value, '2 years, 3 months');
  assert.equal(rowOf(review, '2C', 'q2_24').value, `1 Test Street, Flat 2, Testville, TE1 1ST, ${engine.getCountries().find((c) => c.code === 'GB').name}`);
  assert.equal(rowOf(review, '2D', 'q2_32').value, '+44 7700 900123');
});

test('the helpers: dates, amounts, durations and sizes', () => {
  assert.equal(view.formatDate('2026-01-09'), '9 January 2026');
  assert.equal(view.formatDate('not a date'), 'not a date');
  assert.equal(view.formatDate('2026-13-01'), '2026-13-01');
  assert.equal(view.formatMonth('2026-12'), 'December 2026');
  assert.equal(view.formatMoment(new Date('2026-11-01T23:30:00Z')), '1 November 2026');
  assert.equal(view.formatMoment('2026-11-01T10:00:00.000Z'), '1 November 2026');
  assert.equal(view.formatMoment('nonsense'), '');
  assert.equal(view.formatAmount({ amount: 1000000, currency: 'GBP' }), '£1,000,000');
  assert.equal(view.formatAmount({ amount: 12.5, currency: 'EUR' }), '12.50 EUR');
  assert.equal(view.formatAmount({ amount: 0, currency: 'GBP' }), '£0');
  assert.equal(view.formatDuration({ weeks: 1 }), '1 week');
  assert.equal(view.formatDuration({ days: 10 }), '10 days');
  assert.equal(view.formatDuration({ years: 1, months: 1 }), '1 year, 1 month');
  assert.equal(view.formatSize(0), '0 bytes');
  assert.equal(view.formatSize(1), '1 byte');
  assert.equal(view.formatSize(1536), '1.5 KB');
  assert.equal(view.formatSize(4 * 1024 * 1024), '4 MB');
  assert.equal(view.formatSize(-1), '');
});

test('Yes and No, and a question that has no answer says so', () => {
  const review = buildReview(config, { q1_2: true, q1_3: false }, [], {});
  assert.equal(rowOf(review, '1', 'q1_2').value, 'Yes');
  assert.equal(rowOf(review, '1', 'q1_3').value, 'No', 'a No is an answer');
  const blank = rowOf(buildReview(config, {}, [], {}), '1', 'q1_5');
  assert.equal(blank.value, 'Not answered');
  assert.equal(blank.empty, true);
  assert.equal(rowOf(review, '1', 'q1_2').empty, undefined);
});

test('a repeating group lists its entries as numbered items, with only the questions that apply to each entry', () => {
  const answers = {
    q1_3: true,
    companions: [
      { q1_3a: 'friend', q1_3b: 'Testy', q1_3c: 'Person' },
      { q1_3a: 'relative', q1_3b: 'Second', q1_3c: 'Person', q1_3d: '1990-05-17' },
    ],
  };
  const group = rowOf(buildReview(config, answers, [], {}), '1', 'companions');
  assert.equal(group.kind, 'group');
  assert.equal(group.label, 'Travelling companion details');
  assert.equal(group.value, '2 entries');
  assert.deepEqual(group.entries.map((e) => e.title), ['Travelling companion 1', 'Travelling companion 2']);
  assert.equal(group.entries[0].rows.find((r) => r.id === 'q1_3b').value, 'Testy');
  assert.equal(group.entries[1].rows.find((r) => r.id === 'q1_3d').value, '17 May 1990');
  assert.equal(group.entries[0].rows.find((r) => r.id === 'q1_3a').value, 'Friend');
  // The group follows its Yes/No, and is left out when the answer is No.
  const closed = sectionOf(buildReview(config, { q1_3: false, companions: answers.companions }, [], {}), '1');
  assert.equal(closed.rows.some((r) => r.id === 'companions'), false);
  // Open but empty.
  assert.equal(rowOf(buildReview(config, { q1_3: true }, [], {}), '1', 'companions').value, 'No entries');
});

test('a group entry keeps its own conditions: a follow-up that does not apply to an entry is not shown for it', () => {
  const answers = {
    q4_8: true,
    parents: [
      { q4_8a: 'mother', q4_8b: 'Testmother', q4_8c: 'Testsurname', q4_8d: '1962-01-02', q4_8e: 'GB', q4_8f: true },
      { q4_8a: 'father', q4_8b: 'Testfather', q4_8c: 'Testsurname', q4_8d: '1960-03-04', q4_8e: 'GB', q4_8f: false, q4_8h: 'PK', q4_8i: '1990-06' },
    ],
  };
  const parents = rowOf(buildReview(config, answers, [], {}), '4C', 'parents');
  const idsOf = (entry) => entry.rows.map((r) => r.id);
  assert.equal(idsOf(parents.entries[0]).includes('q4_8h'), false, 'the first parent always had the same nationality');
  assert.equal(idsOf(parents.entries[1]).includes('q4_8h'), true, 'the second parent changed nationality');
  assert.equal(parents.entries[1].rows.find((r) => r.id === 'q4_8i').value, 'June 1990');
  assert.equal(parents.entries[1].rows.find((r) => r.id === 'q4_8a').value, 'Father');
});

test('files show a name and a size and nothing else, whatever else the files carry', () => {
  const documents = [
    { id: 'abc', slot: 'passport', name: 'scan.pdf', size: 2000, publicId: 'tourist-visa/x/secret.pdf', resourceType: 'raw', url: 'https://example.invalid/secret', mime: 'application/pdf' },
    { slot: 'funds', name: 'bank.png', size: 4 * 1024 * 1024 },
    { slot: 'funds', name: 'statement.jpg', size: 900 },
  ];
  const review = buildReview(config, SINGLE, documents, {});
  const passport = rowOf(review, '10D', 'q10_6');
  assert.equal(passport.kind, 'files');
  assert.deepEqual(passport.files, [{ name: 'scan.pdf', size: 2000, sizeText: '2 KB' }]);
  assert.equal(passport.value, '1 file');
  const funds = rowOf(review, '10D', 'q10_7');
  assert.deepEqual(funds.files.map((f) => [f.name, f.sizeText]), [['bank.png', '4 MB'], ['statement.jpg', '900 bytes']]);
  assert.equal(funds.value, '2 files');
  const text = JSON.stringify(review);
  for (const needle of ['secret', 'publicId', 'resourceType', 'https://', 'tourist-visa/', 'example.invalid', 'application/pdf', '"id":"abc"']) assert.equal(text.includes(needle), false, needle);
  const none = rowOf(buildReview(config, SINGLE, [], {}), '10D', 'q10_6');
  assert.deepEqual([none.value, none.empty, none.files], ['No files uploaded', true, []]);
});

test('declaration ticks: confirmed with the date it was given, or not confirmed', () => {
  const declarations = { q9_11: { acceptedAt: new Date('2026-11-01T10:00:00Z') }, q9_12: { acceptedAt: '2026-11-02T10:00:00.000Z' } };
  const review = buildReview(config, { q9_11: true, q9_12: true, q9_13: false }, [], declarations);
  assert.deepEqual([rowOf(review, '9A', 'q9_11').value, rowOf(review, '9A', 'q9_11').note], ['Confirmed', 'Confirmed on 1 November 2026']);
  assert.equal(rowOf(review, '9A', 'q9_12').note, 'Confirmed on 2 November 2026');
  const notGiven = rowOf(review, '9B', 'q9_13');
  assert.deepEqual([notGiven.value, notGiven.empty], ['Not confirmed', true]);
  assert.equal(rowOf(buildReview(config, { q9_11: true }, [], {}), '9A', 'q9_11').note, undefined, 'no record, no date');
});

test('a sensitive answer given as plain text is shown as it is (decrypting happens before the builder)', () => {
  const answers = { q3_1: 'FAKE-PASSPORT-9876', q10_1: ['conviction'], q10_1a: 'Made-up details of what happened.', q10_5: true, q10_5a: 'AB123456C', q9_1: true, q9_1a: 'More made-up details.' };
  const review = buildReview(config, answers, [], {});
  assert.equal(rowOf(review, '3', 'q3_1').value, 'FAKE-PASSPORT-9876');
  assert.equal(rowOf(review, '10A', 'q10_1a').value, 'Made-up details of what happened.');
  assert.deepEqual(rowOf(review, '10A', 'q10_1').items, ['A criminal conviction']);
  assert.equal(rowOf(review, '10C', 'q10_5a').value, 'AB123456C');
  assert.equal(rowOf(review, '9A', 'q9_1a').value, 'More made-up details.');
  // Ciphertext is not something the builder should ever be given: it would be shown as text, so the caller must decrypt.
  assert.equal(config.questions.find((q) => q.id === 'q3_1').sensitive, true);
});

test('with nothing answered, every row of a section that applies says so, and nothing is invented', () => {
  const review = buildReview(config, {}, [], {});
  const rows = flatten(allRows(review));
  assert.ok(rows.length > 40);
  for (const row of rows.filter((r) => r.kind === 'value')) assert.equal(row.empty, true, `${row.id} ${row.value}`);
  for (const row of rows) assert.ok(typeof row.value === 'string' && row.value.length > 0, row.id);
});

test('the builder reads and never changes what it is given', () => {
  const answers = deepFreeze({ q1_1: 'tourism', q1_3: true, companions: [{ q1_3a: 'friend', q1_3b: 'A', q1_3c: 'B' }], q2_35: ['call'] });
  const documents = deepFreeze([{ slot: 'passport', name: 'scan.pdf', size: 10 }]);
  const declarations = deepFreeze({ q9_11: { acceptedAt: '2026-11-01T10:00:00.000Z' } });
  assert.doesNotThrow(() => buildReview(config, answers, documents, declarations));
  const again = buildReview(config, answers, documents, declarations);
  assert.deepEqual(again, buildReview(config, answers, documents, declarations), 'the same input gives the same review');
});

test('a full application renders every part without a gap or a leftover code', () => {
  const FULL = {
    q1_1: 'tourism', q1_2: false, q1_3: false, q1_4: 'holiday', q1_5: 'Test trip.', q1_6: '2027-03-01', q1_7: '2027-03-15',
    q2_1: 'Testfirst', q2_2: 'Testlast', q2_3: false, q2_4: 'test@example.com', q2_5: 'me', q2_6: false,
    q2_12: 'female', q2_13: 'married', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville', q2_17: '1990-01-01', q2_18: false, q2_23: false,
    q2_24: { line1: '1 Test Street', town: 'Testville', country: 'GB' }, q2_25: true, q2_27: { years: 2, months: 3 }, q2_28: 'owned', q2_30: false, q2_31: false,
    q2_32: { countryCode: '+44', number: '7700 900123' }, q2_33: 'in_uk', q2_34: 'mobile', q2_35: ['call'],
    q3_1: 'FAKE-PASSPORT-9876', q3_2: 'Test Passport Office', q3_3: '2022-05-01', q3_4: '2032-05-01',
    q4_7: false, q4_8: false, q5_1: 'retired', q6_1: 'none', q6_3: { amount: 1500, currency: 'GBP' }, q6_4: { amount: 900, currency: 'GBP' }, q6_5: false, q6_6: false, q6_7: false, q6_7x: 'not_decided', q6_8: false,
    q7_1: false, q7_3: false, q7_4: false, q7_6: false, q7_7: false, q8_1: 0, q8_2: false,
    q9_11: true, q9_1: false, q9_12: true, q9_2: false, q9_13: true, q9_3: false, q9_4: false, q9_5: false, q9_14: true, q9_6: false, q9_7: false, q9_8: false, q9_9: false, q9_10: false,
    q10_1: ['none'], q10_4: 'english', q10_5: false,
  };
  const review = buildReview(config, FULL, [{ slot: 'passport', name: 'p.pdf', size: 100 }, { slot: 'funds', name: 'f.pdf', size: 100 }], {});
  assert.equal(review.parts.length, 10);
  for (const row of flatten(allRows(review))) {
    assert.equal(/\[object|undefined|NaN|null/.test(row.value), false, `${row.id}: ${row.value}`);
    if (row.kind === 'value' && row.items) assert.ok(row.items.every((i) => !/^[a-z_]+$/.test(i)), `${row.id} still shows codes`);
  }
  assert.ok(sectionOf(review, '4A'), 'married: the partner section is in');
  assert.equal(rowOf(review, '10D', 'q10_6').files.length, 1);
});

// ---------------------------------------------------------------------------
// Step 8f: the "corrected by our team" marker and the one-value formatter
// ---------------------------------------------------------------------------

test('corrections: a corrected row carries the date in words and nothing else is added to it', () => {
  const answers = { q2_13: 'single', q2_32: { countryCode: '+44', number: '7700 900123' }, q4_8: true, parents: [{ q4_8a: 'mother', q4_8b: 'Testmother', q4_8c: 'Testsurname' }, { q4_8a: 'father', q4_8b: 'Testfather' }] };
  const plain = buildReview(config, answers, [], {});
  const when = new Date(Date.UTC(2026, 9, 5, 23, 30));
  const marked = buildReview(config, answers, [], {}, { q2_32: when, 'q4_8b[1]': '2027-03-01T10:00:00.000Z', parents: when });
  const phone = rowOf(marked, '2D', 'q2_32');
  assert.equal(phone.correctedByTeam, '5 October 2026');
  assert.deepEqual({ ...phone, correctedByTeam: undefined }, { ...rowOf(plain, '2D', 'q2_32'), correctedByTeam: undefined }, 'the row is otherwise the same');
  assert.deepEqual(Object.keys(phone).sort(), [...Object.keys(rowOf(plain, '2D', 'q2_32')), 'correctedByTeam'].sort());
  const group = rowOf(marked, '4C', 'parents');
  assert.equal(group.correctedByTeam, '5 October 2026', 'a group as a whole');
  assert.equal(group.entries[1].rows.find((r) => r.id === 'q4_8b').correctedByTeam, '1 March 2027', 'one answer of one entry, given as text');
  assert.equal(group.entries[0].rows.find((r) => r.id === 'q4_8b').correctedByTeam, undefined, 'the same question in another entry is not marked');
  assert.equal(JSON.stringify(plain).includes('correctedByTeam'), false);
});

test('corrections: no marks, empty marks, marks for other things and marks that are not times change nothing', () => {
  const answers = { q2_13: 'single', q1_1: 'tourism' };
  const plain = buildReview(config, answers, [], {});
  for (const corrections of [undefined, null, {}, { nope: new Date() }, { q1_1: 'not a date' }, { q1_1: undefined }, 'x', []]) {
    assert.deepEqual(buildReview(config, answers, [], {}, corrections), plain, JSON.stringify(corrections));
  }
});

test('corrections: a mark on a question that is hidden shows nothing, and the builder never reads a mark as an answer', () => {
  const review = buildReview(config, { q2_18: false, q2_19: 'FAKE-ID-0001' }, [], {}, { q2_19: new Date() });
  assert.equal(sectionOf(review, '2B').rows.some((r) => r.id === 'q2_19'), false);
  const frozen = deepFreeze({ q1_1: new Date(Date.UTC(2026, 0, 2)) });
  assert.equal(rowOf(buildReview(config, { q1_1: 'tourism' }, [], {}, frozen), '1', 'q1_1').correctedByTeam, '2 January 2026', 'the marks are only read');
});

test('correctionKey: the question id, with the entry number in brackets for an answer inside a group entry', () => {
  assert.equal(view.correctionKey('q2_32'), 'q2_32');
  assert.equal(view.correctionKey('q4_8b', 0), 'q4_8b[0]');
  assert.equal(view.correctionKey('q4_8b', 12), 'q4_8b[12]');
  assert.equal(view.correctionKey('parents', null), 'parents');
  assert.equal(view.correctionKey('parents', undefined), 'parents');
});

test('describeValue: one stored value in the words the review uses, or "Not answered"', () => {
  const q = (id) => engine.getQuestion(config, id);
  assert.equal(view.describeValue(config, q('q1_6'), '2027-03-01', {}), '1 March 2027');
  assert.equal(view.describeValue(config, q('q2_32'), { countryCode: '+44', number: '7700 900123' }, {}), '+44 7700 900123');
  assert.equal(view.describeValue(config, q('q6_3'), { amount: 1500, currency: 'GBP' }, {}), '£1,500');
  assert.equal(view.describeValue(config, q('q1_1'), 'tourism', {}), 'Tourism or holiday');
  assert.equal(view.describeValue(config, q('q2_3'), true, {}), 'Yes');
  assert.equal(view.describeValue(config, q('q2_3'), false, {}), 'No');
  assert.equal(view.describeValue(config, q('q2_1'), 'Name', {}), 'Name');
  for (const empty of [undefined, null, '', '   ', []]) assert.equal(view.describeValue(config, q('q2_1'), empty, {}), 'Not answered');
  assert.equal(view.describeValue(config, q('q9_11'), true, {}), 'Confirmed');
  assert.equal(view.describeValue(config, q('q9_11'), undefined, {}), 'Not confirmed');
  // an option list made from other answers, and a value in an entry
  assert.equal(view.describeValue(config, q('q2_9'), 'a@example.com', { q2_4: 'a@example.com' }), 'a@example.com');
  assert.equal(view.describeValue(config, q('q4_8a'), 'mother', { q4_8: true, parents: [{ q4_8a: 'mother' }] }, { q4_8a: 'mother' }), engine.resolveOptions(config, 'q4_8a', { q4_8: true }, {}).find((o) => o.value === 'mother').label);
});

test('the copies in the client and the backend are the same as the shared source (the drift check)', () => {
  const root = path.join(__dirname, '..', '..');
  for (const name of ['view.js', 'view.d.ts', 'engine.js', 'engine.d.ts', 'questions.json']) {
    const source = fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/\r\n/g, '\n');
    for (const target of [path.join(root, 'client', 'src', 'shared', 'tourist-visa'), path.join(root, 'backend', 'shared', 'tourist-visa')]) {
      assert.equal(fs.readFileSync(path.join(target, name), 'utf8').replace(/\r\n/g, '\n'), source, `${path.relative(root, path.join(target, name))} has drifted`);
    }
  }
  const { check } = require('../../scripts/sync-shared');
  assert.deepEqual(check(), [], 'the sync script finds nothing to fix, and every copy has the view files');
});

test('declarations.submit: the config has the final wording, and its hash input is the text alone', () => {
  assert.ok(config.declarations.submit.text.length > 50);
  assert.equal(engine.wordingOf(config, 'declarations.submit'), config.declarations.submit.text.replace(/\s+/g, ' ').trim());
  assert.equal(engine.wordingOf(config, 'declarations.nope'), '');
  const broken = JSON.parse(JSON.stringify(config));
  delete broken.declarations.submit;
  assert.ok(engine.validateConfig(broken).some((p) => /declarations\.submit is required/.test(p)));
});
