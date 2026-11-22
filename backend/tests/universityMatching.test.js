// University Finder matching. Pure functions: no database, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, matchUniversities } = require('../services/universityMatching');
const { STARTER_UNIVERSITIES } = require('../services/universityStarterData');
const { createUniversitySchema, importUniversitiesSchema, matchSchema } = require('../validations/universityValidation');

const uni = (extra = {}) => ({ name: 'Test Uni', country: 'Canada', isActive: true, minFscPercent: 70, minIelts: 6.5, minToefl: 90, ...extra });

test('eligible when FSc and an English test both pass', () => {
  const r = evaluate(uni(), { fscPercent: 75, tests: { ielts: 6.5 } });
  assert.equal(r.status, 'eligible');
  assert.equal(r.options.withoutScholarship, true);
  assert.equal(r.options.withScholarship, false);
});

test('any accepted test is enough (TOEFL instead of IELTS)', () => {
  assert.equal(evaluate(uni(), { fscPercent: 75, tests: { toefl: 95 } }).status, 'eligible');
});

test('no English test yet -> needs_test, not eligible', () => {
  const r = evaluate(uni(), { fscPercent: 75, tests: {} });
  assert.equal(r.status, 'needs_test');
  assert.equal(r.options.withoutScholarship, false);
  assert.match(r.reasons[0], /English test needed/);
});

test('FSc a little short -> close; a lot short -> not_eligible', () => {
  assert.equal(evaluate(uni(), { fscPercent: 66, tests: { ielts: 7 } }).status, 'close');
  assert.equal(evaluate(uni(), { fscPercent: 55, tests: { ielts: 7 } }).status, 'not_eligible');
});

test('English a little short with FSc a little short is close, far short is not', () => {
  assert.equal(evaluate(uni({ minFscPercent: 70 }), { fscPercent: 66, tests: { ielts: 6.0 } }).status, 'close');
  assert.equal(evaluate(uni({ minFscPercent: 70 }), { fscPercent: 66, tests: { ielts: 5.0 } }).status, 'not_eligible');
});

test('no requirement set means no requirement', () => {
  const r = evaluate({ name: 'Open Uni', country: 'X' }, { fscPercent: 40, tests: {} });
  assert.equal(r.status, 'eligible');
});

test('scholarship: qualifies, does not qualify, and needs IELTS', () => {
  const s = uni({ scholarshipAvailable: true, scholarshipPercent: 50, scholarshipMinFscPercent: 85, scholarshipMinIelts: 7 });
  assert.equal(evaluate(s, { fscPercent: 90, tests: { ielts: 7 } }).options.withScholarship, true);
  assert.equal(evaluate(s, { fscPercent: 75, tests: { ielts: 7 } }).options.withScholarship, false);
  assert.equal(evaluate(s, { fscPercent: 75, tests: { ielts: 7 } }).options.withoutScholarship, true);
  const noIelts = evaluate(s, { fscPercent: 90, tests: { toefl: 100 } });
  assert.equal(noIelts.scholarship.qualifies, false);
  assert.equal(noIelts.scholarship.needsIelts, true);
});

test('country and field filters; inactive universities are skipped', () => {
  const list = [uni({ name: 'A', country: 'Canada' }), uni({ name: 'B', country: 'Italy' }), uni({ name: 'C', isActive: false }), uni({ name: 'D', fields: ['Engineering'] })];
  const student = { fscPercent: 90, tests: { ielts: 7 } };
  assert.deepEqual(matchUniversities(list, { ...student, country: 'canada' }).map((r) => r.university.name), ['A', 'D']);
  assert.deepEqual(matchUniversities(list, { ...student, field: 'Business' }).map((r) => r.university.name), ['A', 'B']);
});

test('results: eligible first, with-scholarship first, not_eligible only when asked', () => {
  const list = [uni({ name: 'Plain' }), uni({ name: 'Schol', scholarshipAvailable: true }), uni({ name: 'High', minFscPercent: 99 })];
  const student = { fscPercent: 80, tests: { ielts: 7 } };
  assert.deepEqual(matchUniversities(list, student).map((r) => r.university.name), ['Schol', 'Plain']);
  assert.equal(matchUniversities(list, student, { includeNotEligible: true }).length, 3);
});

test('starter list is well formed and passes the same validation as a form', () => {
  assert.ok(STARTER_UNIVERSITIES.length >= 25);
  for (const row of STARTER_UNIVERSITIES) {
    assert.ok(createUniversitySchema.safeParse({ body: row }).success, row.name);
    assert.equal(row.needsVerification, true);
    assert.equal(row.scholarshipAvailable, undefined);
  }
});

test('validation: spreadsheet-style text becomes numbers, flags and lists', () => {
  const parsed = createUniversitySchema.parse({ body: { name: ' X ', country: 'UK', minFscPercent: '70', minIelts: '', scholarshipAvailable: 'Yes', applyDocuments: 'Passport; Transcript\nCV' } }).body;
  assert.equal(parsed.name, 'X');
  assert.equal(parsed.minFscPercent, 70);
  assert.equal(parsed.minIelts, null);
  assert.equal(parsed.scholarshipAvailable, true);
  assert.deepEqual(parsed.applyDocuments, ['Passport', 'Transcript', 'CV']);
  assert.equal(importUniversitiesSchema.safeParse({ body: { rows: [] } }).success, false);
  assert.equal(createUniversitySchema.safeParse({ body: { name: 'X', country: 'UK', minFscPercent: 'abc' } }).success, false);
});

test('match input: FSc 0-100, empty scores become null', () => {
  assert.equal(matchSchema.safeParse({ body: { fscPercent: 120 } }).success, false);
  const ok = matchSchema.parse({ body: { fscPercent: '78.5', tests: { ielts: '6.5', toefl: '' } } }).body;
  assert.equal(ok.fscPercent, 78.5);
  assert.equal(ok.tests.ielts, 6.5);
  assert.equal(ok.tests.toefl, null);
});

test('world-list universities are never called eligible and only show when asked', () => {
  const list = [uni({ name: 'Real' }), { name: 'World U', country: 'Canada', isActive: true, requirementsUnknown: true }];
  const student = { fscPercent: 95, tests: { ielts: 8 } };
  assert.deepEqual(matchUniversities(list, student).map((r) => r.university.name), ['Real']);
  const all = matchUniversities(list, student, { includeUnknown: true });
  assert.deepEqual(all.map((r) => [r.university.name, r.status]), [['Real', 'eligible'], ['World U', 'check_official']]);
  assert.equal(all[1].options.withoutScholarship, false);
});

test('world list mapping: keeps good rows, drops bad and duplicate ones, accepts only http(s) links', () => {
  const { mapWorldList } = require('../services/worldUniversitySource');
  const rows = mapWorldList([
    { name: ' Alpha University ', country: 'Peru', web_pages: ['https://alpha.pe/'], 'state-province': 'Lima' },
    { name: 'alpha university', country: 'peru', web_pages: [] },
    { name: 'Beta', country: 'Chile', web_pages: ['javascript:alert(1)'] },
    { name: '', country: 'X' },
    null,
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Alpha University');
  assert.equal(rows[0].city, 'Lima');
  assert.equal(rows[0].website, 'https://alpha.pe/');
  assert.equal(rows[1].website, '');
  assert.ok(rows.every((r) => r.requirementsUnknown === true));
  assert.equal(createUniversitySchema.safeParse({ body: rows[0] }).success, true);
});

test('world list is downloaded once and kept; a failed download gives a plain message', async () => {
  const source = require('../services/worldUniversitySource');
  let calls = 0;
  const body = JSON.stringify([{ name: 'Gamma', country: 'Peru', web_pages: ['https://g.pe'] }]);
  source._state.cache = null;
  source._state.fetchImpl = async () => { calls += 1; return { ok: true, headers: { get: () => null }, text: async () => body }; };
  assert.equal((await source.getWorldRows()).length, 1);
  await source.getWorldRows();
  assert.equal(calls, 1);
  source._state.cache = null;
  source._state.fetchImpl = async () => ({ ok: false });
  await assert.rejects(source.getWorldRows(), /could not be downloaded/);
  source._state.fetchImpl = (...a) => globalThis.fetch(...a);
});

test('links must be http(s): javascript: and data: links are refused', () => {
  const base = { name: 'X', country: 'UK' };
  for (const field of ['website', 'applyUrl', 'scholarshipUrl']) {
    assert.equal(createUniversitySchema.safeParse({ body: { ...base, [field]: 'javascript:alert(1)' } }).success, false, field);
    assert.equal(createUniversitySchema.safeParse({ body: { ...base, [field]: 'data:text/html,hi' } }).success, false, field);
    assert.equal(createUniversitySchema.safeParse({ body: { ...base, [field]: 'not a link' } }).success, false, field);
    assert.equal(createUniversitySchema.safeParse({ body: { ...base, [field]: 'https://ok.edu/x' } }).success, true, field);
    assert.equal(createUniversitySchema.safeParse({ body: { ...base, [field]: '' } }).success, true, field);
  }
});
