'use strict';

// Step 8e tests: the administrator's side (/api/tourist-visa/admin/*): who may call it, what the list and the Overview
// show, the signed document link, the status moves, and the audit log. In-memory MongoDB, a fake file storage (no
// network), made-up users and answers.

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
const TouristVisaConfigSnapshot = require('../models/TouristVisaConfigSnapshot');
const repository = require('../repositories/touristVisaApplicationRepository');
const auditRepository = require('../repositories/touristVisaAuditRepository');
const documentService = require('../services/touristVisaDocumentService');
const { TouristVisaApplicationService } = require('../services/touristVisaApplicationService');
const { TouristVisaAdminService } = require('../services/touristVisaAdminService');
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

/** A stand-in for Cloudinary that remembers what links were asked for. */
class FakeStorage {
  constructor() { this.links = []; }
  isConfigured() { return true; }
  async upload(buffer, { applicationId, extension }) { return { publicId: `tourist-visa/${applicationId}/${crypto.randomBytes(8).toString('hex')}.${extension}`, resourceType: 'raw', bytes: buffer.length }; }
  async remove() {}
  temporaryUrl(doc, expiresAt) {
    this.links.push({ publicId: doc.publicId, expiresAt });
    return `https://fake-storage.invalid/download?id=${encodeURIComponent(doc.publicId)}&expires=${expiresAt.getTime()}`;
  }
}
const fakeStorage = new FakeStorage();
documentService.storage = fakeStorage;

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
  const user = await User.create({ name: name || `Test Admin Side ${userCounter}`, email: `test.adminside.${userCounter}@example.com`, password: 'not-a-real-password', role });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token, userId: String(user._id) };
}
const makeAdmin = (name) => makeUser(1, name);

const oid = (id) => new mongoose.Types.ObjectId(id);
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: oid(appId) });
const auditRows = (filter = {}) => TouristVisaAudit.collection.find(filter).sort({ at: 1, _id: 1 }).toArray();
const adminGet = (token, path) => api('GET', `/admin${path}`, { token });

// Made-up applicant answers.
const SECRET_ID = 'FAKE-PASSPORT-9876';
const SECRET_NI = 'AB123456C';
const SECRET_DETAILS = 'MADE-UP-DETAILS-OF-A-CONVICTION';
const FILE_NAME = 'MADE-UP-FILE-NAME-passport.pdf';
const ADDRESS = { line1: '1 Test Street', town: 'Testville', country: 'GB' };
const gbp = (amount) => ({ amount, currency: 'GBP' });
const SECTIONS = (given = 'Testfirst', family = 'Testlast', email = 'test.applicant@example.com') => [
  ['1', { q1_1: 'tourism', q1_2: false, q1_3: false, q1_4: 'holiday', q1_5: 'Test trip for automated tests.', q1_6: '2027-03-01', q1_7: '2027-03-15' }],
  ['2A', { q2_1: given, q2_2: family, q2_3: false, q2_4: email, q2_5: 'me', q2_6: false, q2_9: email.toLowerCase(), q2_10: email.toLowerCase(), q2_11: email.toLowerCase() }],
  ['2B', { q2_12: 'female', q2_13: 'single', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville', q2_17: '1990-01-01', q2_18: false, q2_23: false }],
  ['2C', { q2_24: ADDRESS, q2_25: true, q2_27: { years: 2, months: 3 }, q2_28: 'owned', q2_30: false, q2_31: false }],
  ['2D', { q2_32: { countryCode: '+44', number: '7700 900123' }, q2_33: 'in_uk', q2_34: 'mobile', q2_35: ['call', 'sms'] }],
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
  ['10C', { q10_4: 'other', q10_4a: 'Sindhi', q10_5: true, q10_5a: SECRET_NI }],
];
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60, 0x20)]);
function upload(token, slot, name) {
  const form = new FormData();
  form.append('slot', slot);
  form.append('file', new Blob([PDF], { type: 'application/pdf' }), name);
  return api('POST', '/applications/me/documents', { token, body: form });
}

/** An applicant with every section saved and both files uploaded (not yet submitted). */
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
const SECRETS = [SECRET_ID, SECRET_NI, SECRET_DETAILS, FILE_NAME, 'Sindhi', 'Test Passport Office', '1 Test Street'];
const assertNoSecrets = (text, where) => { for (const secret of SECRETS) assert.equal(String(text).includes(secret), false, `${secret} is in ${where}`); };
const FORBIDDEN_IN_ANSWERS = ['enc:v1:', 'publicId', 'resourceType', 'tourist-visa/', 'https://', 'http://', 'cloudinary', 'configSha256'];

// ---------------------------------------------------------------------------
// Who may call it
// ---------------------------------------------------------------------------

test('authorization: anonymous is 401, a signed-in applicant is 403, an administrator is let in; every answer is no-store', async () => {
  const app = await submitted();
  const applicant = await makeUser(0);
  const admin = await makeAdmin();
  const doc = (await rawDoc(app.appId)).documents[0];
  const routes = [
    ['GET', '/admin/applications'],
    ['GET', `/admin/applications/${app.appId}`],
    ['GET', `/admin/applications/${app.appId}/activity`],
    ['GET', `/admin/applications/${app.appId}/documents/${doc.id}/link`],
    ['PATCH', `/admin/applications/${app.appId}/status`, { status: 'in_review' }],
  ];
  const before = await auditRows();
  for (const [method, path, body] of routes) {
    const anonymous = await api(method, path, { body });
    assert.equal(anonymous.status, 401, `anonymous ${method} ${path}`);
    assert.equal(anonymous.headers.get('cache-control'), 'no-store', `no-store on 401 ${path}`);
    const bad = await api(method, path, { token: 'not-a-token', body });
    assert.equal(bad.status, 401, `bad token ${method} ${path}`);
    const normal = await api(method, path, { token: applicant.token, body });
    assert.equal(normal.status, 403, `applicant ${method} ${path}`);
    assert.equal(normal.headers.get('cache-control'), 'no-store', `no-store on 403 ${path}`);
    assertNoSecrets(normal.text, '403 body');
    assert.equal(normal.text.includes('Testfirst'), false);
  }
  assert.deepEqual(await auditRows(), before, 'a refused request writes no audit row');
  assert.equal((await rawDoc(app.appId)).status, 'submitted', 'the refused status change did nothing');

  for (const [method, path, body] of routes) {
    const ok = await api(method, path, { token: admin.token, body });
    assert.equal(ok.status, 200, `admin ${method} ${path}: ${ok.text}`);
    assert.equal(ok.headers.get('cache-control'), 'no-store', `no-store on 200 ${path}`);
  }
});

test('authorization: the role is read from the database, so an applicant whose token says admin is still refused, and a demoted admin is refused at once', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  assert.equal((await adminGet(admin.token, '/applications')).status, 200);
  await User.updateOne({ _id: admin.user._id }, { $set: { role: 0 } });
  assert.equal((await adminGet(admin.token, '/applications')).status, 403, 'demoted: the same token is refused');
  await User.updateOne({ _id: admin.user._id }, { $set: { role: 1 } });
  assert.equal((await adminGet(admin.token, `/applications/${app.appId}`)).status, 200);
  const forged = jwt.sign({ id: String((await makeUser(0)).user._id), role: 1, isAdmin: true }, process.env.JWT_SECRET);
  assert.equal((await adminGet(forged, '/applications')).status, 403);
});

test('there is no way to change or delete a draft, a file, an audit row or the activity through the admin routes, and no extra route exists for the status or the answers', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const doc = (await rawDoc(app.appId)).documents[0];
  const before = await rawDoc(app.appId);
  const rowsBefore = await auditRows();
  for (const [method, path] of [
    ['POST', '/admin/applications'], ['PUT', `/admin/applications/${app.appId}`], ['PATCH', `/admin/applications/${app.appId}`], ['DELETE', `/admin/applications/${app.appId}`],
    ['POST', `/admin/applications/${app.appId}/activity`], ['PUT', `/admin/applications/${app.appId}/activity`], ['PATCH', `/admin/applications/${app.appId}/activity`], ['DELETE', `/admin/applications/${app.appId}/activity`],
    ['PUT', `/admin/applications/${app.appId}/status`], ['DELETE', `/admin/applications/${app.appId}/status`], ['POST', `/admin/applications/${app.appId}/status`],
    ['DELETE', `/admin/applications/${app.appId}/documents/${doc.id}`], ['POST', `/admin/applications/${app.appId}/documents/${doc.id}/link`],
    ['GET', '/admin/audit'], ['DELETE', '/admin/audit'], ['GET', `/admin/applications/${app.appId}/answers`],
  ]) {
    const res = await api(method, path, { token: admin.token, body: method === 'GET' || method === 'DELETE' ? undefined : { status: 'completed', answers: { q1_1: 'x' } } });
    assert.equal(res.status, 404, `${method} ${path}`);
  }
  assert.deepEqual(await rawDoc(app.appId), before, 'nothing changed');
  assert.deepEqual(await auditRows(), rowsBefore, 'the audit log is untouched');
});

test('while the feature is closed every admin route answers 404 FEATURE_CLOSED, even for an administrator and before sign-in', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  process.env.TOURIST_VISA_ENABLED = 'false';
  try {
    for (const [method, path, token] of [['GET', '/admin/applications', admin.token], ['GET', `/admin/applications/${app.appId}`, admin.token], ['GET', '/admin/applications', undefined], ['PATCH', `/admin/applications/${app.appId}/status`, admin.token]]) {
      const res = await api(method, path, { token, body: method === 'PATCH' ? { status: 'in_review' } : undefined });
      assert.deepEqual([res.status, res.json.code], [404, 'FEATURE_CLOSED'], `${method} ${path}`);
    }
  } finally {
    process.env.TOURIST_VISA_ENABLED = 'true';
  }
  assert.equal((await rawDoc(app.appId)).status, 'submitted');
});

// ---------------------------------------------------------------------------
// Drafts are invisible
// ---------------------------------------------------------------------------

test('a draft is never listed, found by search, opened, linked, moved or shown in the activity', async () => {
  const admin = await makeAdmin();
  const draft = await readyApplicant({ given: 'Draftonly', family: 'Neverlisted', email: 'draftonly.never@example.com' }); // complete, but not submitted
  const rowsBefore = await auditRows({ applicationId: oid(draft.appId) });

  const list = await adminGet(admin.token, '/applications?pageSize=50');
  assert.equal(list.status, 200);
  assert.equal(list.json.data.applications.some((a) => a.id === draft.appId), false);
  for (const q of ['Draftonly', 'Neverlisted', 'draftonly.never']) {
    assert.deepEqual((await adminGet(admin.token, `/applications?q=${q}`)).json.data.applications, [], q);
  }
  const doc = (await rawDoc(draft.appId)).documents[0];
  for (const [method, path] of [
    ['GET', `/admin/applications/${draft.appId}`],
    ['GET', `/admin/applications/${draft.appId}/activity`],
    ['GET', `/admin/applications/${draft.appId}/documents/${doc.id}/link`],
    ['PATCH', `/admin/applications/${draft.appId}/status`],
  ]) {
    const res = await api(method, path, { token: admin.token, body: method === 'PATCH' ? { status: 'in_review' } : undefined });
    assert.deepEqual([res.status, res.json.code], [404, 'APPLICATION_NOT_FOUND'], `${method} ${path}`);
    assertNoSecrets(res.text, 'the answer');
  }
  assert.equal((await adminGet(admin.token, '/applications?status=draft')).status, 400, 'a draft cannot even be asked for');
  assert.equal((await rawDoc(draft.appId)).status, 'draft');
  assert.deepEqual(await auditRows({ applicationId: oid(draft.appId) }), rowsBefore, 'no row was written for a draft');
  assert.equal(fakeStorage.links.some((l) => l.publicId === doc.publicId), false, 'no link was made for a draft');
});

test('made-up, malformed and missing ids are all a plain 404, never a 500 and never a query', async () => {
  const admin = await makeAdmin();
  const log = capture();
  try {
    for (const id of ['abc', '123', 'z'.repeat(24), '%7B%22%24ne%22%3Anull%7D', '..%2F..', new mongoose.Types.ObjectId().toString()]) {
      for (const suffix of ['', '/activity', '/documents/x/link']) {
        const res = await adminGet(admin.token, `/applications/${id}${suffix}`);
        assert.equal(res.status, 404, `${id}${suffix}`);
      }
    }
  } finally { log.restore(); }
});

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

test('the list: one row per submitted application with the reference, name, email, phone, time, status and file count; newest first', async () => {
  const admin = await makeAdmin();
  const first = await submitted({ given: 'Listone', family: 'Firstperson', email: 'list.one@example.com' });
  const second = await submitted({ given: 'Listtwo', family: 'Secondperson', email: 'list.two@example.com' });
  const res = await adminGet(admin.token, '/applications?pageSize=50');
  assert.equal(res.status, 200);
  const { applications, page, pageSize, total, totalPages } = res.json.data;
  assert.deepEqual([page, pageSize], [1, 50]);
  assert.ok(total >= 2 && totalPages >= 1);
  const mine = applications.filter((a) => [first.appId, second.appId].includes(a.id));
  assert.deepEqual(mine.map((a) => a.id), [second.appId, first.appId], 'newest first');
  const row = mine[1];
  assert.deepEqual(Object.keys(row).sort(), ['documentCount', 'email', 'flags', 'id', 'name', 'phone', 'reference', 'status', 'submittedAt']);
  assert.equal(row.reference, first.reference);
  assert.equal(row.name, 'Listone Firstperson');
  assert.equal(row.email, 'list.one@example.com');
  assert.equal(row.phone, '+44 7700 900123');
  assert.equal(row.status, 'submitted');
  assert.equal(row.documentCount, 2);
  assert.ok(row.submittedAt);
  for (const needle of [...FORBIDDEN_IN_ANSWERS, SECRET_ID, SECRET_NI, FILE_NAME]) assert.equal(res.text.includes(needle), false, needle);
});

test('the summary is made at submit and holds only plain, non-encrypted questions', async () => {
  const app = await submitted({ given: 'Summed', family: 'Upperson', email: 'Summed.Up@Example.COM' });
  assert.deepEqual((await rawDoc(app.appId)).summary, { name: 'Summed Upperson', email: 'summed.up@example.com', phone: '+44 7700 900123' });
  for (const id of ['q2_1', 'q2_2', 'q2_4', 'q2_32']) {
    assert.notEqual(engine.config.questions.find((q) => q.id === id).sensitive, true, `${id} is stored as plain text, so its summary is no new exposure`);
  }
});

test('pagination and the status filter', async () => {
  const admin = await makeAdmin();
  const apps = [];
  for (let i = 0; i < 3; i += 1) apps.push(await submitted({ given: `Pageone${i}`, family: 'Pageperson', email: `page.${i}@example.com` }));
  const all = (await adminGet(admin.token, '/applications?q=Pageperson&pageSize=50')).json.data;
  assert.equal(all.total, 3);
  const p1 = (await adminGet(admin.token, '/applications?q=Pageperson&pageSize=2&page=1')).json.data;
  const p2 = (await adminGet(admin.token, '/applications?q=Pageperson&pageSize=2&page=2')).json.data;
  const p3 = (await adminGet(admin.token, '/applications?q=Pageperson&pageSize=2&page=3')).json.data;
  assert.deepEqual([p1.applications.length, p2.applications.length, p3.applications.length], [2, 1, 0]);
  assert.deepEqual([p1.total, p1.totalPages, p3.totalPages], [3, 2, 2]);
  assert.deepEqual([...p1.applications, ...p2.applications].map((a) => a.id), apps.map((a) => a.appId).reverse(), 'every one once, in order');

  await TouristVisaApplication.collection.updateOne({ _id: oid(apps[0].appId) }, { $set: { status: 'in_review' } });
  await TouristVisaApplication.collection.updateOne({ _id: oid(apps[1].appId) }, { $set: { status: 'completed' } });
  const byStatus = async (status) => (await adminGet(admin.token, `/applications?q=Pageperson&status=${status}`)).json.data.applications.map((a) => a.id);
  assert.deepEqual(await byStatus('submitted'), [apps[2].appId]);
  assert.deepEqual(await byStatus('in_review'), [apps[0].appId]);
  assert.deepEqual(await byStatus('completed'), [apps[1].appId]);
});

test('a bad query is refused with a clear code: page, page size, status and search text', async () => {
  const admin = await makeAdmin();
  for (const query of ['page=0', 'page=-1', 'page=abc', 'page=1.5', 'page=1&page=2', 'pageSize=0', 'pageSize=51', 'pageSize=abc', 'status=draft', 'status=banana', 'status=submitted&status=completed', `q=${'x'.repeat(101)}`, 'q=a&q=b']) {
    const res = await adminGet(admin.token, `/applications?${query}`);
    assert.deepEqual([res.status, res.json.code], [400, 'INVALID_QUERY'], query);
  }
  assert.equal((await adminGet(admin.token, `/applications?q=${'x'.repeat(100)}`)).status, 200, '100 characters is the limit itself');
  // A query that tries to pass an operator is not read as one: it is either refused or ignored, never run.
  const plain = (await adminGet(admin.token, '/applications?pageSize=50')).json.data.total;
  const operator = await adminGet(admin.token, '/applications?q[$ne]=x&pageSize=50');
  assert.ok(operator.status === 400 || (operator.status === 200 && operator.json.data.total === plain), 'an operator in the query changes nothing');
});

test('search: an exact reference, or part of a name or an email, ignoring case', async () => {
  const admin = await makeAdmin();
  const app = await submitted({ given: 'Searchable', family: 'Fernandez', email: 'search.able@example.com' });
  const ids = async (q) => (await adminGet(admin.token, `/applications?q=${encodeURIComponent(q)}`)).json.data.applications.map((a) => a.id);
  for (const q of [app.reference, app.reference.toLowerCase(), ` ${app.reference} `, 'searchable', 'SEARCHABLE FERN', 'fernandez', 'ernan', 'search.able@example.com', 'SEARCH.ABLE', '@example.com']) {
    assert.ok((await ids(q)).includes(app.appId), `"${q}" finds it`);
  }
  assert.deepEqual(await ids(app.reference.slice(0, -1)), [], 'part of a reference is not a reference (and is not a name)');
  assert.deepEqual(await ids('TV-AAAAAAAA'), [], 'a reference that does not exist');
  assert.deepEqual(await ids('nobody-by-this-name'), []);
});

test('search text is taken literally: regular-expression characters match nothing special and never break the request', async () => {
  const admin = await makeAdmin();
  const app = await submitted({ given: 'Regexlit', family: 'Dotperson', email: 'regex.lit@example.com' });
  const log = capture();
  try {
    const ids = async (q) => {
      const res = await adminGet(admin.token, `/applications?q=${encodeURIComponent(q)}`);
      assert.equal(res.status, 200, `"${q}": ${res.text}`);
      return res.json.data.applications.map((a) => a.id);
    };
    for (const q of ['.*', '.+', '^', '$', 'Regexl.t', 'Reg.*lit', '(', ')', '[', '\\', 'a|b', '(?:', '{1,}', '*', '?', 'Regexlit|Dotperson', '(Regexlit)', '[R]egexlit', 'regex\\.lit', '\\w+', '(.*)+$', '.{1000}']) {
      assert.equal((await ids(q)).includes(app.appId), false, `"${q}" is not an expression`);
    }
    assert.ok((await ids('regex.lit@example.com')).includes(app.appId), 'a literal dot still matches its own dot');
    assert.deepEqual(await ids('{"$ne":null}'), [], 'a query-looking text is only text');
  } finally { log.restore(); }
});

test('the lazy summary: an older submitted application gets its summary the first time it is listed, once, and the list never decrypts answers otherwise', async () => {
  const admin = await makeAdmin();
  const app = await submitted({ given: 'Lazyfill', family: 'Oldperson', email: 'lazy.fill@example.com' });
  await TouristVisaApplication.collection.updateOne({ _id: oid(app.appId) }, { $unset: { summary: '' } }); // as if submitted before summaries existed
  assert.equal((await rawDoc(app.appId)).summary, undefined);

  const first = await adminGet(admin.token, '/applications?q=Lazyfill');
  assert.equal(first.status, 200);
  assert.deepEqual(first.json.data.applications.map((a) => [a.id, a.name, a.email, a.phone]), [[app.appId, 'Lazyfill Oldperson', 'lazy.fill@example.com', '+44 7700 900123']]);
  assert.deepEqual((await rawDoc(app.appId)).summary, { name: 'Lazyfill Oldperson', email: 'lazy.fill@example.com', phone: '+44 7700 900123' });

  // Once: later changes to the answers do not rewrite it, and a list with every summary in place decrypts nothing.
  await TouristVisaApplication.collection.updateOne({ _id: oid(app.appId) }, { $set: { 'summary.name': 'Kept As It Was' } });
  const decrypts = mock.method(repository, 'decryptAnswers');
  try {
    const again = await adminGet(admin.token, '/applications?pageSize=50');
    assert.equal(again.status, 200);
    assert.equal(again.json.data.applications.find((a) => a.id === app.appId).name, 'Kept As It Was');
    assert.equal(decrypts.mock.callCount(), 0, 'nothing was decrypted to build the list');
  } finally { decrypts.mock.restore(); }
});

test('a summary is only ever written when there is none: a second writer (a race between two admins) cannot overwrite it', async () => {
  const app = await submitted({ given: 'Raceone', family: 'Keeper', email: 'race.one@example.com' });
  const before = (await rawDoc(app.appId)).summary;
  assert.equal(before.name, 'Raceone Keeper');
  await repository.setSummaryOnce(oid(app.appId), { name: 'Someone Else', email: 'else@example.com', phone: '+44 1' });
  assert.deepEqual((await rawDoc(app.appId)).summary, before, 'the existing summary is kept');

  await TouristVisaApplication.collection.updateOne({ _id: oid(app.appId) }, { $unset: { summary: '' } });
  await repository.setSummaryOnce(oid(app.appId), { name: 'First Writer', email: 'first@example.com', phone: '+44 2' });
  await repository.setSummaryOnce(oid(app.appId), { name: 'Second Writer', email: 'second@example.com', phone: '+44 3' });
  assert.equal((await rawDoc(app.appId)).summary.name, 'First Writer', 'the first writer wins and the second changes nothing');
});

test('the lazy summary also fills when an older application is opened first', async () => {
  const admin = await makeAdmin();
  const app = await submitted({ given: 'Openfirst', family: 'Oldperson', email: 'open.first@example.com' });
  await TouristVisaApplication.collection.updateOne({ _id: oid(app.appId) }, { $unset: { summary: '' } });
  assert.equal((await adminGet(admin.token, `/applications/${app.appId}`)).status, 200);
  assert.equal((await rawDoc(app.appId)).summary.name, 'Openfirst Oldperson');
});

// ---------------------------------------------------------------------------
// The Overview
// ---------------------------------------------------------------------------

test('the Overview: a call block first, then every section in words, with decrypted values for the administrator only', async () => {
  const admin = await makeAdmin();
  const app = await submitted({ given: 'Overviewed', family: 'Person', email: 'over.view@example.com' });
  const res = await adminGet(admin.token, `/applications/${app.appId}`);
  assert.equal(res.status, 200, res.text);
  const data = res.json.data;

  assert.deepEqual(data.call, {
    name: 'Overviewed Person',
    phone: { display: '+44 7700 900123', tel: '+447700900123' },
    email: 'over.view@example.com',
    preferredLanguage: 'Sindhi',
    contact: data.call.contact,
    reference: app.reference,
    submittedAt: data.call.submittedAt,
    status: 'submitted',
  });
  assert.ok(data.call.submittedAt);
  const contact = Object.fromEntries(data.call.contact.map((c) => [c.id, c.value]));
  assert.equal(contact.q2_35, 'Telephone call; Text message (SMS)');
  assert.equal(contact.q2_34, 'Mobile');
  assert.deepEqual(data.application.allowedMoves, ['in_review']);
  assert.equal(data.application.status, 'submitted');

  const rows = data.review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows));
  assert.equal(rows.find((r) => r.id === 'q3_1').value, SECRET_ID, 'the passport number, decrypted');
  assert.equal(rows.find((r) => r.id === 'q10_5a').value, SECRET_NI);
  assert.equal(rows.find((r) => r.id === 'q10_1a').value, SECRET_DETAILS);
  assert.equal(rows.find((r) => r.id === 'q1_6').value, '1 March 2027');
  assert.equal(data.review.parts.length, 10);

  assert.deepEqual(data.documents.map((d) => [d.slot, d.name]).sort(), [['funds', 'bank-statement.pdf'], ['passport', FILE_NAME]]);
  assert.ok(data.documents.every((d) => Object.keys(d).sort().join() === 'id,name,size,slot,type'));
  assert.deepEqual(data.fileSlots, { q10_6: 'passport', q10_7: 'funds' });
  for (const needle of FORBIDDEN_IN_ANSWERS) assert.equal(res.text.includes(needle), false, `${needle} is not in the Overview`);
  assert.equal(fakeStorage.links.some((l) => res.text.includes(l.publicId)), false);
});

test('the Overview is built from the config the application was submitted under, not today\'s config', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  const moved = JSON.parse(JSON.stringify(engine.config));
  moved.version = '97.0.0-test';
  moved.questions.find((q) => q.id === 'q1_1').options.find((o) => o.value === 'tourism').label = 'CHANGED LABEL';
  moved.questions.find((q) => q.id === 'q10_4').options.find((o) => o.value === 'other').label = 'CHANGED OTHER';
  const service = new TouristVisaAdminService({ applications: new TouristVisaApplicationService({ config: moved }) });
  const shown = await service.overview(admin.user._id, app.appId);
  const row = shown.review.parts[0].sections[0].rows.find((r) => r.id === 'q1_1');
  assert.equal(row.value, 'Tourism or holiday', 'the label it was submitted with');
  assert.equal(shown.application.configVersion, engine.config.version);
  assert.equal(shown.call.preferredLanguage, 'Sindhi');
  assert.equal(await TouristVisaConfigSnapshot.countDocuments({ _id: (await rawDoc(app.appId)).configSha256 }), 1);
});

test('each Overview view writes exactly one audit row, naming the administrator and the application and nothing else', async () => {
  const admin = await makeAdmin();
  const other = await makeAdmin();
  const app = await submitted();
  const none = await auditRows({ applicationId: oid(app.appId), action: 'overview_view' });
  assert.equal(none.length, 0);
  assert.equal((await adminGet(admin.token, `/applications/${app.appId}`)).status, 200);
  let rows = await auditRows({ applicationId: oid(app.appId), action: 'overview_view' });
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['_id', 'action', 'adminId', 'applicationId', 'at']);
  assert.equal(String(rows[0].adminId), admin.userId);
  assert.equal(String(rows[0].applicationId), app.appId);
  assert.ok(rows[0].at instanceof Date);
  assert.equal((await adminGet(other.token, `/applications/${app.appId}`)).status, 200);
  assert.equal((await adminGet(admin.token, `/applications/${app.appId}`)).status, 200);
  rows = await auditRows({ applicationId: oid(app.appId), action: 'overview_view' });
  assert.deepEqual(rows.map((r) => String(r.adminId)), [admin.userId, other.userId, admin.userId], 'one row for each view, by whoever looked');
});

test('nothing is shown if the audit row cannot be written', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  const failing = mock.method(auditRepository, 'append', async () => { throw new Error(`audit is down ${SECRET_ID}`); });
  const log = capture();
  let overview;
  let list;
  try {
    overview = await adminGet(admin.token, `/applications/${app.appId}`);
    list = await adminGet(admin.token, '/applications');
  } finally { log.restore(); failing.mock.restore(); }
  for (const res of [overview, list]) {
    assert.equal(res.status, 500);
    assertNoSecrets(res.text, 'the answer');
    assert.equal(res.text.includes('Testfirst'), false);
  }
  assertNoSecrets(log.lines.join('\n'), 'the log');
});

// ---------------------------------------------------------------------------
// The list writes an audit row for each application it shows
// ---------------------------------------------------------------------------

test('a list view writes one audit row for each application it shows, and none for an empty page', async () => {
  const admin = await makeAdmin();
  const a = await submitted({ given: 'Auditlist', family: 'Alpha', email: 'audit.alpha@example.com' });
  const b = await submitted({ given: 'Auditlist', family: 'Beta', email: 'audit.beta@example.com' });
  const before = (await auditRows({ action: 'list_view' })).length;
  const res = await adminGet(admin.token, '/applications?q=Auditlist');
  assert.equal(res.json.data.applications.length, 2);
  const rows = (await auditRows({ action: 'list_view' })).slice(before);
  assert.deepEqual(rows.map((r) => String(r.applicationId)).sort(), [a.appId, b.appId].sort());
  assert.ok(rows.every((r) => String(r.adminId) === admin.userId));
  assert.deepEqual([...new Set(rows.map((r) => Object.keys(r).sort().join()))], ['_id,action,adminId,applicationId,at']);
  assert.equal(rows[0].at.getTime(), rows[1].at.getTime(), 'one list view');
  const empty = await adminGet(admin.token, '/applications?q=nobody-at-all');
  assert.deepEqual(empty.json.data.applications, []);
  assert.equal((await auditRows({ action: 'list_view' })).length, before + 2, 'an empty page writes nothing');
  const log = (await adminGet(admin.token, `/applications/${a.appId}/activity`)).json.data.activity;
  assert.deepEqual(log.map((r) => r.action), ['list_view']);
});

// ---------------------------------------------------------------------------
// The document link
// ---------------------------------------------------------------------------

test('the document link: a signed link that works for 2 minutes, with one audit row that holds the document id and nothing else', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  const doc = (await rawDoc(app.appId)).documents.find((d) => d.slot === 'passport');
  const asked = Date.now();
  const res = await adminGet(admin.token, `/applications/${app.appId}/documents/${doc.id}/link`);
  assert.equal(res.status, 200, res.text);
  assert.match(res.json.data.url, /^https:\/\/fake-storage\.invalid\/download\?/);
  assert.deepEqual(Object.keys(res.json.data).sort(), ['expiresAt', 'url']);
  const lifetime = new Date(res.json.data.expiresAt).getTime() - asked;
  assert.ok(lifetime > 115000 && lifetime <= 125000, `expires in 2 minutes (${lifetime} ms)`);
  assert.equal(new URL(res.json.data.url).searchParams.get('expires'), String(new Date(res.json.data.expiresAt).getTime()));
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(fakeStorage.links.at(-1).publicId, doc.publicId);

  const rows = await auditRows({ applicationId: oid(app.appId), action: 'document_link' });
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['_id', 'action', 'adminId', 'applicationId', 'at', 'documentId']);
  assert.equal(rows[0].documentId, doc.id);
  const text = JSON.stringify(rows);
  for (const needle of ['https://', 'fake-storage', doc.publicId, FILE_NAME, 'expires']) assert.equal(text.includes(needle), false, `${needle} is not in the audit row`);

  await adminGet(admin.token, `/applications/${app.appId}/documents/${doc.id}/link`);
  assert.equal((await auditRows({ applicationId: oid(app.appId), action: 'document_link' })).length, 2, 'every request is a row');
});

test('the document link refuses what is not a file of that application: no link, no audit row', async () => {
  const admin = await makeAdmin();
  const mine = await submitted();
  const theirs = await submitted();
  const theirDoc = (await rawDoc(theirs.appId)).documents[0];
  const linksBefore = fakeStorage.links.length;
  const rowsBefore = (await auditRows({ action: 'document_link' })).length;
  for (const docId of [theirDoc.id, crypto.randomUUID(), 'not-an-id', '..%2f..']) {
    const res = await adminGet(admin.token, `/applications/${mine.appId}/documents/${docId}/link`);
    assert.deepEqual([res.status, res.json.code], [404, 'DOCUMENT_NOT_FOUND'], docId);
  }
  assert.equal(fakeStorage.links.length, linksBefore);
  assert.equal((await auditRows({ action: 'document_link' })).length, rowsBefore);
  const applicantSide = await api('GET', `/admin/applications/${mine.appId}/documents/${theirDoc.id}/link`, { token: mine.token });
  assert.equal(applicantSide.status, 403, 'an applicant cannot ask for a link, even to their own file');
});

test('the applicant side never hands out a link: the applicant routes are unchanged', async () => {
  const app = await submitted();
  const res = await api('GET', '/applications/me/documents', { token: app.token });
  assert.equal(res.status, 200);
  assert.equal(JSON.stringify(res.json).includes('https://'), false);
  assert.equal((await api('GET', `/applications/me/documents/${(await rawDoc(app.appId)).documents[0].id}/link`, { token: app.token })).status, 404);
});

// ---------------------------------------------------------------------------
// The status
// ---------------------------------------------------------------------------

const move = (token, appId, status) => api('PATCH', `/admin/applications/${appId}/status`, { token, body: { status } });

test('status: submitted -> in_review -> completed -> in_review, each move recorded with the old and the new status', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  for (const [from, to, allowed] of [['submitted', 'in_review', ['completed']], ['in_review', 'completed', ['in_review']], ['completed', 'in_review', ['completed']]]) {
    const res = await move(admin.token, app.appId, to);
    assert.equal(res.status, 200, `${from} -> ${to}: ${res.text}`);
    assert.deepEqual(res.json.data, { status: to, allowedMoves: allowed });
    assert.equal((await rawDoc(app.appId)).status, to);
  }
  const rows = await auditRows({ applicationId: oid(app.appId), action: 'status_change' });
  assert.deepEqual(rows.map((r) => [r.fromStatus, r.toStatus]), [['submitted', 'in_review'], ['in_review', 'completed'], ['completed', 'in_review']]);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['_id', 'action', 'adminId', 'applicationId', 'at', 'fromStatus', 'toStatus']);
    assert.equal(String(row.adminId), admin.userId);
  }
  const stored = await rawDoc(app.appId);
  assert.ok(stored.submittedAt, 'the submit time is untouched');
  assert.equal(stored.reference, app.reference);
});

test('status: every other move is refused with a clear code, and writes nothing', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  const check = async (current, to, status, code) => {
    await TouristVisaApplication.collection.updateOne({ _id: oid(app.appId) }, { $set: { status: current } });
    const rows = (await auditRows({ action: 'status_change' })).length;
    const res = await move(admin.token, app.appId, to);
    assert.deepEqual([res.status, res.json.code], [status, code], `${current} -> ${to}`);
    assert.equal((await rawDoc(app.appId)).status, current);
    assert.equal((await auditRows({ action: 'status_change' })).length, rows);
  };
  await check('submitted', 'completed', 409, 'INVALID_STATUS_MOVE');
  await check('submitted', 'submitted', 409, 'INVALID_STATUS_MOVE');
  await check('in_review', 'submitted', 409, 'INVALID_STATUS_MOVE');
  await check('in_review', 'in_review', 409, 'INVALID_STATUS_MOVE');
  await check('completed', 'submitted', 409, 'INVALID_STATUS_MOVE');
  await check('completed', 'completed', 409, 'INVALID_STATUS_MOVE');
  for (const to of ['draft', 'banana', '', 'IN_REVIEW']) await check('submitted', to, 400, 'INVALID_STATUS');
  for (const body of [{}, { status: 1 }, { status: ['in_review'] }, { status: 'in_review', note: 'x' }, { state: 'in_review' }, []]) {
    const res = await api('PATCH', `/admin/applications/${app.appId}/status`, { token: admin.token, body });
    assert.deepEqual([res.status, res.json.code], [400, 'INVALID_REQUEST'], JSON.stringify(body));
  }
  assert.equal((await rawDoc(app.appId)).status, 'submitted');
});

test('status: two moves at the same moment give one winner and one audit row', async () => {
  const admin = await makeAdmin();
  const other = await makeAdmin();
  const app = await submitted();
  const results = await Promise.all([move(admin.token, app.appId, 'in_review'), move(other.token, app.appId, 'in_review'), move(admin.token, app.appId, 'in_review')]);
  assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => [r.status, r.json && r.json.code])));
  for (const r of results.filter((x) => x.status !== 200)) assert.equal(r.status, 409);
  assert.equal((await auditRows({ applicationId: oid(app.appId), action: 'status_change' })).length, 1);
  assert.equal((await rawDoc(app.appId)).status, 'in_review');
});

test('status: a change that cannot be recorded is undone, with a plain error', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  const failing = mock.method(auditRepository, 'append', async () => { throw new Error(`audit is down ${SECRET_ID}`); });
  const log = capture();
  let res;
  try { res = await move(admin.token, app.appId, 'in_review'); } finally { log.restore(); failing.mock.restore(); }
  assert.equal(res.status, 500);
  assertNoSecrets(res.text, 'the answer');
  assertNoSecrets(log.lines.join('\n'), 'the log');
  assert.equal((await rawDoc(app.appId)).status, 'submitted', 'put back: no change without its row');
});

test('the applicant sees the new status and stays locked', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  await move(admin.token, app.appId, 'in_review');
  const mine = (await api('GET', '/applications/me', { token: app.token })).json.data.application;
  assert.equal(mine.status, 'in_review');
  assert.equal((await api('PUT', '/applications/me/sections/1', { token: app.token, body: { answers: {} } })).status, 409);
  assert.equal((await upload(app.token, 'funds', 'x.pdf')).json.code, 'DOCUMENTS_LOCKED');
  assert.equal((await api('POST', '/applications/me/submit', { token: app.token, body: { declarationAccepted: true } })).json.code, 'ALREADY_SUBMITTED');
});

// ---------------------------------------------------------------------------
// The activity and the audit log itself
// ---------------------------------------------------------------------------

test('the activity: who, what and when for one application, newest first, only that application, and reading it writes nothing', async () => {
  const admin = await makeAdmin('Alex Auditor');
  const other = await makeAdmin('Blair Boss');
  const app = await submitted();
  const elsewhere = await submitted();
  await adminGet(admin.token, `/applications/${app.appId}`);
  await adminGet(other.token, `/applications/${elsewhere.appId}`);
  await move(other.token, app.appId, 'in_review');
  await new Promise((r) => setTimeout(r, 10));
  const before = (await auditRows()).length;
  const res = await adminGet(admin.token, `/applications/${app.appId}/activity`);
  assert.equal(res.status, 200);
  const rows = res.json.data.activity;
  assert.deepEqual(rows.map((r) => r.action), ['status_change', 'overview_view']);
  assert.deepEqual(rows.map((r) => r.admin.name), ['Blair Boss', 'Alex Auditor']);
  assert.deepEqual([rows[0].fromStatus, rows[0].toStatus], ['submitted', 'in_review']);
  assert.ok(rows.every((r) => r.at && r.id && r.admin.id));
  assert.ok(new Date(rows[0].at) >= new Date(rows[1].at), 'newest first');
  assert.equal((await auditRows()).length, before, 'reading the activity writes nothing');
  assertNoSecrets(res.text, 'the activity');
  assert.equal(res.text.includes('example.com'), false, 'no email address of the administrators');
});

test('the audit log is append only: the model refuses every update and delete, and the repository offers none', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  await adminGet(admin.token, `/applications/${app.appId}`);
  const row = await TouristVisaAudit.findOne({ applicationId: app.appId });
  const refuse = (what, fn) => assert.rejects(Promise.resolve().then(fn), /append-only/, what);
  await refuse('updateOne', () => TouristVisaAudit.updateOne({ _id: row._id }, { $set: { action: 'list_view' } }));
  await refuse('updateMany', () => TouristVisaAudit.updateMany({}, { $set: { action: 'list_view' } }));
  await refuse('findOneAndUpdate', () => TouristVisaAudit.findOneAndUpdate({ _id: row._id }, { $set: { action: 'list_view' } }));
  await refuse('replaceOne', () => TouristVisaAudit.replaceOne({ _id: row._id }, { adminId: row.adminId, applicationId: row.applicationId, action: 'list_view' }));
  await refuse('deleteOne', () => TouristVisaAudit.deleteOne({ _id: row._id }));
  await refuse('deleteMany', () => TouristVisaAudit.deleteMany({}));
  await refuse('findOneAndDelete', () => TouristVisaAudit.findOneAndDelete({ _id: row._id }));
  await refuse('document.deleteOne', () => row.deleteOne());
  row.action = 'list_view';
  await refuse('save of an existing row', () => row.save());
  await refuse('bulkWrite update', () => TouristVisaAudit.bulkWrite([{ updateOne: { filter: { _id: row._id }, update: { $set: { action: 'list_view' } } } }]));
  const stored = await TouristVisaAudit.collection.findOne({ _id: row._id });
  assert.equal(stored.action, 'overview_view');
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(auditRepository)).filter((name) => name !== 'constructor');
  assert.deepEqual(methods.sort(), ['append', 'findByApplication']);
});

test('an audit row keeps only what the model lists: an answer, a name, a link or an address handed to it is dropped', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  await auditRepository.append([{
    adminId: admin.user._id, applicationId: oid(app.appId), action: 'overview_view', at: new Date(),
    answer: SECRET_ID, fileName: FILE_NAME, url: 'https://example.invalid/x', ip: '203.0.113.7', userAgent: 'x',
  }]);
  const rows = await auditRows({ applicationId: oid(app.appId) });
  const text = JSON.stringify(rows);
  for (const needle of [SECRET_ID, FILE_NAME, 'https://', '203.0.113.7', 'userAgent']) assert.equal(text.includes(needle), false, needle);
  await assert.rejects(() => auditRepository.append([{ adminId: admin.user._id, applicationId: oid(app.appId), action: 'edited_an_answer' }]), /edited_an_answer|enum|validation/i);
});

test('after all of that, no audit row anywhere holds a value, a file name, a link or an address', async () => {
  const rows = await auditRows();
  assert.ok(rows.length > 10);
  const allowed = new Set(['_id', 'adminId', 'applicationId', 'action', 'at', 'fromStatus', 'toStatus', 'documentId']);
  for (const row of rows) {
    for (const key of Object.keys(row)) assert.ok(allowed.has(key), `unexpected field ${key}`);
    assert.ok(['list_view', 'overview_view', 'document_link', 'status_change'].includes(row.action), row.action);
  }
  const text = JSON.stringify(rows);
  for (const needle of [...SECRETS, 'https://', 'http://', 'fake-storage', '203.0.113', 'example.com', 'Testfirst']) assert.equal(text.includes(needle), false, needle);
});

// ---------------------------------------------------------------------------
// Errors and logs
// ---------------------------------------------------------------------------

test('a failure inside the admin side gives a plain 500 and no answer, name or file reaches the response or the log', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  const failing = mock.method(repository, 'findForAdmin', async () => { throw new Error(`database is down ${SECRET_ID} ${FILE_NAME} ${SECRET_NI}`); });
  const log = capture();
  const results = [];
  try {
    results.push(await adminGet(admin.token, `/applications/${app.appId}`));
    results.push(await adminGet(admin.token, `/applications/${app.appId}/activity`));
    results.push(await move(admin.token, app.appId, 'in_review'));
  } finally { log.restore(); failing.mock.restore(); }
  for (const res of results) {
    assert.equal(res.status, 500);
    assertNoSecrets(res.text, 'the response');
  }
  assertNoSecrets(log.lines.join('\n'), 'the log');
  assert.equal((await rawDoc(app.appId)).status, 'submitted');
});

test('every refusal and every success leaves no answer in the log', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  const doc = (await rawDoc(app.appId)).documents[0];
  const log = capture();
  try {
    await adminGet(admin.token, '/applications?q=Testfirst');
    await adminGet(admin.token, `/applications/${app.appId}`);
    await adminGet(admin.token, `/applications/${app.appId}/documents/${doc.id}/link`);
    await adminGet(admin.token, `/applications/${app.appId}/documents/nope/link`);
    await move(admin.token, app.appId, 'completed');
    await move(admin.token, app.appId, 'in_review');
    await adminGet(admin.token, '/applications?page=0');
    await adminGet(admin.token, '/applications/not-an-id');
  } finally { log.restore(); }
  assertNoSecrets(log.lines.join('\n'), 'the log');
  assert.equal(log.lines.join('\n').includes('Testfirst'), false);
});
