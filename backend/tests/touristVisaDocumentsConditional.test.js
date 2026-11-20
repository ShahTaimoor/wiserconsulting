'use strict';

// The document lists (config 1.5.0), through the real routes and the REAL config: 22 slots in section 10D. Employment (5.1) decides
// which employment documents are on the list; marital status (2.13), dependants (4.7) and "someone else pays" (6.5) decide which
// documents on the list are needed. The expected side is in helpers/documentSlots.js (the senior's lists, written out by hand).
// One test submits under an older config that has only passport and funds (a copy with the other 20 slots taken out).
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
const repository = require('../repositories/touristVisaApplicationRepository');
const documentService = require('../services/touristVisaDocumentService');
const applicationService = require('../services/touristVisaApplicationService');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const engine = require('../shared/tourist-visa/engine');
const limits = require('../config/touristVisaDocuments');
const { SECTIONS } = require('./helpers/touristVisaFixtures');
const { SLOT_LIST, neededSlots, shownSlots } = require('./helpers/documentSlots');

const MB = 1024 * 1024;
const clone = (o) => JSON.parse(JSON.stringify(o));
const realConfig = engine.config;

/** The config as it was before the document lists: the same questions, but only the passport and funds slots. Version 1.4.1. */
function oldConfig() {
  const cfg = clone(realConfig);
  cfg.version = '1.4.1';
  cfg.questions = cfg.questions.filter((q) => q.type !== 'FILE' || q.slot === 'passport' || q.slot === 'funds');
  // the order it had then: passport first, funds second
  const files = cfg.questions.filter((q) => q.type === 'FILE');
  const [funds, passport] = [files.find((q) => q.slot === 'funds'), files.find((q) => q.slot === 'passport')];
  const at = cfg.questions.indexOf(funds);
  cfg.questions.splice(at, 2, passport, funds);
  cfg.questions.find((q) => q.slot === 'passport').label = 'Your passport or travel document';
  cfg.questions.find((q) => q.slot === 'funds').label = 'Evidence of funds';
  assert.deepEqual(engine.validateConfig(cfg), []);
  return cfg;
}
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
}, { timeout: 120000 });

after(async () => {
  useConfig(realConfig);
  applicationService.config = real.app;
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
  const user = await User.create({ name: `Lists ${userCounter}`, email: `test.lists.${userCounter}@example.com`, password: 'not-a-real-password', role });
  return { user, token: jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
}
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60, 0x20)]);
const bigPdf = (bytes) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(bytes - 9, 0x20)]);
const upload = (token, slot, name = `${slot}.pdf`, buffer = PDF) => {
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
const uploadAll = async (token, slots) => { for (const slot of slots) assert.equal((await upload(token, slot)).status, 201, slot); };

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
const SPOUSE = { q4_1: 'Testpartner', q4_2: 'Testsurname', q4_3: '1991-02-03', q4_4: 'GB', q4_5: true, q4_6: false };
const DEPENDANT = { q4_7a: 'son', q4_7b: 'Testchild', q4_7c: 'Testsurname', q4_7d: '2015-06-07', q4_7e: true, q4_7f: false };
const sectionAnswers = (id) => SECTIONS().find(([sid]) => sid === id)[1];

/** A draft with every section saved. */
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
const problems10D = (res) => (res.json.sections || []).find((s) => s.id === '10D');

// ---------------------------------------------------------------------------
// The list, the limits, and what is needed
// ---------------------------------------------------------------------------

test('the server lists every slot with its maximum, and the totals are 4 MB a file and 120 MB', async () => {
  const person = await draft();
  const data = await listFiles(person.token);
  assert.deepEqual(data.limits.slots, Object.fromEntries(SLOT_LIST.map((s) => [s.slot, { max: s.max }])));
  assert.equal(Object.keys(data.limits.slots).length, 22);
  assert.equal(data.limits.maxTotalBytes, 120 * MB);
  assert.equal(data.limits.maxFileBytes, 4 * MB);
});

test('retired (the "shared only" list): eight documents are needed; the submit is refused until each has a file, then goes through', async () => {
  const ctx = { employment: 'retired' };
  const person = await draft(RETIRED);
  const slots = neededSlots(ctx);
  assert.equal(slots.length, 8);
  let app = await mine(person.token);
  assert.equal(app.documentsComplete, false);
  assert.equal(app.sectionStatus['10D'], undefined);

  await uploadAll(person.token, slots.slice(0, 7));
  app = await mine(person.token);
  assert.equal(app.sectionStatus['10D'], 'in_progress');
  const refused = await submit(person.token);
  assert.equal(refused.status, 422);
  assert.deepEqual(refused.json.sections, [{ id: '10D', problems: 1 }]);
  assert.equal((await rawDoc(person.appId)).status, 'draft');

  await uploadAll(person.token, slots.slice(7));
  app = await mine(person.token);
  assert.equal(app.documentsComplete, true);
  assert.equal(app.sectionStatus['10D'], 'saved');
  const done = await submit(person.token);
  assert.equal(done.status, 200, done.text);
});

test('the employment slots are refused for everyone whose 5.1 does not show them, and the optional slots take files from anyone', async () => {
  const person = await draft(RETIRED);
  for (const slot of ['appointment', 'confirmation', 'noc', 'salary', 'businessreg', 'chambercard', 'businessbank', 'sponsorship']) {
    const res = await upload(person.token, slot);
    assert.equal(res.status, 409, slot);
    assert.equal(res.json.code, 'SLOT_NOT_AVAILABLE', slot);
  }
  assert.equal(fake.live.size >= 0, true);
  assert.equal(((await rawDoc(person.appId)).documents || []).length, 0, 'nothing was stored');
  for (const slot of ['oldpassports', 'other']) assert.equal((await upload(person.token, slot)).status, 201, slot);
  assert.equal((await mine(person.token)).documentsComplete, false, 'optional files do not complete anything');
});

test('employed: the five employment documents are on the list; with the shared ones the submit goes through, without salary slips it does not', async () => {
  const ctx = { employment: 'employed' };
  const person = await draft(EMPLOYED);
  const slots = neededSlots(ctx);
  assert.deepEqual(slots.filter((s) => ['appointment', 'confirmation', 'noc', 'salary'].includes(s)), ['appointment', 'confirmation', 'noc', 'salary']);
  assert.equal(slots.includes('sponsorship'), false, 'optional unless someone else pays');
  await uploadAll(person.token, slots.filter((s) => s !== 'salary'));
  const refused = await submit(person.token);
  assert.deepEqual(refused.json.sections, [{ id: '10D', problems: 1 }]);
  assert.equal((await upload(person.token, 'sponsorship')).status, 201, 'the optional sponsorship letter can be added');
  assert.equal((await upload(person.token, 'businessreg')).status, 409, 'and a self-employed document cannot');
  assert.equal((await upload(person.token, 'salary')).status, 201);
  assert.equal((await submit(person.token)).status, 200);
});

test('self-employed: the business documents are needed, the employment ones are not on the list', async () => {
  const ctx = { employment: 'self_employed' };
  const person = await draft(SELF_EMPLOYED);
  const slots = neededSlots(ctx);
  assert.deepEqual(slots.filter((s) => ['businessreg', 'chambercard', 'businessbank'].includes(s)).length, 3);
  await uploadAll(person.token, slots.filter((s) => s !== 'businessbank'));
  assert.deepEqual((await submit(person.token)).json.sections, [{ id: '10D', problems: 1 }]);
  assert.equal((await upload(person.token, 'salary')).status, 409);
  assert.equal((await upload(person.token, 'businessbank')).status, 201);
  assert.equal((await submit(person.token)).status, 200);
});

test('married: the marriage certificate and the family certificate with spouse become needed, and optional again when the answer goes back', async () => {
  const person = await draft(RETIRED);
  await uploadAll(person.token, neededSlots({ employment: 'retired' }));
  assert.equal((await mine(person.token)).documentsComplete, true);

  // 2.13 married (this also opens Part 4A)
  assert.equal((await put(person.token, '2B', { ...sectionAnswers('2B'), q2_13: 'married' })).status, 200);
  let app = await mine(person.token);
  assert.equal(app.documentsComplete, false);
  assert.equal(app.sectionStatus['10D'], 'in_progress');
  assert.equal(problems10D(await submit(person.token)).problems, 2, 'marriage and familyspouse');
  await uploadAll(person.token, ['marriage', 'familyspouse']);
  assert.equal((await mine(person.token)).documentsComplete, true);

  // back to single: the two slots are optional again, and their files are still on the list (not orphans)
  assert.equal((await put(person.token, '2B', sectionAnswers('2B'))).status, 200);
  app = await mine(person.token);
  assert.equal(app.documentsComplete, true);
  assert.equal(app.documents.length, 8 + 2);
  assert.deepEqual(engine.getOrphanDocuments(engine.config, app.documents, app.answers), []);
});

test('dependants (4.7 Yes): Form (B), the school certificates and the family certificate become needed, and optional again on No', async () => {
  const person = await draft(RETIRED);
  await uploadAll(person.token, neededSlots({ employment: 'retired' }));
  assert.equal((await put(person.token, '4B', { q4_7: true, dependants: [DEPENDANT] })).status, 200);
  assert.equal((await mine(person.token)).documentsComplete, false);
  assert.equal(problems10D(await submit(person.token)).problems, 3, 'familyspouse, formb and school');
  await uploadAll(person.token, ['familyspouse', 'formb', 'school']);
  assert.equal((await mine(person.token)).documentsComplete, true);
  assert.equal((await put(person.token, '4B', { q4_7: false })).status, 200);
  assert.equal((await mine(person.token)).documentsComplete, true);
  assert.equal((await mine(person.token)).documents.length, 11, 'the files stay');
});

// ---------------------------------------------------------------------------
// A hidden slot
// ---------------------------------------------------------------------------

test('uploading to a hidden slot is refused on the server with a clear 4xx, and nothing is stored or written', async () => {
  const person = await draft(RETIRED);
  const before = await rawDoc(person.appId);
  const storedBefore = fake.live.size;
  const res = await upload(person.token, 'salary');
  assert.equal(res.status, 409);
  assert.equal(res.json.code, 'SLOT_NOT_AVAILABLE');
  assert.equal(res.json.message, 'This document is not on your list. Check your answers, or choose one of the documents shown for you.');
  assert.equal(fake.live.size, storedBefore, 'no file reached storage');
  assert.deepEqual((await rawDoc(person.appId)).documents || [], before.documents || [], 'nothing was written');
  const unknown = await upload(person.token, 'visa');
  assert.deepEqual([unknown.status, unknown.json.code], [400, 'INVALID_SLOT']);
  // the same request works once the answer shows the slot
  assert.equal((await put(person.token, '5', EMPLOYED)).status, 200);
  assert.equal((await upload(person.token, 'salary')).status, 201);
});

test('the hidden-slot check reads the stored answers, never anything the request says', async () => {
  const person = await draft(RETIRED);
  const form = new FormData();
  form.append('slot', 'salary');
  form.append('answers', JSON.stringify({ q5_1: 'employed' }));
  form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'x.pdf');
  const res = await api('POST', '/applications/me/documents', { token: person.token, body: form });
  assert.ok(res.status >= 400 && res.status < 500, `got ${res.status}`);
  assert.equal(((await rawDoc(person.appId)).documents || []).length, 0);
});

test('switching 5.1 after uploading: the files stay, do not block, show as files from a different list, can be removed, and come back with the answer', async () => {
  const person = await draft(EMPLOYED);
  const employedSlots = neededSlots({ employment: 'employed' });
  await uploadAll(person.token, employedSlots);
  assert.equal((await mine(person.token)).documentsComplete, true);

  // employed -> retired: appointment, confirmation, noc and salary leave the list
  assert.equal((await put(person.token, '5', RETIRED)).status, 200);
  let stored = await rawDoc(person.appId);
  assert.equal(stored.documents.length, employedSlots.length, 'nothing was deleted');
  assert.equal(stored.documents.every((d) => fake.live.has(d.publicId)), true, 'every file is still in storage');
  let app = await mine(person.token);
  assert.equal(app.documentsComplete, true, 'the other list does not block');
  assert.deepEqual(engine.getOrphanDocuments(engine.config, app.documents, app.answers).map((d) => d.slot), ['appointment', 'confirmation', 'noc', 'salary']);

  // employed -> self-employed: the business documents are now needed, the employment files are the other list
  assert.equal((await put(person.token, '5', SELF_EMPLOYED)).status, 200);
  app = await mine(person.token);
  assert.equal(app.documentsComplete, false);
  assert.equal(problems10D(await submit(person.token)).problems, 3, 'businessreg, chambercard and businessbank');

  // back to employed: the files count again
  assert.equal((await put(person.token, '5', EMPLOYED)).status, 200);
  app = await mine(person.token);
  assert.equal(app.documentsComplete, true);
  assert.deepEqual(engine.getOrphanDocuments(engine.config, app.documents, app.answers), []);

  // an orphan can be removed like any file (retired again, then remove the salary slips)
  assert.equal((await put(person.token, '5', RETIRED)).status, 200);
  const salary = (await mine(person.token)).documents.find((d) => d.slot === 'salary');
  const publicId = (await rawDoc(person.appId)).documents.find((d) => d.id === salary.id).publicId;
  assert.equal((await api('DELETE', `/applications/me/documents/${salary.id}`, { token: person.token })).status, 200);
  assert.equal(fake.live.has(publicId), false, 'deleted from storage');
  stored = await rawDoc(person.appId);
  assert.equal(stored.documents.some((d) => d.id === salary.id), false, 'and from the database');
  // and the application still submits, with the three employment files that are left on the other list
  assert.equal((await submit(person.token)).status, 200);
});

test('a file in a hidden slot still counts toward the total size limit', async () => {
  const person = await draft(RETIRED);
  await seedDocument(person.appId, 'salary', limits.MAX_TOTAL_BYTES - 10);
  const res = await upload(person.token, 'passport');
  assert.equal(res.status, 409);
  assert.equal(res.json.code, 'TOTAL_TOO_LARGE');
});

test('documents with a slot the config does not have never break a write: saving, uploading, a validated model save and update, listing and removing', async () => {
  const person = await draft(RETIRED);
  const oldId = await seedDocument(person.appId, 'longgoneslot', 100, 'tourist-visa/fake/old.pdf');
  fake.live.set('tourist-visa/fake/old.pdf', 100);
  assert.equal((await put(person.token, '1', sectionAnswers('1'))).status, 200);
  assert.equal((await upload(person.token, 'passport')).status, 201);
  const doc = await TouristVisaApplication.findById(person.appId);
  doc.currentSection = '2A';
  await doc.save();
  await TouristVisaApplication.findOneAndUpdate({ _id: person.appId }, { $set: { currentSection: '1' } }, { runValidators: true, new: true });
  const app = await mine(person.token);
  assert.equal(app.documents.some((d) => d.id === oldId && d.slot === 'longgoneslot'), true);
  assert.deepEqual(engine.getOrphanDocuments(engine.config, app.documents, app.answers).map((d) => d.slot), ['longgoneslot']);
  assert.equal((await api('DELETE', `/applications/me/documents/${oldId}`, { token: person.token })).status, 200);
  assert.equal(fake.live.has('tourist-visa/fake/old.pdf'), false);
});

// ---------------------------------------------------------------------------
// Review page and admin view
// ---------------------------------------------------------------------------

test('the review prints the visible slots in the config order with their files; empty optional ones say "Not answered", needed ones "No files uploaded"; a hidden slot is left out', async () => {
  const person = await draft(EMPLOYED);
  await upload(person.token, 'salary', 'salary-slips.pdf');
  await upload(person.token, 'passport', 'passport-scan.pdf');
  await upload(person.token, 'hotels', 'london-hotel.pdf');
  await put(person.token, '5', RETIRED); // the salary slips leave the list
  const res = await api('GET', '/applications/me/review', { token: person.token });
  assert.equal(res.status, 200);
  const rows = res.json.data.review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows)).filter((r) => r.kind === 'files');
  assert.deepEqual(rows.map((r) => r.id), SLOT_LIST.filter((s) => shownSlots({ employment: 'retired' }).includes(s.slot)).map((s) => s.id), 'only the slots on the list, in the config order');
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(byId.q10_8.files.map((f) => f.name), ['london-hotel.pdf']);
  assert.deepEqual(byId.q10_6.files.map((f) => f.name), ['passport-scan.pdf']);
  assert.equal(byId.q10_9.value, 'No files uploaded', 'flight reservation: needed, empty');
  assert.equal(byId.q10_24.value, 'Not answered', 'old passports: optional, empty');
  assert.equal(byId.q10_27.value, 'Not answered');
  assert.equal(res.text.includes('salary-slips.pdf'), false, 'a file of a hidden slot is not printed');
});

test('the admin view lists the files of a hidden slot apart, never as a missing row, with the same temporary link', async () => {
  const person = await draft(EMPLOYED);
  await uploadAll(person.token, neededSlots({ employment: 'employed' }));
  assert.equal((await submit(person.token)).status, 200, 'the admin sees submitted applications');
  const admin = await makeUser(1);

  const first = await api('GET', `/admin/applications/${person.appId}`, { token: admin.token });
  assert.equal(first.status, 200, first.text);
  assert.deepEqual(first.json.data.otherDocuments, []);
  assert.deepEqual(first.json.data.fileSlots, Object.fromEntries(SLOT_LIST.map((s) => [s.id, s.slot])));
  assert.equal(first.json.data.documents.length, neededSlots({ employment: 'employed' }).length);

  // a correction by the team changes the employment answer (the applicant cannot, once submitted): the employment slots are now another list
  await TouristVisaApplication.collection.updateOne({ _id: oid(person.appId) }, { $set: { 'answers.q5_1': 'retired' } });
  const overview = (await api('GET', `/admin/applications/${person.appId}`, { token: admin.token })).json.data;
  assert.deepEqual(overview.otherDocuments.map((f) => f.slot), ['appointment', 'confirmation', 'noc', 'salary']);
  const rowIds = overview.review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows)).map((r) => r.id);
  for (const id of ['q10_17', 'q10_18', 'q10_19', 'q10_20']) assert.equal(rowIds.includes(id), false, `${id} has no row`);
  const link = await api('GET', `/admin/applications/${person.appId}/documents/${overview.otherDocuments[0].id}/link`, { token: admin.token });
  assert.ok([200, 201].includes(link.status), `link: ${link.status} ${link.text}`);
});

// ---------------------------------------------------------------------------
// Old applications and drafts
// ---------------------------------------------------------------------------

test('an application submitted under config 1.4.1 (only passport and funds) still opens, reviews and shows the admin its two files', async () => {
  useConfig(oldConfig());
  let person;
  try {
    person = await draft(RETIRED);
    assert.equal((await upload(person.token, 'passport', 'passport.pdf')).status, 201);
    assert.equal((await upload(person.token, 'funds', 'funds.pdf')).status, 201);
    assert.equal((await submit(person.token)).status, 200, 'under the old config two files were enough');
  } finally {
    useConfig(realConfig);
  }
  const app = await mine(person.token);
  assert.equal(app.status, 'submitted');
  assert.equal(app.configVersion, '1.4.1');
  assert.equal(app.documentsComplete, true, 'read with the config it was submitted under: not "missing" the new documents');
  assert.equal(app.sectionStatus['10D'], 'saved');
  const review = await api('GET', '/applications/me/review', { token: person.token });
  assert.equal(review.status, 200);
  const rows = review.json.data.review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows)).filter((r) => r.kind === 'files');
  assert.deepEqual(rows.map((r) => [r.id, r.label, r.files.map((f) => f.name)]), [['q10_6', 'Your passport or travel document', ['passport.pdf']], ['q10_7', 'Evidence of funds', ['funds.pdf']]]);
  const admin = await makeUser(1);
  const overview = await api('GET', `/admin/applications/${person.appId}`, { token: admin.token });
  assert.equal(overview.status, 200);
  assert.deepEqual(overview.json.data.otherDocuments, []);
  assert.deepEqual(overview.json.data.fileSlots, { q10_6: 'passport', q10_7: 'funds' });
  assert.equal(overview.json.data.documents.length, 2);
});

test('a draft that already had passport and funds files keeps them; the new needed documents are needed, as expected', async () => {
  useConfig(oldConfig());
  let person;
  try {
    person = await draft(RETIRED);
    await upload(person.token, 'passport', 'passport.pdf');
    await upload(person.token, 'funds', 'funds.pdf');
    assert.equal((await mine(person.token)).documentsComplete, true, 'complete under the old config');
  } finally {
    useConfig(realConfig);
  }
  const app = await mine(person.token);
  assert.equal(app.documents.length, 2, 'the files stay');
  assert.equal(app.documentsComplete, false);
  assert.equal(app.sectionStatus['10D'], 'in_progress');
  assert.equal(problems10D(await submit(person.token)).problems, 6, 'the six new shared documents');
  await uploadAll(person.token, neededSlots({ employment: 'retired' }).filter((s) => s !== 'passport' && s !== 'funds'));
  assert.equal((await submit(person.token)).status, 200);
});

test('an admin correction that changes employment on a submitted application is not stopped by documents (they cannot be uploaded then)', async () => {
  const person = await draft(RETIRED);
  await uploadAll(person.token, neededSlots({ employment: 'retired' }));
  assert.equal((await submit(person.token)).status, 200);
  const logic = require('../utils/touristVisaChanges');
  const z = require('zod');
  const stored = await rawDoc(person.appId);
  const existing = repository.decryptAnswers(String(person.appId), stored.answers);
  // 5.1 changes to self-employed together with the answers that section needs: the business documents are now missing, but a correction
  // cannot upload them, so the logic never counts the files-only section 10D as a problem.
  const parsed = logic.parseChanges(realConfig, [
    { questionId: 'q5_1', value: 'self_employed' }, { questionId: 'q5_1a', value: 'Test Trading Co' }, { questionId: 'q5_1b', value: '2018-05' },
    { questionId: 'q5_1c', value: ADDRESS }, { questionId: 'q5_1d', value: 'Made-up business.' }, { questionId: 'q5_1e', value: { amount: 3000, currency: 'GBP' } },
  ]);
  const result = logic.evaluate({ z, cfg: realConfig, existing, parsed });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.sections.includes('10D'), false);
});

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

test('the limits: 4 MB per file, 120 MB in all, 120 uploads an hour; a full normal set of documents fits', async () => {
  assert.equal(limits.MAX_FILE_BYTES, 4 * MB);
  assert.equal(limits.MAX_TOTAL_BYTES, 120 * MB);
  assert.equal(limits.UPLOAD_RATE.max, 120);
  const person = await draft(RETIRED);
  assert.equal((await upload(person.token, 'passport', 'big.pdf', bigPdf(4 * MB))).status, 201, 'exactly 4 MB is accepted');
  const tooBig = await upload(person.token, 'passport', 'bigger.pdf', bigPdf(4 * MB + 1));
  assert.deepEqual([tooBig.status, tooBig.json.code], [413, 'FILE_TOO_LARGE']);
  await seedDocument(person.appId, 'funds', 116 * MB - 100);
  assert.equal((await upload(person.token, 'other', 'fits.pdf')).status, 201);
  const full = await upload(person.token, 'other', 'over.pdf');
  assert.deepEqual([full.status, full.json.code], [409, 'TOTAL_TOO_LARGE']);
});

test('the largest possible set of files: every slot full of 4 MB files is more than 120 MB, but a normal complete set is far below it', () => {
  const everySlotFull = SLOT_LIST.reduce((sum, s) => sum + s.max * 4, 0);
  assert.ok(everySlotFull > 120, `every slot full of 4 MB files would be ${everySlotFull} MB`);
  // a complete set for the widest list (employed, married, with children, with a sponsor): one file in each needed slot, at the cap of 4 MB
  const widest = { employment: 'employed', married: true, children: true, sponsor: true };
  const oneEach = neededSlots(widest).length * 4;
  assert.ok(oneEach <= 120, `one 4 MB file in each of the ${neededSlots(widest).length} needed slots is ${oneEach} MB`);
  // and the most multi-page documents a person could normally have: the maximum number of files, each about 1 MB (a phone scan)
  const phoneScans = SLOT_LIST.reduce((sum, s) => sum + s.max * 1, 0);
  assert.ok(phoneScans <= 120, `every slot full of 1 MB scans is ${phoneScans} MB`);
});
