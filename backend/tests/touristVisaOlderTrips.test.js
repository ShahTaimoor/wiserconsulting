'use strict';

// Config 1.3.0: "Have you travelled to any other country more than 10 years ago?" (8.3) and its group of older trips (8.3a to 8.3d),
// through the real routes: saving, the 10-year cutoff, readiness, submitting, the review, the answers PDF, the administrator's edit,
// and an application submitted under 1.2.0 (no 8.3), which keeps its own config. An in-memory replica set, a fake file storage,
// made-up users and answers. Dates are worked out from today because the server checks them against the real clock.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.TOURIST_VISA_ENABLED = 'true';
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const User = require('../models/User');
const TouristVisaApplication = require('../models/TouristVisaApplication');
const TouristVisaAudit = require('../models/TouristVisaAudit');
const TouristVisaChange = require('../models/TouristVisaChange');
const TouristVisaNote = require('../models/TouristVisaNote');
const TouristVisaCoverLetter = require('../models/TouristVisaCoverLetter');
const TouristVisaItinerary = require('../models/TouristVisaItinerary');
const TouristVisaConfigSnapshot = require('../models/TouristVisaConfigSnapshot');
const engine = require('../shared/tourist-visa/engine');
const documentService = require('../services/touristVisaDocumentService');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const { FILE_NAME, SECTIONS } = require('./helpers/touristVisaFixtures');
const { uploadRemainingShared } = require('./helpers/documentSlots');
const { inspectPdf } = require('./helpers/pdfInspect');

let replSet;
let server;
let baseUrl;
let userCounter = 0;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  for (const model of [TouristVisaApplication, TouristVisaAudit, TouristVisaChange, TouristVisaNote, TouristVisaCoverLetter, TouristVisaItinerary, TouristVisaConfigSnapshot]) await model.init();
  const app = express();
  app.use('/api/tourist-visa', touristVisaBodyParser);
  app.use(express.json());
  app.use('/api/tourist-visa', touristVisaRoutes);
  app.use(errorHandler);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}, { timeout: 180000 });

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

class FakeStorage {
  isConfigured() { return true; }
  async upload(buffer, { applicationId, extension }) { return { publicId: `tourist-visa/${applicationId}/${crypto.randomBytes(8).toString('hex')}.${extension}`, resourceType: 'raw', bytes: buffer.length }; }
  async remove() {}
  temporaryUrl() { return 'https://fake-storage.invalid/download'; }
}
documentService.storage = new FakeStorage();

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${baseUrl}/api/tourist-visa${path}`, {
    method,
    headers: { ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}
async function getPdf(path, token) {
  const res = await fetch(`${baseUrl}/api/tourist-visa${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const bytes = Buffer.from(await res.arrayBuffer());
  const isPdf = (res.headers.get('content-type') || '').startsWith('application/pdf');
  return { status: res.status, buffer: isPdf ? bytes : null, text: isPdf ? '' : bytes.toString('utf8') };
}
async function makeUser(role = 0) {
  userCounter += 1;
  const user = await User.create({ name: `Older Trips ${userCounter}`, email: `test.oldertrips.${userCounter}@example.com`, password: 'not-a-real-password', role });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token, userId: String(user._id) };
}
const oid = (id) => new mongoose.Types.ObjectId(id);
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: oid(appId) });
const put = (token, sectionId, answers) => api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const submit = (token) => api('POST', '/applications/me/submit', { token, body: { declarationAccepted: true } });
const edit = (token, appId, body) => api('PUT', `/admin/applications/${appId}/changes`, { token, body });
const flat = (text) => text.replace(/\s+/g, ' ');
const rowsOf = (review) => review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows));

const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60, 0x20)]);
function upload(token, slot, name) {
  const form = new FormData();
  form.append('slot', slot);
  form.append('file', new Blob([PDF_BYTES], { type: 'application/pdf' }), name);
  return api('POST', '/applications/me/documents', { token, body: form });
}

// Dates (UTC, like the server). The cutoff is the day ten years before today; 29 February becomes 28 February.
const isoOf = (date) => date.toISOString().slice(0, 10);
const daysAgo = (n) => isoOf(new Date(Date.now() - n * 86400000));
const todayIso = () => daysAgo(0);
function cutoffIso() {
  const [y, m, d] = todayIso().split('-').map(Number);
  const day = m === 2 && d === 29 ? 28 : d;
  return `${String(y - 10).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
const shift = (iso, n) => isoOf(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000));

const TOO_RECENT = 'Trips in the last 10 years go in the travel history above.';
const TRIP = { q8_2a: 'FR', q8_2b: 'tourism', q8_2c: daysAgo(400), q8_2d: daysAgo(390) };
const OLD1 = { q8_3a: 'FR', q8_3b: 'tourism', q8_3c: '2003-03-01', q8_3d: '2003-03-10' };
const OLD2 = { q8_3a: 'DE', q8_3b: 'business', q8_3c: '2001-05-01', q8_3d: '2001-05-04' };
const S8_NO = { q8_1: 0, q8_2: false, q8_3: false };
const S8_OLD = { q8_1: 0, q8_2: false, q8_3: true, olderCountryTrips: [OLD1, OLD2] };

async function readyApplicant(section8 = S8_NO) {
  const person = await makeUser(0);
  const created = await api('POST', '/applications', { token: person.token });
  const appId = created.json.data.application.id;
  for (const [id, answers] of SECTIONS('Testfirst', 'Testlast', 'test.older@example.com')) {
    const res = await put(person.token, id, id === '8' ? section8 : answers);
    assert.equal(res.status, 200, `${id}: ${JSON.stringify(res.json)}`);
  }
  assert.equal((await upload(person.token, 'passport', FILE_NAME)).status, 201);
  assert.equal((await upload(person.token, 'funds', 'bank-statement.pdf')).status, 201);
  await uploadRemainingShared(upload, person.token);
  return { ...person, appId };
}
async function submitted(section8 = S8_NO) {
  const person = await readyApplicant(section8);
  const res = await submit(person.token);
  assert.equal(res.status, 200, res.text);
  return person;
}
const olderPut = (token, entry, extra = {}) => put(token, '8', { q8_1: 0, q8_2: false, q8_3: true, olderCountryTrips: [entry], ...extra });

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

test('8.3 Yes with older trips is saved; the answers come back as they were sent', async () => {
  const person = await makeUser();
  await api('POST', '/applications', { token: person.token });
  const res = await put(person.token, '8', S8_OLD);
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.json.data.removed, []);
  const mine = await api('GET', '/applications/me', { token: person.token });
  assert.equal(mine.json.data.application.answers.q8_3, true);
  assert.deepEqual(mine.json.data.application.answers.olderCountryTrips, [OLD1, OLD2]);
  assert.equal(mine.json.data.application.sectionStatus['8'], 'saved');
});

test('8.3 is required: Part 8 saved without it is refused, and 8.3 Yes needs at least one entry', async () => {
  const person = await makeUser();
  await api('POST', '/applications', { token: person.token });
  const missing = await put(person.token, '8', { q8_1: 0, q8_2: false });
  assert.equal(missing.status, 422);
  assert.deepEqual(missing.json.errors, { q8_3: 'This question is required' });
  const none = await put(person.token, '8', { q8_1: 0, q8_2: false, q8_3: true });
  assert.equal(none.status, 422);
  assert.deepEqual(none.json.errors, { olderCountryTrips: 'Add at least one entry' });
  const blank = await put(person.token, '8', { q8_1: 0, q8_2: false, q8_3: true, olderCountryTrips: [{}] });
  assert.deepEqual(Object.keys(blank.json.errors).sort(), ['olderCountryTrips.0.q8_3a', 'olderCountryTrips.0.q8_3b', 'olderCountryTrips.0.q8_3c', 'olderCountryTrips.0.q8_3d']);
  for (const message of Object.values(blank.json.errors)) assert.equal(message, 'This question is required');
});

test('8.3 No removes the older trips saved before, and leaves the recent trips alone', async () => {
  const person = await readyApplicant({ q8_1: 2, q8_2: true, otherCountryTrips: [TRIP], q8_3: true, olderCountryTrips: [OLD1] });
  const res = await put(person.token, '8', { q8_1: 2, q8_2: true, otherCountryTrips: [TRIP], q8_3: false, olderCountryTrips: [OLD1] });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.json.data.removed, ['olderCountryTrips']);
  const stored = await rawDoc(person.appId);
  assert.equal('olderCountryTrips' in stored.answers, false);
  assert.equal(stored.answers.q8_3, false);
  assert.equal(stored.answers.otherCountryTrips.length, 1);
  assert.equal(JSON.stringify(stored.answers).includes('2003-03-01'), false, 'nothing of the removed trip is left');
});

// ---------------------------------------------------------------------------
// The 10-year cutoff
// ---------------------------------------------------------------------------

test('cutoff: the day before it is an older trip, the cutoff day and every later day are refused with the message', async () => {
  const person = await makeUser();
  await api('POST', '/applications', { token: person.token });
  const cutoff = cutoffIso();
  const entry = (leave) => ({ ...OLD1, q8_3c: '1990-01-01', q8_3d: leave });
  assert.equal((await olderPut(person.token, entry(shift(cutoff, -1)))).status, 200);
  for (const leave of [cutoff, shift(cutoff, 1), daysAgo(100), daysAgo(1)]) {
    const res = await olderPut(person.token, entry(leave));
    assert.equal(res.status, 422, leave);
    assert.deepEqual(res.json.errors, { 'olderCountryTrips.0.q8_3d': TOO_RECENT }, leave);
  }
  const future = await olderPut(person.token, entry(shift(todayIso(), 5)));
  assert.deepEqual(future.json.errors, { 'olderCountryTrips.0.q8_3d': 'Cannot be in the future' });
});

test('cutoff: Part 8 itself behaves as before, the other way round (the cutoff day is in, the day before is out)', async () => {
  const person = await makeUser();
  await api('POST', '/applications', { token: person.token });
  const cutoff = cutoffIso();
  const recent = (leave) => put(person.token, '8', { q8_1: 0, q8_2: true, q8_3: false, otherCountryTrips: [{ ...TRIP, q8_2c: '1990-01-01', q8_2d: leave }] });
  assert.equal((await recent(cutoff)).status, 200);
  const before = await recent(shift(cutoff, -1));
  assert.equal(before.status, 422);
  assert.deepEqual(before.json.errors, { 'otherCountryTrips.0.q8_2d': 'Must be within the past 10 years' });
});

test('dates in an older trip: the leave date follows the arrival date and neither is in the future', async () => {
  const person = await makeUser();
  await api('POST', '/applications', { token: person.token });
  const back = await olderPut(person.token, { ...OLD1, q8_3c: '2003-03-10', q8_3d: '2003-03-09' });
  assert.deepEqual(back.json.errors, { 'olderCountryTrips.0.q8_3d': 'Must be on or after the date in question 8.3c' });
  assert.equal((await olderPut(person.token, { ...OLD1, q8_3c: '2003-03-10', q8_3d: '2003-03-10' })).status, 200, 'the same day is allowed');
  const ahead = await olderPut(person.token, { ...OLD1, q8_3c: shift(todayIso(), 5), q8_3d: shift(todayIso(), 9) });
  assert.deepEqual(ahead.json.errors, { 'olderCountryTrips.0.q8_3c': 'Cannot be in the future', 'olderCountryTrips.0.q8_3d': 'Cannot be in the future' });
  const country = await olderPut(person.token, { ...OLD1, q8_3a: 'ZZ' });
  assert.deepEqual(country.json.errors, { 'olderCountryTrips.0.q8_3a': 'Choose a country from the list' });
});

// ---------------------------------------------------------------------------
// Readiness and submitting
// ---------------------------------------------------------------------------

test('an application with 8.3 never answered is not ready: section 8 is named, nothing is submitted; answering it makes it ready', async () => {
  const person = await readyApplicant();
  // As a draft saved before 8.3 existed: 8.3 is not in the stored answers.
  await TouristVisaApplication.collection.updateOne({ _id: oid(person.appId) }, { $unset: { 'answers.q8_3': '' } });
  const before = await rawDoc(person.appId);
  const refused = await submit(person.token);
  assert.equal(refused.status, 422, refused.text);
  assert.equal(refused.json.code, 'NOT_READY');
  assert.deepEqual(refused.json.sections.map((s) => s.id), ['8']);
  assert.equal(refused.json.sections[0].problems, 1);
  assert.equal((await rawDoc(person.appId)).status, 'draft');
  assert.deepEqual((await rawDoc(person.appId)).answers, before.answers, 'a refused submit writes nothing');

  assert.equal((await put(person.token, '8', S8_NO)).status, 200);
  assert.equal((await submit(person.token)).status, 200);
});

test('a whole application is submitted without older trips (8.3 No) and with two older trips, under config 1.5.0', async () => {
  const without = await submitted(S8_NO);
  const a = await rawDoc(without.appId);
  assert.equal(a.status, 'submitted');
  assert.equal(a.configVersion, '1.5.0');
  assert.equal(a.answers.q8_3, false);
  assert.equal('olderCountryTrips' in a.answers, false);

  const withOlder = await submitted(S8_OLD);
  const b = await rawDoc(withOlder.appId);
  assert.equal(b.status, 'submitted');
  assert.equal(b.configVersion, '1.5.0');
  assert.equal(b.answers.q8_3, true);
  assert.equal(b.answers.olderCountryTrips.length, 2);
  const snapshot = await TouristVisaConfigSnapshot.findById(b.configSha256).lean();
  assert.ok(JSON.parse(snapshot.json).groups.some((g) => g.id === 'olderCountryTrips'), 'the config it was submitted under has the group');
});

// ---------------------------------------------------------------------------
// The review and the answers PDF
// ---------------------------------------------------------------------------

test('the review shows 8.3 and the older trips under their own names, apart from the recent trips', async () => {
  const person = await readyApplicant({ q8_1: 1, q8_2: true, otherCountryTrips: [TRIP], q8_3: true, olderCountryTrips: [OLD1, OLD2] });
  const review = await api('GET', '/applications/me/review', { token: person.token });
  assert.equal(review.status, 200, review.text);
  const rows = rowsOf(review.json.data.review);
  const gate = rows.find((r) => r.id === 'q8_3');
  assert.equal(gate.number, '8.3');
  assert.equal(gate.label, 'Have you travelled to any other country more than 10 years ago?');
  assert.equal(gate.value, 'Yes');
  const older = rows.find((r) => r.id === 'olderCountryTrips');
  assert.equal(older.value, '2 entries');
  assert.deepEqual(older.entries.map((e) => e.title), ['Older trip 1', 'Older trip 2']);
  assert.deepEqual(older.entries[0].rows.map((r) => r.number), ['8.3a', '8.3b', '8.3c', '8.3d']);
  assert.deepEqual(older.entries[0].rows.map((r) => r.value), ['France', 'Tourism or holiday', '1 March 2003', '10 March 2003']);
  assert.equal(older.entries[1].rows[0].value, 'Germany');
  const recent = rows.find((r) => r.id === 'otherCountryTrips');
  assert.deepEqual(recent.entries.map((e) => e.title), ['Trip 1']);
  assert.ok(rows.findIndex((r) => r.id === 'otherCountryTrips') < rows.findIndex((r) => r.id === 'q8_3'), '8.3 follows the recent trips');
});

test('the review with 8.3 No shows the answer and no older trips', async () => {
  const person = await readyApplicant(S8_NO);
  const rows = rowsOf((await api('GET', '/applications/me/review', { token: person.token })).json.data.review);
  assert.equal(rows.find((r) => r.id === 'q8_3').value, 'No');
  assert.equal(rows.some((r) => r.id === 'olderCountryTrips'), false);
});

test('the answers PDF prints the older trips under their own heading, in the same table style as the recent trips', async () => {
  const person = await submitted({ q8_1: 1, q8_2: true, otherCountryTrips: [TRIP], q8_3: true, olderCountryTrips: [OLD1, OLD2] });
  const mine = await getPdf('/applications/me/pdf/answers', person.token);
  assert.equal(mine.status, 200, mine.text);
  const pdf = await inspectPdf(mine.buffer);
  for (const needle of ['Older trip 1', 'Older trip 2', 'Trip 1', 'France', 'Germany', '1 March 2003', '10 March 2003', '4 May 2001', 'Have you travelled to any other country more than 10']) {
    assert.ok(flat(pdf.text).includes(needle), `${needle} is in the PDF`);
  }
  assert.ok(pdf.text.indexOf('Trip 1') < pdf.text.indexOf('Older trip 1'), 'the recent trips come first');
  const admin = await makeUser(1);
  const theirs = await getPdf(`/admin/applications/${person.appId}/pdf/answers`, admin.token);
  assert.equal(theirs.status, 200);
  assert.ok((await inspectPdf(theirs.buffer)).text.includes('Older trip 2'), 'the administrator\'s copy has them too');
});

test('the answers PDF without older trips has no older-trip heading', async () => {
  const person = await submitted(S8_NO);
  const pdf = await inspectPdf((await getPdf('/applications/me/pdf/answers', person.token)).buffer);
  assert.ok(flat(pdf.text).includes('Have you travelled to any other country more than 10'));
  assert.equal(pdf.text.includes('Older trip'), false);
});

// ---------------------------------------------------------------------------
// The administrator
// ---------------------------------------------------------------------------

test('the administrator sees the older trips, the edit form offers them, and a correction is checked with the same rule', async () => {
  const person = await submitted(S8_OLD);
  const admin = await makeUser(1);
  const overview = await api('GET', `/admin/applications/${person.appId}`, { token: admin.token });
  assert.equal(overview.status, 200, overview.text);
  const rows = rowsOf(overview.json.data.review);
  assert.deepEqual(rows.find((r) => r.id === 'olderCountryTrips').entries.map((e) => e.title), ['Older trip 1', 'Older trip 2']);

  const form = await api('GET', `/admin/applications/${person.appId}/edit-form`, { token: admin.token });
  assert.equal(form.status, 200, form.text);
  assert.ok(form.text.includes('q8_3d') && form.text.includes('olderCountryTrips'), 'the edit form has the new fields');

  const REASON = 'MADE-UP-REASON: corrected after the phone call';
  const recent = await edit(admin.token, person.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q8_3d', index: 0, value: daysAgo(60) }] });
  assert.ok([400, 422].includes(recent.status), recent.text);
  assert.ok(recent.text.includes(TOO_RECENT), 'the correction is refused with the same message');
  assert.deepEqual((await rawDoc(person.appId)).answers.olderCountryTrips.length, 2, 'nothing changed');

  const fixed = await edit(admin.token, person.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q8_3a', index: 0, value: 'IT' }, { questionId: 'q8_3d', index: 0, value: '2003-03-12' }] });
  assert.equal(fixed.status, 200, fixed.text);
  const review = await api('GET', `/admin/applications/${person.appId}`, { token: admin.token });
  const entry = rowsOf(review.json.data.review).find((r) => r.id === 'olderCountryTrips').entries[0];
  assert.deepEqual(entry.rows.map((r) => r.value), ['Italy', 'Tourism or holiday', '1 March 2003', '12 March 2003']);
});

test('the administrator can change 8.3 to No: the older trips are removed and listed in the preview', async () => {
  const person = await submitted(S8_OLD);
  const admin = await makeUser(1);
  const body = { expectedRevision: 0, changes: [{ questionId: 'q8_3', value: false }] };
  const preview = await edit(admin.token, person.appId, { ...body, dryRun: true });
  assert.equal(preview.status, 200, preview.text);
  assert.deepEqual(preview.json.data.changes.map((c) => [c.questionId, c.old, c.new]), [['q8_3', 'Yes', 'No']]);
  assert.equal(preview.json.data.removed.length, 8, '4 fields in each of 2 older trips');
  assert.equal((await rawDoc(person.appId)).answers.olderCountryTrips.length, 2, 'the preview removed nothing');
  assert.equal((await edit(admin.token, person.appId, { ...body, reason: 'MADE-UP-REASON: they never travelled' })).status, 200);
  const stored = await rawDoc(person.appId);
  assert.equal('olderCountryTrips' in stored.answers, false);
  assert.equal(stored.answers.q8_3, false);
});

// ---------------------------------------------------------------------------
// An application submitted under 1.2.0 (no 8.3)
// ---------------------------------------------------------------------------

async function oldConfig() {
  const old = JSON.parse(JSON.stringify(engine.config));
  old.version = '1.2.0';
  old.questions = old.questions.filter((q) => !/^q8_3/.test(q.id));
  old.groups = old.groups.filter((g) => g.id !== 'olderCountryTrips');
  const json = JSON.stringify(old);
  const sha = crypto.createHash('sha256').update(json, 'utf8').digest('hex');
  await TouristVisaConfigSnapshot.updateOne({ _id: sha }, { $setOnInsert: { version: old.version, json, createdAt: new Date() } }, { upsert: true });
  return { sha, old };
}

test('an application submitted under 1.2.0 keeps its config: it opens, reviews, exports and edits without 8.3, and nothing asks for it', async () => {
  const person = await submitted(S8_NO);
  const { sha, old } = await oldConfig();
  assert.equal(old.questions.some((q) => q.id === 'q8_3'), false);
  await TouristVisaApplication.collection.updateOne({ _id: oid(person.appId) }, { $set: { configSha256: sha, configVersion: '1.2.0' }, $unset: { 'answers.q8_3': '' } });
  const before = await rawDoc(person.appId);

  const mine = await api('GET', '/applications/me', { token: person.token });
  assert.equal(mine.status, 200, mine.text);
  assert.equal(mine.json.data.application.configVersion, '1.2.0');
  assert.equal(mine.json.data.application.status, 'submitted');

  const review = await api('GET', '/applications/me/review', { token: person.token });
  assert.equal(review.status, 200, review.text);
  const rows = rowsOf(review.json.data.review);
  assert.equal(rows.some((r) => r.id === 'q8_3' || r.id === 'olderCountryTrips'), false, 'the old config has no 8.3');
  assert.ok(rows.some((r) => r.id === 'q8_2'), 'the rest of Part 8 is there');

  const pdf = await getPdf('/applications/me/pdf/answers', person.token);
  assert.equal(pdf.status, 200, pdf.text);
  const text = (await inspectPdf(pdf.buffer)).text;
  assert.equal(text.includes('more than 10 years ago'), false);
  assert.equal(text.includes('Older trip'), false);

  const admin = await makeUser(1);
  assert.equal((await api('GET', `/admin/applications/${person.appId}`, { token: admin.token })).status, 200);
  const adminPdf = await getPdf(`/admin/applications/${person.appId}/pdf/answers`, admin.token);
  assert.equal(adminPdf.status, 200);
  const form = await api('GET', `/admin/applications/${person.appId}/edit-form`, { token: admin.token });
  assert.equal(form.status, 200, form.text);
  assert.equal(form.text.includes('q8_3'), false, 'the edit form is built from the old config');
  // A correction elsewhere still works, and does not ask for 8.3.
  const fixed = await edit(admin.token, person.appId, { expectedRevision: 0, reason: 'MADE-UP-REASON: a typo', changes: [{ questionId: 'q8_1', value: 2 }] });
  assert.equal(fixed.status, 200, fixed.text);
  const after = await rawDoc(person.appId);
  assert.equal(after.configSha256, before.configSha256, 'it stays on the config it was submitted under');
  assert.equal(after.configVersion, '1.2.0');
  assert.equal('q8_3' in after.answers, false);
});
