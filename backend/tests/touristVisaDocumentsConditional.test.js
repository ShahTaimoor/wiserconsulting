'use strict';

// Task A: document slots that are conditional (showWhen) and optional (required: false), through the real routes.
// The real config has only the passport and funds slots, so these tests put four more FILE questions into a COPY of the config
// (and give that copy to the services for the length of this file). Nothing here touches the real config.
//   salary   required, only when 5.1 is "employed"
//   bizreg   required, only when 5.1 is "self_employed"
//   other    optional, always on the list
//   sponsor  optional, only when 6.5 (someone else pays) is Yes
// In-memory MongoDB, a fake file storage, made-up data.

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
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const TouristVisaApplication = require('../models/TouristVisaApplication');
const TouristVisaConfigSnapshot = require('../models/TouristVisaConfigSnapshot');
const documentService = require('../services/touristVisaDocumentService');
const applicationService = require('../services/touristVisaApplicationService');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const engine = require('../shared/tourist-visa/engine');
const limits = require('../config/touristVisaDocuments');
const { SECTIONS, FILE_NAME } = require('./helpers/touristVisaFixtures');

const MB = 1024 * 1024;
const clone = (o) => JSON.parse(JSON.stringify(o));

function conditionalConfig() {
  const cfg = clone(engine.config);
  const file = (number, slot, extra) => ({ id: `q10_${number}`, number: `10.${number}`, section: '10D', label: `Label for ${slot}`, type: 'FILE', slot, maxFiles: 2, required: true, help: 'Made-up guidance.', ...extra });
  cfg.questions.push(
    file(8, 'salary', { showWhen: { q: 'q5_1', eq: 'employed' } }),
    file(9, 'bizreg', { showWhen: { q: 'q5_1', eq: 'self_employed' } }),
    file(10, 'other', { required: false }),
    file(11, 'sponsor', { required: false, showWhen: { q: 'q6_5', eq: true } })
  );
  assert.deepEqual(engine.validateConfig(cfg), []);
  return cfg;
}
const realConfig = engine.config;
const testConfig = conditionalConfig();
const real = { app: applicationService.config, doc: documentService.config, slots: documentService.slots };
function useConfig(cfg) {
  applicationService.config = cfg;
  applicationService.snapshot = undefined; // the stored copy of the config is worked out again for the new one
  documentService.config = cfg;
  documentService.slots = limits.slotsOf(cfg);
}

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
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  useConfig(testConfig);
}, { timeout: 120000 });

after(async () => {
  applicationService.config = real.app;
  applicationService.snapshot = undefined;
  documentService.config = real.doc;
  documentService.slots = real.slots;
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

/** Remembers what is "stored" so the tests can see what was kept and what was deleted. */
const fake = {
  live: new Map(),
  isConfigured: () => true,
  async upload(buffer, { applicationId, extension }) {
    const publicId = `tourist-visa/${applicationId}/${crypto.randomBytes(8).toString('hex')}.${extension}`;
    this.live.set(publicId, buffer.length);
    return { publicId, resourceType: 'raw', bytes: buffer.length };
  },
  async remove(publicId) { this.live.delete(publicId); },
  temporaryUrl() { return 'https://fake-storage.invalid/x'; },
};
documentService.storage = fake;

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
  const user = await User.create({ name: `Conditional ${userCounter}`, email: `test.conditional.${userCounter}@example.com`, password: 'not-a-real-password', role });
  return { user, token: jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
}
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60, 0x20)]);
const bigPdf = (bytes) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(bytes - 9, 0x20)]);
const upload = (token, slot, name = 'scan.pdf', buffer = PDF) => {
  const form = new FormData();
  form.append('slot', slot);
  form.append('file', new Blob([buffer], { type: 'application/pdf' }), name);
  return api('POST', '/applications/me/documents', { token, body: form });
};
const put = (token, sectionId, answers) => api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const submit = (token) => api('POST', '/applications/me/submit', { token, body: { declarationAccepted: true } });
const oid = (id) => new mongoose.Types.ObjectId(id);
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: oid(appId) });
const mine = async (token) => (await api('GET', '/applications/me', { token })).json.data.application;
const listFiles = async (token) => (await api('GET', '/applications/me/documents', { token })).json.data;

const repository = require('../repositories/touristVisaApplicationRepository');
/** Puts a file reference straight into the database (as an earlier version of the form could have left it), with a readable name. */
async function seedDocument(appId, slot, bytes, publicId = `tourist-visa/fake/${crypto.randomUUID()}.pdf`) {
  const id = crypto.randomUUID();
  await TouristVisaApplication.collection.updateOne({ _id: oid(appId) }, { $push: { documents: {
    id, slot, publicId, resourceType: 'raw', format: 'pdf', bytes, mime: 'application/pdf', uploadedAt: new Date(), originalName: repository.encryptDocumentName(appId, id, 'seeded.pdf'),
  } } });
  return id;
}

const ADDRESS = { line1: '1 Test Street', town: 'Testville', country: 'GB' };
const EMPLOYED = {
  q5_1: 'employed', q5_2: '2019-04', q5_3: 'Test Employer Ltd', q5_4: ADDRESS,
  q5_5: { countryCode: '+44', number: '20 7946 0000' }, q5_6: 'Test Analyst',
  q5_7: { amount: 2500, currency: 'GBP' }, q5_8: 'Made-up description of a made-up job.',
};
const SELF_EMPLOYED = {
  q5_1: 'self_employed', q5_1a: 'Test Trading Co', q5_1b: '2018-05', q5_1c: ADDRESS, q5_1d: 'Made-up business.', q5_1e: { amount: 3000, currency: 'GBP' },
};
const RETIRED = { q5_1: 'retired' };

/** A draft with every section saved. `employment` is the answer set for section 5 (retired by default). */
async function draft(employment = RETIRED) {
  const person = await makeUser();
  const created = await api('POST', '/applications', { token: person.token });
  const appId = created.json.data.application.id;
  for (const [id, answers] of SECTIONS()) {
    const res = await put(person.token, id, id === '5' ? employment : answers);
    assert.equal(res.status, 200, `${id}: ${JSON.stringify(res.json)}`);
  }
  return { ...person, appId };
}

// ---------------------------------------------------------------------------
// Which documents are on the list, and what blocks
// ---------------------------------------------------------------------------

test('the slots and their limits come from the config: the server lists every slot, with the maximum from the question', async () => {
  const person = await draft();
  const data = await listFiles(person.token);
  assert.deepEqual(data.limits.slots, { passport: { max: 3 }, funds: { max: 10 }, salary: { max: 2 }, bizreg: { max: 2 }, other: { max: 2 }, sponsor: { max: 2 } });
  assert.equal(data.limits.maxTotalBytes, 120 * MB);
  assert.equal(data.limits.maxFileBytes, 4 * MB);
});

test('a retired applicant needs only passport and funds: the two conditional slots are hidden, the optional one is never needed', async () => {
  const person = await draft(RETIRED);
  let app = await mine(person.token);
  assert.equal(app.documentsComplete, false);
  assert.equal(app.sectionStatus['10D'], undefined);

  assert.equal((await upload(person.token, 'passport')).status, 201);
  app = await mine(person.token);
  assert.equal(app.sectionStatus['10D'], 'in_progress');
  assert.equal((await upload(person.token, 'funds')).status, 201);
  app = await mine(person.token);
  assert.equal(app.documentsComplete, true, 'salary and bizreg are hidden and "other" is optional');
  assert.equal(app.sectionStatus['10D'], 'saved');

  const done = await submit(person.token);
  assert.equal(done.status, 200, done.text);
  assert.equal((await rawDoc(person.appId)).status, 'submitted');
});

test('an employed applicant also needs the salary document: the submit is refused until it is uploaded, then goes through', async () => {
  const person = await draft(EMPLOYED);
  await upload(person.token, 'passport');
  await upload(person.token, 'funds');
  let app = await mine(person.token);
  assert.equal(app.documentsComplete, false);
  assert.equal(app.sectionStatus['10D'], 'in_progress');

  const refused = await submit(person.token);
  assert.equal(refused.status, 422);
  assert.deepEqual(refused.json.sections, [{ id: '10D', problems: 1 }], 'one required document is missing: the salary one, not the optional one');
  assert.equal((await rawDoc(person.appId)).status, 'draft');

  assert.equal((await upload(person.token, 'salary')).status, 201);
  app = await mine(person.token);
  assert.equal(app.documentsComplete, true);
  assert.equal((await submit(person.token)).status, 200);
});

test('a self-employed applicant needs the business document, not the salary one', async () => {
  const person = await draft(SELF_EMPLOYED);
  await upload(person.token, 'passport');
  await upload(person.token, 'funds');
  const refused = await submit(person.token);
  assert.deepEqual(refused.json.sections, [{ id: '10D', problems: 1 }]);
  assert.equal((await upload(person.token, 'bizreg')).status, 201);
  assert.equal((await submit(person.token)).status, 200);
});

test('an optional slot never blocks, with or without files; a conditional optional slot appears only when its answer says so', async () => {
  const person = await draft(RETIRED);
  await upload(person.token, 'passport');
  await upload(person.token, 'funds');
  assert.equal((await mine(person.token)).documentsComplete, true);
  assert.equal((await upload(person.token, 'other')).status, 201, 'an optional slot takes files');
  assert.equal((await mine(person.token)).documentsComplete, true);
  // 6.5 is No: the sponsor slot is hidden
  assert.equal((await upload(person.token, 'sponsor')).status, 409);
});

// ---------------------------------------------------------------------------
// A hidden slot: the server refuses uploads to it
// ---------------------------------------------------------------------------

test('uploading to a slot that is hidden for the applicant is refused on the server, with a clear 4xx, and nothing is stored', async () => {
  const person = await draft(RETIRED);
  const storedBefore = fake.live.size;
  const before = await rawDoc(person.appId);
  const res = await upload(person.token, 'salary');
  assert.equal(res.status, 409);
  assert.equal(res.json.code, 'SLOT_NOT_AVAILABLE');
  assert.equal(res.json.message, 'This document is not on your list. Check your answers, or choose one of the documents shown for you.');
  assert.equal(fake.live.size, storedBefore, 'no file reached storage');
  assert.deepEqual((await rawDoc(person.appId)).documents || [], before.documents || [], 'nothing was written');
  // a slot that does not exist is still a plain bad request
  const unknown = await upload(person.token, 'visa');
  assert.equal(unknown.status, 400);
  assert.equal(unknown.json.code, 'INVALID_SLOT');
  // the same request is fine once the answer makes the slot visible
  assert.equal((await put(person.token, '5', EMPLOYED)).status, 200);
  assert.equal((await upload(person.token, 'salary')).status, 201);
});

test('the hidden-slot check looks at the stored answers, not at anything the request says', async () => {
  const person = await draft(RETIRED);
  const form = new FormData();
  form.append('slot', 'salary');
  form.append('answers', JSON.stringify({ q5_1: 'employed' }));
  form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'x.pdf');
  const res = await api('POST', '/applications/me/documents', { token: person.token, body: form });
  assert.ok(res.status >= 400 && res.status < 500, `got ${res.status}`);
  assert.equal(((await rawDoc(person.appId)).documents || []).length, 0);
});

// ---------------------------------------------------------------------------
// Files left in a slot that became hidden
// ---------------------------------------------------------------------------

test('files in a slot that became hidden are kept, never block, can be removed, and still count toward the total', async () => {
  const person = await draft(EMPLOYED);
  const salary = (await upload(person.token, 'salary', 'salary.pdf')).json.data.document;
  await upload(person.token, 'passport');
  await upload(person.token, 'funds');
  assert.equal((await mine(person.token)).documentsComplete, true);

  // the applicant changes the answer: employed -> retired
  assert.equal((await put(person.token, '5', RETIRED)).status, 200);
  let stored = await rawDoc(person.appId);
  assert.equal(stored.documents.length, 3, 'nothing was deleted');
  assert.equal(stored.documents.some((d) => d.id === salary.id), true);
  assert.equal([...fake.live.keys()].some((k) => k === stored.documents.find((d) => d.id === salary.id).publicId), true, 'and the file is still in storage');

  let app = await mine(person.token);
  assert.equal(app.documentsComplete, true, 'the orphan does not block');
  assert.equal(app.documents.length, 3, 'the applicant still sees it, so that it can be removed');
  assert.equal((await submit(person.token).then((r) => r.status)), 200, 'and it does not stop the submit either');
});

test('removing a file of a hidden slot deletes it from storage and the database, like any other file, while a draft', async () => {
  const person = await draft(EMPLOYED);
  const salary = (await upload(person.token, 'salary')).json.data.document;
  await put(person.token, '5', RETIRED);
  const publicId = (await rawDoc(person.appId)).documents[0].publicId;
  assert.equal(fake.live.has(publicId), true);

  const res = await api('DELETE', `/applications/me/documents/${salary.id}`, { token: person.token });
  assert.equal(res.status, 200, res.text);
  assert.equal(fake.live.has(publicId), false, 'deleted from storage');
  assert.deepEqual((await rawDoc(person.appId)).documents, [], 'and from the database');
});

test('a file in a hidden slot still counts toward the total size limit', async () => {
  const person = await draft(RETIRED);
  await seedDocument(person.appId, 'salary', limits.MAX_TOTAL_BYTES - 10);
  const res = await upload(person.token, 'passport');
  assert.equal(res.status, 409);
  assert.equal(res.json.code, 'TOTAL_TOO_LARGE');
});

test('documents with a slot the config no longer has never break a write: saving, uploading, removing, and a validated save all work', async () => {
  const person = await draft(RETIRED);
  const oldId = await seedDocument(person.appId, 'longgoneslot', 100, 'tourist-visa/fake/old.pdf');
  fake.live.set('tourist-visa/fake/old.pdf', 100);

  // 1. saving a section
  assert.equal((await put(person.token, '1', SECTIONS().find(([id]) => id === '1')[1])).status, 200);
  // 2. uploading a new file (a validated update that pushes a document)
  assert.equal((await upload(person.token, 'passport')).status, 201);
  // 3. a whole-document save through the model, with validation
  const doc = await TouristVisaApplication.findById(person.appId);
  doc.currentSection = '2A';
  await doc.save();
  // 4. an update with validators on
  await TouristVisaApplication.findOneAndUpdate({ _id: person.appId }, { $set: { currentSection: '1' } }, { runValidators: true, new: true });
  // 5. the application is still shown, with the file listed
  const app = await mine(person.token);
  assert.equal(app.documents.some((d) => d.id === oldId && d.slot === 'longgoneslot'), true);
  assert.equal(app.documentsComplete, false, 'the unknown slot satisfies nothing');
  // 6. and the old file can be removed
  assert.equal((await api('DELETE', `/applications/me/documents/${oldId}`, { token: person.token })).status, 200);
  assert.equal(fake.live.has('tourist-visa/fake/old.pdf'), false);
});

// ---------------------------------------------------------------------------
// Review page and admin view
// ---------------------------------------------------------------------------

test('the review prints only the slots on the list: an optional empty one says "Not answered", a hidden slot and its files are left out', async () => {
  const person = await draft(EMPLOYED);
  await upload(person.token, 'salary', 'salary.pdf');
  await upload(person.token, 'passport', 'passport.pdf');
  await upload(person.token, 'funds', 'funds.pdf');
  await put(person.token, '5', RETIRED); // salary becomes hidden
  const res = await api('GET', '/applications/me/review', { token: person.token });
  assert.equal(res.status, 200);
  const rows = res.json.data.review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows)).filter((r) => r.kind === 'files');
  assert.deepEqual(rows.map((r) => r.id), ['q10_6', 'q10_7', 'q10_10']);
  assert.equal(rows.find((r) => r.id === 'q10_10').value, 'Not answered');
  assert.equal(res.text.includes('salary.pdf'), false, 'a file of a hidden slot is not printed');
});

test('the admin view lists a hidden slot\'s files apart ("not on this applicant\'s list") and never as a missing row', async () => {
  const person = await draft(EMPLOYED);
  await upload(person.token, 'salary', 'salary.pdf');
  await upload(person.token, 'passport', 'passport.pdf');
  await upload(person.token, 'funds', 'funds.pdf');
  assert.equal((await submit(person.token)).status, 200, 'the admin sees submitted applications');
  const admin = await makeUser(1);

  const first = await api('GET', `/admin/applications/${person.appId}`, { token: admin.token });
  assert.equal(first.status, 200, first.text);
  let overview = first.json.data;
  assert.deepEqual(overview.otherDocuments, [], 'every file is on the list');
  assert.equal(overview.documents.length, 3);

  // a correction by the team changes the employment answer (the applicant cannot, once submitted): the salary slot is now hidden
  await TouristVisaApplication.collection.updateOne({ _id: oid(person.appId) }, { $set: { 'answers.q5_1': 'retired' } });
  overview = (await api('GET', `/admin/applications/${person.appId}`, { token: admin.token })).json.data;
  assert.deepEqual(overview.otherDocuments.map((f) => [f.slot, f.name]), [['salary', 'salary.pdf']]);
  assert.equal(overview.documents.length, 3, 'the full list is still there');
  const rows = overview.review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows)).filter((r) => r.kind === 'files');
  assert.equal(rows.some((r) => r.id === 'q10_8'), false, 'the hidden slot has no row');

  // the same temporary-link route opens it, like any other file
  const link = await api('GET', `/admin/applications/${person.appId}/documents/${overview.otherDocuments[0].id}/link`, { token: admin.token });
  assert.ok([200, 201].includes(link.status), `link: ${link.status} ${link.text}`);
});

// ---------------------------------------------------------------------------
// Old applications and the new limits
// ---------------------------------------------------------------------------

test('an application submitted under the real config still opens and shows its files after the config gains conditional slots', async () => {
  useConfig(realConfig);
  let person;
  try {
    person = await draft(RETIRED);
    await upload(person.token, 'passport', 'passport.pdf');
    await upload(person.token, 'funds', 'funds.pdf');
    assert.equal((await submit(person.token)).status, 200);
  } finally {
    useConfig(testConfig);
  }
  const app = await mine(person.token);
  assert.equal(app.status, 'submitted');
  const review = await api('GET', '/applications/me/review', { token: person.token });
  assert.equal(review.status, 200);
  const rows = review.json.data.review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows)).filter((r) => r.kind === 'files');
  assert.deepEqual(rows.map((r) => [r.id, r.files.map((f) => f.name)]), [['q10_6', ['passport.pdf']], ['q10_7', ['funds.pdf']]], 'shown with the config it was submitted under');
  const admin = await makeUser(1);
  const overview = await api('GET', `/admin/applications/${person.appId}`, { token: admin.token });
  assert.equal(overview.status, 200);
  assert.deepEqual(overview.json.data.otherDocuments, []);
});

test('the limits: 4 MB per file still holds, and the total is 120 MB', async () => {
  assert.equal(limits.MAX_FILE_BYTES, 4 * MB);
  assert.equal(limits.MAX_TOTAL_BYTES, 120 * MB);
  assert.equal(limits.UPLOAD_RATE.max, 120);
  const person = await draft(RETIRED);

  assert.equal((await upload(person.token, 'passport', 'big.pdf', bigPdf(4 * MB))).status, 201, 'exactly 4 MB is accepted');
  const tooBig = await upload(person.token, 'passport', 'bigger.pdf', bigPdf(4 * MB + 1));
  assert.equal(tooBig.status, 413);
  assert.equal(tooBig.json.code, 'FILE_TOO_LARGE');

  // Fill the application up to 100 bytes below 120 MB (the 4 MB file above is already in): a 69-byte file fits, the next one does not.
  await seedDocument(person.appId, 'funds', 116 * MB - 100);
  assert.equal((await upload(person.token, 'other', 'fits.pdf')).status, 201, 'a total of 120 MB less 31 bytes is within the limit');
  const full = await upload(person.token, 'other', 'over.pdf');
  assert.equal(full.status, 409);
  assert.equal(full.json.code, 'TOTAL_TOO_LARGE');
});
