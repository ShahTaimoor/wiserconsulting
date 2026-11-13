'use strict';

// Step 8j-3, A12: a cover letter or itinerary that was APPROVED and whose answers changed afterwards is not printed as approved. It is exported
// as a draft (the diagonal watermark and the banner on every page, "-draft" in the file name) and the banner says the answers changed since
// approval. The audit row records pdfApproved false and pdfStale true; the Activity line says so. A current approved document is exported
// exactly as before. The test uses the same staleness check the admin panels use (the view's `stale`). Made-up data, in-memory replica set.

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
const TouristVisaAudit = require('../models/TouristVisaAudit');
const TouristVisaApplication = require('../models/TouristVisaApplication');
const TouristVisaCoverLetter = require('../models/TouristVisaCoverLetter');
const TouristVisaItinerary = require('../models/TouristVisaItinerary');
const TouristVisaChange = require('../models/TouristVisaChange');
const TouristVisaNote = require('../models/TouristVisaNote');
const documentService = require('../services/touristVisaDocumentService');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const { TouristVisaCoverLetterService } = require('../services/touristVisaCoverLetterService');
const { TouristVisaItineraryService } = require('../services/touristVisaItineraryService');
const { TouristVisaPdfService, fileNameFor } = require('../services/touristVisaPdfService');
const { buildLetterModel } = require('../utils/touristVisaCoverLetterPdf');
const { buildItineraryModel } = require('../utils/touristVisaItineraryPdf');
const { SECTIONS, FILE_NAME } = require('./helpers/touristVisaFixtures');
const { inspectPdf } = require('./helpers/pdfInspect');

const DRAFT_MARK = 'DRAFT - NOT APPROVED';
const STALE_MARK = 'DRAFT - ANSWERS CHANGED SINCE APPROVAL';

let replSet;
let server;
let baseUrl;
let userCounter = 0;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  for (const model of [TouristVisaApplication, TouristVisaAudit, TouristVisaChange, TouristVisaNote, TouristVisaCoverLetter, TouristVisaItinerary]) await model.init();
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
  temporaryUrl(doc, expiresAt) { return `https://fake-storage.invalid/download?id=${encodeURIComponent(doc.publicId)}&expires=${expiresAt.getTime()}`; }
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
  return { status: res.status, json, text, headers: res.headers };
}
async function getPdf(path, token) {
  const res = await fetch(`${baseUrl}/api/tourist-visa${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const bytes = Buffer.from(await res.arrayBuffer());
  const isPdf = (res.headers.get('content-type') || '').startsWith('application/pdf');
  return { status: res.status, headers: res.headers, buffer: isPdf ? bytes : null, json: isPdf ? null : JSON.parse(bytes.toString('utf8') || 'null') };
}
async function makeUser(role = 0) {
  userCounter += 1;
  const user = await User.create({ name: `Stale Person ${userCounter}`, email: `test.stale.${userCounter}@example.com`, password: 'not-a-real-password', role });
  return { token: jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' }), userId: String(user._id) };
}
const oid = (id) => new mongoose.Types.ObjectId(id);
const auditRows = (filter = {}) => TouristVisaAudit.collection.find(filter).sort({ at: 1, _id: 1 }).toArray();
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60, 0x20)]);
function upload(token, slot, name) {
  const form = new FormData();
  form.append('slot', slot);
  form.append('file', new Blob([PDF_BYTES], { type: 'application/pdf' }), name);
  return api('POST', '/applications/me/documents', { token, body: form });
}
async function submitted() {
  const person = await makeUser(0);
  const created = await api('POST', '/applications', { token: person.token });
  const appId = created.json.data.application.id;
  for (const [id, answers] of SECTIONS('Testfirst', 'Testlast', 'test.stale.applicant@example.com')) {
    assert.equal((await api('PUT', `/applications/me/sections/${id}`, { token: person.token, body: { answers } })).status, 200);
  }
  assert.equal((await upload(person.token, 'passport', FILE_NAME)).status, 201);
  assert.equal((await upload(person.token, 'funds', 'bank-statement.pdf')).status, 201);
  const res = await api('POST', '/applications/me/submit', { token: person.token, body: { declarationAccepted: true } });
  assert.equal(res.status, 200, res.text);
  return { ...person, appId, reference: res.json.data.application.reference };
}

const KINDS = {
  letter: {
    name: 'cover letter', slug: 'cover-letter', pdfType: 'cover_letter', suffix: 'cover-letter',
    generate: (token, appId) => api('POST', `/admin/applications/${appId}/cover-letter/generate`, { token }),
    approve: (token, appId, version) => api('POST', `/admin/applications/${appId}/cover-letter/approve`, { token, body: { version } }),
    view: (token, appId) => api('GET', `/admin/applications/${appId}/cover-letter`, { token }),
    pdf: (token, appId) => getPdf(`/admin/applications/${appId}/pdf/cover-letter`, token),
  },
  itinerary: {
    name: 'itinerary', slug: 'itinerary', pdfType: 'itinerary', suffix: 'itinerary',
    generate: (token, appId) => api('POST', `/admin/applications/${appId}/itinerary/generate`, { token }),
    approve: (token, appId, version) => api('POST', `/admin/applications/${appId}/itinerary/approve`, { token, body: { version } }),
    view: (token, appId) => api('GET', `/admin/applications/${appId}/itinerary`, { token }),
    pdf: (token, appId) => getPdf(`/admin/applications/${appId}/pdf/itinerary`, token),
  },
};
const rowsOf = (kind, appId) => auditRows({ applicationId: oid(appId), action: 'pdf_export', pdfType: KINDS[kind].pdfType });
const correctArrival = (token, appId, revision, date) => api('PUT', `/admin/applications/${appId}/changes`, { token, body: { expectedRevision: revision, reason: 'MADE-UP-REASON for the stale test', changes: [{ questionId: 'q1_6', value: date }] } });
const countOf = (pdf, text) => pdf.pages.map((page) => page.items.filter((item) => item.str === text).length);

async function approvedDocument(kind) {
  const app = await submitted();
  const admin = await makeUser(1);
  const made = await KINDS[kind].generate(admin.token, app.appId);
  assert.equal(made.status, 201, made.text);
  const version = made.json.data.versions[0].version;
  assert.equal((await KINDS[kind].approve(admin.token, app.appId, version)).status, 200);
  return { app, admin, version };
}

for (const kind of ['letter', 'itinerary']) {
  const K = KINDS[kind];

  test(`${K.name}: approved and CURRENT is exported clean, exactly as before: no mark, no "-draft", and an audit row with pdfApproved true and no pdfStale`, async () => {
    const { app, admin, version } = await approvedDocument(kind);
    assert.equal((await K.view(admin.token, app.appId)).json.data.stale, false, 'the panel agrees: not stale');
    const res = await K.pdf(admin.token, app.appId);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-disposition'), `attachment; filename="${app.reference}-${K.suffix}.pdf"`);
    const pdf = await inspectPdf(res.buffer);
    assert.equal(/DRAFT|NOT APPROVED|CHANGED SINCE/i.test(pdf.text), false);
    const rows = await rowsOf(kind, app.appId);
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].version, rows[0].pdfApproved], [version, true]);
    assert.equal('pdfStale' in rows[0], false, 'no flag is written for a current document');
  });

  test(`${K.name}: approved, then an answer it uses is corrected: the panel says stale, and the export is a DRAFT whose banner says the answers changed since approval`, async () => {
    const { app, admin, version } = await approvedDocument(kind);
    const corrected = await correctArrival(admin.token, app.appId, 0, '2027-03-02');
    assert.equal(corrected.status, 200, corrected.text);
    assert.equal((await K.view(admin.token, app.appId)).json.data.stale, true, 'the panel says stale (the check the export must use)');

    const res = await K.pdf(admin.token, app.appId);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.equal(res.headers.get('content-disposition'), `attachment; filename="${app.reference}-${K.suffix}-draft.pdf"`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const pdf = await inspectPdf(res.buffer);
    // Every page: the diagonal watermark (still the draft words) once, and the banner (the new words) once.
    assert.deepEqual(countOf(pdf, DRAFT_MARK), pdf.pages.map(() => 1), 'one watermark on every page');
    assert.deepEqual(countOf(pdf, STALE_MARK), pdf.pages.map(() => 1), 'one banner on every page, saying the answers changed since approval');
    assert.equal(pdf.pages.some((page) => page.items.filter((item) => item.str === STALE_MARK).some((item) => item.angle !== 0)), false, 'the banner is horizontal');

    const rows = await rowsOf(kind, app.appId);
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].version, rows[0].pdfApproved, rows[0].pdfStale, rows[0].pdfBy], [version, false, true, 'admin']);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['_id', 'action', 'adminId', 'applicationId', 'at', 'pdfApproved', 'pdfBy', 'pdfStale', 'pdfType', 'version'].sort());

    // The Activity route carries the flag.
    const activity = await api('GET', `/admin/applications/${app.appId}/activity`, { token: admin.token });
    const line = activity.json.data.activity.find((a) => a.action === 'pdf_export' && a.pdfType === K.pdfType);
    assert.deepEqual([line.pdfApproved, line.pdfStale], [false, true]);
  });

  test(`${K.name}: a version that was never approved is the usual draft ("NOT APPROVED" banner, no stale flag), even when its answers have also changed`, async () => {
    const app = await submitted();
    const admin = await makeUser(1);
    assert.equal((await K.generate(admin.token, app.appId)).status, 201);
    assert.equal((await correctArrival(admin.token, app.appId, 0, '2027-03-02')).status, 200);
    assert.equal((await K.view(admin.token, app.appId)).json.data.stale, true);
    const res = await K.pdf(admin.token, app.appId);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-disposition'), `attachment; filename="${app.reference}-${K.suffix}-draft.pdf"`);
    const pdf = await inspectPdf(res.buffer);
    assert.deepEqual(countOf(pdf, DRAFT_MARK), pdf.pages.map(() => 2), 'watermark and banner both say NOT APPROVED');
    assert.deepEqual(countOf(pdf, STALE_MARK), pdf.pages.map(() => 0));
    const rows = await rowsOf(kind, app.appId);
    assert.deepEqual([rows[0].pdfApproved, 'pdfStale' in rows[0]], [false, false]);
  });

  test(`${K.name}: after the answers changed, a NEW version that is approved is exported clean again`, async () => {
    const { app, admin } = await approvedDocument(kind);
    assert.equal((await correctArrival(admin.token, app.appId, 0, '2027-03-02')).status, 200);
    const stale = await K.pdf(admin.token, app.appId);
    assert.match(stale.headers.get('content-disposition'), /-draft\.pdf"$/);
    const made = await K.generate(admin.token, app.appId);
    assert.equal(made.status, 201);
    assert.equal((await K.approve(admin.token, app.appId, made.json.data.versions[0].version)).status, 200);
    assert.equal((await K.view(admin.token, app.appId)).json.data.stale, false);
    const clean = await K.pdf(admin.token, app.appId);
    assert.equal(clean.headers.get('content-disposition'), `attachment; filename="${app.reference}-${K.suffix}.pdf"`);
    assert.equal(/DRAFT|CHANGED SINCE/i.test((await inspectPdf(clean.buffer)).text), false);
    const rows = await rowsOf(kind, app.appId);
    assert.deepEqual(rows.map((r) => [r.pdfApproved, 'pdfStale' in r]), [[false, true], [true, false]]);
  });

  test(`${K.name}: an application that is COMPLETED is judged the same way (the export is made for completed ones too): stale is a draft, current is clean`, async () => {
    const stale = await approvedDocument(kind);
    assert.equal((await correctArrival(stale.admin.token, stale.app.appId, 0, '2027-03-02')).status, 200);
    for (const status of ['in_review', 'completed']) assert.equal((await api('PATCH', `/admin/applications/${stale.app.appId}/status`, { token: stale.admin.token, body: { status } })).status, 200);
    const draft = await K.pdf(stale.admin.token, stale.app.appId);
    assert.equal(draft.status, 200);
    assert.match(draft.headers.get('content-disposition'), /-draft\.pdf"$/);
    assert.equal(countOf(await inspectPdf(draft.buffer), STALE_MARK).every((n) => n === 1), true, 'the stale banner is on every page');
    assert.equal((await rowsOf(kind, stale.app.appId))[0].pdfStale, true);

    const current = await approvedDocument(kind);
    for (const status of ['in_review', 'completed']) assert.equal((await api('PATCH', `/admin/applications/${current.app.appId}/status`, { token: current.admin.token, body: { status } })).status, 200);
    const clean = await K.pdf(current.admin.token, current.app.appId);
    assert.equal(clean.headers.get('content-disposition'), `attachment; filename="${current.app.reference}-${K.suffix}.pdf"`);
    assert.equal('pdfStale' in (await rowsOf(kind, current.app.appId))[0], false);
  });
}

// ---------------------------------------------------------------------------------------------- the check itself and the pieces

test('the PDF uses the same check as the panel: for every state of every document, the export is a draft exactly when the view says stale or the version is not approved', async () => {
  const { app, admin } = await approvedDocument('letter');
  const sequence = [];
  let revision = 0;
  for (const arrival of [null, '2027-03-02', '2027-03-01']) {
    if (arrival) {
      assert.equal((await correctArrival(admin.token, app.appId, revision, arrival)).status, 200, `correction ${arrival}`);
      revision += 1;
    }
    const stale = (await KINDS.letter.view(admin.token, app.appId)).json.data.stale;
    const res = await KINDS.letter.pdf(admin.token, app.appId);
    sequence.push([arrival, stale, /-draft\.pdf"$/.test(res.headers.get('content-disposition'))]);
  }
  // Changed and changed back: the hash is of the facts, so the letter is current again and prints clean again.
  assert.deepEqual(sequence, [[null, false, false], ['2027-03-02', true, true], ['2027-03-01', false, false]]);
});

test('isStale never throws: when the facts cannot be worked out it answers "changed" (the safe side) and logs the application id only', async () => {
  for (const [Service, key, method] of [[TouristVisaCoverLetterService, 'letters', 'letter'], [TouristVisaItineraryService, 'itineraries', 'itinerary']]) {
    const logged = [];
    const logger = require('../utils/logger');
    const original = logger.error;
    logger.error = (...args) => logged.push(args);
    try {
      const service = new Service({ applications: { configOf: async () => { throw new Error('MADE-UP-ANSWER-IN-AN-ERROR 4711'); } } });
      assert.equal(await service.isStale({ _id: 'abc123', answers: { q1_5: 'MADE-UP-ANSWER' } }, { factsHash: 'x' }), true, method);
      assert.equal(await service.isStale({ _id: 'abc123', answers: {} }, null), true, `${method}: no version`);
    } finally {
      logger.error = original;
    }
    assert.ok(logged.length >= 1);
    assert.equal(JSON.stringify(logged).includes('MADE-UP-ANSWER'), false, `${method}: no answer in the log`);
    assert.equal(JSON.stringify(logged).includes('abc123'), true, `${method}: the id is`);
    assert.equal(key.length > 0, true);
  }
});

test('the PDF service asks the staleness check only for an approved version, and treats an error in it as stale', async () => {
  const calls = [];
  const fakeLetters = { findLatestWithText: async () => ({ version: 3, text: 'Dear Sir,\n\nA made-up letter.\n\nYours faithfully,\nTest Person', status: 'draft', factsHash: 'h', createdAt: new Date() }) };
  const appRecord = { _id: new mongoose.Types.ObjectId(), reference: 'TV-ABCDEFGH', answers: {}, status: 'submitted' };
  const audit = { append: async (rows) => { calls.push(['audit', rows[0]]); } };
  const service = new TouristVisaPdfService({
    admin: { load: async () => appRecord },
    audit,
    letters: fakeLetters,
    letterService: { isStale: async () => { calls.push(['isStale']); return true; } },
    renderLetter: async (model) => { calls.push(['render', { draft: model.draft, stale: model.stale }]); return Buffer.from('%PDF-fake'); },
  });
  const notApproved = await service.coverLetterForAdmin('admin1', 'id');
  assert.deepEqual(calls.map((c) => c[0]), ['audit', 'render'], 'not approved: the check is not even asked');
  assert.equal(calls[1][1].stale, false);
  assert.equal(notApproved.filename, 'TV-ABCDEFGH-cover-letter-draft.pdf');
  assert.equal('pdfStale' in calls[0][1], false);

  calls.length = 0;
  fakeLetters.findLatestWithText = async () => ({ version: 3, text: 'Dear Sir,\n\nA made-up letter.\n\nYours faithfully,\nTest Person', status: 'approved', factsHash: 'h', createdAt: new Date() });
  const staleOne = await service.coverLetterForAdmin('admin1', 'id');
  assert.deepEqual(calls.map((c) => c[0]), ['isStale', 'audit', 'render']);
  assert.deepEqual(calls[2][1], { draft: true, stale: true });
  assert.equal(calls[1][1].pdfApproved, false);
  assert.equal(calls[1][1].pdfStale, true);
  assert.equal(staleOne.filename, 'TV-ABCDEFGH-cover-letter-draft.pdf');

  calls.length = 0;
  service.letterService = { isStale: async () => false };
  const current = await service.coverLetterForAdmin('admin1', 'id');
  assert.equal(current.filename, 'TV-ABCDEFGH-cover-letter.pdf');
  assert.equal(calls.find((c) => c[0] === 'audit')[1].pdfApproved, true);
  assert.equal('pdfStale' in calls.find((c) => c[0] === 'audit')[1], false);
});

test('the models: stale only counts for a draft, and the file name helper is unchanged', () => {
  const base = { text: 'Dear Sir,\n\nA made-up letter.\n\nYours faithfully,\nTest Person', reference: 'TV-ABCDEFGH', sender: { name: 'Test Person' }, date: null };
  assert.equal(buildLetterModel({ ...base, draft: true, stale: true }).stale, true);
  assert.equal(buildLetterModel({ ...base, draft: true }).stale, false);
  assert.equal(buildLetterModel({ ...base, draft: false, stale: true }).stale, false, 'an approved, current document cannot carry the stale banner');
  const itin = { text: 'Travel itinerary\n\nA note.\n\nMon 1 Mar\nA made-up day.', reference: 'TV-ABCDEFGH', applicantName: 'Test Person', details: [] };
  assert.equal(buildItineraryModel({ ...itin, draft: true, stale: true }).stale, true);
  assert.equal(buildItineraryModel({ ...itin, draft: false, stale: true }).stale, false);
  assert.equal(fileNameFor('TV-ABCDEFGH', 'cover_letter', { draft: true }), 'TV-ABCDEFGH-cover-letter-draft.pdf');
  assert.equal(fileNameFor('TV-ABCDEFGH', 'itinerary'), 'TV-ABCDEFGH-itinerary.pdf');
});

test('the audit model keeps pdfStale like pdfApproved: a fixed yes, immutable, and the repository returns it only when it is true', async () => {
  const { schema } = TouristVisaAudit;
  assert.equal(schema.path('pdfStale').instance, 'Boolean');
  assert.equal(schema.path('pdfStale').options.immutable, true);
  const audit = require('../repositories/touristVisaAuditRepository');
  const app = await submitted();
  const admin = await makeUser(1);
  const base = { adminId: oid(admin.userId), applicationId: oid(app.appId), action: 'pdf_export', pdfType: 'cover_letter', pdfBy: 'admin', version: 1, pdfApproved: false };
  await audit.append([{ ...base, at: new Date(1000), pdfStale: true }, { ...base, at: new Date(2000), pdfStale: false }, { ...base, at: new Date(3000) }]);
  const rows = (await audit.findByApplication(oid(app.appId))).filter((r) => r.action === 'pdf_export');
  const byTime = rows.sort((a, b) => a.at - b.at);
  assert.deepEqual(byTime.map((r) => r.pdfStale), [true, undefined, undefined]);
  assert.equal(byTime.every((r) => r.pdfApproved === false), true);
});
