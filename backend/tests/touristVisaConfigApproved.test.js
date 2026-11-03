'use strict';

// Config 1.0.0: the senior approved the design as final, the draft markers were removed and the version became 1.0.0.
// These tests prove that nothing already stored is affected: a draft saved under 0.12.0-draft keeps its answers, statuses
// and Part 9 ticks and can still be submitted; an application submitted under 0.12.0-draft is still shown (applicant,
// admin Overview and edit form) with the config snapshot it was submitted under, and can still be corrected.
// In-memory MongoDB replica set (an admin correction is a transaction), fake file storage, made-up data.

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
const TouristVisaConfigSnapshot = require('../models/TouristVisaConfigSnapshot');
const documentService = require('../services/touristVisaDocumentService');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const engine = require('../shared/tourist-visa/engine');
const { SECTIONS, FILE_NAME } = require('./helpers/touristVisaFixtures');

let replSet;
let server;
let baseUrl;
let userCounter = 0;
const clone = (o) => JSON.parse(JSON.stringify(o));
const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  for (const model of [TouristVisaApplication, TouristVisaAudit, TouristVisaChange, TouristVisaConfigSnapshot]) await model.init();
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

documentService.storage = {
  isConfigured: () => true,
  async upload(buffer, { applicationId, extension }) { return { publicId: `tourist-visa/${applicationId}/${crypto.randomBytes(8).toString('hex')}.${extension}`, resourceType: 'raw', bytes: buffer.length }; },
  async remove() {},
  temporaryUrl() { return 'https://fake-storage.invalid/x'; },
};

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
async function makeUser(role = 0) {
  userCounter += 1;
  const user = await User.create({ name: `Approved ${userCounter}`, email: `test.approved.${userCounter}@example.com`, password: 'not-a-real-password', role });
  return { user, token: jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
}
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60, 0x20)]);
const upload = (token, slot, name) => {
  const form = new FormData();
  form.append('slot', slot);
  form.append('file', new Blob([PDF], { type: 'application/pdf' }), name);
  return api('POST', '/applications/me/documents', { token, body: form });
};
async function filledDraft() {
  const person = await makeUser();
  const created = await api('POST', '/applications', { token: person.token });
  const appId = created.json.data.application.id;
  for (const [id, answers] of SECTIONS()) assert.equal((await api('PUT', `/applications/me/sections/${id}`, { token: person.token, body: { answers } })).status, 200, id);
  assert.equal((await upload(person.token, 'passport', FILE_NAME)).status, 201);
  assert.equal((await upload(person.token, 'funds', 'bank-statement.pdf')).status, 201);
  return { ...person, appId };
}
const oid = (id) => new mongoose.Types.ObjectId(id);
const rowsOf = (review) => review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows));

/** The config as it was before approval: the same questions with draft notes on and the old version. Stored as a snapshot. */
async function oldSnapshot() {
  const old = clone(engine.config);
  old.version = '0.12.0-draft';
  old.questions.find((q) => q.id === 'q2_33').draft = 'Draft: a default we chose.';
  old.questions.find((q) => q.id === 'q9_11').draft = 'Draft: the tick and its guidance are our own plain wording.';
  old.declarations.submit.draft = 'Draft wording for the final declaration.';
  old.afterSubmit.draft = 'Draft wording for the text after submitting.';
  const json = JSON.stringify(old);
  await TouristVisaConfigSnapshot.updateOne({ _id: sha(json) }, { $setOnInsert: { version: old.version, json, createdAt: new Date() } }, { upsert: true });
  return { sha: sha(json), json, old };
}

test('the config is 1.0.x with no draft marker and nothing held, and the release switches are unchanged', () => {
  assert.equal(engine.config.version, '1.0.1');
  assert.equal(JSON.stringify(engine.config).includes('"draft"'), false);
  assert.deepEqual(engine.getHeldSections(engine.config), []);
  // The server switch is read from the environment, exactly true: nothing about it depends on the config.
  const gate = require('../middleware/touristVisaFeatureGate');
  assert.equal(gate.isTouristVisaEnabled(), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes']) {
    const was = process.env.TOURIST_VISA_ENABLED;
    if (value === undefined) delete process.env.TOURIST_VISA_ENABLED; else process.env.TOURIST_VISA_ENABLED = value;
    assert.equal(gate.isTouristVisaEnabled(), false, String(value));
    process.env.TOURIST_VISA_ENABLED = was;
  }
});

test('a draft saved under the old config keeps its answers, statuses and Part 9 ticks, and can still be submitted', async () => {
  const person = await filledDraft();
  await TouristVisaApplication.collection.updateOne({ _id: oid(person.appId) }, { $set: { configVersion: '0.12.0-draft' } });
  const before = await TouristVisaApplication.collection.findOne({ _id: oid(person.appId) });
  assert.equal(before.declarations.q9_11.wordingSha256, '1480306fdcedaaac124e2b576871a60958192bdc15dc6c685e9dddfb6e78ec0f', 'the tick was recorded with the hash the old wording had');

  const mine = await api('GET', '/applications/me', { token: person.token });
  assert.equal(mine.status, 200);
  const view = mine.json.data.application;
  assert.equal(view.configVersion, '0.12.0-draft', 'the version it was collected with is kept');
  assert.equal(view.answers.q9_11, true, 'the tick is still given: it is not asked for again');
  assert.equal(view.sectionStatus['9A'], 'saved');
  assert.ok(Object.values(view.sectionStatus).every((state) => state === 'saved'));
  assert.deepEqual(await TouristVisaApplication.collection.findOne({ _id: oid(person.appId) }), before, 'reading wrote nothing');

  const submit = await api('POST', '/applications/me/submit', { token: person.token, body: { declarationAccepted: true } });
  assert.equal(submit.status, 200, submit.text);
  const raw = await TouristVisaApplication.collection.findOne({ _id: oid(person.appId) });
  assert.equal(raw.status, 'submitted');
  assert.equal(raw.declarations.q9_11.wordingSha256, before.declarations.q9_11.wordingSha256, 'the tick record is untouched');
  assert.equal(raw.declarations.submit.wordingSha256, 'ba987cf2b54255d648605386afb9a756f9f8a62dbbe0bbf4a68d045c30dc0e8a', 'the final declaration was accepted for exactly the old words');
  assert.equal(raw.configVersion, engine.config.version, 'a submit records the config it is submitted under, as it always did');
  const snapshot = await TouristVisaConfigSnapshot.findById(raw.configSha256).lean();
  assert.equal(snapshot.version, engine.config.version, 'what it was submitted under now is the approved config');
  assert.equal(JSON.parse(snapshot.json).version, engine.config.version);
});

test('an application submitted under the old config is still shown with the snapshot it was submitted under, to the applicant and to an admin', async () => {
  const person = await filledDraft();
  assert.equal((await api('POST', '/applications/me/submit', { token: person.token, body: { declarationAccepted: true } })).status, 200);
  const admin = await makeUser(1);
  const { sha: oldSha, old } = await oldSnapshot();
  const before = await TouristVisaApplication.collection.findOne({ _id: oid(person.appId) });
  await TouristVisaApplication.collection.updateOne({ _id: oid(person.appId) }, { $set: { configSha256: oldSha, configVersion: old.version } });

  const mine = await api('GET', '/applications/me', { token: person.token });
  assert.equal(mine.status, 200);
  assert.equal(mine.json.data.application.configVersion, '0.12.0-draft');
  assert.equal(mine.json.data.application.status, 'submitted');

  const review = await api('GET', '/applications/me/review', { token: person.token });
  assert.equal(review.status, 200, review.text);
  assert.equal(review.json.data.configVersion, '0.12.0-draft');
  assert.equal(review.json.data.declaration.text, old.declarations.submit.text, 'the declaration as it was submitted');
  assert.equal(JSON.stringify(review.json.data).includes('Draft'), false, 'no draft wording is shown to the applicant');

  const overview = await api('GET', `/admin/applications/${person.appId}`, { token: admin.token });
  assert.equal(overview.status, 200, overview.text);
  assert.equal(overview.json.data.application.configVersion, '0.12.0-draft');
  assert.deepEqual(rowsOf(overview.json.data.review).map((r) => r.id), rowsOf(review.json.data.review).map((r) => r.id));
  assert.equal(rowsOf(overview.json.data.review).find((r) => r.id === 'q3_1').value, 'FAKE-PASSPORT-9876');

  const form = await api('GET', `/admin/applications/${person.appId}/edit-form`, { token: admin.token });
  assert.equal(form.status, 200);
  assert.equal(form.json.data.config.version, '0.12.0-draft', 'the form is built from the snapshot');

  // and it can still be corrected, validated against that snapshot
  const edit = await api('PUT', `/admin/applications/${person.appId}/changes`, { token: admin.token, body: { expectedRevision: 0, reason: 'A correction made after the config was approved.', changes: [{ questionId: 'q1_5', value: 'A corrected test trip.' }] } });
  assert.equal(edit.status, 200, edit.text);
  assert.equal((await TouristVisaApplication.collection.findOne({ _id: oid(person.appId) })).answers.q1_5, 'A corrected test trip.');
  assert.equal(before.configSha256 === oldSha, false);
});

test('the list shows applications submitted under either version; a new draft starts on 1.0.0', async () => {
  const admin = await makeUser(1);
  const list = await api('GET', '/admin/applications?pageSize=50', { token: admin.token });
  assert.equal(list.status, 200);
  assert.ok(list.json.data.applications.length >= 2);
  const fresh = await makeUser();
  const created = await api('POST', '/applications', { token: fresh.token });
  assert.equal(created.json.data.application.configVersion, engine.config.version);
});

test('the limits note in the config states exactly the limits the backend enforces, so the two cannot drift apart unnoticed', () => {
  const docs = require('../config/touristVisaDocuments');
  const note = engine.config.limits.note;
  const MB = 1024 * 1024;
  assert.match(note, new RegExp(`up to ${docs.MAX_FILE_BYTES / MB} MB per file`));
  assert.match(note, new RegExp(`${docs.MAX_TOTAL_BYTES / MB} MB in all`));
  assert.match(note, new RegExp(`passport up to ${docs.SLOTS.passport.max} files`));
  assert.match(note, new RegExp(`funds up to ${docs.SLOTS.funds.max}`));
  assert.match(note, /PDF, JPG or PNG/);
  assert.deepEqual(Object.values(docs.FILE_TYPES).map((t) => t.extension.toUpperCase()).sort(), ['JPG', 'PDF', 'PNG']);
  // the text limits it also states are the ones in the same object
  const { txtMax, lngMax, groupMax } = engine.config.limits;
  assert.match(note, new RegExp(`up to ${txtMax} characters for a short answer, up to ${lngMax.toLocaleString('en-GB')} for a long one, and up to ${groupMax} entries`));
  assert.equal(/Not yet confirmed|Proposed values/.test(note), false, 'nothing says the limits are unconfirmed');
});
