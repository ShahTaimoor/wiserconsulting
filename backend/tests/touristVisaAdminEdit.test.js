'use strict';

// Step 8f tests: an administrator corrects a submitted application (a dry run, then one transaction), and keeps notes,
// a call log and flags. Needs a replica set (transactions): an in-memory one is started. A fake file storage (no
// network), made-up users and answers.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.TOURIST_VISA_ENABLED = 'true';
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { test, before, after, mock } = require('node:test');
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
const repository = require('../repositories/touristVisaApplicationRepository');
const auditRepository = require('../repositories/touristVisaAuditRepository');
const changeRepository = require('../repositories/touristVisaChangeRepository');
const noteRepository = require('../repositories/touristVisaNoteRepository');
const fieldCipher = require('../repositories/fieldCipher');
const { getFieldEncryptionKey } = require('../config/fieldEncryption');
const documentService = require('../services/touristVisaDocumentService');
const { TouristVisaApplicationService } = require('../services/touristVisaApplicationService');
const { TouristVisaAdminEditService } = require('../services/touristVisaAdminEditService');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const engine = require('../shared/tourist-visa/engine');
const { SECRET_ID, SECRET_NI, SECRET_DETAILS, FILE_NAME, SECTIONS } = require('./helpers/touristVisaFixtures');

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

async function api(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}/api/tourist-visa${path}`, {
    method,
    headers: { ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function makeUser(role = 0, name) {
  userCounter += 1;
  const user = await User.create({ name: name || `Edit Side ${userCounter}`, email: `test.editside.${userCounter}@example.com`, password: 'not-a-real-password', role });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token, userId: String(user._id) };
}
const makeAdmin = (name) => makeUser(1, name);
const oid = (id) => new mongoose.Types.ObjectId(id);
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: oid(appId) });
const auditRows = (filter = {}) => TouristVisaAudit.collection.find(filter).sort({ at: 1, _id: 1 }).toArray();
const changeRows = (filter = {}) => TouristVisaChange.collection.find(filter).sort({ at: 1, _id: 1 }).toArray();
const noteRows = (filter = {}) => TouristVisaNote.collection.find(filter).sort({ at: 1, _id: 1 }).toArray();
const adminGet = (token, path) => api('GET', `/admin${path}`, { token });
const edit = (token, appId, body) => api('PUT', `/admin/applications/${appId}/changes`, { token, body });
const move = (token, appId, status) => api('PATCH', `/admin/applications/${appId}/status`, { token, body: { status } });

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60, 0x20)]);
function upload(token, slot, name) {
  const form = new FormData();
  form.append('slot', slot);
  form.append('file', new Blob([PDF], { type: 'application/pdf' }), name);
  return api('POST', '/applications/me/documents', { token, body: form });
}
async function readyApplicant({ given, family, email } = {}) {
  const person = await makeUser(0);
  const created = await api('POST', '/applications', { token: person.token });
  const appId = created.json.data.application.id;
  for (const [id, answers] of SECTIONS(given, family, email)) {
    const res = await api('PUT', `/applications/me/sections/${id}`, { token: person.token, body: { answers } });
    assert.equal(res.status, 200, `${id}: ${JSON.stringify(res.json)}`);
  }
  assert.equal((await upload(person.token, 'passport', FILE_NAME)).status, 201);
  assert.equal((await upload(person.token, 'funds', 'bank-statement.pdf')).status, 201);
  return { ...person, appId };
}
async function submitted(options) {
  const person = await readyApplicant(options);
  const res = await api('POST', '/applications/me/submit', { token: person.token, body: { declarationAccepted: true } });
  assert.equal(res.status, 200, res.text);
  return { ...person, reference: res.json.data.reference };
}

function capture() {
  const lines = [];
  const original = { error: console.error, log: console.log, info: console.info, warn: console.warn };
  for (const method of Object.keys(original)) console[method] = (...args) => lines.push(args.map((a) => util.inspect(a, { depth: 8 })).join(' '));
  return { lines, restore: () => Object.assign(console, original) };
}

const REASON = 'MADE-UP-REASON: corrected after the phone call';
const NEW_PASSPORT = 'NEW-FAKE-PASSPORT-5555';
const NEW_NI = 'CE654321B';
const NEW_PHONE = '7700 900555';
const NOTE_TEXT = 'MADE-UP-NOTE: prefers calls after six in the evening';
const CALL_TEXT = 'MADE-UP-CALL-TEXT: left a message with a relative';
const OLD_PHONE_TEXT = '+44 7700 900123';
// Every made-up value an edit, a note or a reason can carry. None of them may appear where it should not.
const NEW_VALUES = [NEW_PASSPORT, NEW_NI, NEW_PHONE, REASON, NOTE_TEXT, CALL_TEXT, SECRET_ID, SECRET_NI, SECRET_DETAILS, FILE_NAME, 'Sindhi'];
const assertNone = (text, needles, where) => { for (const needle of needles) assert.equal(String(text).includes(needle), false, `${needle} is in ${where}`); };
const phoneChange = (number = NEW_PHONE) => ({ questionId: 'q2_32', value: { countryCode: '+44', number } });
const phoneBody = (expectedRevision = 0, extra = {}) => ({ expectedRevision, reason: REASON, changes: [phoneChange()], ...extra });
const rowsOf = (review) => review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows));

// ---------------------------------------------------------------------------
// Who may call it
// ---------------------------------------------------------------------------

test('authorization: anonymous is 401, a signed-in applicant is 403, an administrator is let in; every answer is no-store; a refusal writes nothing', async () => {
  const app = await submitted();
  const applicant = await makeUser(0);
  const admin = await makeAdmin();
  const id = app.appId;
  const routes = [
    ['GET', `/admin/applications/${id}/edit-form`],
    ['PUT', `/admin/applications/${id}/changes`, phoneBody()],
    ['GET', `/admin/applications/${id}/changes`],
    ['GET', `/admin/applications/${id}/notes`],
    ['POST', `/admin/applications/${id}/notes`, { kind: 'note', text: NOTE_TEXT }],
    ['PUT', `/admin/applications/${id}/flags`, { flags: ['verified'] }],
  ];
  const before = await rawDoc(id);
  const rowsBefore = await auditRows();
  for (const [method, path, body] of routes) {
    const anonymous = await api(method, path, { body });
    assert.equal(anonymous.status, 401, `anonymous ${method} ${path}`);
    assert.equal(anonymous.headers.get('cache-control'), 'no-store');
    assert.equal((await api(method, path, { token: 'not-a-token', body })).status, 401);
    const normal = await api(method, path, { token: applicant.token, body });
    assert.equal(normal.status, 403, `applicant ${method} ${path}`);
    assert.equal(normal.headers.get('cache-control'), 'no-store');
    assertNone(normal.text, NEW_VALUES, '403 body');
  }
  assert.deepEqual(await rawDoc(id), before);
  assert.deepEqual(await auditRows(), rowsBefore);
  assert.equal((await changeRows({ applicationId: oid(id) })).length, 0);
  assert.equal((await noteRows({ applicationId: oid(id) })).length, 0);

  for (const [method, path, body] of routes) {
    const ok = await api(method, path, { token: admin.token, body });
    assert.ok([200, 201].includes(ok.status), `admin ${method} ${path}: ${ok.text}`);
    assert.equal(ok.headers.get('cache-control'), 'no-store', `no-store on ${path}`);
  }
});

test('authorization: a demoted administrator is refused at once, and a forged role in the token does nothing', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  assert.equal((await edit(admin.token, app.appId, { ...phoneBody(), dryRun: true })).status, 200);
  await User.updateOne({ _id: admin.user._id }, { $set: { role: 0 } });
  assert.equal((await edit(admin.token, app.appId, phoneBody())).status, 403);
  const forged = jwt.sign({ id: String((await makeUser(0)).user._id), role: 1, isAdmin: true }, process.env.JWT_SECRET);
  assert.equal((await edit(forged, app.appId, phoneBody())).status, 403);
  assert.equal((await rawDoc(app.appId)).revision ?? 0, 0);
});

test('while the feature is closed the new admin routes answer 404 FEATURE_CLOSED, even for an administrator', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  process.env.TOURIST_VISA_ENABLED = 'false';
  try {
    for (const [method, path, body] of [
      ['GET', `/admin/applications/${app.appId}/edit-form`], ['PUT', `/admin/applications/${app.appId}/changes`, phoneBody()], ['GET', `/admin/applications/${app.appId}/changes`],
      ['GET', `/admin/applications/${app.appId}/notes`], ['POST', `/admin/applications/${app.appId}/notes`, { kind: 'note', text: NOTE_TEXT }], ['PUT', `/admin/applications/${app.appId}/flags`, { flags: [] }],
    ]) {
      const res = await api(method, path, { token: admin.token, body });
      assert.deepEqual([res.status, res.json.code], [404, 'FEATURE_CLOSED'], `${method} ${path}`);
    }
  } finally { process.env.TOURIST_VISA_ENABLED = 'true'; }
  assert.equal((await changeRows({ applicationId: oid(app.appId) })).length, 0);
});

test('a draft is invisible to every new route: the same 404 as an unknown id, and nothing is written', async () => {
  const admin = await makeAdmin();
  const person = await readyApplicant();
  const before = await rawDoc(person.appId);
  const rowsBefore = await auditRows();
  const ids = [person.appId, '0123456789abcdef01234567', 'not-an-id'];
  for (const id of ids) {
    for (const [method, path, body] of [
      ['GET', `/admin/applications/${id}/edit-form`], ['PUT', `/admin/applications/${id}/changes`, phoneBody()], ['PUT', `/admin/applications/${id}/changes`, { ...phoneBody(), dryRun: true }],
      ['GET', `/admin/applications/${id}/changes`], ['GET', `/admin/applications/${id}/notes`], ['POST', `/admin/applications/${id}/notes`, { kind: 'note', text: NOTE_TEXT }], ['PUT', `/admin/applications/${id}/flags`, { flags: ['concern'] }],
    ]) {
      const res = await api(method, path, { token: admin.token, body });
      assert.deepEqual([res.status, res.json.code], [404, 'APPLICATION_NOT_FOUND'], `${method} ${path}`);
    }
  }
  assert.deepEqual(await rawDoc(person.appId), before);
  assert.deepEqual(await auditRows(), rowsBefore);
  assert.equal(await noteRows().then((rows) => rows.filter((r) => String(r.applicationId) === person.appId).length), 0);
});

test('there is still no route that changes or deletes an audit row, a change record or a note', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const id = app.appId;
  assert.equal((await edit(admin.token, id, phoneBody())).status, 200);
  const note = await api('POST', `/admin/applications/${id}/notes`, { token: admin.token, body: { kind: 'note', text: NOTE_TEXT } });
  const noteId = note.json.data.note.id;
  const changeId = String((await changeRows({ applicationId: oid(id) }))[0]._id);
  const before = [await changeRows(), await noteRows(), await auditRows()];
  for (const [method, path] of [
    ['DELETE', `/admin/applications/${id}/changes`], ['PATCH', `/admin/applications/${id}/changes`], ['POST', `/admin/applications/${id}/changes`], ['PUT', `/admin/applications/${id}/changes/${changeId}`], ['DELETE', `/admin/applications/${id}/changes/${changeId}`],
    ['DELETE', `/admin/applications/${id}/notes`], ['PUT', `/admin/applications/${id}/notes`], ['PATCH', `/admin/applications/${id}/notes/${noteId}`], ['PUT', `/admin/applications/${id}/notes/${noteId}`], ['DELETE', `/admin/applications/${id}/notes/${noteId}`],
    ['DELETE', `/admin/applications/${id}/flags`], ['POST', `/admin/applications/${id}/flags`], ['PATCH', `/admin/applications/${id}/flags`], ['POST', `/admin/applications/${id}/edit-form`], ['PUT', `/admin/applications/${id}/edit-form`],
  ]) {
    const res = await api(method, path, { token: admin.token, body: method === 'GET' || method === 'DELETE' ? undefined : { flags: [], text: 'x', kind: 'note' } });
    assert.equal(res.status, 404, `${method} ${path}`);
  }
  assert.deepEqual([await changeRows(), await noteRows(), await auditRows()], before);
});

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

test('a correction: the answer, the revision and the summary change together; the list shows the new phone; one change record; one audit row', async () => {
  const app = await submitted({ given: 'Phonefirst', family: 'Phonelast', email: 'phone.test@example.com' });
  const admin = await makeAdmin();
  const res = await edit(admin.token, app.appId, phoneBody());
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.json.data, { dryRun: false, revision: 1, applied: 1 });
  assert.equal(res.headers.get('cache-control'), 'no-store');

  const raw = await rawDoc(app.appId);
  assert.equal(raw.revision, 1);
  assert.deepEqual(raw.answers.q2_32, { countryCode: '+44', number: NEW_PHONE });
  assert.equal(raw.summary.phone, `+44 ${NEW_PHONE}`);
  assert.equal(raw.summary.name, 'Phonefirst Phonelast', 'the rest of the summary is as it was');
  assert.equal(raw.status, 'submitted');

  const list = await adminGet(admin.token, '/applications?q=Phonefirst');
  assert.equal(list.json.data.applications[0].phone, `+44 ${NEW_PHONE}`);
  const overview = await adminGet(admin.token, `/applications/${app.appId}`);
  assert.equal(overview.json.data.call.phone.display, `+44 ${NEW_PHONE}`);
  assert.equal(overview.json.data.call.phone.tel, '+447700900555');
  assert.equal(overview.json.data.application.revision, 1);
  assert.equal(overview.json.data.application.editable, true);

  const records = await changeRows({ applicationId: oid(app.appId) });
  assert.equal(records.length, 1);
  assert.equal(String(records[0].adminId), admin.userId);
  assert.deepEqual([records[0].revisionBefore, records[0].revisionAfter], [0, 1]);
  assert.equal(records[0].changes.length, 1);
  assert.deepEqual(Object.keys(records[0].changes[0]).sort(), ['kind', 'new', 'old', 'questionId', 'sectionId']);
  assert.deepEqual([records[0].changes[0].sectionId, records[0].changes[0].questionId, records[0].changes[0].kind], ['2D', 'q2_32', 'edited']);

  const audit = await auditRows({ applicationId: oid(app.appId), action: 'changes_apply' });
  assert.equal(audit.length, 1);
  assert.deepEqual(Object.keys(audit[0]).sort(), ['_id', 'action', 'adminId', 'applicationId', 'at']);
  assert.equal(String(audit[0].adminId), admin.userId);
});

test('name and email corrections refresh the summary; an unrelated correction leaves it alone', async () => {
  const app = await submitted({ given: 'Summaryfirst', family: 'Summarylast', email: 'summary.test@example.com' });
  const admin = await makeAdmin();
  assert.equal((await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q2_1', value: 'Renamedfirst' }, { questionId: 'q2_2', value: 'Renamedlast' }] })).status, 200);
  assert.equal((await rawDoc(app.appId)).summary.name, 'Renamedfirst Renamedlast');
  assert.equal((await adminGet(admin.token, '/applications?q=Renamedfirst')).json.data.applications.length, 1);
  assert.equal((await adminGet(admin.token, '/applications?q=Summaryfirst')).json.data.applications.length, 0, 'the old name no longer finds it');

  const email = 'Renamed.Email@Example.com';
  const lower = email.toLowerCase();
  const emailBody = { expectedRevision: 1, reason: REASON, changes: [{ questionId: 'q2_4', value: email }, { questionId: 'q2_9', value: lower }, { questionId: 'q2_10', value: lower }, { questionId: 'q2_11', value: lower }] };
  assert.equal((await edit(admin.token, app.appId, emailBody)).status, 200);
  assert.equal((await rawDoc(app.appId)).summary.email, lower);
  assert.equal((await adminGet(admin.token, '/applications?q=renamed.email')).json.data.applications.length, 1);

  const summary = (await rawDoc(app.appId)).summary;
  assert.equal((await edit(admin.token, app.appId, { expectedRevision: 2, reason: REASON, changes: [{ questionId: 'q1_5', value: 'A different test trip.' }] })).status, 200);
  assert.deepEqual((await rawDoc(app.appId)).summary, summary);
  assert.equal((await rawDoc(app.appId)).revision, 3);
});

test('changing the email alone is refused: its section is validated as a whole, like a normal save', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const res = await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q2_4', value: 'only.the.email@example.com' }] });
  assert.equal(res.status, 422);
  assert.equal(res.json.code, 'CHANGES_INVALID');
  assert.deepEqual(res.json.sections, [{ id: '2A', problems: 3 }]);
  assertNone(res.text, ['only.the.email', ...NEW_VALUES, 'Testfirst'], 'the 422');
  assert.equal((await rawDoc(app.appId)).revision ?? 0, 0);
  assert.equal((await changeRows({ applicationId: oid(app.appId) })).length, 0);
});

test('a dry run writes no data change: same answers, revision, summary and times; one preview audit row without any value; no reason needed', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const before = await rawDoc(app.appId);
  const res = await edit(admin.token, app.appId, { expectedRevision: 0, changes: [phoneChange()], dryRun: true });
  assert.equal(res.status, 200, res.text);
  const data = res.json.data;
  assert.equal(data.dryRun, true);
  assert.equal(data.revision, 0);
  assert.deepEqual(data.sections, [{ id: '2D', title: data.sections[0].title }]);
  assert.equal(data.changes.length, 1);
  assert.deepEqual([data.changes[0].old, data.changes[0].new, data.changes[0].questionId, data.changes[0].sectionId], [OLD_PHONE_TEXT, `+44 ${NEW_PHONE}`, 'q2_32', '2D']);
  assert.ok(data.changes[0].label && data.changes[0].number);
  assert.deepEqual([data.removed, data.required], [[], []]);

  assert.deepEqual(await rawDoc(app.appId), before, 'nothing in the application changed, not even its update time');
  assert.equal((await changeRows({ applicationId: oid(app.appId) })).length, 0);
  const rows = await auditRows({ applicationId: oid(app.appId) });
  assert.deepEqual(rows.map((r) => r.action), ['changes_preview']);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['_id', 'action', 'adminId', 'applicationId', 'at']);
  assertNone(JSON.stringify(rows), [NEW_PHONE, '7700', 'q2_32', ...NEW_VALUES], 'the preview audit row');

  // a reason that is sent with a dry run is neither needed nor kept
  const withReason = await edit(admin.token, app.appId, { expectedRevision: 0, reason: 'x', changes: [phoneChange()], dryRun: true });
  assert.equal(withReason.status, 200);
  assert.equal((await changeRows({ applicationId: oid(app.appId) })).length, 0);
});

test('a dry run that does not pass is refused like the real thing and writes nothing, not even an audit row', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const rowsBefore = await auditRows({ applicationId: oid(app.appId) });
  const res = await edit(admin.token, app.appId, { expectedRevision: 0, dryRun: true, changes: [{ questionId: 'q2_3', value: true }] });
  assert.equal(res.status, 422);
  assert.deepEqual(res.json.sections, [{ id: '2A', problems: 1 }]);
  assert.deepEqual(await auditRows({ applicationId: oid(app.appId) }), rowsBefore);
});

test('the reason is required for a real edit: 10 to 1000 characters after trimming', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const before = await rawDoc(app.appId);
  for (const reason of [undefined, null, 7, '', '          ', '123456789', '  123456789  ', 'x'.repeat(1001)]) {
    const res = await edit(admin.token, app.appId, { expectedRevision: 0, ...(reason === undefined ? {} : { reason }), changes: [phoneChange()] });
    assert.deepEqual([res.status, res.json.code], [400, 'INVALID_REASON'], String(reason).slice(0, 12));
  }
  assert.deepEqual(await rawDoc(app.appId), before);
  assert.equal((await edit(admin.token, app.appId, { expectedRevision: 0, reason: '   0123456789   ', changes: [phoneChange()] })).status, 200);
  const record = (await changeRows({ applicationId: oid(app.appId) }))[0];
  assert.equal(fieldCipher.decrypt(getFieldEncryptionKey(), record.reason, `touristvisachanges:${record._id}:reason`), '0123456789', 'the trimmed reason is what is kept');
  const second = await edit(admin.token, app.appId, { expectedRevision: 1, reason: 'y'.repeat(1000), changes: [{ questionId: 'q1_5', value: 'Another test trip.' }] });
  assert.equal(second.status, 200);
});

test('a request that is not exactly { expectedRevision, reason, changes, dryRun? } is refused', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const bad = [
    undefined, [], 'x', null,
    { reason: REASON, changes: [phoneChange()] }, // no revision
    { expectedRevision: '0', reason: REASON, changes: [phoneChange()] }, { expectedRevision: -1, reason: REASON, changes: [phoneChange()] }, { expectedRevision: 0.5, reason: REASON, changes: [phoneChange()] },
    { ...phoneBody(), extra: true }, { ...phoneBody(), dryRun: 'yes' }, { ...phoneBody(), changes: [] }, { ...phoneBody(), changes: 'x' }, { expectedRevision: 0, reason: REASON },
  ];
  for (const body of bad) {
    const res = await edit(admin.token, app.appId, body);
    assert.equal(res.status, 400, JSON.stringify(body)?.slice(0, 60));
    // (a body that is not an object or a list never reaches the service: the body parser refuses it without a code)
    assert.ok([undefined, 'INVALID_REQUEST', 'INVALID_REASON'].includes(res.json.code), res.json.code);
  }
  assert.equal((await rawDoc(app.appId)).revision ?? 0, 0);
});

test('a stale revision is refused with 409 REVISION_CHANGED, for a preview and for an edit, and writes nothing', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  assert.equal((await edit(admin.token, app.appId, phoneBody(0))).status, 200);
  const before = await rawDoc(app.appId);
  const rowsBefore = await auditRows({ applicationId: oid(app.appId) });
  for (const body of [phoneBody(0, { changes: [{ questionId: 'q1_5', value: 'A late edit.' }] }), phoneBody(0, { dryRun: true }), phoneBody(7)]) {
    const res = await edit(admin.token, app.appId, body);
    assert.deepEqual([res.status, res.json.code], [409, 'REVISION_CHANGED']);
    assertNone(res.text, NEW_VALUES, 'the 409');
  }
  assert.deepEqual(await rawDoc(app.appId), before);
  assert.deepEqual(await auditRows({ applicationId: oid(app.appId) }), rowsBefore);
  assert.equal((await changeRows({ applicationId: oid(app.appId) })).length, 1);
  assert.equal((await edit(admin.token, app.appId, phoneBody(1, { changes: [{ questionId: 'q1_5', value: 'On the latest revision.' }] }))).status, 200);
  assert.equal((await rawDoc(app.appId)).revision, 2);
  const records = await changeRows({ applicationId: oid(app.appId) });
  assert.deepEqual(records.map((r) => [r.revisionBefore, r.revisionAfter]), [[0, 1], [1, 2]]);
});

test('two edits at the same moment with the same revision: exactly one wins, the other is told 409', async () => {
  const admin = await makeAdmin();
  const other = await makeAdmin();
  for (let round = 0; round < 4; round += 1) {
    const app = await submitted();
    const [a, b] = await Promise.all([
      edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [phoneChange('7700 900111')] }),
      edit(other.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [phoneChange('7700 900222')] }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409], `round ${round}: ${a.text} ${b.text}`);
    const loser = a.status === 409 ? a : b;
    assert.equal(loser.json.code, 'REVISION_CHANGED');
    const raw = await rawDoc(app.appId);
    assert.equal(raw.revision, 1);
    assert.equal((await changeRows({ applicationId: oid(app.appId) })).length, 1);
    assert.equal((await auditRows({ applicationId: oid(app.appId), action: 'changes_apply' })).length, 1);
    const winnerNumber = a.status === 200 ? '7700 900111' : '7700 900222';
    assert.equal(raw.answers.q2_32.number, winnerNumber);
  }
});

test('the status gates: submitted and in review can be edited; a completed application cannot (409 STATUS_NOT_EDITABLE), for a preview too, and the form is not offered', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  assert.equal((await edit(admin.token, app.appId, phoneBody(0))).status, 200);
  assert.equal((await move(admin.token, app.appId, 'in_review')).status, 200);
  assert.equal((await edit(admin.token, app.appId, phoneBody(1, { changes: [phoneChange('7700 900333')] }))).status, 200);
  assert.equal((await move(admin.token, app.appId, 'completed')).status, 200);
  const before = await rawDoc(app.appId);
  for (const body of [phoneBody(2), phoneBody(2, { dryRun: true })]) {
    const res = await edit(admin.token, app.appId, body);
    assert.deepEqual([res.status, res.json.code], [409, 'STATUS_NOT_EDITABLE']);
  }
  assert.deepEqual([(await adminGet(admin.token, `/applications/${app.appId}/edit-form`)).status], [409]);
  assert.deepEqual(await rawDoc(app.appId), before);
  assert.equal((await adminGet(admin.token, `/applications/${app.appId}`)).json.data.application.editable, false);
  // reading the history and writing notes still work on a completed application
  assert.equal((await adminGet(admin.token, `/applications/${app.appId}/changes`)).status, 200);
  assert.equal((await api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body: { kind: 'note', text: NOTE_TEXT } })).status, 201);
  assert.equal((await move(admin.token, app.appId, 'in_review')).status, 200);
  assert.equal((await edit(admin.token, app.appId, phoneBody(2, { changes: [phoneChange('7700 900444')] }))).status, 200, 'reopened: editable again');
});

test('the write itself is conditional on the status: an application that was completed after the check is not changed', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  await TouristVisaApplication.collection.updateOne({ _id: oid(app.appId) }, { $set: { status: 'completed' } });
  const before = await rawDoc(app.appId);
  const written = await changeRepository.applyEdit({
    applicationId: oid(app.appId), adminId: admin.user._id, expectedRevision: 0, set: { q1_5: 'Written after completion.' }, unset: [], summary: undefined, reason: REASON,
    items: [{ sectionId: '1', questionId: 'q1_5', kind: 'edited', old: 'a', new: 'b' }], at: new Date(),
  });
  assert.equal(written, null);
  assert.deepEqual(await rawDoc(app.appId), before);
  assert.equal((await changeRows({ applicationId: oid(app.appId) })).length, 0);
  assert.equal((await auditRows({ applicationId: oid(app.appId), action: 'changes_apply' })).length, 0);
});

test('what an admin cannot change is refused with its own code and nothing is written', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const before = await rawDoc(app.appId);
  const rowsBefore = await auditRows({ applicationId: oid(app.appId) });
  const asChange = (questionId) => ({ expectedRevision: 0, reason: REASON, changes: [{ questionId, value: 'x' }] });
  const cases = [
    [asChange('q9_11'), 'NOT_EDITABLE_DECLARATION'], [asChange('q9_14'), 'NOT_EDITABLE_DECLARATION'], [asChange('declarations.submit'), 'NOT_EDITABLE_DECLARATION'],
    [asChange('documents'), 'NOT_EDITABLE_DOCUMENTS'], [asChange('q10_6'), 'NOT_EDITABLE_DOCUMENTS'], [asChange('status'), 'NOT_EDITABLE_STATUS'],
    [asChange('reference'), 'NOT_EDITABLE_REFERENCE'], [asChange('submittedAt'), 'NOT_EDITABLE_SUBMITTED_AT'], [asChange('applicant'), 'NOT_EDITABLE_IDENTITY'],
    [{ ...phoneBody(), status: 'completed' }, 'NOT_EDITABLE_STATUS'], [{ ...phoneBody(), reference: 'TV-AAAAAAAA' }, 'NOT_EDITABLE_REFERENCE'], [{ ...phoneBody(), submittedAt: '2020-01-01' }, 'NOT_EDITABLE_SUBMITTED_AT'],
    [{ ...phoneBody(), documents: [] }, 'NOT_EDITABLE_DOCUMENTS'], [{ ...phoneBody(), applicant: String(admin.user._id) }, 'NOT_EDITABLE_IDENTITY'], [{ ...phoneBody(), declarations: { submit: {} } }, 'NOT_EDITABLE_DECLARATION'],
    [asChange('q_does_not_exist'), 'UNKNOWN_QUESTION'],
  ];
  for (const [body, code] of cases) {
    for (const dryRun of [false, true]) {
      const res = await edit(admin.token, app.appId, { ...body, ...(dryRun ? { dryRun: true } : {}) });
      assert.deepEqual([res.status, res.json.code], [400, code], `${JSON.stringify(body).slice(0, 80)} dryRun=${dryRun}`);
    }
  }
  assert.deepEqual(await rawDoc(app.appId), before);
  assert.deepEqual(await auditRows({ applicationId: oid(app.appId) }), rowsBefore);
  assert.equal((await changeRows({ applicationId: oid(app.appId) })).length, 0);
});

test('the Part 9 ticks and the final declaration record are exactly as they were after a correction in their own section', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const before = await rawDoc(app.appId);
  const res = await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q9_1', value: false }, { questionId: 'q9_2', value: false }] });
  assert.ok([200, 400].includes(res.status), res.text);
  const after = await rawDoc(app.appId);
  assert.deepEqual(after.declarations, before.declarations);
  for (const id of ['q9_11', 'q9_12', 'q9_13', 'q9_14']) assert.equal(after.answers[id], before.answers[id]);
  assert.deepEqual(after.documents, before.documents);
  assert.equal(String(after.applicant), String(before.applicant));
  assert.equal(after.reference, before.reference);
  assert.equal(String(after.submittedAt), String(before.submittedAt));
  assert.equal(after.status, before.status);
});

test('the config the application was submitted under is used, not today\'s: a rule that has since changed does not apply, and the preview uses the old wording', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const moved = JSON.parse(JSON.stringify(engine.config));
  moved.version = '98.0.0-test';
  const passport = moved.questions.find((q) => q.id === 'q3_1');
  passport.label = 'CHANGED LABEL TODAY';
  passport.rules = { ...(passport.rules || {}), pattern: { regex: '^ONLY-TODAY-[0-9]+$', message: 'Today\'s rule' } };
  const service = new TouristVisaAdminEditService({ applications: new TouristVisaApplicationService({ config: moved }) });
  const body = { expectedRevision: 0, changes: [{ questionId: 'q3_1', value: 'NOT-TODAYS-SHAPE' }], dryRun: true };

  const preview = await service.change(admin.user._id, app.appId, body);
  assert.equal(preview.changes[0].new, 'NOT-TODAYS-SHAPE', 'today\'s rule would have refused this');
  assert.notEqual(preview.changes[0].label, 'CHANGED LABEL TODAY');
  assert.equal(preview.changes[0].old, SECRET_ID);
  const applied = await service.change(admin.user._id, app.appId, { ...body, dryRun: false, reason: REASON });
  assert.equal(applied.revision, 1);

  // against today's config the same value is refused, so the difference really is the snapshot
  const today = engine.validateSection(require('zod'), moved, '3', { q3_1: 'NOT-TODAYS-SHAPE', q3_2: 'Test Passport Office', q3_3: '2022-05-01', q3_4: '2032-05-01' }, {});
  assert.equal(today.success, false);
});

// ---------------------------------------------------------------------------
// Showing and hiding
// ---------------------------------------------------------------------------

test('hidden answers are pruned: the preview lists them separately and the edit removes them, keeping every old value in the encrypted record', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const body = { expectedRevision: 0, changes: [{ questionId: 'q4_8', value: false }] };
  const preview = await edit(admin.token, app.appId, { ...body, dryRun: true });
  assert.equal(preview.status, 200, preview.text);
  assert.deepEqual(preview.json.data.changes.map((c) => [c.questionId, c.old, c.new]), [['q4_8', 'Yes', 'No']]);
  assert.equal(preview.json.data.removed.length, 6);
  assert.ok(preview.json.data.removed.some((r) => r.questionId === 'q4_8b' && r.old === 'Testmother' && r.label === 'Parent 1: Given names'));
  assert.equal((await rawDoc(app.appId)).answers.parents.length, 1, 'the preview removed nothing');

  assert.equal((await edit(admin.token, app.appId, { ...body, reason: REASON })).status, 200);
  const raw = await rawDoc(app.appId);
  assert.equal(raw.answers.parents, undefined);
  assert.equal(raw.answers.q4_8, false);
  const record = (await changeRows({ applicationId: oid(app.appId) }))[0];
  assert.equal(record.changes.length, 7);
  const pruned = record.changes.filter((c) => c.kind === 'pruned');
  assert.equal(pruned.length, 6);
  assert.ok(pruned.every((c) => c.old.startsWith('enc:v1:') && c.new === undefined && c.index === 0 && c.sectionId === '4C'));

  // the applicant's own view: the removed answers are not shown, and nothing says what they were
  const review = await api('GET', '/applications/me/review', { token: app.token });
  assert.equal(rowsOf(review.json.data.review).some((r) => r.id === 'parents'), false);
  assertNone(review.text, ['Testmother', 'Testsurname'], 'the applicant\'s review');

  // the administrator can still read them in the history
  const history = await adminGet(admin.token, `/applications/${app.appId}/changes`);
  const removed = history.json.data.history[0].changes.filter((c) => c.kind === 'pruned');
  assert.equal(removed.length, 6);
  assert.ok(removed.some((c) => c.old === 'Testmother' && c.new === 'Removed'));
});

test('a follow-up that becomes required must come in the same request: 422 with section ids and counts only; supplied, it is accepted', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const without = await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q2_3', value: true }] });
  assert.equal(without.status, 422);
  assert.equal(without.json.code, 'CHANGES_INVALID');
  assert.deepEqual(without.json.sections, [{ id: '2A', problems: 1 }]);
  assert.equal((await rawDoc(app.appId)).answers.q2_3, false);

  const requestBody = { expectedRevision: 0, changes: [{ questionId: 'q2_3', value: true }, { questionId: 'otherNames', value: [{ q2_3a: 'Aliasfirst', q2_3b: 'Aliaslast' }] }] };
  const preview = await edit(admin.token, app.appId, { ...requestBody, dryRun: true });
  assert.deepEqual(preview.json.data.required.map((r) => [r.questionId, r.new, r.label]), [['q2_3a', 'Aliasfirst', 'Other name 1: Given name(s)'], ['q2_3b', 'Aliaslast', 'Other name 1: Family name']]);
  assert.equal((await edit(admin.token, app.appId, { ...requestBody, reason: REASON })).status, 200);
  assert.deepEqual((await rawDoc(app.appId)).answers.otherNames, [{ q2_3a: 'Aliasfirst', q2_3b: 'Aliaslast' }]);
});

test('a section the correction makes necessary elsewhere is named: single -> married needs the partner section 4A, and is accepted once 4A is answered', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const res = await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q2_13', value: 'married' }] });
  assert.equal(res.status, 422);
  assert.deepEqual(res.json.sections.map((s) => s.id), ['4A']);
  assert.equal(res.json.sections[0].problems, 6);
  assertNone(res.text, ['married'], 'the 422');
  const partner = [['q4_1', 'Partnerfirst'], ['q4_2', 'Partnerlast'], ['q4_3', '1991-02-03'], ['q4_4', 'GB'], ['q4_5', true], ['q4_6', true]].map(([questionId, value]) => ({ questionId, value }));
  const ok = await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q2_13', value: 'married' }, ...partner] });
  assert.equal(ok.status, 200, ok.text);
  assert.equal((await rawDoc(app.appId)).answers.q4_1, 'Partnerfirst');
  const overview = await adminGet(admin.token, `/applications/${app.appId}`);
  assert.ok(overview.json.data.review.parts.flatMap((p) => p.sections).some((s) => s.id === '4A'));
});

test('a change to an answer inside a repeating group is validated and stored with the entry', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const needsMore = await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q4_8f', index: 0, value: false }] });
  assert.equal(needsMore.status, 422);
  assert.deepEqual(needsMore.json.sections, [{ id: '4C', problems: 1 }]);
  const ok = await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q4_8f', index: 0, value: false }, { questionId: 'q4_8h', index: 0, value: 'FR' }, { questionId: 'q4_8b', index: 0, value: 'Newmother' }] });
  assert.equal(ok.status, 200, ok.text);
  const parent = (await rawDoc(app.appId)).answers.parents[0];
  assert.deepEqual([parent.q4_8b, parent.q4_8f, parent.q4_8h, parent.q4_8c], ['Newmother', false, 'FR', 'Testsurname']);
  const record = (await changeRows({ applicationId: oid(app.appId) }))[0];
  assert.deepEqual(record.changes.map((c) => [c.questionId, c.index]).sort(), [['q4_8b', 0], ['q4_8f', 0], ['q4_8h', 0]]);
});

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

test('encrypted fields are re-encrypted for this application, never plaintext at rest; the record, the reason and the notes are encrypted too', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const res = await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q3_1', value: NEW_PASSPORT }, { questionId: 'q10_5a', value: NEW_NI }, phoneChange()] });
  assert.equal(res.status, 200, res.text);
  await api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body: { kind: 'call', outcome: 'reached', text: CALL_TEXT } });

  const raw = await rawDoc(app.appId);
  for (const id of ['q3_1', 'q10_5a']) assert.ok(String(raw.answers[id]).startsWith('enc:v1:'), id);
  assert.notEqual(raw.answers.q3_1, (await TouristVisaApplication.findById(app.appId).lean()).answers.q10_5a);
  const decrypted = repository.decryptAnswers(app.appId, raw.answers);
  assert.equal(decrypted.q3_1, NEW_PASSPORT);
  assert.equal(decrypted.q10_5a, NEW_NI);
  assert.throws(() => fieldCipher.decrypt(getFieldEncryptionKey(), raw.answers.q3_1, `${app.appId}:q3_2`), /could not be decrypted/, 'bound to the question');
  assert.throws(() => fieldCipher.decrypt(getFieldEncryptionKey(), raw.answers.q3_1, `${oid('0123456789abcdef01234567')}:q3_1`), /could not be decrypted/, 'bound to the application');

  const records = await changeRows({ applicationId: oid(app.appId) });
  const notes = await noteRows({ applicationId: oid(app.appId) });
  const stored = JSON.stringify({ raw: { ...raw, documents: [] }, records, notes, audit: await auditRows({ applicationId: oid(app.appId) }) });
  assertNone(stored, [NEW_PASSPORT, NEW_NI, REASON, CALL_TEXT, SECRET_ID, SECRET_NI, OLD_PHONE_TEXT, '7700 900123'].filter((v) => v !== SECRET_ID && v !== SECRET_NI), 'the database');
  assertNone(JSON.stringify(raw.answers), [NEW_PASSPORT, NEW_NI, SECRET_ID, SECRET_NI], 'the stored answers');
  assert.ok(records[0].reason.startsWith('enc:v1:'));
  for (const item of records[0].changes) {
    assert.ok(item.old.startsWith('enc:v1:') && item.new.startsWith('enc:v1:'), `${item.questionId}: even a question that is not sensitive keeps its old and new value encrypted`);
  }
  assert.ok(notes[0].text.startsWith('enc:v1:'));

  const overview = await adminGet(admin.token, `/applications/${app.appId}`);
  const values = Object.fromEntries(rowsOf(overview.json.data.review).map((r) => [r.id, r.value]));
  assert.equal(values.q3_1, NEW_PASSPORT);
  assert.equal(values.q10_5a, NEW_NI);
  const history = await adminGet(admin.token, `/applications/${app.appId}/changes`);
  const byId = Object.fromEntries(history.json.data.history[0].changes.map((c) => [c.questionId, c]));
  assert.deepEqual([byId.q3_1.old, byId.q3_1.new], [SECRET_ID, NEW_PASSPORT]);
});

// ---------------------------------------------------------------------------
// One transaction
// ---------------------------------------------------------------------------

test('if the change record cannot be written, nothing is written: the answers, the revision and the summary stay as they were', async () => {
  const app = await submitted({ given: 'Rollbackfirst' });
  const admin = await makeAdmin();
  const before = await rawDoc(app.appId);
  const rowsBefore = await auditRows({ applicationId: oid(app.appId) });
  const failing = mock.method(TouristVisaChange, 'create', async () => { throw new Error(`records are down ${NEW_PASSPORT} ${REASON}`); });
  const log = capture();
  let res;
  try {
    res = await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [phoneChange(), { questionId: 'q3_1', value: NEW_PASSPORT }] });
  } finally { log.restore(); failing.mock.restore(); }
  assert.equal(res.status, 500);
  assertNone(res.text, NEW_VALUES, 'the response');
  assertNone(log.lines.join('\n'), NEW_VALUES, 'the log');
  assert.deepEqual(await rawDoc(app.appId), before);
  assert.deepEqual(await auditRows({ applicationId: oid(app.appId) }), rowsBefore);
  assert.equal((await changeRows({ applicationId: oid(app.appId) })).length, 0);
  assert.equal((await edit(admin.token, app.appId, phoneBody(0))).status, 200, 'and the same edit works afterwards');
});

test('if the audit row cannot be written, nothing is written either', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const before = await rawDoc(app.appId);
  const failing = mock.method(TouristVisaAudit, 'insertMany', async () => { throw new Error('audit is down'); });
  let res;
  try { res = await edit(admin.token, app.appId, phoneBody()); } finally { failing.mock.restore(); }
  assert.equal(res.status, 500);
  assert.deepEqual(await rawDoc(app.appId), before);
  assert.equal((await changeRows({ applicationId: oid(app.appId) })).length, 0);
});

test('a dry run, a history view and the form are not shown if their audit row cannot be written', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const failing = mock.method(auditRepository, 'append', async () => { throw new Error(`audit is down ${SECRET_ID}`); });
  const log = capture();
  const results = [];
  try {
    results.push(await edit(admin.token, app.appId, { ...phoneBody(), dryRun: true }));
    results.push(await adminGet(admin.token, `/applications/${app.appId}/changes`));
    results.push(await adminGet(admin.token, `/applications/${app.appId}/edit-form`));
    results.push(await adminGet(admin.token, `/applications/${app.appId}/notes`));
    results.push(await api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body: { kind: 'note', text: NOTE_TEXT } }));
  } finally { log.restore(); failing.mock.restore(); }
  for (const res of results) { assert.equal(res.status, 500); assertNone(res.text, [...NEW_VALUES, 'Testfirst'], 'the answer'); }
  assertNone(log.lines.join('\n'), NEW_VALUES, 'the log');
  assert.equal((await noteRows({ applicationId: oid(app.appId) })).length, 0, 'a note whose audit row failed was not written');
});

test('an application saved before revisions existed counts as revision 0 and moves to 1', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  await TouristVisaApplication.collection.updateOne({ _id: oid(app.appId) }, { $unset: { revision: '' } });
  assert.equal((await adminGet(admin.token, `/applications/${app.appId}`)).json.data.application.revision, 0);
  assert.equal((await edit(admin.token, app.appId, phoneBody(0))).status, 200);
  assert.equal((await rawDoc(app.appId)).revision, 1);
});

// ---------------------------------------------------------------------------
// What the applicant sees
// ---------------------------------------------------------------------------

test('the applicant sees only that a row was corrected and when: no old value, no reason, no notes, no flags, no change record', async () => {
  const app = await submitted({ given: 'Marked', family: 'Applicant' });
  const admin = await makeAdmin();
  await api('PUT', `/admin/applications/${app.appId}/flags`, { token: admin.token, body: { flags: ['concern', 'needs_call'] } });
  await api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body: { kind: 'note', text: NOTE_TEXT } });
  await api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body: { kind: 'call', outcome: 'no_answer', text: CALL_TEXT } });
  assert.equal((await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [phoneChange(), { questionId: 'q3_1', value: NEW_PASSPORT }, { questionId: 'q4_8b', index: 0, value: 'Newmother' }] })).status, 200);

  const mine = await api('GET', '/applications/me', { token: app.token });
  const review = await api('GET', '/applications/me/review', { token: app.token });
  const submit = await api('GET', '/applications/me/documents', { token: app.token });
  for (const res of [mine, review, submit]) {
    assert.equal(res.status, 200);
    assertNone(res.text, [REASON, NOTE_TEXT, CALL_TEXT, OLD_PHONE_TEXT, '7700 900123', SECRET_ID, 'Testmother', '"concern"', 'needs_call', 'adminFlags', '"flags"', '"revision"', 'touristvisachanges', 'revisionBefore', 'changes_apply'], 'an applicant response');
  }
  // the current answers are the applicant's own and are shown as they are now
  assert.deepEqual(mine.json.data.application.answers.q2_32, { countryCode: '+44', number: NEW_PHONE });
  assert.equal(mine.json.data.application.answers.q3_1, NEW_PASSPORT);

  const marks = mine.json.data.application.corrections;
  assert.deepEqual(Object.keys(marks).sort(), ['q2_32', 'q3_1', 'q4_8b[0]']);
  for (const value of Object.values(marks)) assert.match(value, /^\d{4}-\d{2}-\d{2}T/);

  const rows = rowsOf(review.json.data.review);
  const marked = rows.filter((r) => r.correctedByTeam);
  assert.deepEqual(marked.map((r) => r.id).sort(), ['q2_32', 'q3_1']);
  const today = new Date();
  assert.equal(marked[0].correctedByTeam, `${today.getUTCDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][today.getUTCMonth()]} ${today.getUTCFullYear()}`);
  const parent = rows.find((r) => r.id === 'parents').entries[0].rows;
  assert.ok(parent.find((r) => r.id === 'q4_8b').correctedByTeam);
  assert.equal(parent.find((r) => r.id === 'q4_8c').correctedByTeam, undefined);
  for (const row of marked) assert.deepEqual(Object.keys(row).sort(), ['correctedByTeam', 'id', 'kind', 'label', 'number', 'value']);
  assert.deepEqual(Object.keys(review.json.data).sort(), ['configVersion', 'declaration', 'documentsComplete', 'reference', 'review', 'status', 'submittedAt']);

  // another applicant, whose application nobody corrected, sees no marks at all
  const other = await submitted();
  const otherReview = await api('GET', '/applications/me/review', { token: other.token });
  assert.equal(JSON.stringify(otherReview.json.data.review).includes('correctedByTeam'), false);
  assert.deepEqual((await api('GET', '/applications/me', { token: other.token })).json.data.application.corrections, {});

  // the administrator's Overview carries the same marks, plus what only an administrator may see
  const overview = await adminGet(admin.token, `/applications/${app.appId}`);
  assert.deepEqual(rowsOf(overview.json.data.review).filter((r) => r.correctedByTeam).map((r) => r.id).sort(), ['q2_32', 'q3_1']);
  assert.deepEqual(overview.json.data.application.flags, ['needs_call', 'concern']);
});

test('a draft\'s own response has no corrections', async () => {
  const person = await readyApplicant();
  const mine = await api('GET', '/applications/me', { token: person.token });
  assert.equal(mine.json.data.application.corrections, undefined);
});

// ---------------------------------------------------------------------------
// The history and the form
// ---------------------------------------------------------------------------

test('the history: newest first with who, when, why, and the old and new value in words; one audit row for each view; not for applicants', async () => {
  const app = await submitted();
  const first = await makeAdmin('First Admin');
  const second = await makeAdmin('Second Admin');
  assert.deepEqual((await adminGet(first.token, `/applications/${app.appId}/changes`)).json.data, { revision: 0, history: [] });
  assert.equal((await edit(first.token, app.appId, phoneBody(0))).status, 200);
  assert.equal((await edit(second.token, app.appId, { expectedRevision: 1, reason: 'MADE-UP-SECOND-REASON for the date', changes: [{ questionId: 'q1_6', value: '2027-04-02' }, { questionId: 'q1_7', value: '2027-04-20' }] })).status, 200);

  const res = await adminGet(first.token, `/applications/${app.appId}/changes`);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const { history, revision } = res.json.data;
  assert.equal(revision, 2);
  assert.deepEqual(history.map((h) => [h.admin.name, h.reason, h.revisionBefore, h.revisionAfter]), [['Second Admin', 'MADE-UP-SECOND-REASON for the date', 1, 2], ['First Admin', REASON, 0, 1]]);
  assert.deepEqual(history[0].changes.map((c) => [c.questionId, c.old, c.new]), [['q1_6', '1 March 2027', '2 April 2027'], ['q1_7', '15 March 2027', '20 April 2027']]);
  assert.deepEqual(history[1].changes.map((c) => [c.questionId, c.old, c.new, c.sectionId]), [['q2_32', OLD_PHONE_TEXT, `+44 ${NEW_PHONE}`, '2D']]);
  assert.ok(history[1].changes[0].label && history[1].changes[0].number && history[1].changes[0].sectionTitle);
  assert.ok(history.every((h) => h.at && h.id));

  const views = await auditRows({ applicationId: oid(app.appId), action: 'changes_view' });
  assert.equal(views.length, 2, 'the empty view and this one');
  assert.deepEqual(Object.keys(views[1]).sort(), ['_id', 'action', 'adminId', 'applicationId', 'at']);
  assert.equal((await api('GET', `/admin/applications/${app.appId}/changes`, { token: app.token })).status, 403);
});

test('the form: the config the application was submitted under, the decrypted answers and the revision; one audit row; nothing else', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const res = await adminGet(admin.token, `/applications/${app.appId}/edit-form`);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const data = res.json.data;
  assert.deepEqual(Object.keys(data).sort(), ['answers', 'application', 'config']);
  assert.deepEqual(data.application, { id: app.appId, reference: app.reference, status: 'submitted', revision: 0, configVersion: engine.config.version });
  assert.equal(data.config.version, engine.config.version);
  assert.equal(data.answers.q3_1, SECRET_ID);
  for (const needle of ['enc:v1:', 'publicId', 'tourist-visa/', 'https://', 'configSha256']) assert.equal(res.text.includes(needle), false, needle);
  assert.equal((await auditRows({ applicationId: oid(app.appId), action: 'edit_open' })).length, 1);
});

// ---------------------------------------------------------------------------
// Notes and the call log
// ---------------------------------------------------------------------------

test('notes and calls: added, listed newest first, decrypted for admins; encrypted at rest; one audit row each, without text', async () => {
  const app = await submitted();
  const admin = await makeAdmin('Note Writer');
  const note = await api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body: { kind: 'note', text: `  ${NOTE_TEXT}  ` } });
  assert.equal(note.status, 201, note.text);
  assert.deepEqual([note.json.data.note.kind, note.json.data.note.text, note.json.data.note.admin.name], ['note', NOTE_TEXT, 'Note Writer']);
  const call = await api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body: { kind: 'call', outcome: 'call_back', text: CALL_TEXT } });
  assert.equal(call.status, 201);
  const bare = await api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body: { kind: 'call', outcome: 'wrong_number' } });
  assert.equal(bare.status, 201, 'a call can be logged with only how it went');

  const list = await adminGet(admin.token, `/applications/${app.appId}/notes`);
  assert.equal(list.status, 200);
  assert.equal(list.headers.get('cache-control'), 'no-store');
  assert.deepEqual(list.json.data.notes.map((n) => [n.kind, n.outcome, n.text]), [['call', 'wrong_number', ''], ['call', 'call_back', CALL_TEXT], ['note', undefined, NOTE_TEXT]]);
  assert.ok(list.json.data.notes.every((n) => n.admin.name === 'Note Writer' && n.id && n.at));

  const rows = await noteRows({ applicationId: oid(app.appId) });
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.text.startsWith('enc:v1:')));
  assertNone(JSON.stringify(rows), [NOTE_TEXT, CALL_TEXT], 'the notes collection');
  assert.deepEqual(Object.keys(rows[0]).sort(), ['_id', 'adminId', 'applicationId', 'at', 'kind', 'text']);
  assert.deepEqual(Object.keys(rows[1]).sort(), ['_id', 'adminId', 'applicationId', 'at', 'kind', 'outcome', 'text']);

  const audit = await auditRows({ applicationId: oid(app.appId) });
  assert.equal(audit.filter((r) => r.action === 'notes_add').length, 3);
  assert.equal(audit.filter((r) => r.action === 'notes_view').length, 1);
  assertNone(JSON.stringify(audit), [NOTE_TEXT, CALL_TEXT], 'the audit log');
  assert.deepEqual(Object.keys(audit.find((r) => r.action === 'notes_add')).sort(), ['_id', 'action', 'adminId', 'applicationId', 'at']);

  // a note is bound to its own id: its ciphertext does not open under another id
  assert.throws(() => fieldCipher.decrypt(getFieldEncryptionKey(), rows[0].text, `touristvisanotes:${rows[1]._id}:text`), /could not be decrypted/);
});

test('notes are checked: kind, text up to 2000 characters, an outcome for a call and only for a call, nothing extra', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const post = (body) => api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body });
  const bad = [
    [undefined, 'INVALID_REQUEST'], [[], 'INVALID_REQUEST'], [{ kind: 'note', text: 'x', extra: 1 }, 'INVALID_REQUEST'], [{ kind: 'note', text: 'x', adminId: 'someone-else' }, 'INVALID_REQUEST'],
    [{ text: 'x' }, 'INVALID_KIND'], [{ kind: 'memo', text: 'x' }, 'INVALID_KIND'], [{ kind: 'note' }, 'INVALID_TEXT'], [{ kind: 'note', text: '   ' }, 'INVALID_TEXT'], [{ kind: 'note', text: 5 }, 'INVALID_TEXT'],
    [{ kind: 'note', text: 'x'.repeat(2001) }, 'INVALID_TEXT'], [{ kind: 'note', text: 'x', outcome: 'reached' }, 'INVALID_OUTCOME'],
    [{ kind: 'call', text: 'x' }, 'INVALID_OUTCOME'], [{ kind: 'call', outcome: 'maybe' }, 'INVALID_OUTCOME'], [{ kind: 'call', outcome: 'reached', text: 'x'.repeat(2001) }, 'INVALID_TEXT'],
  ];
  for (const [body, code] of bad) {
    const res = await post(body);
    assert.deepEqual([res.status, res.json.code], [400, code], JSON.stringify(body)?.slice(0, 60));
  }
  assert.equal((await post({ kind: 'note', text: 'x'.repeat(2000) })).status, 201);
  for (const outcome of ['reached', 'no_answer', 'wrong_number', 'call_back']) assert.equal((await post({ kind: 'call', outcome })).status, 201, outcome);
  assert.equal((await noteRows({ applicationId: oid(app.appId) })).length, 5);
});

test('who wrote a note comes from the signed-in administrator, never from the request', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const someoneElse = await makeAdmin();
  const res = await api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body: { kind: 'note', text: NOTE_TEXT } });
  assert.equal(res.status, 201);
  assert.equal(String((await noteRows({ applicationId: oid(app.appId) }))[0].adminId), admin.userId);
  assert.notEqual(admin.userId, someoneElse.userId);
});

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

test('flags: set from the fixed list, kept in a fixed order, shown in the list and the Overview, never to the applicant; the audit row holds the old and the new flag names', async () => {
  const app = await submitted({ given: 'Flagfirst' });
  const admin = await makeAdmin();
  const put = (flags) => api('PUT', `/admin/applications/${app.appId}/flags`, { token: admin.token, body: { flags } });
  assert.deepEqual((await put(['concern', 'needs_call'])).json.data, { flags: ['needs_call', 'concern'] });
  assert.deepEqual((await rawDoc(app.appId)).adminFlags, ['needs_call', 'concern']);
  assert.deepEqual((await put(['concern', 'needs_call'])).json.data, { flags: ['needs_call', 'concern'] }, 'the same set again changes nothing');
  assert.deepEqual((await put(['verified'])).json.data, { flags: ['verified'] });
  const rows = await auditRows({ applicationId: oid(app.appId), action: 'flags_change' });
  assert.equal(rows.length, 2, 'the repeat wrote no row');
  assert.deepEqual(rows.map((r) => [r.fromFlags, r.toFlags]), [[[], ['needs_call', 'concern']], [['needs_call', 'concern'], ['verified']]]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['_id', 'action', 'adminId', 'applicationId', 'at', 'fromFlags', 'toFlags']);

  const list = await adminGet(admin.token, '/applications?q=Flagfirst');
  assert.deepEqual(list.json.data.applications[0].flags, ['verified']);
  assert.deepEqual((await adminGet(admin.token, `/applications/${app.appId}`)).json.data.application.flags, ['verified']);
  const mine = await api('GET', '/applications/me', { token: app.token });
  assertNone(mine.text + (await api('GET', '/applications/me/review', { token: app.token })).text, ['"verified"', 'needs_call', 'adminFlags', '"flags"'], 'an applicant response');
  assert.deepEqual((await put([])).json.data, { flags: [] });
});

test('flags are checked: only the fixed words, each once, nothing extra', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const before = await rawDoc(app.appId);
  for (const body of [undefined, [], { flags: 'needs_call' }, { flags: ['nope'] }, { flags: ['needs_call', 'needs_call'] }, { flags: [1] }, { flags: [null] }, { flags: ['needs_call'], extra: 1 }, { flags: ['needs_call', 'called', 'awaiting_applicant', 'verified', 'concern', 'concern'] }, { flags: { $ne: 1 } }]) {
    const res = await api('PUT', `/admin/applications/${app.appId}/flags`, { token: admin.token, body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok(['INVALID_REQUEST', 'INVALID_FLAGS'].includes(res.json.code));
  }
  assert.deepEqual(await rawDoc(app.appId), before);
  assert.equal((await api('PUT', `/admin/applications/${app.appId}/flags`, { token: admin.token, body: { flags: ['needs_call', 'called', 'awaiting_applicant', 'verified', 'concern'] } })).status, 200);
});

test('the list can be filtered by flag, together with the other filters; a flag that is not on the list is a 400', async () => {
  const admin = await makeAdmin();
  const a = await submitted({ given: 'Filterfirsta' });
  const b = await submitted({ given: 'Filterfirstb' });
  await api('PUT', `/admin/applications/${a.appId}/flags`, { token: admin.token, body: { flags: ['needs_call'] } });
  await api('PUT', `/admin/applications/${b.appId}/flags`, { token: admin.token, body: { flags: ['concern', 'needs_call'] } });
  const ids = async (query) => (await adminGet(admin.token, `/applications?${query}`)).json.data.applications.map((x) => x.id).sort();
  assert.deepEqual(await ids('flag=needs_call&q=Filterfirst'), [a.appId, b.appId].sort());
  assert.deepEqual(await ids('flag=concern&q=Filterfirst'), [b.appId]);
  assert.deepEqual(await ids('flag=verified&q=Filterfirst'), []);
  await move(admin.token, a.appId, 'in_review');
  assert.deepEqual(await ids('flag=needs_call&status=in_review&q=Filterfirst'), [a.appId]);
  for (const flag of ['nope', 'needs_call,concern', '%24ne']) assert.deepEqual([(await adminGet(admin.token, `/applications?flag=${flag}`)).status, (await adminGet(admin.token, `/applications?flag=${flag}`)).json.code], [400, 'INVALID_QUERY'], flag);
  // an operator smuggled in through the query string is never run: it is refused, or it is no filter at all
  const smuggled = await adminGet(admin.token, '/applications?flag[$ne]=x');
  assert.ok([200, 400].includes(smuggled.status), String(smuggled.status));
});

test('a flag change whose audit row cannot be written is undone', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  await api('PUT', `/admin/applications/${app.appId}/flags`, { token: admin.token, body: { flags: ['called'] } });
  const failing = mock.method(auditRepository, 'append', async () => { throw new Error('audit is down'); });
  let res;
  try { res = await api('PUT', `/admin/applications/${app.appId}/flags`, { token: admin.token, body: { flags: ['concern'] } }); } finally { failing.mock.restore(); }
  assert.equal(res.status, 500);
  assert.deepEqual((await rawDoc(app.appId)).adminFlags, ['called']);
});

// ---------------------------------------------------------------------------
// Append only, and what the logs and the audit log hold
// ---------------------------------------------------------------------------

test('change records and notes are append only, like the audit log: every update and delete is refused and the repositories offer none', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  await edit(admin.token, app.appId, phoneBody());
  await api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body: { kind: 'note', text: NOTE_TEXT } });
  for (const [Model, label] of [[TouristVisaChange, 'change'], [TouristVisaNote, 'note']]) {
    const row = await Model.findOne({ applicationId: app.appId });
    const refuse = (what, fn) => assert.rejects(Promise.resolve().then(fn), /append-only/, `${label}: ${what}`);
    await refuse('updateOne', () => Model.updateOne({ _id: row._id }, { $set: { at: new Date() } }));
    await refuse('updateMany', () => Model.updateMany({}, { $set: { at: new Date() } }));
    await refuse('findOneAndUpdate', () => Model.findOneAndUpdate({ _id: row._id }, { $set: { at: new Date() } }));
    await refuse('replaceOne', () => Model.replaceOne({ _id: row._id }, { applicationId: row.applicationId, adminId: row.adminId }));
    await refuse('deleteOne', () => Model.deleteOne({ _id: row._id }));
    await refuse('deleteMany', () => Model.deleteMany({}));
    await refuse('findOneAndDelete', () => Model.findOneAndDelete({ _id: row._id }));
    await refuse('document.deleteOne', () => row.deleteOne());
    row.at = new Date(0);
    await refuse('save of an existing row', () => row.save());
    await refuse('bulkWrite update', () => Model.bulkWrite([{ updateOne: { filter: { _id: row._id }, update: { $set: { at: new Date() } } } }]));
    await refuse('bulkWrite delete', () => Model.bulkWrite([{ deleteOne: { filter: { _id: row._id } } }]));
    assert.ok(await Model.collection.findOne({ _id: row._id }));
  }
  const methods = (repo) => Object.getOwnPropertyNames(Object.getPrototypeOf(repo)).filter((name) => name !== 'constructor').sort();
  assert.deepEqual(methods(changeRepository), ['applyEdit', 'findByApplication', 'findCorrectionMarks']);
  assert.deepEqual(methods(noteRepository), ['append', 'findByApplication']);
  assert.deepEqual(methods(auditRepository), ['append', 'findByApplication']);
});

test('after all of that, no audit row holds a value, a reason, a note, a file name or an address; only ids, fixed words and flag names', async () => {
  const rows = await auditRows();
  assert.ok(rows.length > 40);
  const allowed = new Set(['_id', 'adminId', 'applicationId', 'action', 'at', 'fromStatus', 'toStatus', 'documentId', 'fromFlags', 'toFlags']);
  for (const row of rows) {
    for (const key of Object.keys(row)) assert.ok(allowed.has(key), `unexpected field ${key}`);
    assert.ok(TouristVisaAudit.ACTIONS.includes(row.action), row.action);
  }
  const seen = new Set(rows.map((r) => r.action));
  for (const action of ['changes_preview', 'changes_apply', 'changes_view', 'edit_open', 'notes_view', 'notes_add', 'flags_change', 'status_change', 'overview_view', 'list_view']) assert.ok(seen.has(action), `an audit row for ${action} was written`);
  const text = JSON.stringify(rows);
  assertNone(text, [...NEW_VALUES, 'Newmother', 'Aliasfirst', 'Partnerfirst', 'https://', 'http://', 'example.com', 'Testfirst', '203.0.113'], 'the audit log');
});

test('after all of that, nothing readable is stored in the change, note or application collections', async () => {
  const stored = JSON.stringify({ changes: await changeRows(), notes: await noteRows() });
  assertNone(stored, [...NEW_VALUES, 'Newmother', 'Aliasfirst', 'Partnerfirst', 'Testmother', 'Testsurname', '1962-01-02', 'Sindhi', 'Renamedfirst'], 'the change and note collections');
  for (const row of await changeRows()) {
    for (const item of row.changes) for (const field of ['old', 'new']) if (item[field] !== undefined) assert.ok(String(item[field]).startsWith('enc:v1:'), `${item.questionId}.${field}`);
  }
  for (const row of await TouristVisaApplication.collection.find({ status: { $ne: 'draft' } }).toArray()) {
    for (const id of ['q3_1', 'q10_5a', 'q10_1a']) if (row.answers[id] !== undefined) assert.ok(String(row.answers[id]).startsWith('enc:v1:'), `${id} is encrypted at rest`);
  }
});

test('every refusal and every success leaves no answer, reason or note in the log, and a failure is a plain 500', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const log = capture();
  try {
    await edit(admin.token, app.appId, { ...phoneBody(), dryRun: true });
    await edit(admin.token, app.appId, phoneBody(5));
    await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q2_3', value: true }] });
    await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q9_11', value: false }] });
    await edit(admin.token, app.appId, { expectedRevision: 0, reason: 'short', changes: [phoneChange(NEW_PASSPORT)] });
    await edit(admin.token, app.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q3_1', value: NEW_PASSPORT }, phoneChange()] });
    await adminGet(admin.token, `/applications/${app.appId}/changes`);
    await adminGet(admin.token, `/applications/${app.appId}/edit-form`);
    await api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body: { kind: 'note', text: NOTE_TEXT } });
    await api('POST', `/admin/applications/${app.appId}/notes`, { token: admin.token, body: { kind: 'call', outcome: 'x', text: CALL_TEXT } });
    await api('PUT', `/admin/applications/${app.appId}/flags`, { token: admin.token, body: { flags: ['nope'] } });
    await adminGet(admin.token, `/applications/${app.appId}/notes`);
    const failing = mock.method(repository, 'findForAdmin', async () => { throw new Error(`database is down ${NEW_PASSPORT} ${REASON} ${NOTE_TEXT} ${SECRET_ID}`); });
    try {
      for (const res of [await edit(admin.token, app.appId, phoneBody()), await adminGet(admin.token, `/applications/${app.appId}/changes`), await adminGet(admin.token, `/applications/${app.appId}/notes`)]) {
        assert.equal(res.status, 500);
        assertNone(res.text, NEW_VALUES, 'a 500');
      }
    } finally { failing.mock.restore(); }
  } finally { log.restore(); }
  const text = log.lines.join('\n');
  assertNone(text, [...NEW_VALUES, 'Testfirst', 'Aliasfirst'], 'the log');
});
