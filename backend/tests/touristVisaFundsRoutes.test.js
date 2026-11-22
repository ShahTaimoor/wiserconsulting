'use strict';

// The bank activity section (config 1.7.0) through the real routes: saving it, the checks, the derived month count, encryption at rest, nothing of it in a
// log, the staff-only funds check (who may read it, its audit row, the older application), and that no applicant-facing response, review or PDF carries the
// badge. In-memory MongoDB, a fake file storage (no network), made-up users and figures.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.TOURIST_VISA_ENABLED = 'true'; // the API is closed unless the switch is exactly true
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const util = require('node:util');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const TouristVisaApplication = require('../models/TouristVisaApplication');
const TouristVisaAudit = require('../models/TouristVisaAudit');
const documentService = require('../services/touristVisaDocumentService');
const ratesService = require('../services/touristVisaRatesService');
const { TouristVisaFundsService } = require('../services/touristVisaFundsService');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const engine = require('../shared/tourist-visa/engine');
const logic = require('../utils/touristVisaChanges');
const { SECTIONS, pkr } = require('./helpers/touristVisaFixtures');
const { uploadRemainingShared } = require('./helpers/documentSlots');
const { inspectPdf } = require('./helpers/pdfInspect');

let mongod;
let server;
let baseUrl;
let userCounter = 0;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await TouristVisaApplication.init();
  await TouristVisaAudit.init();
  const app = express();
  app.use('/api/tourist-visa', touristVisaBodyParser);
  app.use(express.json());
  app.use('/api/tourist-visa', touristVisaRoutes);
  app.use(errorHandler);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}, { timeout: 120000 });

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

documentService.storage = {
  isConfigured: () => true,
  upload: async (buffer, { applicationId, extension }) => ({ publicId: `tourist-visa/${applicationId}/${crypto.randomBytes(8).toString('hex')}.${extension}`, resourceType: 'raw', bytes: buffer.length }),
  remove: async () => {},
  temporaryUrl: () => 'https://fake-storage.invalid/download',
};

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${baseUrl}/api/tourist-visa${path}`, {
    method,
    headers: { ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  const text = buffer.toString('utf8');
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, buffer, headers: res.headers };
}

async function makeUser(role = 0) {
  userCounter += 1;
  const user = await User.create({ name: `Test Funds ${userCounter}`, email: `test.funds.${userCounter}@example.com`, password: 'not-a-real-password', role });
  return { user, token: jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
}
const put = (token, sectionId, answers) => api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const get = async (token) => (await api('GET', '/applications/me', { token })).json.data.application;
const oid = (id) => new mongoose.Types.ObjectId(id);
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: oid(appId) });
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60, 0x20)]);
function upload(token, slot, name) {
  const form = new FormData();
  form.append('slot', slot);
  form.append('file', new Blob([PDF], { type: 'application/pdf' }), name);
  return api('POST', '/applications/me/documents', { token, body: form });
}

// Distinctive figures and words, so that anything stored or logged in the clear can be found: 2 months, 20 October to 19 December 2026.
const FIGURES = {
  q10_29: '2026-10-20', q10_30: '2026-12-19', q10_31: pkr(111111.11), q10_33: pkr(1234567.89), q10_34: pkr(123456.78), q10_32: pkr(1222222.22),
  bankMonths: [{ q10_35a: pkr(600000.45), q10_35b: pkr(60000.5) }, { q10_35a: pkr(634567.44), q10_35b: pkr(63456.28) }],
  q10_36: true,
  largeTransactions: [{ q10_37a: '2026-11-05', q10_37b: 'credit', q10_37c: pkr(555555.55), q10_37d: 'SECRET-WHO-NAME', q10_37e: 'other', q10_37e_other: 'SECRET-OTHER-REASON', q10_37f: 'SECRET-DETAILS-TEXT' }],
};
const SECRET_PIECES = ['1234567.89', '111111.11', '123456.78', '1222222.22', '600000.45', '634567.44', '555555.55', 'SECRET-WHO-NAME', 'SECRET-OTHER-REASON', 'SECRET-DETAILS-TEXT'];
const BADGE_WORDS = ['Funds check', 'funds-check', 'Looks consistent', 'Needs a closer look', 'Not enough information', 'Not collected', 'badge', 'indicator', 'amber', 'greenAtOrAbovePercent'];

async function draftWith(figures = FIGURES) {
  const person = await makeUser(0);
  const created = await api('POST', '/applications', { token: person.token });
  const appId = created.json.data.application.id;
  for (const [id, answers] of SECTIONS('Fundsfirst', 'Fundslast', person.user.email)) {
    const res = await put(person.token, id, id === '10F' ? figures : answers);
    assert.equal(res.status, 200, `${id}: ${JSON.stringify(res.json)}`);
  }
  return { ...person, appId };
}
async function submitted(figures) {
  const person = await draftWith(figures);
  assert.equal((await upload(person.token, 'passport', 'passport.pdf')).status, 201);
  assert.equal((await upload(person.token, 'funds', 'bank-statement.pdf')).status, 201);
  await uploadRemainingShared(upload, person.token);
  const res = await api('POST', '/applications/me/submit', { token: person.token, body: { declarationAccepted: true } });
  assert.equal(res.status, 200, res.text);
  return person;
}

function capture() {
  const lines = [];
  const original = { error: console.error, log: console.log, info: console.info, warn: console.warn };
  for (const method of Object.keys(original)) console[method] = (...args) => lines.push(args.map((a) => util.inspect(a, { depth: 8 })).join(' '));
  return { lines, restore: () => Object.assign(console, original) };
}

// ---------------------------------------------------------------------------
// Saving the section
// ---------------------------------------------------------------------------

test('a statement whose figures add up saves; the section is on the dashboard as saved and is asked of every applicant', async () => {
  const person = await draftWith();
  const app = await get(person.token);
  assert.equal(app.sectionStatus['10F'], 'saved');
  assert.deepEqual(app.answers.q10_32, pkr(1222222.22), 'read back decrypted for its owner');
  assert.equal(app.answers.bankMonths.length, 2);
  assert.equal(app.answers.largeTransactions[0].q10_37d, 'SECRET-WHO-NAME');
  assert.equal(app.configVersion, '1.7.0');
});

test('the checks and the derived month count are enforced by the server, with both numbers in the message, and nothing is saved', async () => {
  const person = await makeUser(0);
  await api('POST', '/applications', { token: person.token });
  const bad = await put(person.token, '10F', { ...FIGURES, q10_32: pkr(1000000) });
  assert.equal(bad.status, 422);
  assert.equal(bad.json.errors.q10_32, 'Your opening balance plus the credits, minus the debits, comes to PKR 1,222,222.22, but the closing balance you entered is PKR 1,000,000.00. Please check the figures against the statement.');
  const monthly = clone(FIGURES);
  monthly.bankMonths[0].q10_35a = pkr(500000);
  assert.equal((await put(person.token, '10F', monthly)).json.errors.q10_33, 'Your monthly credits add up to PKR 1,134,567.44 but the statement total is PKR 1,234,567.89. Please check them against the statement.');
  const count = await put(person.token, '10F', { ...FIGURES, bankMonths: [FIGURES.bankMonths[0]] });
  assert.equal(count.json.errors.bankMonths, 'Give details for exactly 2 months');
  assert.equal((await put(person.token, '10F', { ...FIGURES, q10_30: '2027-12-19' })).json.errors.q10_30, 'The period must cover between 1 and 12 months');
  assert.equal((await get(person.token)).sectionStatus['10F'], undefined, 'nothing was saved');
});

test('an unusual month must be explained, and the section applies whatever 6.7 says', async () => {
  const person = await makeUser(0);
  await api('POST', '/applications', { token: person.token });
  const over = clone(FIGURES);
  over.bankMonths = [{ q10_35a: pkr(100000), q10_35b: pkr(60000.5) }, { q10_35a: pkr(1134567.89), q10_35b: pkr(63456.28) }];
  over.q10_36 = false;
  delete over.largeTransactions;
  const res = await put(person.token, '10F', over);
  assert.equal(res.status, 422);
  assert.equal(res.json.errors['bankMonths.1.q10_35c'], 'This question is required');
  over.bankMonths[1].q10_35c = 'SECRET-MONTH-REASON';
  assert.equal((await put(person.token, '10F', over)).status, 200);
  assert.equal((await get(person.token)).answers.bankMonths[1].q10_35c, 'SECRET-MONTH-REASON');
});

test('every amount and free text is stored as ciphertext, the dates stay readable, and nothing typed is in the clear in the database', async () => {
  const person = await draftWith();
  const stored = await rawDoc(person.appId);
  const isCipher = (v) => typeof v === 'string' && v.startsWith('enc:v1:');
  for (const id of ['q10_31', 'q10_32', 'q10_33', 'q10_34']) assert.ok(isCipher(stored.answers[id]), `${id} is ciphertext`);
  for (const entry of stored.answers.bankMonths) for (const id of ['q10_35a', 'q10_35b']) assert.ok(isCipher(entry[id]), `${id} of a month is ciphertext`);
  const large = stored.answers.largeTransactions[0];
  for (const id of ['q10_37c', 'q10_37d', 'q10_37e', 'q10_37e_other', 'q10_37f']) assert.ok(isCipher(large[id]), `${id} of a large transaction is ciphertext`);
  assert.equal(stored.answers.q10_29, '2026-10-20');
  assert.equal(stored.answers.q10_36 === true || isCipher(stored.answers.q10_36), true);
  const everything = JSON.stringify(stored);
  for (const piece of SECRET_PIECES) assert.equal(everything.includes(piece), false, `${piece} is in the database in the clear`);
});

test('nothing of the section is written to a log: a good save, a refused save and a read leave no figure or word in the output', async () => {
  const person = await makeUser(0);
  await api('POST', '/applications', { token: person.token });
  const seen = capture();
  try {
    await put(person.token, '10F', { ...FIGURES, q10_32: pkr(1000000) });
    await put(person.token, '10F', { ...FIGURES, bankMonths: [FIGURES.bankMonths[0]] });
    await put(person.token, '10F', FIGURES);
    await get(person.token);
    await api('GET', '/applications/me/review', { token: person.token });
  } finally {
    seen.restore();
  }
  const output = seen.lines.join('\n');
  for (const piece of SECRET_PIECES) assert.equal(output.includes(piece), false, `${piece} is in the log`);
});

// ---------------------------------------------------------------------------
// The staff-only funds check
// ---------------------------------------------------------------------------

const RATES = { base: 'GBP', asOf: '2026-11-20', stale: false, rates: { PKR: 400 }, attribution: null };

test('the funds check: anonymous is 401, an applicant is 403, an administrator reads it; the answer is no-store, audited by ids only, and says what it is', async () => {
  const applicantApp = await submitted();
  const admin = await makeUser(1);
  const path = `/admin/applications/${applicantApp.appId}/funds-check`;
  mock.method(ratesService, 'get', async () => RATES);
  try {
    assert.equal((await api('GET', path)).status, 401);
    assert.equal((await api('GET', path, { token: 'not-a-token' })).status, 401);
    const refused = await api('GET', path, { token: applicantApp.token });
    assert.equal(refused.status, 403);
    for (const word of ['badge', 'figures', 'Looks consistent']) assert.equal(refused.text.includes(word), false);
    const before = await TouristVisaAudit.collection.countDocuments({ action: 'funds_check_view' });
    assert.equal(before, 0, 'a refused request writes no audit row');

    const res = await api('GET', path, { token: admin.token });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const panel = res.json.data;
    assert.equal(panel.collected, true);
    assert.ok(['green', 'amber', 'red', 'grey'].includes(panel.badge));
    assert.equal(panel.badge, 'green', 'closing PKR 1,222,222.22 is about £3,056 against planned £1,500');
    assert.match(panel.helper, /helper for staff, not a decision/);
    assert.equal(panel.figures.period.months, 2);
    assert.deepEqual(panel.figures.closing, { pkr: 1222222.22, gbp: 3055.56 });
    assert.equal(panel.figures.months[0].label, '20 October to 19 November');
    assert.equal(panel.figures.largeTransactions[0].who, 'SECRET-WHO-NAME', 'staff see what the applicant wrote');
    assert.equal(panel.planned.gbp, 1500);
    assert.deepEqual(panel.rates, { asOf: '2026-11-20', stale: false, pkrPerGbp: 400 });
    assert.equal(panel.checks.balance.passed, true);

    const rows = await TouristVisaAudit.collection.find({ action: 'funds_check_view' }).toArray();
    assert.equal(rows.length, 1);
    assert.equal(String(rows[0].applicationId), applicantApp.appId);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['_id', 'action', 'adminId', 'applicationId', 'at'].sort(), 'ids, the action and a time: no figure, no word');
  } finally {
    mock.restoreAll();
  }
});

test('the funds check of a draft is a 404, and with no exchange rate the badge is grey and the pound figures are left out', async () => {
  const draft = await draftWith();
  const admin = await makeUser(1);
  assert.equal((await api('GET', `/admin/applications/${draft.appId}/funds-check`, { token: admin.token })).status, 404);
  const sent = await submitted();
  mock.method(ratesService, 'get', async () => { throw new Error('no rates'); });
  const seen = capture();
  let res;
  try {
    res = await api('GET', `/admin/applications/${sent.appId}/funds-check`, { token: admin.token });
  } finally {
    seen.restore();
    mock.restoreAll();
  }
  assert.equal(res.status, 200);
  assert.equal(res.json.data.badge, 'grey');
  assert.equal(res.json.data.figures.closing.gbp, null);
  assert.equal(res.json.data.figures.closing.pkr, 1222222.22);
  assert.equal(res.json.data.rates, null);
  for (const piece of SECRET_PIECES) assert.equal(seen.lines.join('\n').includes(piece), false, `${piece} is in the log`);
});

test('an application submitted under an older config gets the grey "Not collected" badge from the service, and the read is still audited', async () => {
  const older = JSON.parse(JSON.stringify(engine.config));
  older.version = '1.6.0';
  older.questions = older.questions.filter((q) => q.section !== '10F');
  older.sections = older.sections.filter((s) => s.id !== '10F');
  older.groups = older.groups.filter((g) => !['bankMonths', 'largeTransactions'].includes(g.id));
  delete older.checks;
  const audit = [];
  const service = new TouristVisaFundsService({
    audit: { append: async (rows) => { audit.push(...rows); } },
    applications: { configOf: async () => older },
    admin: { load: async () => ({ _id: 'a'.repeat(24), status: 'submitted', answers: { q6_3: { amount: 1000, currency: 'GBP' } } }) },
    rates: { get: async () => RATES },
    now: () => new Date('2026-11-22T10:00:00Z'),
  });
  const panel = await service.view('admin1', 'x');
  assert.equal(panel.collected, false);
  assert.equal(panel.badge, 'grey');
  assert.equal(panel.headline, 'Not collected (submitted on an older form)');
  assert.deepEqual(audit.map((row) => row.action), ['funds_check_view']);
});

// ---------------------------------------------------------------------------
// The applicant never sees it
// ---------------------------------------------------------------------------

test('no applicant-facing response carries the badge or the thresholds: the application, the dashboard, the review, the settings and the PDF of the answers', async () => {
  const sent = await submitted();
  const seen = [];
  const mine = await api('GET', '/applications/me', { token: sent.token });
  const review = await api('GET', '/applications/me/review', { token: sent.token });
  const settings = await api('GET', '/funds-settings', { token: sent.token });
  const pdf = await api('GET', '/applications/me/pdf/answers', { token: sent.token });
  assert.equal(mine.status, 200);
  assert.equal(review.status, 200);
  assert.equal(settings.status, 200);
  assert.equal(pdf.status, 200);
  seen.push(['application', mine.text], ['review', review.text], ['settings', settings.text]);
  const pdfText = (await inspectPdf(pdf.buffer)).text;
  seen.push(['PDF text', pdfText], ['PDF bytes', pdf.buffer.toString('latin1')]);
  for (const [where, text] of seen) for (const word of BADGE_WORDS) assert.equal(text.includes(word), false, `${word} is in the ${where}`);
  assert.deepEqual(settings.json.data, { currency: 'PKR', spikePercent: 50, singleTransactionPercent: 25, singleTransactionFloor: 25000 });
  assert.equal(/fundsCheck|funds_check|fundsIndicator|redBelowPercent/i.test(JSON.stringify(mine.json.data.application)), false);
  // The applicant's own PDF does print the answers: the heading, each month with its period, and the figures.
  assert.match(pdfText, /Your bank activity/);
  assert.match(pdfText, /Month 1 \(20 October to 19 November\)/);
  assert.match(pdfText, /Month 2 \(20 November to 19 December\)/);
  assert.match(pdfText, /1,234,567\.89 PKR/);
});

test('the administrator\'s PDF of the answers prints the answers of the section and NOT the badge, and the Overview carries no badge either', async () => {
  const sent = await submitted();
  const admin = await makeUser(1);
  const pdf = await api('GET', `/admin/applications/${sent.appId}/pdf/answers`, { token: admin.token });
  assert.equal(pdf.status, 200);
  const text = (await inspectPdf(pdf.buffer)).text;
  assert.match(text, /Your bank activity/);
  assert.match(text, /Total credit \(PKR\)/);
  for (const word of BADGE_WORDS) assert.equal(text.includes(word), false, `${word} is in the admin PDF`);
  const overview = await api('GET', `/admin/applications/${sent.appId}`, { token: admin.token });
  assert.equal(overview.status, 200);
  assert.match(overview.text, /Your bank activity/);
  for (const word of ['Looks consistent', 'Needs a closer look', 'funds-check', 'indicator', 'badge']) assert.equal(overview.text.includes(word), false, `${word} is in the Overview`);
});

// ---------------------------------------------------------------------------
// The administrator corrects a mismatch
// ---------------------------------------------------------------------------

const clone = (o) => JSON.parse(JSON.stringify(o));
const z = require('zod');
const TODAY = '2026-11-22';
const run = (changes, existing) => logic.evaluate({ z, cfg: engine.config, existing, parsed: logic.parseChanges(engine.config, changes), today: TODAY });

test('an administrator correcting the figures goes through the same checks: a mismatch is refused with the message, and a correct pair of changes is accepted', () => {
  const existing = { ...SECTIONS().reduce((all, [, answers]) => Object.assign(all, answers), {}), ...clone(FIGURES) };
  const refused = run([{ questionId: 'q10_32', value: pkr(1000000) }], existing);
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.sections, [{ id: '10F', problems: 1 }]);
  assert.match(refused.errors.q10_32, /comes to PKR 1,222,222\.22, but the closing balance you entered is PKR 1,000,000\.00/);
  assert.equal(JSON.stringify(refused).includes('SECRET'), false, 'no value in the refusal');
  // A mistyped total is corrected together with the balance that now follows from it.
  const fixed = run([{ questionId: 'q10_34', value: pkr(223456.78) }, { questionId: 'q10_32', value: pkr(1122222.22) }, { questionId: 'bankMonths', value: [{ q10_35a: pkr(600000.45), q10_35b: pkr(160000.5) }, { q10_35a: pkr(634567.44), q10_35b: pkr(63456.28) }] }], existing);
  assert.equal(fixed.ok, true, JSON.stringify(fixed));
  assert.equal(fixed.answers.q10_32.amount, 1122222.22);
  // Moving the end date changes the months asked for: it must come with the new list of months.
  const moved = run([{ questionId: 'q10_30', value: '2027-01-19' }], existing);
  assert.equal(moved.ok, false);
  assert.equal(moved.errors.bankMonths, 'Give details for exactly 3 months');
});
