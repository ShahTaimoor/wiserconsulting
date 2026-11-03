'use strict';

// Step 8g tests: the administrator's cover letter, through the real routes. An in-memory replica set, a fake file storage and
// a FAKE AI put into the adapter (no network, no key), made-up users and answers.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.TOURIST_VISA_ENABLED = 'true';
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
for (const name of ['AI_ENABLED', 'AI_PROVIDER', 'GROQ_API_KEY', 'GROQ_MODEL', 'AI_DAILY_LIMIT', 'AI_ADMIN_HOURLY_LIMIT', 'AI_DATA_TERMS_CONFIRMED']) delete process.env[name];

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
const TouristVisaCoverLetter = require('../models/TouristVisaCoverLetter');
const coverLetters = require('../repositories/touristVisaCoverLetterRepository');
const documentService = require('../services/touristVisaDocumentService');
const aiService = require('../services/aiService');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const { DEFAULT_GROQ_MODEL } = require('../config/ai');
const logger = require('../utils/logger');
const { SECRET_ID, SECRET_NI, SECRET_DETAILS, FILE_NAME, SECTIONS } = require('./helpers/touristVisaFixtures');

let replSet;
let server;
let baseUrl;
let userCounter = 0;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  for (const model of [TouristVisaApplication, TouristVisaAudit, TouristVisaChange, TouristVisaCoverLetter]) await model.init();

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
  const user = await User.create({ name: name || `Letter Side ${userCounter}`, email: `test.letterside.${userCounter}@example.com`, password: 'not-a-real-password', role });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token, userId: String(user._id) };
}
const makeAdmin = (name) => makeUser(1, name);
const oid = (id) => new mongoose.Types.ObjectId(id);
const auditRows = (filter = {}) => TouristVisaAudit.collection.find(filter).sort({ at: 1, _id: 1 }).toArray();
const letterRows = (appId) => TouristVisaCoverLetter.collection.find({ applicationId: oid(appId) }).sort({ version: 1 }).toArray();
const base = (appId) => `/admin/applications/${appId}/cover-letter`;
const view = (token, appId) => api('GET', base(appId), { token });
const generate = (token, appId) => api('POST', `${base(appId)}/generate`, { token });
const save = (token, appId, body) => api('PUT', base(appId), { token, body });
const approve = (token, appId, body) => api('POST', `${base(appId)}/approve`, { token, body });
const move = (token, appId, status) => api('PATCH', `/admin/applications/${appId}/status`, { token, body: { status } });
const correct = (token, appId, revision, changes) => api('PUT', `/admin/applications/${appId}/changes`, { token, body: { expectedRevision: revision, reason: 'MADE-UP-REASON for the test', changes } });

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60, 0x20)]);
function upload(token, slot, name) {
  const form = new FormData();
  form.append('slot', slot);
  form.append('file', new Blob([PDF], { type: 'application/pdf' }), name);
  return api('POST', '/applications/me/documents', { token, body: form });
}
async function readyApplicant() {
  const person = await makeUser(0);
  const created = await api('POST', '/applications', { token: person.token });
  const appId = created.json.data.application.id;
  for (const [id, answers] of SECTIONS('Testfirst', 'Testlast', 'test.letter.applicant@example.com')) {
    const res = await api('PUT', `/applications/me/sections/${id}`, { token: person.token, body: { answers } });
    assert.equal(res.status, 200, `${id}: ${JSON.stringify(res.json)}`);
  }
  assert.equal((await upload(person.token, 'passport', FILE_NAME)).status, 201);
  assert.equal((await upload(person.token, 'funds', 'bank-statement.pdf')).status, 201);
  return { ...person, appId };
}
async function submitted() {
  const person = await readyApplicant();
  const res = await api('POST', '/applications/me/submit', { token: person.token, body: { declarationAccepted: true } });
  assert.equal(res.status, 200, res.text);
  return person;
}

function capture() {
  const lines = [];
  const original = { error: console.error, log: console.log, info: console.info, warn: console.warn, debug: console.debug };
  for (const method of Object.keys(original)) console[method] = (...args) => lines.push(args.map((a) => util.inspect(a, { depth: 8 })).join(' '));
  // The logger prints only in development, so its calls are captured directly too.
  const loggerOriginal = { error: logger.error, warn: logger.warn, info: logger.info, debug: logger.debug };
  for (const method of Object.keys(loggerOriginal)) logger[method] = (...args) => lines.push(args.map((a) => util.inspect(a, { depth: 8 })).join(' '));
  return { lines, restore: () => { Object.assign(console, original); Object.assign(logger, loggerOriginal); } };
}

// ---- the fake AI ----------------------------------------------------------

const KEY = 'gsk_TESTONLY_ROUTE_KEY_987654321';
const AI_ON = { AI_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: KEY };
const FILLER = 'I am a careful and responsible traveller and I have organised this visit well in advance so that everything is clear and in order. ';
let aiCalls = [];
let aiAnswer = null;
aiService.fetchImpl = async (url, init) => {
  const body = JSON.parse(init.body);
  aiCalls.push({ url, init, body });
  return aiAnswer(body);
};
const chatResponse = (content) => new Response(JSON.stringify({ model: 'x', choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }), { status: 200 });
const pick = (prompt, label) => (new RegExp(`${label}: (.+)`).exec(prompt) || [])[1];
/** A letter that follows the facts it is given. */
function followingLetter(body) {
  const prompt = body.messages[1].content;
  const arrival = pick(prompt, 'Planned arrival date');
  const departure = pick(prompt, 'Planned departure date');
  const stay = pick(prompt, 'Length of the visit');
  return ['Dear Sir or Madam,',
    `I am applying for a UK Standard Visitor visa. I plan to travel to the United Kingdom on ${arrival} and to leave on ${departure}, a stay of ${stay}. ${FILLER}${FILLER}`,
    `${FILLER}${FILLER}${FILLER}`, 'Yours faithfully,\n\n[NAME]'].join('\n\n');
}
function useAi(env, answer = (body) => chatResponse(followingLetter(body))) {
  for (const name of Object.keys(AI_ON)) delete process.env[name];
  for (const name of ['GROQ_MODEL', 'AI_DAILY_LIMIT', 'AI_ADMIN_HOURLY_LIMIT']) delete process.env[name];
  Object.assign(process.env, env || {});
  aiAnswer = answer;
  aiCalls = [];
  aiService.failures = 0;
  aiService.pausedUntil = 0;
}
const aiOff = () => useAi(null);

const IDENTIFIERS = [
  'Testfirst', 'Testlast', 'test.letter.applicant@example.com', '7700 900123', SECRET_ID, SECRET_NI, SECRET_DETAILS, 'Sindhi', 'Testmother', 'Testsurname',
  'Test Street', 'Testville', 'Test Passport Office', FILE_NAME, '1990-01-01', '1 January 1990', KEY,
];
const assertNone = (text, needles, where) => { for (const needle of needles) assert.equal(String(text).includes(needle), false, `${needle} is in ${where}`); };

// ---------------------------------------------------------------------------
// Who may call it, and when
// ---------------------------------------------------------------------------

test('authorization: anonymous is 401, an applicant is 403, an administrator is let in; every answer is no-store; a refusal writes nothing', async () => {
  aiOff();
  const app = await submitted();
  const applicant = await makeUser(0);
  const admin = await makeAdmin();
  const id = app.appId;
  const routes = [
    ['GET', base(id)],
    ['POST', `${base(id)}/generate`],
    ['PUT', base(id), { text: 'A hand-written letter.', basedOnVersion: 0 }],
    ['POST', `${base(id)}/approve`, { version: 1 }],
  ];
  const auditBefore = await auditRows();
  for (const [method, path, body] of routes) {
    const anonymous = await api(method, path, { body });
    assert.equal(anonymous.status, 401, `anonymous ${method} ${path}`);
    assert.equal(anonymous.headers.get('cache-control'), 'no-store');
    assert.equal((await api(method, path, { token: 'not-a-token', body })).status, 401);
    const normal = await api(method, path, { token: applicant.token, body });
    assert.equal(normal.status, 403, `applicant ${method} ${path}`);
    assert.equal(normal.headers.get('cache-control'), 'no-store');
  }
  assert.deepEqual(await auditRows(), auditBefore);
  assert.equal((await letterRows(id)).length, 0);

  assert.equal((await view(admin.token, id)).status, 200);
  const generated = await generate(admin.token, id);
  assert.equal(generated.status, 201, generated.text);
  assert.equal(generated.headers.get('cache-control'), 'no-store');
  assert.equal((await save(admin.token, id, { text: 'A hand-written letter.', basedOnVersion: 1 })).status, 201);
  assert.equal((await approve(admin.token, id, { version: 2 })).status, 200);
});

test('the feature gate: while Tourist Visa is closed every cover letter route answers the fixed 404 and writes nothing', async () => {
  aiOff();
  const app = await submitted();
  const admin = await makeAdmin();
  process.env.TOURIST_VISA_ENABLED = 'false';
  try {
    for (const [method, path, body] of [['GET', base(app.appId)], ['POST', `${base(app.appId)}/generate`], ['PUT', base(app.appId), { text: 'x', basedOnVersion: 0 }], ['POST', `${base(app.appId)}/approve`, { version: 1 }]]) {
      const res = await api(method, path, { token: admin.token, body });
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.equal(res.json.code, 'FEATURE_CLOSED');
    }
  } finally {
    process.env.TOURIST_VISA_ENABLED = 'true';
  }
  assert.equal((await letterRows(app.appId)).length, 0);
});

test('status gates: a submitted or in-review application can have a letter; a completed one, a draft and an unknown id are refused', async () => {
  aiOff();
  const admin = await makeAdmin();

  const app = await submitted();
  assert.equal((await generate(admin.token, app.appId)).status, 201, 'submitted');
  assert.equal((await move(admin.token, app.appId, 'in_review')).status, 200);
  assert.equal((await generate(admin.token, app.appId)).status, 201, 'in review');
  assert.equal((await move(admin.token, app.appId, 'completed')).status, 200);
  for (const [method, path, body] of [['GET', base(app.appId)], ['POST', `${base(app.appId)}/generate`], ['PUT', base(app.appId), { text: 'x', basedOnVersion: 2 }], ['POST', `${base(app.appId)}/approve`, { version: 2 }]]) {
    const res = await api(method, path, { token: admin.token, body });
    assert.equal(res.status, 409, `${method} ${path}`);
    assert.equal(res.json.code, 'LETTER_NOT_AVAILABLE');
  }
  assert.equal((await letterRows(app.appId)).length, 2, 'nothing was added to the completed application');
  assert.equal((await move(admin.token, app.appId, 'in_review')).status, 200, 'reopened');
  assert.equal((await view(admin.token, app.appId)).status, 200, 'and the letters are there again');

  const draft = await readyApplicant();
  for (const [method, path, body] of [['GET', base(draft.appId)], ['POST', `${base(draft.appId)}/generate`], ['PUT', base(draft.appId), { text: 'x', basedOnVersion: 0 }]]) {
    const res = await api(method, path, { token: admin.token, body });
    assert.equal(res.status, 404, `draft ${method}`);
    assert.equal(res.json.code, 'APPLICATION_NOT_FOUND');
  }
  assert.equal((await letterRows(draft.appId)).length, 0);
  assert.equal((await view(admin.token, '64b64b64b64b64b64b64b64')).status, 404);
  assert.equal((await view(admin.token, 'not-an-id')).status, 404);
});

// ---------------------------------------------------------------------------
// Generating: the template and the AI
// ---------------------------------------------------------------------------

test('with the AI off a template letter is written: version 1, the real name in it, the reason recorded, the text encrypted at rest, one audit row without text', async () => {
  aiOff();
  const app = await submitted();
  const admin = await makeAdmin();

  const empty = await view(admin.token, app.appId);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.json.data.versions, []);
  assert.equal(empty.json.data.latest, null);
  assert.equal(empty.json.data.stale, false);
  assert.deepEqual(empty.json.data.ai, { available: false, code: 'AI_DISABLED' });
  assert.equal(empty.json.data.maxLength, 8000);

  const res = await generate(admin.token, app.appId);
  assert.equal(res.status, 201, res.text);
  const data = res.json.data;
  assert.deepEqual(data.created, { version: 1, source: 'template', fallbackReason: 'AI_DISABLED' });
  assert.equal(data.latest, 1);
  const letter = data.versions[0];
  assert.equal(letter.source, 'template');
  assert.equal(letter.status, 'draft');
  assert.equal(letter.version, 1);
  assert.match(letter.text, /^Dear Sir or Madam,/);
  assert.match(letter.text, /Yours faithfully,\n\nTestfirst Testlast$/);
  assert.match(letter.text, /1 March 2027/);
  assert.equal(letter.factsHash, undefined, 'the hash is not sent');

  const rows = await letterRows(app.appId);
  assert.equal(rows.length, 1);
  assert.match(rows[0].text, /^enc:v1:/);
  assert.equal(JSON.stringify(rows[0]).includes('Testfirst'), false, 'the text is not in the database in plain form');
  assert.equal(JSON.stringify(rows[0]).includes('Dear Sir'), false);
  assert.equal(rows[0].source, 'template');
  assert.equal(rows[0].fallbackReason, 'AI_DISABLED');
  assert.equal(rows[0].aiAttempted, false);
  assert.equal(rows[0].status, 'draft');
  assert.match(rows[0].factsHash, /^[0-9a-f]{64}$/);
  assert.equal(String(rows[0].createdBy), admin.userId);

  const generateRows = await auditRows({ applicationId: oid(app.appId), action: 'cover_letter_generate' });
  assert.equal(generateRows.length, 1);
  assert.equal(generateRows[0].letterVersion, 1);
  assert.equal(generateRows[0].letterSource, 'template');
  assert.equal(generateRows[0].model, undefined);
});

test('the AI is used when it is on: it is sent the facts with placeholders and no identifier, and the real name and employer are put in afterwards', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  useAi(AI_ON);
  const res = await generate(admin.token, app.appId);
  assert.equal(res.status, 201, res.text);
  assert.deepEqual(res.json.data.created, { version: 1, source: 'ai', model: DEFAULT_GROQ_MODEL });

  // What was sent to the provider.
  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(aiCalls[0].init.headers.Authorization, `Bearer ${KEY}`);
  const sent = JSON.stringify(aiCalls[0].body);
  assertNone(sent, IDENTIFIERS.filter((v) => v !== KEY), 'the request to the AI');
  assert.match(aiCalls[0].body.messages[1].content, /The applicant's name: \[NAME\]/);
  assert.match(aiCalls[0].body.messages[1].content, /Planned arrival date: 1 March 2027/);
  assert.equal(/Part 9|conviction|National Insurance|passport number/i.test(aiCalls[0].body.messages[1].content), false);

  const letter = res.json.data.versions[0];
  assert.equal(letter.source, 'ai');
  assert.equal(letter.model, DEFAULT_GROQ_MODEL);
  assert.match(letter.text, /Yours faithfully,\n\nTestfirst Testlast$/);
  assert.equal(/\[NAME\]/.test(letter.text), false, 'the placeholder was replaced');

  const [row] = await letterRows(app.appId);
  assert.equal(row.source, 'ai');
  assert.equal(row.model, DEFAULT_GROQ_MODEL);
  assert.equal(row.aiAttempted, true);
  assert.equal(row.fallbackReason, undefined);
  assert.match(row.text, /^enc:v1:/);
  const [audit] = await auditRows({ applicationId: oid(app.appId), action: 'cover_letter_generate' });
  assert.equal(audit.letterSource, 'ai');
  assert.equal(audit.model, DEFAULT_GROQ_MODEL);
  aiOff();
});

test('every way the AI can fail gives a template letter, never an error to the administrator, and records only a fixed code', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  const lines = capture();
  const results = [];
  try {
    const scripts = [
      ['a wrong key', () => new Response('SECRET-PROVIDER-BODY invalid key', { status: 401 }), 'AI_PROVIDER_REJECTED'],
      ['a server error', () => new Response('SECRET-PROVIDER-BODY', { status: 500 }), 'AI_PROVIDER_ERROR'],
      ['a slow provider rate limiting us for a long time', () => new Response('SECRET-PROVIDER-BODY', { status: 429, headers: { 'retry-after': '120' } }), 'AI_RATE_LIMITED'],
      ['an answer that is not JSON', () => new Response('SECRET-PROVIDER-BODY', { status: 200 }), 'AI_BAD_RESPONSE'],
      ['a letter with an invented number', (body) => chatResponse(followingLetter(body).replace(/a stay of [^.]+/, 'a stay of 99 nights')), 'LETTER_NUMBER_NOT_IN_FACTS'],
      ['a letter with an invented date', (body) => chatResponse(followingLetter(body).replace('1 March 2027', '9 May 2027')), 'LETTER_DATE_NOT_IN_FACTS'],
      ['a letter with a made-up placeholder', (body) => chatResponse(followingLetter(body).replace('[NAME]', '[SIGNATURE]')), 'LETTER_UNKNOWN_TOKEN'],
      ['a letter that forgot the name', (body) => chatResponse(followingLetter(body).replace('[NAME]', 'The Applicant')), 'LETTER_MISSING_TOKEN'],
    ];
    for (const [label, answer, code] of scripts) {
      useAi(AI_ON, answer);
      const res = await generate(admin.token, app.appId);
      assert.equal(res.status, 201, `${label}: ${res.text}`);
      assert.equal(res.json.data.created.source, 'template', label);
      assert.equal(res.json.data.created.fallbackReason, code, label);
      assert.match(res.json.data.versions[0].text, /Yours faithfully,\n\nTestfirst Testlast$/, label);
      assert.equal(res.text.includes('SECRET-PROVIDER-BODY'), false, label);
      results.push(code);
    }
    // A provider that cannot be reached at all.
    useAi(AI_ON, () => { throw new TypeError('SECRET-NETWORK-ERROR'); });
    const net = await generate(admin.token, app.appId);
    assert.equal(net.json.data.created.fallbackReason, 'AI_NETWORK');
    assert.equal(net.text.includes('SECRET-NETWORK-ERROR'), false);
  } finally {
    lines.restore();
    aiOff();
  }
  const rows = await letterRows(app.appId);
  assert.equal(rows.length, results.length + 1);
  assert.ok(rows.every((r) => r.source === 'template' && r.aiAttempted === true), 'the provider was asked each time');
  // Nothing of a prompt, an answer, an error, a key, a fact or a letter was logged.
  assertNone(lines.lines.join('\n'), [KEY, 'SECRET-PROVIDER-BODY', 'SECRET-NETWORK-ERROR', 'Testfirst', 'Testlast', 'Dear Sir', 'Planned arrival', 'Bearer'], 'the log');
});

test('the AI circuit breaker shows up as a template letter without asking the provider after three failures in a row', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  useAi(AI_ON, () => new Response('x', { status: 401 }));
  const reasons = [];
  for (let i = 0; i < 5; i += 1) reasons.push((await generate(admin.token, app.appId)).json.data.created.fallbackReason);
  assert.deepEqual(reasons, ['AI_PROVIDER_REJECTED', 'AI_PROVIDER_REJECTED', 'AI_PROVIDER_REJECTED', 'AI_CIRCUIT_OPEN', 'AI_CIRCUIT_OPEN']);
  assert.equal(aiCalls.length, 3);
  const rows = await letterRows(app.appId);
  assert.deepEqual(rows.map((r) => r.aiAttempted), [true, true, true, false, false], 'a skipped request does not count as a request to the AI');
  aiOff();
});

test('the daily limit (in total) and the per-administrator limit fall back to the template without asking the provider; another administrator is not held up', async () => {
  const one = await makeAdmin();
  const two = await makeAdmin();
  const app = await submitted();
  // Start from a clean count of today's AI requests.
  await TouristVisaCoverLetter.collection.deleteMany({});

  useAi({ ...AI_ON, AI_ADMIN_HOURLY_LIMIT: '2', AI_DAILY_LIMIT: '4' });
  assert.equal((await generate(one.token, app.appId)).json.data.created.source, 'ai');
  assert.equal((await generate(one.token, app.appId)).json.data.created.source, 'ai');
  const held = await generate(one.token, app.appId);
  assert.equal(held.json.data.created.source, 'template');
  assert.equal(held.json.data.created.fallbackReason, 'AI_ADMIN_LIMIT');
  assert.equal(aiCalls.length, 2);
  assert.equal((await generate(two.token, app.appId)).json.data.created.source, 'ai', 'the other administrator');
  assert.equal((await generate(two.token, app.appId)).json.data.created.source, 'ai');
  assert.equal(aiCalls.length, 4);
  const daily = await generate(two.token, app.appId);
  assert.equal(daily.json.data.created.fallbackReason, 'AI_DAILY_LIMIT');
  assert.equal(aiCalls.length, 4, 'the provider was not asked');
  // Letters written by hand or from the template do not count.
  assert.equal((await save(two.token, app.appId, { text: 'By hand.', basedOnVersion: daily.json.data.latest })).status, 201);
  assert.equal(await coverLetters.countAiRequests({ since: new Date(Date.now() - 3600 * 1000) }), 4);
  aiOff();
});

test('the production guard: in production the AI is not used without the data-terms confirmation', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  useAi({ ...AI_ON });
  process.env.NODE_ENV = 'production';
  try {
    const refused = await generate(admin.token, app.appId);
    assert.equal(refused.json.data.created.fallbackReason, 'AI_TERMS_NOT_CONFIRMED');
    assert.equal(aiCalls.length, 0);
    process.env.AI_DATA_TERMS_CONFIRMED = 'true';
    const allowed = await generate(admin.token, app.appId);
    assert.equal(allowed.json.data.created.source, 'ai');
  } finally {
    process.env.NODE_ENV = 'test';
    delete process.env.AI_DATA_TERMS_CONFIRMED;
    aiOff();
  }
});

// ---------------------------------------------------------------------------
// Editing, approving and the history
// ---------------------------------------------------------------------------

test('an edited text is a NEW version with source "admin"; earlier versions never change; a stale starting point is refused', async () => {
  aiOff();
  const admin = await makeAdmin();
  const other = await makeAdmin();
  const app = await submitted();
  assert.equal((await generate(admin.token, app.appId)).status, 201);
  const [first] = await letterRows(app.appId);

  const saved = await save(admin.token, app.appId, { text: 'EDITED-LETTER-TEXT written by hand.\r\n\r\nYours faithfully', basedOnVersion: 1 });
  assert.equal(saved.status, 201, saved.text);
  const data = saved.json.data;
  assert.equal(data.latest, 2);
  assert.equal(data.versions[0].source, 'admin');
  assert.equal(data.versions[0].text, 'EDITED-LETTER-TEXT written by hand.\n\nYours faithfully');
  assert.equal(data.versions[0].model, undefined);
  assert.equal(data.versions.length, 2);
  assert.deepEqual((await letterRows(app.appId))[0], first, 'version 1 is exactly as it was');
  const [row2] = (await letterRows(app.appId)).slice(1);
  assert.match(row2.text, /^enc:v1:/);
  assert.equal(JSON.stringify(row2).includes('EDITED-LETTER-TEXT'), false);
  assert.equal(row2.aiAttempted, false);

  // Another administrator who still looks at version 1 cannot overwrite version 2.
  const clash = await save(other.token, app.appId, { text: 'Another text', basedOnVersion: 1 });
  assert.equal(clash.status, 409);
  assert.equal(clash.json.code, 'LETTER_CHANGED');
  assert.equal((await letterRows(app.appId)).length, 2);

  // A hand-edited version stays in the history when a newer version is generated.
  const again = await generate(admin.token, app.appId);
  assert.equal(again.json.data.versions.length, 3);
  assert.deepEqual(again.json.data.versions.map((v) => v.source), ['template', 'admin', 'template']);
  assert.equal(again.json.data.versions[1].text, 'EDITED-LETTER-TEXT written by hand.\n\nYours faithfully');

  const [audit] = await auditRows({ applicationId: oid(app.appId), action: 'cover_letter_edit' });
  assert.equal(audit.letterVersion, 2);
  assert.equal(audit.letterSource, 'admin');
  assert.equal(JSON.stringify(audit).includes('EDITED-LETTER-TEXT'), false);
});

test('editing: the request is checked (text, length, extra fields, the starting version) and a refusal writes nothing', async () => {
  aiOff();
  const admin = await makeAdmin();
  const app = await submitted();
  const before = await auditRows({ applicationId: oid(app.appId) });
  const bad = [
    [{}, 'INVALID_REQUEST'],
    [{ text: 'x' }, 'INVALID_REQUEST'],
    [{ text: 'x', basedOnVersion: 0, status: 'approved' }, 'INVALID_REQUEST'],
    [{ text: 'x', basedOnVersion: '0' }, 'INVALID_REQUEST'],
    [{ text: 'x', basedOnVersion: -1 }, 'INVALID_REQUEST'],
    [{ text: 'x', basedOnVersion: 1.5 }, 'INVALID_REQUEST'],
    [{ text: 42, basedOnVersion: 0 }, 'INVALID_TEXT'],
    [{ text: '   \n ', basedOnVersion: 0 }, 'INVALID_TEXT'],
    [{ text: 'a'.repeat(8001), basedOnVersion: 0 }, 'INVALID_TEXT'],
    [{ text: 'bad \u0000 byte', basedOnVersion: 0 }, 'INVALID_TEXT'],
    [['array'], 'INVALID_REQUEST'],
  ];
  for (const [body, code] of bad) {
    const res = await save(admin.token, app.appId, body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal(res.json.code, code);
  }
  assert.equal((await save(admin.token, app.appId, { text: 'x', basedOnVersion: 3 })).json.code, 'LETTER_CHANGED', 'a version that does not exist');
  assert.equal((await letterRows(app.appId)).length, 0);
  assert.deepEqual(await auditRows({ applicationId: oid(app.appId) }), before);
  assert.equal((await save(admin.token, app.appId, { text: 'a'.repeat(8000), basedOnVersion: 0 })).status, 201, '8000 characters is allowed');
  assert.equal((await save(admin.token, app.appId, { text: 'a hand-written start', basedOnVersion: 1 })).status, 201);
});

test('approving: only the latest version, once, and the row changes in nothing but its approval', async () => {
  aiOff();
  const admin = await makeAdmin('Approving Admin');
  const app = await submitted();
  assert.equal((await approve(admin.token, app.appId, { version: 1 })).json.code, 'LETTER_NOT_FOUND', 'nothing to approve yet');
  await generate(admin.token, app.appId);
  await generate(admin.token, app.appId);
  const before = await letterRows(app.appId);

  const old = await approve(admin.token, app.appId, { version: 1 });
  assert.equal(old.status, 409);
  assert.equal(old.json.code, 'LETTER_NOT_LATEST');
  assert.equal((await approve(admin.token, app.appId, { version: 3 })).json.code, 'LETTER_NOT_LATEST');
  for (const body of [{}, { version: '2' }, { version: 0 }, { version: 2, text: 'x' }, [2]]) assert.equal((await approve(admin.token, app.appId, body)).status, 400);
  assert.deepEqual(await letterRows(app.appId), before, 'refusals change nothing');

  const ok = await approve(admin.token, app.appId, { version: 2 });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.data.versions[0].status, 'approved');
  assert.equal(ok.json.data.versions[0].approvedBy.name, 'Approving Admin');
  assert.ok(ok.json.data.versions[0].approvedAt);
  assert.equal(ok.json.data.versions[1].status, 'draft', 'the older version stays a draft');

  const after = await letterRows(app.appId);
  assert.deepEqual(after[0], before[0], 'version 1 untouched');
  const { status: s1, approvedBy, approvedAt, ...restAfter } = after[1];
  const { status: s0, ...restBefore } = before[1];
  assert.deepEqual(restAfter, restBefore, 'version 2 differs in nothing but its approval');
  assert.equal(after[1].status, 'approved');
  assert.equal(String(approvedBy), admin.userId);
  assert.ok(approvedAt instanceof Date);

  assert.equal((await approve(admin.token, app.appId, { version: 2 })).json.code, 'ALREADY_APPROVED');
  // After approving, a new text is a new draft version; the approved one stays in the history.
  const next = await save(admin.token, app.appId, { text: 'A newer text.', basedOnVersion: 2 });
  assert.equal(next.json.data.versions[0].status, 'draft');
  assert.equal(next.json.data.versions[1].status, 'approved');
  const [audit] = await auditRows({ applicationId: oid(app.appId), action: 'cover_letter_approve' });
  assert.equal(audit.letterVersion, 2);
});

test('a letter with [not provided: ...] gaps cannot be approved until they are filled in', async () => {
  aiOff();
  const admin = await makeAdmin();
  const app = await submitted();
  await save(admin.token, app.appId, { text: 'I will travel on [not provided: planned arrival date] and I am grateful.', basedOnVersion: 0 });
  const refused = await approve(admin.token, app.appId, { version: 1 });
  assert.equal(refused.status, 409);
  assert.equal(refused.json.code, 'LETTER_HAS_PLACEHOLDERS');
  assert.equal((await letterRows(app.appId))[0].status, 'draft');
  await save(admin.token, app.appId, { text: 'I will travel on 1 March 2027 and I am grateful.', basedOnVersion: 1 });
  assert.equal((await approve(admin.token, app.appId, { version: 2 })).status, 200);
});

// ---------------------------------------------------------------------------
// The stale rule
// ---------------------------------------------------------------------------

test('stale: a change to an answer the letter uses makes it stale; a change to one it does not use does not; nothing is regenerated by itself', async () => {
  aiOff();
  const admin = await makeAdmin();
  const app = await submitted();
  await generate(admin.token, app.appId);
  assert.equal((await view(admin.token, app.appId)).json.data.stale, false);

  // The phone number is not on the allowlist: the letter stays current.
  const phone = await correct(admin.token, app.appId, 0, [{ questionId: 'q2_32', value: { countryCode: '+44', number: '7700 900555' } }]);
  assert.equal(phone.status, 200, phone.text);
  assert.equal((await view(admin.token, app.appId)).json.data.stale, false, 'a phone number is not used by the letter');

  // The departure date is.
  const dates = await correct(admin.token, app.appId, 1, [{ questionId: 'q1_7', value: '2027-03-20' }]);
  assert.equal(dates.status, 200, dates.text);
  const stale = await view(admin.token, app.appId);
  assert.equal(stale.json.data.stale, true);
  assert.equal(stale.json.data.versions.length, 1, 'nothing was regenerated by itself');
  assert.equal((await letterRows(app.appId)).length, 1);

  // A stale letter cannot be approved.
  const refused = await approve(admin.token, app.appId, { version: 1 });
  assert.equal(refused.status, 409);
  assert.equal(refused.json.code, 'LETTER_STALE');

  // A new version (generated, or saved from the text) is current again.
  const fresh = await generate(admin.token, app.appId);
  assert.equal(fresh.json.data.stale, false);
  assert.match(fresh.json.data.versions[0].text, /20 March 2027/);
  assert.equal((await correct(admin.token, app.appId, 2, [{ questionId: 'q1_7', value: '2027-03-22' }])).status, 200);
  assert.equal((await view(admin.token, app.appId)).json.data.stale, true);
  const edited = await save(admin.token, app.appId, { text: 'The text, checked against the new answers.', basedOnVersion: 2 });
  assert.equal(edited.json.data.stale, false);
  assert.equal((await approve(admin.token, app.appId, { version: 3 })).status, 200);
  // Approved, and the answers change again: it is flagged, and stays in the history as it was.
  assert.equal((await correct(admin.token, app.appId, 3, [{ questionId: 'q6_3', value: { amount: 1700, currency: 'GBP' } }])).status, 200);
  const after = await view(admin.token, app.appId);
  assert.equal(after.json.data.stale, true);
  assert.equal(after.json.data.versions[0].status, 'approved');
});

// ---------------------------------------------------------------------------
// Append only, audit, privacy
// ---------------------------------------------------------------------------

test('versions are append only: the model refuses every update and delete, and the only change the repository makes is the one approval', async () => {
  aiOff();
  const admin = await makeAdmin();
  const app = await submitted();
  await generate(admin.token, app.appId);
  const id = oid(app.appId);
  const before = await letterRows(app.appId);

  for (const attempt of [
    () => TouristVisaCoverLetter.updateOne({ applicationId: id }, { $set: { text: 'x' } }),
    () => TouristVisaCoverLetter.updateMany({ applicationId: id }, { $set: { source: 'ai' } }),
    () => TouristVisaCoverLetter.findOneAndUpdate({ applicationId: id }, { $set: { status: 'approved' } }),
    () => TouristVisaCoverLetter.replaceOne({ applicationId: id }, { applicationId: id }),
    () => TouristVisaCoverLetter.deleteOne({ applicationId: id }),
    () => TouristVisaCoverLetter.deleteMany({ applicationId: id }),
    () => TouristVisaCoverLetter.findOneAndDelete({ applicationId: id }),
    async () => { const doc = await TouristVisaCoverLetter.findOne({ applicationId: id }); doc.status = 'approved'; await doc.save(); },
    () => TouristVisaCoverLetter.bulkWrite([{ deleteOne: { filter: { applicationId: id } } }]),
  ]) {
    await assert.rejects(attempt(), /append-only/);
  }
  assert.deepEqual(await letterRows(app.appId), before);
  // There is no route to change or remove a version.
  for (const method of ['DELETE', 'PATCH']) assert.ok([404, 405].includes((await api(method, base(app.appId), { token: admin.token })).status));
  assert.deepEqual(await letterRows(app.appId), before);
  // The repository approves a draft once, and not twice.
  const draft = { applicationId: id, version: 1, adminId: oid(admin.userId), at: new Date() };
  assert.equal(await coverLetters.approve(draft), true);
  // A second approval, even by someone else at another time, changes nothing: the row is not a draft any more.
  const another = await makeAdmin();
  assert.equal(await coverLetters.approve({ ...draft, adminId: oid(another.userId), at: new Date(Date.now() + 60000) }), false);
  const approvedRow = (await letterRows(app.appId))[0];
  assert.equal(String(approvedRow.approvedBy), admin.userId, 'the first approval stands');
  assert.equal(await coverLetters.approve({ ...draft, version: 9 }), false);
});

test('two versions cannot share a number: a second writer with the same number is told the letter changed', async () => {
  aiOff();
  const admin = await makeAdmin();
  const app = await submitted();
  await generate(admin.token, app.appId);
  const row = (await letterRows(app.appId))[0];
  await assert.rejects(
    coverLetters.append({ applicationId: row.applicationId, version: 1, text: 'x', source: 'admin', aiAttempted: false, factsHash: 'a'.repeat(64), basedOnRevision: 0, createdBy: row.createdBy, createdAt: new Date() }),
    (error) => error.statusCode === 409 && error.code === 'LETTER_CHANGED'
  );
  // Two requests at the same moment: both succeed with different numbers, or one is told to reload; never two version 2s.
  const results = await Promise.all([generate(admin.token, app.appId), generate(admin.token, app.appId), generate(admin.token, app.appId)]);
  assert.ok(results.every((r) => [201, 409].includes(r.status)), results.map((r) => r.status).join());
  const versions = (await letterRows(app.appId)).map((r) => r.version);
  assert.equal(new Set(versions).size, versions.length);
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
});

test('audit rows hold ids and fixed words only: the four actions are recorded before the data is returned, with no text', async () => {
  aiOff();
  const admin = await makeAdmin();
  const app = await submitted();
  await view(admin.token, app.appId);
  await generate(admin.token, app.appId);
  await save(admin.token, app.appId, { text: 'AUDIT-TEST-TEXT by hand', basedOnVersion: 1 });
  await approve(admin.token, app.appId, { version: 2 });
  const rows = await auditRows({ applicationId: oid(app.appId), action: /^cover_letter_/ });
  assert.deepEqual(rows.map((r) => r.action), ['cover_letter_view', 'cover_letter_generate', 'cover_letter_edit', 'cover_letter_approve']);
  for (const r of rows) {
    assert.equal(String(r.adminId), admin.userId);
    const text = JSON.stringify(r);
    assertNone(text, ['AUDIT-TEST-TEXT', 'Dear Sir', 'Testfirst', 'Testlast', 'Yours faithfully'], `the ${r.action} audit row`);
  }
  assert.deepEqual(Object.keys(rows[0]).sort(), ['_id', 'action', 'adminId', 'applicationId', 'at'].sort(), 'a view records who and when');
  assert.equal(rows[1].letterSource, 'template');
  assert.equal(rows[3].letterVersion, 2);
  // The activity panel can read them.
  const activity = await api('GET', `/admin/applications/${app.appId}/activity`, { token: admin.token });
  const actions = activity.json.data.activity.map((a) => a.action);
  for (const action of ['cover_letter_view', 'cover_letter_generate', 'cover_letter_edit', 'cover_letter_approve']) assert.ok(actions.includes(action), action);
  assertNone(activity.text, ['AUDIT-TEST-TEXT', 'Dear Sir'], 'the activity');
});

test('the letter never reaches an applicant, and no error or log line holds a letter, a fact, a prompt or the key', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const lines = capture();
  try {
    useAi(AI_ON);
    await generate(admin.token, app.appId);
    await save(admin.token, app.appId, { text: 'LETTER-PRIVACY-TEXT', basedOnVersion: 1 });
    const errors = [
      await save(admin.token, app.appId, { text: 'LETTER-PRIVACY-TEXT-2', basedOnVersion: 0 }),
      await save(admin.token, app.appId, { text: 'x', extra: 'LETTER-PRIVACY-TEXT-3' }),
      await approve(admin.token, app.appId, { version: 1 }),
    ];
    for (const e of errors) assertNone(e.text, ['LETTER-PRIVACY-TEXT', 'Testfirst', 'Dear Sir', KEY], 'an error response');
  } finally {
    lines.restore();
    aiOff();
  }
  assertNone(lines.lines.join('\n'), ['LETTER-PRIVACY-TEXT', 'Testfirst', 'Testlast', 'Dear Sir', 'Planned arrival', KEY, 'Bearer', 'SYSTEM'], 'the log');

  // Every applicant-facing response is free of the letter.
  for (const path of ['/applications/me', '/applications/me/review']) {
    const res = await api('GET', path, { token: app.token });
    assert.equal(res.status, 200);
    assertNone(res.text, ['LETTER-PRIVACY-TEXT', 'Yours faithfully', 'coverLetter', 'cover_letter', 'Standard Visitor visa'], path);
  }
});
