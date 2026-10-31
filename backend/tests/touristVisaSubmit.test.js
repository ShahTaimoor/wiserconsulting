'use strict';

// Step 8d tests: submitting an application (POST /api/tourist-visa/applications/me/submit) and reading it back
// (GET .../applications/me/review). Covers: a successful submit and what it records, every kind of failure,
// two submits at the same moment, the lock after submit, the config snapshot (stored once, used to show a
// submitted application), the reference (format, uniqueness, retry), ownership, the feature gate, and that no
// answer ever reaches an error or a log line.
// In-memory MongoDB, a fake file storage (no network), made-up users and answers.

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
const TouristVisaConfigSnapshot = require('../models/TouristVisaConfigSnapshot');
const repository = require('../repositories/touristVisaApplicationRepository');
const documentService = require('../services/touristVisaDocumentService');
const applicationService = require('../services/touristVisaApplicationService');
const { TouristVisaApplicationService, generateReference, REFERENCE_ALPHABET } = applicationService;
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const engine = require('../shared/tourist-visa/engine');

let mongod;
let server;
let baseUrl;
let userCounter = 0;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await TouristVisaApplication.init();
  await TouristVisaConfigSnapshot.init();

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

/** A stand-in for Cloudinary: remembers what is "stored". */
class FakeStorage {
  constructor() { this.live = new Map(); }
  isConfigured() { return true; }
  async upload(buffer, { applicationId, extension }) {
    const publicId = `tourist-visa/${applicationId}/${crypto.randomBytes(8).toString('hex')}.${extension}`;
    this.live.set(publicId, buffer.length);
    return { publicId, resourceType: 'raw', bytes: buffer.length };
  }
  async remove(publicId) { this.live.delete(publicId); }
  temporaryUrl() { throw new Error('a link must never be asked for here'); }
}
documentService.storage = new FakeStorage();

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${baseUrl}/api/tourist-visa${path}`, {
    method,
    headers: { ...(body instanceof FormData || body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

async function makeUser() {
  userCounter += 1;
  const user = await User.create({ name: `Test Submit ${userCounter}`, email: `test.submit.${userCounter}@example.com`, password: 'not-a-real-password' });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token, userId: String(user._id) };
}
async function start() {
  const person = await makeUser();
  const created = await api('POST', '/applications', { token: person.token });
  return { ...person, appId: created.json.data.application.id };
}
const put = (token, sectionId, answers) => api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const oid = (id) => new mongoose.Types.ObjectId(id);
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: oid(appId) });
const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const submit = (token, body = { declarationAccepted: true }) => api('POST', '/applications/me/submit', { token, body });

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60, 0x20)]);
function upload(token, slot, name = 'scan.pdf') {
  const form = new FormData();
  form.append('slot', slot);
  form.append('file', new Blob([PDF], { type: 'application/pdf' }), name);
  return api('POST', '/applications/me/documents', { token, body: form });
}

// Made-up, valid answers for every section, in form order.
const SECRET_ID = 'FAKE-PASSPORT-9876';
const SECRET_NI = 'AB123456C';
const SECRET_DETAILS = 'MADE-UP-DETAILS-OF-A-CONVICTION';
const ADDRESS = { line1: '1 Test Street', town: 'Testville', country: 'GB' };
const gbp = (amount) => ({ amount, currency: 'GBP' });
const SECTIONS = [
  ['1', { q1_1: 'tourism', q1_2: false, q1_3: false, q1_4: 'holiday', q1_5: 'Test trip for automated tests.', q1_6: '2027-03-01', q1_7: '2027-03-15' }],
  ['2A', {
    q2_1: 'Testfirst', q2_2: 'Testlast', q2_3: false, q2_4: 'test.applicant@example.com', q2_5: 'me', q2_6: false,
    q2_9: 'test.applicant@example.com', q2_10: 'test.applicant@example.com', q2_11: 'test.applicant@example.com',
  }],
  ['2B', { q2_12: 'female', q2_13: 'single', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville', q2_17: '1990-01-01', q2_18: false, q2_23: false }],
  ['2C', { q2_24: ADDRESS, q2_25: true, q2_27: { years: 2, months: 3 }, q2_28: 'owned', q2_30: false, q2_31: false }],
  ['2D', { q2_32: { countryCode: '+44', number: '7700 900123' }, q2_33: 'in_uk', q2_34: 'mobile', q2_35: ['call'] }],
  ['3', { q3_1: SECRET_ID, q3_2: 'Test Passport Office', q3_3: '2022-05-01', q3_4: '2032-05-01' }],
  ['4B', { q4_7: false }],
  ['4C', { q4_8: true, parents: [{ q4_8a: 'mother', q4_8b: 'Testmother', q4_8c: 'Testsurname', q4_8d: '1962-01-02', q4_8e: 'GB', q4_8f: true }] }],
  ['5', { q5_1: 'retired' }],
  ['6A', { q6_1: 'none', q6_3: gbp(1500), q6_4: gbp(900), q6_5: false }],
  ['6B', { q6_6: false }],
  ['6C', { q6_7: false, q6_7x: 'not_decided' }],
  ['6D', { q6_8: false }],
  ['7', { q7_1: false, q7_3: false, q7_4: false, q7_6: false, q7_7: false }],
  ['8', { q8_1: 0, q8_2: false }],
  ['9A', { q9_11: true, q9_1: false, q9_12: true, q9_2: false }],
  ['9B', { q9_13: true, q9_3: false, q9_4: false, q9_5: false, q9_14: true, q9_6: false, q9_7: false }],
  ['9C', { q9_8: false, q9_9: false, q9_10: false }],
  ['10A', { q10_1: ['conviction'], q10_1a: SECRET_DETAILS }],
  ['10B', {}],
  ['10C', { q10_4: 'english', q10_5: true, q10_5a: SECRET_NI }],
];

/** Saves every section (except those named in `skip`) and uploads the two documents (unless `files` says otherwise). */
async function complete(person, { skip = [], files = ['passport', 'funds'] } = {}) {
  for (const [id, answers] of SECTIONS) {
    if (skip.includes(id)) continue;
    const res = await put(person.token, id, answers);
    assert.equal(res.status, 200, `${id}: ${JSON.stringify(res.json)}`);
  }
  for (const slot of files) assert.equal((await upload(person.token, slot, `${slot}-file.pdf`)).status, 201, slot);
  return person;
}
const readyApplication = async () => complete(await start());

function capture() {
  const lines = [];
  const original = { error: console.error, log: console.log, info: console.info, warn: console.warn };
  for (const method of Object.keys(original)) console[method] = (...args) => lines.push(args.map((a) => util.inspect(a, { depth: 8 })).join(' '));
  return { lines, restore: () => Object.assign(console, original) };
}
const SECRETS = [SECRET_ID, SECRET_NI, SECRET_DETAILS, 'Testfirst', 'Test Passport Office', 'test.applicant@example.com', '7700 900123', '1 Test Street'];
const assertNoSecrets = (text, where) => { for (const secret of SECRETS) assert.equal(String(text).includes(secret), false, `${secret} is in ${where}`); };

const REFERENCE = /^TV-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

// ---------------------------------------------------------------------------
// A successful submit
// ---------------------------------------------------------------------------

test('a complete application is submitted: status, time, reference, config, declaration record; nothing else is touched', async () => {
  const person = await readyApplication();
  const before = await rawDoc(person.appId);
  const started = Date.now();
  const res = await submit(person.token);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.data.application.status, 'submitted');
  assert.match(res.json.data.reference, REFERENCE);
  assert.equal(res.json.data.application.reference, res.json.data.reference);
  assert.ok(new Date(res.json.data.application.submittedAt).getTime() >= started - 1000);

  const stored = await rawDoc(person.appId);
  assert.equal(stored.status, 'submitted');
  assert.equal(stored.reference, res.json.data.reference);
  assert.ok(stored.submittedAt instanceof Date);
  assert.equal(stored.configVersion, engine.config.version);
  assert.match(stored.configSha256, /^[0-9a-f]{64}$/);

  // The final declaration is recorded like the Part 9 ticks: hash of the exact wording, time, user, config version. No IP.
  const record = stored.declarations.submit;
  assert.deepEqual(Object.keys(record).sort(), ['acceptedAt', 'acceptedBy', 'configVersion', 'wordingSha256']);
  assert.equal(record.wordingSha256, sha256(engine.wordingOf(engine.config, 'declarations.submit')));
  assert.equal(record.wordingSha256, sha256(engine.config.declarations.submit.text.replace(/\s+/g, ' ').trim()));
  assert.equal(record.configVersion, engine.config.version);
  assert.equal(String(record.acceptedBy), person.userId);
  assert.ok(record.acceptedAt instanceof Date && record.acceptedAt.getTime() === stored.submittedAt.getTime());

  // The answers, the files and the Part 9 records are exactly as they were.
  assert.deepEqual(stored.answers, before.answers);
  assert.deepEqual(stored.documents, before.documents);
  for (const id of ['q9_11', 'q9_12', 'q9_13', 'q9_14']) assert.deepEqual(stored.declarations[id], before.declarations[id]);
  assert.deepEqual(Object.keys(stored.declarations).sort(), ['q9_11', 'q9_12', 'q9_13', 'q9_14', 'submit']);
  assert.match(stored.answers.q3_1, /^enc:v1:/, 'the passport number is still ciphertext');
});

test('the config the application was submitted under is stored once, by its SHA-256, and reused by the next application', async () => {
  const first = await complete(await start());
  const second = await complete(await start());
  assert.equal((await submit(first.token)).status, 200);
  assert.equal((await submit(second.token)).status, 200);

  const a = await rawDoc(first.appId);
  const b = await rawDoc(second.appId);
  assert.equal(a.configSha256, b.configSha256, 'same config, same snapshot');
  assert.equal(await TouristVisaConfigSnapshot.countDocuments({ _id: a.configSha256 }), 1, 'stored once');
  const snapshot = await TouristVisaConfigSnapshot.collection.findOne({ _id: a.configSha256 });
  assert.equal(snapshot.version, engine.config.version);
  assert.equal(sha256(snapshot.json), snapshot._id, 'the id is the SHA-256 of the text it holds');
  assert.deepEqual(JSON.parse(snapshot.json), engine.config, 'it is the exact config');
  assert.deepEqual(Object.keys(snapshot).sort(), ['_id', 'createdAt', 'json', 'version'], 'no answer or applicant detail in it');
  assert.equal(snapshot.json.includes(SECRET_ID), false);
  // A snapshot is written once and never touched again: a later submit does not rewrite it.
  const again = await complete(await start());
  assert.equal((await submit(again.token)).status, 200);
  const after = await TouristVisaConfigSnapshot.collection.findOne({ _id: a.configSha256 });
  assert.deepEqual(after, snapshot, 'the stored snapshot is exactly as it was');
});

test('a submitted application is shown with the config it was submitted under, even after the live config changes', async () => {
  const person = await readyApplication();
  assert.equal((await submit(person.token)).status, 200);

  const changed = JSON.parse(JSON.stringify(engine.config));
  changed.version = '99.0.0-test';
  changed.questions.find((q) => q.id === 'q1_1').options.find((o) => o.value === 'tourism').label = 'CHANGED LABEL';
  changed.declarations.submit.text = 'A completely different declaration.';
  const later = new TouristVisaApplicationService({ config: changed });

  const shown = await later.getReview(person.user._id);
  const row = shown.review.parts[0].sections[0].rows.find((r) => r.id === 'q1_1');
  assert.equal(row.value, 'Tourism or holiday', 'the label it was submitted with');
  assert.equal(shown.declaration.text, engine.config.declarations.submit.text);
  assert.equal(shown.configVersion, engine.config.version);

  // A second application, still a draft, is shown with the live config.
  const draft = await start();
  const live = await later.getReview(draft.user._id);
  assert.equal(live.review.parts[0].sections[0].rows.find((r) => r.id === 'q1_1').empty, true);
  assert.equal(live.declaration.text, 'A completely different declaration.');
});

test('the applicant reads back the status, time, reference and a review, without any link or storage id', async () => {
  const person = await readyApplication();
  const done = await submit(person.token);
  const reference = done.json.data.reference;

  const mine = (await api('GET', '/applications/me', { token: person.token })).json.data.application;
  assert.equal(mine.status, 'submitted');
  assert.equal(mine.reference, reference);
  assert.ok(mine.submittedAt);
  assert.equal(mine.answers.q3_1, SECRET_ID, 'the owner reads their own answers, decrypted');
  assert.equal('configSha256' in mine, false, 'the config hash is not for the applicant');

  const res = await api('GET', '/applications/me/review', { token: person.token });
  assert.equal(res.status, 200);
  const data = res.json.data;
  assert.equal(data.status, 'submitted');
  assert.equal(data.reference, reference);
  assert.equal(data.documentsComplete, true);
  assert.ok(data.submittedAt);
  assert.equal(data.declaration.text, engine.config.declarations.submit.text);
  assert.ok(data.declaration.acceptedAt);
  assert.equal(data.review.parts.length, 10);
  const rows = data.review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows));
  assert.equal(rows.find((r) => r.id === 'q3_1').value, SECRET_ID);
  assert.equal(rows.find((r) => r.id === 'q10_5a').value, SECRET_NI);
  const passport = rows.find((r) => r.id === 'q10_6');
  assert.deepEqual(passport.files.map((f) => f.name), ['passport-file.pdf']);
  assert.match(rows.find((r) => r.id === 'q9_11').note, /^Confirmed on \d{1,2} \w+ \d{4}$/);

  for (const text of [JSON.stringify(mine), res.text]) {
    for (const needle of ['tourist-visa/', 'https://', 'http://', 'publicId', 'resourceType', 'enc:v1:', 'cloudinary']) assert.equal(text.includes(needle), false, needle);
  }
});

test('a submitted application keeps its Part 9 ticks when the wording of a tick changes later', async () => {
  const person = await readyApplication();
  assert.equal((await submit(person.token)).status, 200);
  const changed = JSON.parse(JSON.stringify(engine.config));
  changed.questions.find((q) => q.id === 'q9_11').help += ' An extra sentence.';
  const later = new TouristVisaApplicationService({ config: changed });
  const view = await later.getMine(person.user._id);
  assert.equal(view.answers.q9_11, true, 'what was agreed stays agreed');
  assert.equal(view.status, 'submitted');
});

// ---------------------------------------------------------------------------
// Failures: what is wrong is named by section and count, never by value
// ---------------------------------------------------------------------------

test('a section that was never saved stops the submit: 422 with the section and a count, nothing written', async () => {
  const person = await complete(await start(), { skip: ['7'] });
  const before = await rawDoc(person.appId);
  const log = capture();
  let res;
  try { res = await submit(person.token); } finally { log.restore(); }
  assert.equal(res.status, 422, res.text);
  assert.equal(res.json.success, false);
  assert.equal(res.json.code, 'NOT_READY');
  assert.deepEqual(res.json.sections.map((s) => s.id), ['7']);
  assert.ok(res.json.sections[0].problems >= 1);
  assert.equal(res.json.declarationMissing, false);
  assertNoSecrets(res.text, 'the response');
  assertNoSecrets(log.lines.join('\n'), 'the log');
  const after = await rawDoc(person.appId);
  assert.deepEqual(after, before, 'nothing was written: still a draft, no reference, no declaration');
  assert.equal(after.status, 'draft');
  assert.equal(after.reference, undefined);
});

test('several sections that need attention are all listed, in form order, with how many problems each has', async () => {
  const person = await complete(await start(), { skip: ['2C', '8'] });
  const res = await submit(person.token);
  assert.equal(res.status, 422);
  assert.deepEqual(res.json.sections.map((s) => s.id), ['2C', '8']);
  assert.ok(res.json.sections.every((s) => Number.isInteger(s.problems) && s.problems >= 1));
  for (const section of res.json.sections) assert.deepEqual(Object.keys(section).sort(), ['id', 'problems'], 'only an id and a count');
});

test('a section that is saved but needs another look is not ready', async () => {
  const person = await readyApplication();
  await TouristVisaApplication.collection.updateOne({ _id: oid(person.appId) }, { $set: { 'sectionStatus.6A': 'needs_review' } });
  const res = await submit(person.token);
  assert.equal(res.status, 422);
  assert.deepEqual(res.json.sections.map((s) => s.id), ['6A']);
});

test('saved answers that no longer pass the rules are counted, not shown', async () => {
  const person = await readyApplication();
  // Break a stored answer behind the application's back: a date that is not a date.
  await TouristVisaApplication.collection.updateOne({ _id: oid(person.appId) }, { $set: { 'answers.q1_6': 'not-a-date' } });
  const res = await submit(person.token);
  assert.equal(res.status, 422);
  assert.deepEqual(res.json.sections.map((s) => s.id), ['1']);
  assert.equal(res.text.includes('not-a-date'), false);
});

test('missing documents: one missing slot is one problem, both missing is two, in the documents section', async () => {
  const noFunds = await complete(await start(), { files: ['passport'] });
  const a = await submit(noFunds.token);
  assert.equal(a.status, 422);
  assert.deepEqual(a.json.sections, [{ id: '10D', problems: 1 }]);

  const none = await complete(await start(), { files: [] });
  const b = await submit(none.token);
  assert.deepEqual(b.json.sections, [{ id: '10D', problems: 2 }]);
  assert.equal((await rawDoc(none.appId)).status, 'draft');
});

test('a Part 9 tick that no longer matches the current wording stops the submit', async () => {
  const person = await readyApplication();
  const changed = JSON.parse(JSON.stringify(engine.config));
  changed.questions.find((q) => q.id === 'q9_12').help += ' The guidance was reworded after the tick was given.';
  const service = new TouristVisaApplicationService({ config: changed });
  await assert.rejects(
    () => service.submit(person.user._id, { declarationAccepted: true }),
    (error) => error.statusCode === 422 && error.code === 'NOT_READY' && JSON.stringify(error.details.sections) === JSON.stringify([{ id: '9A', problems: 1 }]) && error.details.declarationMissing === false
  );
  assert.equal((await rawDoc(person.appId)).status, 'draft');
  // With the wording it was given under, the same application submits.
  assert.equal((await submit(person.token)).status, 200);
});

test('the final declaration is required: not ticked, ticked as text, or left out all give 422 and write nothing', async () => {
  const person = await readyApplication();
  const before = await rawDoc(person.appId);
  for (const body of [{ declarationAccepted: false }, { declarationAccepted: 'true' }, { declarationAccepted: 1 }, {}]) {
    const res = await submit(person.token, body);
    assert.equal(res.status, 422, JSON.stringify(body));
    assert.equal(res.json.code, 'NOT_READY');
    assert.equal(res.json.declarationMissing, true);
    assert.deepEqual(res.json.sections, []);
  }
  assert.deepEqual(await rawDoc(person.appId), before);
  assert.equal(await TouristVisaApplication.collection.countDocuments({ _id: oid(person.appId), reference: { $exists: true } }), 0);
});

test('an incomplete application with no declaration reports both', async () => {
  const person = await complete(await start(), { skip: ['5'], files: [] });
  const res = await submit(person.token, { declarationAccepted: false });
  assert.equal(res.status, 422);
  assert.deepEqual(res.json.sections.map((s) => s.id), ['5', '10D']);
  assert.equal(res.json.declarationMissing, true);
});

test('a request that is not { declarationAccepted } is refused as a bad request, and a missing application is a 404', async () => {
  const person = await readyApplication();
  for (const body of [{ declarationAccepted: true, reference: 'TV-AAAAAAAA' }, { status: 'submitted' }, []]) {
    const res = await submit(person.token, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.json.code, 'INVALID_REQUEST');
  }
  assert.equal((await rawDoc(person.appId)).status, 'draft');
  const nobody = await makeUser();
  const res = await submit(nobody.token);
  assert.deepEqual([res.status, res.json.code], [404, 'APPLICATION_NOT_FOUND']);
  assert.equal((await api('GET', '/applications/me/review', { token: nobody.token })).status, 404);
});

// ---------------------------------------------------------------------------
// Two submits at the same moment
// ---------------------------------------------------------------------------

test('five submits at the same moment: exactly one wins, the rest are told it is already submitted', async () => {
  const person = await readyApplication();
  const results = await Promise.all(Array.from({ length: 5 }, () => submit(person.token)));
  const won = results.filter((r) => r.status === 200);
  const lost = results.filter((r) => r.status !== 200);
  assert.equal(won.length, 1, JSON.stringify(results.map((r) => [r.status, r.json && r.json.code])));
  assert.equal(lost.length, 4);
  for (const r of lost) assert.deepEqual([r.status, r.json.code], [409, 'ALREADY_SUBMITTED']);
  const stored = await rawDoc(person.appId);
  assert.equal(stored.reference, won[0].json.data.reference, 'the one reference is the winner\'s');
  assert.equal(await TouristVisaApplication.collection.countDocuments({ reference: stored.reference }), 1);
  assert.equal(await TouristVisaConfigSnapshot.countDocuments({ _id: stored.configSha256 }), 1);
});

test('submitting again after it was submitted is a 409 and changes nothing', async () => {
  const person = await readyApplication();
  assert.equal((await submit(person.token)).status, 200);
  const before = await rawDoc(person.appId);
  const again = await submit(person.token);
  assert.deepEqual([again.status, again.json.code], [409, 'ALREADY_SUBMITTED']);
  assert.deepEqual(await rawDoc(person.appId), before);
});

test('what was checked is what is submitted: a change between the check and the write makes it check again', async () => {
  const person = await readyApplication();
  let touched = false;
  const wrapped = Object.create(repository);
  wrapped.saveConfigSnapshot = async (...args) => {
    await repository.saveConfigSnapshot(...args);
    if (!touched) {
      touched = true; // another request changes the application after it was checked
      await TouristVisaApplication.collection.updateOne({ _id: oid(person.appId) }, { $set: { updatedAt: new Date(Date.now() + 5000) } });
    }
  };
  const service = new TouristVisaApplicationService({ repository: wrapped });
  const result = await service.submit(person.user._id, { declarationAccepted: true });
  assert.equal(touched, true);
  assert.equal(result.application.status, 'submitted', 'it checked again and then submitted');

  // If it keeps changing, it gives up with a clear answer instead of submitting something it did not check.
  const other = await readyApplication();
  const restless = Object.create(repository);
  restless.saveConfigSnapshot = async (...args) => {
    await repository.saveConfigSnapshot(...args);
    await TouristVisaApplication.collection.updateOne({ _id: oid(other.appId) }, { $set: { updatedAt: new Date(Date.now() + Math.random() * 1e6) } });
  };
  await assert.rejects(
    () => new TouristVisaApplicationService({ repository: restless }).submit(other.user._id, { declarationAccepted: true }),
    (error) => error.statusCode === 409 && error.code === 'APPLICATION_CHANGED'
  );
  assert.equal((await rawDoc(other.appId)).status, 'draft');
});

test('the repository\'s own guard: the conditional write matches only the owner\'s draft that has not changed', async () => {
  const person = await readyApplication();
  const stored = await rawDoc(person.appId);
  const write = (applicantId, overrides = {}) => repository.submitApplication(person.appId, applicantId, {
    expectedUpdatedAt: stored.updatedAt, reference: 'TV-GUARDED2', configSha256: 'a'.repeat(64), configVersion: 'test',
    declarationRecord: { wordingSha256: 'b'.repeat(64), configVersion: 'test', acceptedAt: new Date(), acceptedBy: person.user._id }, submittedAt: new Date(), ...overrides,
  });
  assert.equal(await write(new mongoose.Types.ObjectId()), null, 'not the owner');
  assert.equal(await write(person.user._id, { expectedUpdatedAt: new Date(stored.updatedAt.getTime() - 1) }), null, 'it changed since it was checked');
  assert.equal((await rawDoc(person.appId)).status, 'draft');
  const done = await write(person.user._id);
  assert.equal(done.status, 'submitted');
  // Already submitted: the very same call, even with the matching time, matches nothing.
  const after = await rawDoc(person.appId);
  assert.equal(await write(person.user._id, { expectedUpdatedAt: after.updatedAt, reference: 'TV-GUARDED3' }), null, 'not a draft any more');
  assert.equal((await rawDoc(person.appId)).reference, 'TV-GUARDED2');
});

// ---------------------------------------------------------------------------
// Locked after submit
// ---------------------------------------------------------------------------

test('trying to submit an application that is already submitted refuses at once: no config is stored for it, nothing is written', async () => {
  const person = await readyApplication();
  assert.equal((await submit(person.token)).status, 200);
  const before = await rawDoc(person.appId);
  const snapshotsBefore = await TouristVisaConfigSnapshot.countDocuments({});
  // The live config has moved on since. A second attempt must not store the new config for an application that was submitted under the old one.
  const moved = JSON.parse(JSON.stringify(engine.config));
  moved.version = '98.0.0-test';
  moved.declarations.submit.text = 'Another declaration entirely.';
  const later = new TouristVisaApplicationService({ config: moved });
  await assert.rejects(() => later.submit(person.user._id, { declarationAccepted: true }), (error) => error.statusCode === 409 && error.code === 'ALREADY_SUBMITTED');
  assert.equal(await TouristVisaConfigSnapshot.countDocuments({}), snapshotsBefore, 'no snapshot was added');
  assert.deepEqual(await rawDoc(person.appId), before, 'nothing was written');
});

test('after submit nothing can be changed: saving a section, uploading and deleting a file all fail', async () => {
  const person = await readyApplication();
  const fileId = (await api('GET', '/applications/me/documents', { token: person.token })).json.data.documents[0].id;
  assert.equal((await submit(person.token)).status, 200);
  const before = await rawDoc(person.appId);

  const save = await put(person.token, '1', SECTIONS[0][1]);
  assert.equal(save.status, 409);
  assert.match(save.json.message, /submitted and can no longer be edited/);
  const up = await upload(person.token, 'funds');
  assert.deepEqual([up.status, up.json.code], [409, 'DOCUMENTS_LOCKED']);
  const del = await api('DELETE', `/applications/me/documents/${fileId}`, { token: person.token });
  assert.deepEqual([del.status, del.json.code], [409, 'DOCUMENTS_LOCKED']);
  const resave = await put(person.token, '10D', {});
  assert.equal(resave.status, 409);
  assert.deepEqual(await rawDoc(person.appId), before, 'not a byte changed');
  // Starting an application again gives back the submitted one, not a second draft.
  const again = await api('POST', '/applications', { token: person.token });
  assert.equal(again.json.data.application.id, person.appId);
  assert.equal(again.json.data.application.status, 'submitted');
});

// ---------------------------------------------------------------------------
// The reference
// ---------------------------------------------------------------------------

test('a reference is TV- and eight characters without look-alikes, and every one is different', () => {
  assert.equal(REFERENCE_ALPHABET.length, 31);
  for (const ambiguous of ['0', 'O', '1', 'I', 'L']) assert.equal(REFERENCE_ALPHABET.includes(ambiguous), false, ambiguous);
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const reference = generateReference();
    assert.match(reference, REFERENCE);
    seen.add(reference);
  }
  assert.equal(seen.size, 2000, 'no repeats in 2,000');
  assert.equal(generateReference(() => 0), 'TV-AAAAAAAA');
  assert.equal(generateReference((n) => n - 1), 'TV-99999999');
});

test('a reference is unique in the database: a second application cannot take it', async () => {
  const a = await start();
  const b = await start();
  await TouristVisaApplication.collection.updateOne({ _id: oid(a.appId) }, { $set: { reference: 'TV-UNIQUE22' } });
  await assert.rejects(
    () => TouristVisaApplication.collection.updateOne({ _id: oid(b.appId) }, { $set: { reference: 'TV-UNIQUE22' } }),
    (error) => error.code === 11000
  );
  // Applications without a reference do not collide with each other.
  const c = await start();
  const d = await start();
  assert.equal((await rawDoc(c.appId)).reference, undefined);
  assert.equal((await rawDoc(d.appId)).reference, undefined);
});

test('when a reference is already taken another is tried, and the application still submits', async () => {
  const taken = await start();
  await TouristVisaApplication.collection.updateOne({ _id: oid(taken.appId) }, { $set: { reference: 'TV-AAAAAAAA' } });
  const person = await readyApplication();
  const offered = ['TV-AAAAAAAA', 'TV-AAAAAAAA', 'TV-BBBBBBBB'];
  const service = new TouristVisaApplicationService({ newReference: () => offered.shift() });
  const result = await service.submit(person.user._id, { declarationAccepted: true });
  assert.equal(result.reference, 'TV-BBBBBBBB');
  assert.equal(offered.length, 0, 'two collisions, then one that was free');
  assert.equal((await rawDoc(person.appId)).reference, 'TV-BBBBBBBB');
  assert.equal((await rawDoc(taken.appId)).reference, 'TV-AAAAAAAA', 'the other application keeps its own');
});

test('if no free reference is found, the application stays a draft and the answer is a clean 503', async () => {
  const taken = await start();
  await TouristVisaApplication.collection.updateOne({ _id: oid(taken.appId) }, { $set: { reference: 'TV-CCCCCCCC' } });
  const person = await readyApplication();
  const service = new TouristVisaApplicationService({ newReference: () => 'TV-CCCCCCCC' });
  const log = capture();
  try {
    await assert.rejects(() => service.submit(person.user._id, { declarationAccepted: true }), (error) => error.statusCode === 503 && error.code === 'REFERENCE_UNAVAILABLE');
  } finally { log.restore(); }
  assert.equal((await rawDoc(person.appId)).status, 'draft');
  assertNoSecrets(log.lines.join('\n'), 'the log');
});

// ---------------------------------------------------------------------------
// Ownership, sign-in, the feature gate
// ---------------------------------------------------------------------------

test('one applicant cannot submit or read another\'s application', async () => {
  const mine = await readyApplication();
  const theirs = await start(); // a draft with nothing in it
  const res = await submit(theirs.token);
  assert.equal(res.status, 422, 'their own, incomplete, application is the one that is checked');
  assert.equal((await rawDoc(mine.appId)).status, 'draft', 'mine was not touched');
  assert.equal((await submit(mine.token)).status, 200);
  assert.equal((await rawDoc(theirs.appId)).status, 'draft');
  const theirReview = await api('GET', '/applications/me/review', { token: theirs.token });
  assert.equal(theirReview.status, 200);
  assert.equal(theirReview.json.data.reference, null);
  assert.equal(JSON.stringify(theirReview.json).includes(SECRET_ID), false, 'my passport number is not in their review');
  assert.equal(theirReview.json.data.status, 'draft');
});

test('signing in is required for both routes', async () => {
  for (const [method, path] of [['POST', '/applications/me/submit'], ['GET', '/applications/me/review']]) {
    assert.equal((await api(method, path, { body: method === 'POST' ? { declarationAccepted: true } : undefined })).status, 401, path);
    assert.equal((await api(method, path, { token: 'not-a-token', body: method === 'POST' ? { declarationAccepted: true } : undefined })).status, 401, path);
  }
});

test('while the feature is closed both routes answer 404 FEATURE_CLOSED and nothing is submitted', async () => {
  const person = await readyApplication();
  process.env.TOURIST_VISA_ENABLED = 'false';
  try {
    for (const res of [await submit(person.token), await api('GET', '/applications/me/review', { token: person.token })]) {
      assert.equal(res.status, 404);
      assert.equal(res.json.code, 'FEATURE_CLOSED');
    }
  } finally {
    process.env.TOURIST_VISA_ENABLED = 'true';
  }
  assert.equal((await rawDoc(person.appId)).status, 'draft');
});

// ---------------------------------------------------------------------------
// Nothing sensitive in an error or a log
// ---------------------------------------------------------------------------

test('a failure inside the submit gives a plain 500 and no answer reaches the response or the log', async () => {
  const person = await readyApplication();
  const failing = mock.method(repository, 'submitApplication', async () => { throw new Error(`database is down ${SECRET_ID} ${SECRET_NI}`); });
  const log = capture();
  let res;
  try { res = await submit(person.token); } finally { log.restore(); failing.mock.restore(); }
  assert.equal(res.status, 500);
  assertNoSecrets(res.text, 'the response');
  assertNoSecrets(log.lines.join('\n'), 'the log');
  assert.equal((await rawDoc(person.appId)).status, 'draft');
  assert.equal((await submit(person.token)).status, 200, 'and it can be tried again');
});

test('a successful submit and every refusal leave no answer in the log', async () => {
  const log = capture();
  try {
    const ok = await readyApplication();
    const bad = await complete(await start(), { skip: ['3'] });
    await submit(bad.token);
    await submit(ok.token, { declarationAccepted: false });
    await submit(ok.token);
    await submit(ok.token);
    await api('GET', '/applications/me/review', { token: ok.token });
  } finally { log.restore(); }
  assertNoSecrets(log.lines.join('\n'), 'the log');
});

test('the review of a draft shows the live config, the files by name, and no reference yet', async () => {
  const person = await readyApplication();
  const res = await api('GET', '/applications/me/review', { token: person.token });
  assert.equal(res.status, 200);
  const data = res.json.data;
  assert.equal(data.status, 'draft');
  assert.equal(data.reference, null);
  assert.equal(data.submittedAt, null);
  assert.equal(data.declaration.acceptedAt, null);
  assert.equal(data.documentsComplete, true);
  const rows = data.review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows));
  assert.deepEqual(rows.find((r) => r.id === 'q10_7').files.map((f) => f.name), ['funds-file.pdf']);
  assert.equal(rows.find((r) => r.id === 'q1_6').value, '1 March 2027');
});
