'use strict';

// The application summary PDF (step 8h-1), through the real routes: an in-memory replica set, a fake file storage, made-up users and
// answers. The file itself (layout, fonts, page rules) is tested without a database in touristVisaPdfLayout.test.js.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.TOURIST_VISA_ENABLED = 'true';
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const util = require('node:util');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const User = require('../models/User');
const TouristVisaApplication = require('../models/TouristVisaApplication');
const TouristVisaAudit = require('../models/TouristVisaAudit');
const TouristVisaChange = require('../models/TouristVisaChange');
const TouristVisaNote = require('../models/TouristVisaNote');
const documentService = require('../services/touristVisaDocumentService');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const { createPdfLimiter, pdfLimiter } = require('../middleware/touristVisaPdfLimit');
const logger = require('../utils/logger');
const { SECRET_ID, SECRET_NI, SECRET_DETAILS, FILE_NAME, SECTIONS } = require('./helpers/touristVisaFixtures');
const { inspectPdf } = require('./helpers/pdfInspect');

let replSet;
let server;
let baseUrl;
let userCounter = 0;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  for (const model of [TouristVisaApplication, TouristVisaAudit, TouristVisaChange, TouristVisaNote]) await model.init();
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

/** A GET that may answer with a PDF: { status, headers, buffer (for a PDF), json (for anything else) }. */
async function getPdf(path, token) {
  const res = await fetch(`${baseUrl}/api/tourist-visa${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const bytes = Buffer.from(await res.arrayBuffer());
  const isPdf = (res.headers.get('content-type') || '').startsWith('application/pdf');
  let json = null;
  if (!isPdf) { try { json = JSON.parse(bytes.toString('utf8')); } catch { /* not JSON */ } }
  return { status: res.status, headers: res.headers, buffer: isPdf ? bytes : null, json, text: isPdf ? '' : bytes.toString('utf8') };
}

async function makeUser(role = 0, name) {
  userCounter += 1;
  const user = await User.create({ name: name || `Pdf Side ${userCounter}`, email: `test.pdfside.${userCounter}@example.com`, password: 'not-a-real-password', role });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token, userId: String(user._id) };
}
const makeAdmin = (name) => makeUser(1, name);
const oid = (id) => new mongoose.Types.ObjectId(id);
const auditRows = (filter = {}) => TouristVisaAudit.collection.find(filter).sort({ at: 1, _id: 1 }).toArray();
const adminPdf = (token, appId) => getPdf(`/admin/applications/${appId}/pdf/answers`, token);
const myPdf = (token) => getPdf('/applications/me/pdf/answers', token);
const correct = (token, appId, revision, changes) => api('PUT', `/admin/applications/${appId}/changes`, { token, body: { expectedRevision: revision, reason: 'MADE-UP-REASON for the PDF test', changes } });

const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60, 0x20)]);
function upload(token, slot, name) {
  const form = new FormData();
  form.append('slot', slot);
  form.append('file', new Blob([PDF_BYTES], { type: 'application/pdf' }), name);
  return api('POST', '/applications/me/documents', { token, body: form });
}
async function readyApplicant(given = 'Testfirst', family = 'Testlast') {
  const person = await makeUser(0);
  const created = await api('POST', '/applications', { token: person.token });
  const appId = created.json.data.application.id;
  for (const [id, answers] of SECTIONS(given, family, 'test.pdf.applicant@example.com')) {
    const res = await api('PUT', `/applications/me/sections/${id}`, { token: person.token, body: { answers } });
    assert.equal(res.status, 200, `${id}: ${JSON.stringify(res.json)}`);
  }
  assert.equal((await upload(person.token, 'passport', FILE_NAME)).status, 201);
  assert.equal((await upload(person.token, 'funds', 'bank-statement.pdf')).status, 201);
  return { ...person, appId };
}
async function submitted(given, family) {
  const person = await readyApplicant(given, family);
  const res = await api('POST', '/applications/me/submit', { token: person.token, body: { declarationAccepted: true } });
  assert.equal(res.status, 200, res.text);
  return { ...person, reference: res.json.data.application.reference };
}

function capture() {
  const lines = [];
  const original = { error: console.error, log: console.log, info: console.info, warn: console.warn, debug: console.debug };
  for (const method of Object.keys(original)) console[method] = (...args) => lines.push(args.map((a) => util.inspect(a, { depth: 8 })).join(' '));
  const loggerOriginal = { error: logger.error, warn: logger.warn, info: logger.info, debug: logger.debug };
  for (const method of Object.keys(loggerOriginal)) logger[method] = (...args) => lines.push(args.map((a) => util.inspect(a, { depth: 8 })).join(' '));
  return { lines, restore: () => { Object.assign(console, original); Object.assign(logger, loggerOriginal); } };
}
const assertNone = (text, needles, where) => { for (const needle of needles) assert.equal(String(text).includes(needle), false, `${needle} is in ${where}`); };
const ARABIC = String.fromCodePoint(0x645, 0x631, 0x62d, 0x628, 0x627);

// ---------------------------------------------------------------------------
// Who may ask, and when
// ---------------------------------------------------------------------------

test('authorization: anonymous is 401 on both routes; a non-admin is 403 on the admin route; an administrator and the owner are let in; no answer of a refusal is a PDF', async () => {
  const app = await submitted();
  const other = await makeUser(0);
  const admin = await makeAdmin();
  const before = await auditRows();

  for (const [path, token] of [[`/admin/applications/${app.appId}/pdf/answers`, undefined], [`/admin/applications/${app.appId}/pdf/answers`, 'not-a-token'], ['/applications/me/pdf/answers', undefined], ['/applications/me/pdf/answers', 'not-a-token']]) {
    const res = await getPdf(path, token);
    assert.equal(res.status, 401, `${path} ${token}`);
    assert.equal(res.buffer, null);
  }
  const normal = await adminPdf(app.token, app.appId);
  assert.equal(normal.status, 403, 'the owner is not an administrator');
  assert.equal(normal.buffer, null);
  assert.equal((await adminPdf(other.token, app.appId)).status, 403);
  assert.equal((await auditRows()).length, before.length, 'a refusal records nothing');

  const asAdmin = await adminPdf(admin.token, app.appId);
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.buffer.subarray(0, 5).toString(), '%PDF-');
  const asOwner = await myPdf(app.token);
  assert.equal(asOwner.status, 200);
  assert.equal(asOwner.buffer.subarray(0, 5).toString(), '%PDF-');
  // An administrator has no application of their own: the applicant route is their own and finds none.
  const none = await myPdf(admin.token);
  assert.equal(none.status, 404);
  assert.equal(none.json.code, 'APPLICATION_NOT_FOUND');
});

test('the applicant route answers only for the applicant\'s own application: another applicant\'s id is not a thing they can ask for, and a person with no application is 404', async () => {
  const one = await submitted('Onefirst', 'Onelast');
  const two = await submitted('Twofirst', 'Twolast');
  const pdfOne = await inspectPdf((await myPdf(one.token)).buffer);
  const pdfTwo = await inspectPdf((await myPdf(two.token)).buffer);
  assert.match(pdfOne.text, /Onefirst Onelast/);
  assert.equal(pdfOne.text.includes('Twofirst'), false);
  assert.match(pdfTwo.text, /Twofirst Twolast/);
  assert.equal(pdfTwo.text.includes('Onefirst'), false);
  // Nothing in the query, the body or the path chooses another application.
  const sneaky = await getPdf(`/applications/me/pdf/answers?id=${two.appId}&userId=${two.userId}`, one.token);
  assert.equal(sneaky.status, 200);
  assert.equal((await inspectPdf(sneaky.buffer)).text.includes('Twofirst'), false);
  assert.equal((await getPdf(`/applications/${two.appId}/pdf/answers`, one.token)).status, 404);
  assert.equal((await getPdf(`/applications/me/pdf/cover-letter`, one.token)).status, 404, 'the other documents are the next step');
  const nobody = await makeUser(0);
  const res = await myPdf(nobody.token);
  assert.equal(res.status, 404);
  assert.equal(res.json.code, 'APPLICATION_NOT_FOUND');
});

test('a draft application: 409 PDF_NOT_AVAILABLE for the applicant, the same 404 as everywhere for an administrator; nothing is recorded', async () => {
  const draft = await readyApplicant();
  const admin = await makeAdmin();
  const before = await auditRows();
  const mine = await myPdf(draft.token);
  assert.equal(mine.status, 409);
  assert.equal(mine.json.code, 'PDF_NOT_AVAILABLE');
  assert.match(mine.json.message, /once it has been submitted/);
  const theirs = await adminPdf(admin.token, draft.appId);
  assert.equal(theirs.status, 404);
  assert.equal(theirs.json.code, 'APPLICATION_NOT_FOUND');
  assert.equal((await adminPdf(admin.token, '64b64b64b64b64b64b64b64')).status, 404);
  assert.equal((await adminPdf(admin.token, 'not-an-id')).status, 404);
  assert.equal((await auditRows()).length, before.length);
  assertNone(mine.text + theirs.text, ['Testfirst', 'Testlast', SECRET_ID], 'a refusal');
});

test('every status after submit can be exported: submitted, in review and completed', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  for (const status of ['in_review', 'completed']) {
    assert.equal((await api('PATCH', `/admin/applications/${app.appId}/status`, { token: admin.token, body: { status } })).status, 200);
    assert.equal((await adminPdf(admin.token, app.appId)).status, 200, status);
    assert.equal((await myPdf(app.token)).status, 200, status);
  }
});

test('the feature gate: while Tourist Visa is closed both routes answer the fixed 404 and nothing is recorded', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const before = (await auditRows()).length;
  process.env.TOURIST_VISA_ENABLED = 'false';
  try {
    for (const [path, token] of [[`/admin/applications/${app.appId}/pdf/answers`, admin.token], ['/applications/me/pdf/answers', app.token]]) {
      const res = await getPdf(path, token);
      assert.equal(res.status, 404, path);
      assert.equal(res.json.code, 'FEATURE_CLOSED');
      assert.equal(res.buffer, null);
    }
  } finally {
    process.env.TOURIST_VISA_ENABLED = 'true';
  }
  assert.equal((await auditRows()).length, before);
});

// ---------------------------------------------------------------------------
// The answer: headers, the file, what is in it
// ---------------------------------------------------------------------------

test('the answer is an attachment that is never cached, with a file name built only from the reference', async () => {
  const app = await submitted('Aisha', 'Khan-Reynolds');
  const admin = await makeAdmin();
  assert.match(app.reference, /^TV-[A-Z0-9]{8}$/);
  for (const res of [await adminPdf(admin.token, app.appId), await myPdf(app.token)]) {
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.equal(res.headers.get('content-disposition'), `attachment; filename="${app.reference}-application-summary.pdf"`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(Number(res.headers.get('content-length')), res.buffer.length);
    assertNone(res.headers.get('content-disposition'), ['Aisha', 'Khan', 'Reynolds', 'test.pdf', app.appId], 'the file name');
  }
  // A refusal is no-store too (the admin side marks everything so; the applicant's routes set it before anything runs).
  const refused = await myPdf((await readyApplicant()).token);
  assert.equal(refused.headers.get('cache-control'), 'no-store');
});

test('the file holds the application: the header block, every section in order, the decrypted answers, files by name and size, the footer on every page', async () => {
  const app = await submitted('Aisha', 'Khan-Reynolds');
  const admin = await makeAdmin();
  const res = await adminPdf(admin.token, app.appId);
  const pdf = await inspectPdf(res.buffer);
  assert.ok(pdf.numPages >= 6);
  assert.match(pdf.pages[0].text, /Application summary/);
  for (const line of [`APPLICANT NAME Aisha Khan-Reynolds`, `APPLICATION REFERENCE ${app.reference}`, `PASSPORT NUMBER ${SECRET_ID}`, 'COUNTRY OF NATIONALITY United Kingdom', 'DATE OF BIRTH 1 January 1990', 'GENDER Female', 'TYPE OF VISA UK Standard Visitor', 'SUBMISSION METHOD Online, Wiser Consulting', 'CONTACT EMAIL test.pdf.applicant@example.com', 'CONTACT LANGUAGE Sindhi']) {
    assert.ok(pdf.pages[0].lines.some((l) => l.text === line), line);
  }
  assert.match(pdf.pages[0].text, /DATE OF APPLICATION \d{1,2} [A-Z][a-z]+ \d{4}/);
  // Every part and section of the config, in its order, with nothing out of place.
  const { modelOf } = require('./helpers/pdfFixtures');
  const { fullAnswers } = require('./helpers/touristVisaFixtures');
  const expected = modelOf(fullAnswers('Aisha', 'Khan-Reynolds', 'test.pdf.applicant@example.com')).parts.flatMap((part) => part.sections.map((section) => section.title));
  assert.ok(expected.length >= 15, `${expected.length} sections`);
  let at = 0;
  for (const title of expected) {
    const index = pdf.text.indexOf(title, at);
    assert.ok(index >= at, `section "${title}" is missing or out of order`);
    at = index;
  }
  assert.ok(pdf.text.includes('MADE-UP-DETAILS-OF-A-CONVICTION'), 'the sensitive answers are in the generated file (decrypted)');
  assert.ok(pdf.text.includes(SECRET_NI));
  assert.ok(pdf.text.includes('FAKE-PASSPORT-9876'));
  assert.ok(pdf.text.includes(`${FILE_NAME} (`), 'a file by name and size');
  assert.equal(/https?:|fake-storage|tourist-visa\//i.test(pdf.text), false, 'no link, no storage id');
  for (const page of pdf.pages) {
    assert.ok(page.text.includes(`Page ${page.number} of ${pdf.numPages}`));
    assert.ok(page.text.includes('This is not an official UK Government document.'));
    assert.ok(page.text.includes(app.reference));
  }
  // The same file for the applicant (a copy of their own).
  const mine = await inspectPdf((await myPdf(app.token)).buffer);
  assert.equal(mine.numPages, pdf.numPages);
  assert.equal(mine.text.replace(/\d{1,2} [A-Z][a-z]+ \d{4}/, ''), pdf.text.replace(/\d{1,2} [A-Z][a-z]+ \d{4}/, ''));
});

test('the PDF is the same Overview the team sees, from the config the application was submitted under; the metadata has no personal data', async () => {
  const app = await submitted('Aisha', 'Khan-Reynolds');
  const admin = await makeAdmin();
  const pdf = await inspectPdf((await adminPdf(admin.token, app.appId)).buffer);
  assert.equal(pdf.info.Title, 'Application summary');
  assert.equal(pdf.info.Author, 'Wiser Consulting');
  for (const value of Object.values(pdf.info)) assertNone(value, ['Aisha', 'Khan', app.reference, SECRET_ID, 'test.pdf.applicant'], 'the metadata');
  for (const script of ['/JavaScript', '/JS ', '/OpenAction', '/Launch']) assert.equal(pdf.raw.includes(script), false, script);
});

test('corrections show as a small marker and nothing more; notes, flags, the change history and every reason stay out of the file, for the admin and for the applicant', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const NOTE = 'PRIVATE-NOTE-TEXT about this applicant';
  assert.equal((await api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body: { kind: 'note', text: NOTE } })).status, 201);
  assert.equal((await api('PUT', `/admin/applications/${app.appId}/flags`, { token: admin.token, body: { flags: ['verified', 'concern'] } })).status, 200);
  const changed = await correct(admin.token, app.appId, 0, [{ questionId: 'q2_32', value: { countryCode: '+44', number: '7700 900555' } }]);
  assert.equal(changed.status, 200, changed.text);
  for (const res of [await adminPdf(admin.token, app.appId), await myPdf(app.token)]) {
    const pdf = await inspectPdf(res.buffer);
    assert.equal((pdf.text.match(/Corrected by our team on/g) || []).length, 1);
    assert.ok(pdf.text.includes('+44 7700 900555'), 'the new value');
    assert.equal(pdf.text.includes('7700 900123'), false, 'never the old value');
    assertNone(pdf.text, ['MADE-UP-REASON', NOTE, 'PRIVATE-NOTE', 'verified', 'Verified', 'revision', 'Revision'], 'the PDF');
    assert.equal(/\bFlags?\b|Change history|Activity log|Audit trail|Internal note/i.test(pdf.text), false);
  }
});

// ---------------------------------------------------------------------------
// Characters the fonts cannot print
// ---------------------------------------------------------------------------

test('text with characters the fonts cannot print is refused with 422 and the section named; nothing is recorded; the character is never in the answer or the log', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  assert.equal((await correct(admin.token, app.appId, 0, [{ questionId: 'q1_5', value: `Visit ${ARABIC} soon` }])).status, 200);
  const before = (await auditRows({ applicationId: oid(app.appId), action: 'pdf_export' })).length;
  const lines = capture();
  let theirs;
  let mine;
  try {
    theirs = await adminPdf(admin.token, app.appId);
    mine = await myPdf(app.token);
  } finally {
    lines.restore();
  }
  for (const res of [theirs, mine]) {
    assert.equal(res.status, 422);
    assert.equal(res.buffer, null);
    assert.equal(res.json.code, 'PDF_UNSUPPORTED_CHARACTERS');
    assert.equal(res.json.section, '1');
    assert.equal(res.json.sectionTitle, 'Travel information');
    assert.match(res.json.message, /section 1 \(Travel information\)/);
    assert.match(res.json.message, /Latin letters only/);
    assertNone(res.text, [ARABIC, 'Visit', 'Testfirst', SECRET_ID], 'the answer');
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await auditRows({ applicationId: oid(app.appId), action: 'pdf_export' })).length, before, 'a refused PDF is not recorded as an export');
  assertNone(lines.lines.join('\n'), [ARABIC, 'Visit', 'Testfirst', 'Testlast', SECRET_ID], 'the log');
  // Put it right and the same application can be exported.
  assert.equal((await correct(admin.token, app.appId, 1, [{ questionId: 'q1_5', value: 'Visit London soon' }])).status, 200);
  assert.equal((await adminPdf(admin.token, app.appId)).status, 200);
});

test('a name the fonts cannot print is refused, naming the application details at the top (the header block)', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  assert.equal((await correct(admin.token, app.appId, 0, [{ questionId: 'q2_1', value: ARABIC }])).status, 200);
  const res = await adminPdf(admin.token, app.appId);
  assert.equal(res.status, 422);
  assert.equal(res.json.code, 'PDF_UNSUPPORTED_CHARACTERS');
  assert.equal(res.json.section, 'header', 'the name is in the header block, which is checked first');
  assert.match(res.json.message, /application details at the top of the summary/);
  assert.equal(/section header/i.test(res.json.message), false);
  assertNone(res.text, [ARABIC], 'the answer');
});

// ---------------------------------------------------------------------------
// The audit, the log, storage and the rate limit
// ---------------------------------------------------------------------------

test('each export is one audit row with ids and fixed words only (the type, and who asked), written for the admin and for the applicant, never any content', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  assert.equal((await adminPdf(admin.token, app.appId)).status, 200);
  assert.equal((await myPdf(app.token)).status, 200);
  const rows = await auditRows({ applicationId: oid(app.appId), action: 'pdf_export' });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [String(r.adminId), r.pdfType, r.pdfBy]), [[admin.userId, 'answers', 'admin'], [app.userId, 'answers', 'applicant']]);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['_id', 'action', 'adminId', 'applicationId', 'at', 'pdfBy', 'pdfType'].sort());
    assertNone(JSON.stringify(row), ['Testfirst', 'Testlast', SECRET_ID, SECRET_NI, 'Application summary', app.reference, '.pdf'], 'the audit row');
  }
  // The admin can read them in the activity panel.
  const activity = await api('GET', `/admin/applications/${app.appId}/activity`, { token: admin.token });
  const exports = activity.json.data.activity.filter((a) => a.action === 'pdf_export');
  assert.deepEqual(exports.map((a) => a.pdfBy).sort(), ['admin', 'applicant']);
  assert.ok(exports.every((a) => a.pdfType === 'answers'));
  assertNone(activity.text, [SECRET_ID, SECRET_NI], 'the activity');
});

test('nothing sensitive in any log line, in a successful export or a refused one', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const lines = capture();
  try {
    await adminPdf(admin.token, app.appId);
    await myPdf(app.token);
    await adminPdf(app.token, app.appId);
    await getPdf('/applications/me/pdf/answers');
  } finally {
    lines.restore();
  }
  assertNone(lines.lines.join('\n'), ['Testfirst', 'Testlast', SECRET_ID, SECRET_NI, SECRET_DETAILS, 'test.pdf.applicant', 'Application summary'], 'the log');
});

test('a drawing failure is a fixed 500 and one log line with the application id only: never the error text, an answer or a name', async () => {
  const { TouristVisaPdfService } = require('../services/touristVisaPdfService');
  const engine = require('../shared/tourist-visa/engine');
  const { fullAnswers } = require('./helpers/touristVisaFixtures');
  const application = { _id: new mongoose.Types.ObjectId(), reference: 'TV-AAAAAAAA', status: 'submitted', answers: fullAnswers('Leakfirst', 'Leaklast', 'leak@example.com'), documents: [], declarations: {}, submittedAt: new Date() };
  const rows = [];
  const service = new TouristVisaPdfService({
    applications: { configOf: async () => engine.config, correctionMarks: async () => ({}), repository: { findLatestByApplicant: async () => application } },
    admin: { load: async () => application },
    audit: { append: async (list) => rows.push(...list) },
    render: async () => { throw new Error('SECRET-ERROR-TEXT Leakfirst Leaklast leak@example.com'); },
  });
  for (const call of [() => service.answersForApplicant('u1'), () => service.answersForAdmin('a1', String(application._id))]) {
    const lines = capture();
    let error;
    try { await call(); } catch (e) { error = e; } finally { lines.restore(); }
    assert.ok(error, 'it fails');
    assert.equal(error.statusCode, 500);
    assert.equal(error.code, 'PDF_FAILED');
    assertNone(`${error.message} ${JSON.stringify(error.details || {})}`, ['SECRET-ERROR-TEXT', 'Leakfirst', 'Leaklast', 'leak@example.com'], 'the error');
    const log = lines.lines.join('\n');
    assert.ok(log.includes(String(application._id)), 'the application id is logged');
    assertNone(log, ['SECRET-ERROR-TEXT', 'Leakfirst', 'Leaklast', 'leak@example.com', 'TV-AAAAAAAA'], 'the log');
  }
  assert.equal(rows.length, 2, 'the export was recorded before the file was made');
});

test('the PDF is made in memory and kept nowhere: the database holds no copy and the collections gain nothing but the audit row', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const collections = async () => Object.fromEntries(await Promise.all((await mongoose.connection.db.listCollections().toArray()).map(async (c) => [c.name, await mongoose.connection.db.collection(c.name).countDocuments()])));
  const before = await collections();
  assert.equal((await adminPdf(admin.token, app.appId)).status, 200);
  const after = await collections();
  const grown = Object.keys(after).filter((name) => after[name] !== (before[name] || 0));
  assert.deepEqual(grown, ['touristvisaaudit']);
  assert.equal(after.touristvisaaudit, before.touristvisaaudit + 1);
  for (const name of Object.keys(after)) assert.equal(/pdf/i.test(name), false, `a collection called ${name}`);
  const stored = JSON.stringify(await TouristVisaApplication.collection.findOne({ _id: oid(app.appId) }));
  assertNone(stored, ['%PDF', 'Application summary'], 'the stored application');
});

test('the rate limit: each signed-in user has one shared budget for the PDF routes; another user is not held up; the answer is a plain 429', async () => {
  const app = await submitted();
  const other = await submitted();
  const results = [];
  for (let i = 0; i < 21; i += 1) results.push((await myPdf(app.token)).status);
  assert.deepEqual(results.slice(0, 20), Array(20).fill(200));
  assert.equal(results[20], 429);
  const limited = await myPdf(app.token);
  assert.equal(limited.status, 429);
  assert.equal(limited.json.code, 'TOO_MANY_PDFS');
  assert.match(limited.json.message, /Too many PDF downloads/);
  assert.equal(limited.buffer, null);
  assert.equal((await myPdf(other.token)).status, 200, 'another user');
  // A refused export wrote no audit row beyond the 20.
  assert.equal((await auditRows({ applicationId: oid(app.appId), action: 'pdf_export' })).length, 20);
});

test('both PDF routes carry the one shared limiter, and no other route does', () => {
  const adminRoutes = require('../routes/touristVisaAdminRoutes');
  const found = [];
  for (const [router, path] of [[adminRoutes, '/applications/:id/pdf/answers'], [touristVisaRoutes, '/applications/me/pdf/answers']]) {
    const layer = router.stack.find((l) => l.route && l.route.path === path);
    assert.ok(layer, `${path} is registered`);
    assert.deepEqual(Object.keys(layer.route.methods), ['get']);
    assert.ok(layer.route.stack.some((s) => s.handle === pdfLimiter), `${path} is rate limited`);
    found.push(path);
  }
  assert.equal(found.length, 2);
  // Nothing else uses it (a limit on the overview would turn the page away).
  for (const router of [adminRoutes, touristVisaRoutes]) {
    for (const layer of router.stack.filter((l) => l.route && !/pdf/.test(l.route.path))) assert.equal(layer.route.stack.some((s) => s.handle === pdfLimiter), false, layer.route.path);
  }
});

test('the limiter is per user and takes its numbers as arguments: a small one is turned away at once', async () => {
  const limiter = createPdfLimiter({ windowMs: 60000, max: 2 });
  const express2 = express();
  express2.use((req, res, next) => { req.user = { _id: req.get('x-user') || 'a' }; next(); });
  express2.get('/', limiter, (req, res) => res.send('ok'));
  express2.use((error, req, res, next) => res.status(error.statusCode || 500).json({ code: error.code }));
  const srv = await new Promise((resolve) => { const s = express2.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const statuses = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await fetch(url, { headers: { 'x-user': 'a' } })).status);
    statuses.push((await fetch(url, { headers: { 'x-user': 'b' } })).status);
    assert.deepEqual(statuses, [200, 200, 429, 200]);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});
