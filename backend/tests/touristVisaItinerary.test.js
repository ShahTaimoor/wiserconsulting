'use strict';

// The administrator's itinerary, through the real routes. An in-memory replica set, a fake file storage and a FAKE AI put into the
// adapter (no network, no key), made-up users and answers. The cases that need no database are in touristVisaItineraryLogic.test.js.

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
const TouristVisaItinerary = require('../models/TouristVisaItinerary');
const itineraries = require('../repositories/touristVisaItineraryRepository');
const aiUsage = require('../repositories/aiUsageRepository');
const documentService = require('../services/touristVisaDocumentService');
const aiService = require('../services/aiService');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const { DEFAULT_GROQ_MODEL } = require('../config/ai');
const { ITINERARY_PROMPT_VERSION, RETRY_REMINDER } = require('../config/touristVisaItineraryPrompt');
const logger = require('../utils/logger');
const { SECRET_ID, SECRET_NI, SECRET_DETAILS, FILE_NAME, SECTIONS } = require('./helpers/touristVisaFixtures');

let replSet;
let server;
let baseUrl;
let userCounter = 0;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  for (const model of [TouristVisaApplication, TouristVisaAudit, TouristVisaChange, TouristVisaCoverLetter, TouristVisaItinerary]) await model.init();

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
  const user = await User.create({ name: name || `Plan Side ${userCounter}`, email: `test.planside.${userCounter}@example.com`, password: 'not-a-real-password', role });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token, userId: String(user._id) };
}
const makeAdmin = (name) => makeUser(1, name);
const oid = (id) => new mongoose.Types.ObjectId(id);
const auditRows = (filter = {}) => TouristVisaAudit.collection.find(filter).sort({ at: 1, _id: 1 }).toArray();
const rowsOf = (appId) => TouristVisaItinerary.collection.find({ applicationId: oid(appId) }).sort({ version: 1 }).toArray();
const base = (appId) => `/admin/applications/${appId}/itinerary`;
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
  for (const [id, answers] of SECTIONS('Testfirst', 'Testlast', 'test.plan.applicant@example.com')) {
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
const TRIP = 'I would like to see London, then Bath, and finally Edinburgh.';
/** The dummy application of the manual test: 15 March 2027 to 2 April 2027, a trip through London, Bath and Edinburgh. (19 headings.) */
async function dummyTrip(token, appId) {
  const res = await correct(token, appId, 0, [
    { questionId: 'q1_5', value: TRIP },
    { questionId: 'q1_6', value: '2027-03-15' },
    { questionId: 'q1_7', value: '2027-04-02' },
  ]);
  assert.equal(res.status, 200, res.text);
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

const KEY = 'gsk_TESTONLY_ITINERARY_KEY_987654321';
const AI_ON = { AI_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: KEY };
let aiCalls = [];
let aiAnswer = null;
aiService.fetchImpl = async (url, init) => {
  const body = JSON.parse(init.body);
  aiCalls.push({ url, init, body });
  return aiAnswer(body);
};
const chatResponse = (content) => new Response(JSON.stringify({ model: 'x', choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }), { status: 200 });
const userOf = (body) => body.messages[1].content;
/** The headings the prompt lists, and the places it names. */
const headingsOf = (body) => [...userOf(body).matchAll(/^\d+\. (.+?)(?: \((?:includes|the arrival)[^)]*\))?$/gm)].map((m) => m[1]);
const placesOf = (body) => ((/Places the applicant named, in order: (.+)/.exec(userOf(body)) || [])[1] || '').split('; ').filter(Boolean);
/** A good answer: one plain sentence for each heading, the places in the order named. */
function followingAnswer(body) {
  const headings = headingsOf(body);
  const places = placesOf(body);
  const verbs = ['Wander through', 'Spend the day in', 'Take a slow walk around', 'Explore the streets of', 'Visit the museums of', 'Enjoy the parks of'];
  return JSON.stringify({
    descriptions: headings.map((_, i) => {
      const place = places.length ? places[Math.min(places.length - 1, Math.floor((i / headings.length) * places.length))] : 'the city';
      if (i === 0) return `Arrive in ${place} and settle in, then take a gentle first look around the area.`;
      if (i === headings.length - 1) return `Spend a last quiet morning in ${place} before setting off on the journey home.`;
      return `${verbs[i % verbs.length]} ${place} at an easy pace, with time to rest between visits.`;
    }),
  });
}
function useAi(env, answer = (body) => chatResponse(followingAnswer(body))) {
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
  'Testfirst', 'Testlast', 'test.plan.applicant@example.com', '7700 900123', SECRET_ID, SECRET_NI, SECRET_DETAILS, 'Sindhi', 'Testmother', 'Testsurname',
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
    ['PUT', base(id), { text: 'A hand-written plan.', basedOnVersion: 0 }],
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
    // The owner of the application is an applicant too: also refused.
    assert.equal((await api(method, path, { token: app.token, body })).status, 403, `the owner ${method} ${path}`);
  }
  assert.deepEqual(await auditRows(), auditBefore);
  assert.equal((await rowsOf(id)).length, 0);

  assert.equal((await view(admin.token, id)).status, 200);
  const generated = await generate(admin.token, id);
  assert.equal(generated.status, 201, generated.text);
  assert.equal(generated.headers.get('cache-control'), 'no-store');
  assert.equal((await save(admin.token, id, { text: 'A hand-written plan.', basedOnVersion: 1 })).status, 201);
  assert.equal((await approve(admin.token, id, { version: 2 })).status, 200);
});

test('the feature gate: while Tourist Visa is closed every itinerary route answers the fixed 404 and writes nothing', async () => {
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
  assert.equal((await rowsOf(app.appId)).length, 0);
});

test('status gates: a submitted or in-review application can have an itinerary; a completed one, a draft and an unknown id are refused', async () => {
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
    assert.equal(res.json.code, 'ITINERARY_NOT_AVAILABLE');
  }
  assert.equal((await rowsOf(app.appId)).length, 2, 'nothing was added to the completed application');
  assert.equal((await move(admin.token, app.appId, 'in_review')).status, 200, 'reopened');
  assert.equal((await view(admin.token, app.appId)).status, 200, 'and the itineraries are there again');

  const draft = await readyApplicant();
  for (const [method, path, body] of [['GET', base(draft.appId)], ['POST', `${base(draft.appId)}/generate`], ['PUT', base(draft.appId), { text: 'x', basedOnVersion: 0 }]]) {
    const res = await api(method, path, { token: admin.token, body });
    assert.equal(res.status, 404, `draft ${method}`);
    assert.equal(res.json.code, 'APPLICATION_NOT_FOUND');
  }
  assert.equal((await rowsOf(draft.appId)).length, 0);
  assert.equal((await view(admin.token, '64b64b64b64b64b64b64b64')).status, 404);
  assert.equal((await view(admin.token, 'not-an-id')).status, 404);
});

// ---------------------------------------------------------------------------
// Generating: the template and the AI
// ---------------------------------------------------------------------------

test('with the AI off a template itinerary is written: version 1, the skeleton from the dates, the reason recorded, the text encrypted at rest, one audit row without text', async () => {
  aiOff();
  const app = await submitted();
  const admin = await makeAdmin();

  const empty = await view(admin.token, app.appId);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.json.data.versions, []);
  assert.equal(empty.json.data.latest, null);
  assert.equal(empty.json.data.stale, false);
  assert.equal(empty.json.data.blocker, null);
  assert.deepEqual(empty.json.data.ai, { available: false, code: 'AI_DISABLED' });
  assert.equal(empty.json.data.maxLength, 8000);

  const res = await generate(admin.token, app.appId);
  assert.equal(res.status, 201, res.text);
  const data = res.json.data;
  assert.deepEqual(data.created, { version: 1, source: 'template', fallbackReason: 'AI_DISABLED' });
  assert.equal(data.latest, 1);
  const itinerary = data.versions[0];
  assert.equal(itinerary.source, 'template');
  assert.equal(itinerary.status, 'draft');
  assert.equal(itinerary.factsHash, undefined, 'the hash is not sent');
  const sections = itinerary.text.split('\n\n');
  assert.equal(sections[0], 'Proposed itinerary');
  assert.equal(sections[1], 'This is a proposed plan for the visit, and it may change.');
  assert.equal(sections.length, 2 + 15, '1 to 15 March 2027 is 15 days');
  assert.equal(sections[2].split('\n')[0], 'Day 1, Monday 1 March 2027');
  assert.equal(sections[16].split('\n')[0], 'Day 15, Monday 15 March 2027');
  assert.equal(itinerary.text.includes('Testfirst'), false, 'the itinerary has no name in it');

  const rows = await rowsOf(app.appId);
  assert.equal(rows.length, 1);
  assert.match(rows[0].text, /^enc:v1:/);
  assert.equal(JSON.stringify(rows[0]).includes('Proposed itinerary'), false, 'the text is not in the database in plain form');
  assert.equal(JSON.stringify(rows[0]).includes('Day 1'), false);
  assert.equal(rows[0].source, 'template');
  assert.equal(rows[0].fallbackReason, 'AI_DISABLED');
  assert.equal(rows[0].aiAttempted, false);
  assert.equal(rows[0].promptVersion, undefined);
  assert.equal(rows[0].status, 'draft');
  assert.match(rows[0].factsHash, /^[0-9a-f]{64}$/);
  assert.equal(String(rows[0].createdBy), admin.userId);

  const generateRows = await auditRows({ applicationId: oid(app.appId), action: 'itinerary_generate' });
  assert.equal(generateRows.length, 1);
  assert.equal(generateRows[0].letterVersion, 1);
  assert.equal(generateRows[0].letterSource, 'template');
  assert.equal(generateRows[0].model, undefined);
});

test('the dummy application: with the AI on, 19 headings with the right weekdays, descriptions with no digit, London then Bath then Edinburgh; the AI sees only the itinerary facts', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  await dummyTrip(admin.token, app.appId);
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
  const prompt = userOf(aiCalls[0].body);
  assert.match(prompt, /There are exactly 19 headings, one for each day/);
  assert.match(prompt, /Planned arrival date: 15 March 2027/);
  assert.match(prompt, /Planned departure date: 2 April 2027/);
  assert.match(prompt, /Length of the visit: 18 nights/);
  assert.match(prompt, /Places the applicant named, in order: London; Bath; Edinburgh/);
  assert.equal(/Part 9|conviction|National Insurance|passport|savings|income|earnings|employer|£/i.test(prompt), false);
  assert.equal(/\bTestfirst\b|\bTestlast\b/.test(prompt), false);

  const itinerary = res.json.data.versions[0];
  assert.equal(itinerary.source, 'ai');
  assert.equal(itinerary.model, DEFAULT_GROQ_MODEL);
  const sections = itinerary.text.split('\n\n');
  assert.equal(sections.length, 21, 'the title, the note and 19 days');
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  sections.slice(2).forEach((section, i) => {
    const [heading, description, ...rest] = section.split('\n');
    const date = new Date(Date.UTC(2027, 2, 15 + i));
    const month = date.getUTCMonth() === 2 ? 'March' : 'April';
    assert.equal(heading, `Day ${i + 1}, ${WEEKDAYS[(date.getUTCDay() + 6) % 7]} ${date.getUTCDate()} ${month} 2027`);
    assert.equal(rest.length, 0, 'one description for each heading');
    assert.equal(/\d/.test(description), false, `no digit in the description of day ${i + 1}`);
  });
  assert.equal(sections[2].split('\n')[0], 'Day 1, Monday 15 March 2027');
  assert.equal(sections[20].split('\n')[0], 'Day 19, Friday 2 April 2027');
  const body = sections.slice(2).map((s) => s.split('\n')[1]).join('\n');
  assert.ok(body.indexOf('London') < body.indexOf('Bath') && body.indexOf('Bath') < body.indexOf('Edinburgh'), 'the places are in the order named');

  const [row] = await rowsOf(app.appId);
  assert.equal(row.source, 'ai');
  assert.equal(row.model, DEFAULT_GROQ_MODEL);
  assert.equal(row.aiAttempted, true);
  assert.equal(row.aiAttempts, 1);
  assert.equal(row.promptVersion, ITINERARY_PROMPT_VERSION);
  assert.equal(row.fallbackReason, undefined);
  assert.match(row.text, /^enc:v1:/);
  assertNone(JSON.stringify(row), ['Edinburgh', 'Day 19'], 'the stored row');
  const [audit] = await auditRows({ applicationId: oid(app.appId), action: 'itinerary_generate' });
  assert.equal(audit.letterSource, 'ai');
  assert.equal(audit.model, DEFAULT_GROQ_MODEL);
  assert.equal(audit.promptVersion, ITINERARY_PROMPT_VERSION);
  assertNone(JSON.stringify(audit), ['Edinburgh', 'London', 'Day 1'], 'the audit row');
  aiOff();
});

test('every way the AI can fail gives a template itinerary, never an error to the administrator, and records only a fixed code', async () => {
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
      ['an answer cut short', () => new Response(JSON.stringify({ model: 'x', choices: [{ message: { content: '{"descriptions": [' }, finish_reason: 'length' }] }), { status: 200 }), 'AI_TRUNCATED'],
    ];
    for (const [label, answer, code] of scripts) {
      useAi(AI_ON, answer);
      const res = await generate(admin.token, app.appId);
      assert.equal(res.status, 201, `${label}: ${res.text}`);
      assert.equal(res.json.data.created.source, 'template', label);
      assert.equal(res.json.data.created.fallbackReason, code, label);
      assert.equal(res.json.data.versions[0].text.split('\n\n').length, 17, label);
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
  const rows = await rowsOf(app.appId);
  assert.equal(rows.length, results.length + 1);
  assert.ok(rows.every((r) => r.source === 'template' && r.aiAttempted === true && r.promptVersion === ITINERARY_PROMPT_VERSION), 'the provider was asked each time');
  assertNone(lines.lines.join('\n'), [KEY, 'SECRET-PROVIDER-BODY', 'SECRET-NETWORK-ERROR', 'Testfirst', 'Testlast', 'Planned arrival', 'Bearer', 'Proposed itinerary'], 'the log');
});

test('an answer that fails the checks is asked for ONCE more (with the reminder) and then the template is used with a fixed code; both requests are counted; the rejected answers are kept nowhere', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  const good = followingAnswer;
  const mutate = (body, fn) => { const list = JSON.parse(good(body)).descriptions; return JSON.stringify({ descriptions: fn(list) }); };
  const kinds = [
    ['not JSON at all', () => 'Sure, here are your days: 1. ...', 'ITINERARY_BAD_JSON'],
    ['the wrong number of entries', (body) => mutate(body, (l) => l.slice(1)), 'ITINERARY_WRONG_COUNT'],
    ['an entry that is not a string', (body) => mutate(body, (l) => l.map((d, i) => (i === 4 ? 12 : d))), 'ITINERARY_BAD_ENTRY'],
    ['a digit', (body) => mutate(body, (l) => l.map((d, i) => (i === 4 ? 'Spend the day in London for 3 hours in the museums.' : d))), 'ITINERARY_FORBIDDEN_CONTENT'],
    ['a booking', (body) => mutate(body, (l) => l.map((d, i) => (i === 4 ? 'Spend the day in London at the pre-booked museum visit.' : d))), 'ITINERARY_BANNED_PHRASE'],
    ['a place that was not named', (body) => mutate(body, (l) => l.map((d, i) => (i === 4 ? 'Spend the day in Oxford walking by the river and the colleges.' : d))), 'ITINERARY_PLACE_NOT_NAMED'],
  ];
  for (const [label, answer, code] of kinds) {
    useAi(AI_ON, (body) => chatResponse(answer(body)));
    const res = await generate(admin.token, app.appId);
    assert.equal(res.status, 201, `${label}: ${res.text}`);
    assert.equal(res.json.data.created.source, 'template', label);
    assert.equal(res.json.data.created.fallbackReason, code, label);
    assert.equal(aiCalls.length, 2, `${label}: asked once more, not twice`);
    assert.equal(userOf(aiCalls[0].body).includes(RETRY_REMINDER), false);
    assert.equal(userOf(aiCalls[1].body).includes(RETRY_REMINDER), true);
    const rows = await rowsOf(app.appId);
    const last = rows[rows.length - 1];
    assert.equal(last.aiAttempts, 2, label);
    assert.equal(last.promptVersion, ITINERARY_PROMPT_VERSION);
    assert.equal(res.json.data.versions[0].text.includes('Oxford'), false);
    assert.equal(res.json.data.versions[0].text.includes('pre-booked'), false);
  }
  // The first answer bad, the second good: kept, as an AI itinerary, counted as two requests.
  let n = 0;
  useAi(AI_ON, (body) => chatResponse(n++ === 0 ? 'not json' : good(body)));
  const second = await generate(admin.token, app.appId);
  assert.equal(second.json.data.created.source, 'ai');
  assert.equal(aiCalls.length, 2);
  const rows = await rowsOf(app.appId);
  assert.equal(rows[rows.length - 1].aiAttempts, 2);
  assert.equal(rows[rows.length - 1].fallbackReason, undefined);
  aiOff();
});

test('the AI circuit breaker shows up as a template itinerary without asking the provider after three failures in a row', async () => {
  const admin = await makeAdmin();
  const app = await submitted();
  useAi(AI_ON, () => new Response('x', { status: 401 }));
  const reasons = [];
  for (let i = 0; i < 5; i += 1) reasons.push((await generate(admin.token, app.appId)).json.data.created.fallbackReason);
  assert.deepEqual(reasons, ['AI_PROVIDER_REJECTED', 'AI_PROVIDER_REJECTED', 'AI_PROVIDER_REJECTED', 'AI_CIRCUIT_OPEN', 'AI_CIRCUIT_OPEN']);
  assert.equal(aiCalls.length, 3);
  assert.deepEqual((await rowsOf(app.appId)).map((r) => r.aiAttempted), [true, true, true, false, false], 'a skipped request does not count as a request to the AI');
  aiOff();
});

test('the limits are SHARED with the cover letter: requests for either use the same daily and per-administrator allowance, and the provider is not asked beyond it', async () => {
  const one = await makeAdmin();
  const two = await makeAdmin();
  const app = await submitted();
  await TouristVisaCoverLetter.collection.deleteMany({});
  await TouristVisaItinerary.collection.deleteMany({});

  useAi({ ...AI_ON, AI_ADMIN_HOURLY_LIMIT: '3', AI_DAILY_LIMIT: '5' });
  const letter = (token) => api('POST', `/admin/applications/${app.appId}/cover-letter/generate`, { token });
  // The cover letter's AI (the fake answers JSON, so the letter falls back to its template after asking: that is still a request).
  assert.equal((await letter(one.token)).status, 201);
  assert.equal(aiCalls.length, 1);
  assert.equal((await generate(one.token, app.appId)).json.data.created.source, 'ai');
  assert.equal((await generate(one.token, app.appId)).json.data.created.source, 'ai');
  assert.equal(aiCalls.length, 3, 'the cover letter\'s request and two itineraries');
  const held = await generate(one.token, app.appId);
  assert.equal(held.json.data.created.fallbackReason, 'AI_ADMIN_LIMIT', 'three requests by this administrator, over both');
  assert.equal(aiCalls.length, 3);
  const heldLetter = await letter(one.token);
  assert.equal(heldLetter.json.data.created.fallbackReason, 'AI_ADMIN_LIMIT', 'and the cover letter is held up by the itineraries');
  assert.equal(aiCalls.length, 3);

  // Another administrator has their own hourly allowance but shares the daily one.
  assert.equal((await generate(two.token, app.appId)).json.data.created.source, 'ai');
  assert.equal((await generate(two.token, app.appId)).json.data.created.source, 'ai');
  assert.equal(aiCalls.length, 5);
  const daily = await generate(two.token, app.appId);
  assert.equal(daily.json.data.created.fallbackReason, 'AI_DAILY_LIMIT');
  assert.equal((await letter(two.token)).json.data.created.fallbackReason, 'AI_DAILY_LIMIT');
  assert.equal(aiCalls.length, 5, 'the provider was not asked');

  // Hand-written and template versions do not count; the count is over both collections.
  assert.equal((await save(two.token, app.appId, { text: 'By hand.', basedOnVersion: daily.json.data.latest })).status, 201);
  assert.equal(await aiUsage.countAiRequests({ since: new Date(Date.now() - 3600 * 1000) }), 5);
  assert.equal(await itineraries.countAiRequests({ since: new Date(Date.now() - 3600 * 1000) }), 5);
  assert.equal(await itineraries.countAiRequests({ since: new Date(Date.now() - 3600 * 1000), adminId: one.userId }), 3);
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
  const [first] = await rowsOf(app.appId);

  const saved = await save(admin.token, app.appId, { text: 'EDITED-ITINERARY-TEXT written by hand.\r\n\r\nDay 1', basedOnVersion: 1 });
  assert.equal(saved.status, 201, saved.text);
  const data = saved.json.data;
  assert.equal(data.latest, 2);
  assert.equal(data.versions[0].source, 'admin');
  assert.equal(data.versions[0].text, 'EDITED-ITINERARY-TEXT written by hand.\n\nDay 1');
  assert.equal(data.versions[1].version, 1, 'the earlier version is still there');

  const rows = await rowsOf(app.appId);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], first, 'version 1 is untouched');
  assert.match(rows[1].text, /^enc:v1:/);
  assert.equal(JSON.stringify(rows[1]).includes('EDITED-ITINERARY'), false, 'the edit is encrypted at rest');
  assert.equal(rows[1].source, 'admin');
  assert.equal(rows[1].aiAttempted, false);
  assert.equal(rows[1].promptVersion, undefined);
  assert.equal(String(rows[1].createdBy), admin.userId);

  // Another administrator who still has version 1 open is told, and nothing is overwritten.
  const stale = await save(other.token, app.appId, { text: 'A later edit from an old screen.', basedOnVersion: 1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.code, 'ITINERARY_CHANGED');
  assert.equal((await rowsOf(app.appId)).length, 2);
  // Generating again adds a version and never replaces the edit.
  const regenerated = await generate(other.token, app.appId);
  assert.equal(regenerated.json.data.latest, 3);
  assert.equal(regenerated.json.data.versions[1].text, 'EDITED-ITINERARY-TEXT written by hand.\n\nDay 1');
});

test('editing: the request is checked (text, length, extra fields, the starting version) and a refusal writes nothing', async () => {
  aiOff();
  const admin = await makeAdmin();
  const app = await submitted();
  await generate(admin.token, app.appId);
  const before = await rowsOf(app.appId);
  const auditBefore = (await auditRows({ applicationId: oid(app.appId) })).length;
  const bad = [
    [{ text: 'x' }, 400, 'INVALID_REQUEST'],
    [{ basedOnVersion: 1 }, 400, 'INVALID_REQUEST'],
    [{ text: 'x', basedOnVersion: 1, extra: 1 }, 400, 'INVALID_REQUEST'],
    [{ text: 'x', basedOnVersion: '1' }, 400, 'INVALID_REQUEST'],
    [{ text: 'x', basedOnVersion: -1 }, 400, 'INVALID_REQUEST'],
    [{ text: 5, basedOnVersion: 1 }, 400, 'INVALID_TEXT'],
    [{ text: '   \n ', basedOnVersion: 1 }, 400, 'INVALID_TEXT'],
    [{ text: 'a'.repeat(8001), basedOnVersion: 1 }, 400, 'INVALID_TEXT'],
    [{ text: 'a\u0000b', basedOnVersion: 1 }, 400, 'INVALID_TEXT'],
    [{ text: 'x', basedOnVersion: 0 }, 409, 'ITINERARY_CHANGED'],
    [{ text: 'x', basedOnVersion: 2 }, 409, 'ITINERARY_CHANGED'],
    [['x'], 400, 'INVALID_REQUEST'],
  ];
  for (const [body, status, code] of bad) {
    const res = await save(admin.token, app.appId, body);
    assert.equal(res.status, status, JSON.stringify(body).slice(0, 60));
    assert.equal(res.json.code, code, JSON.stringify(body).slice(0, 60));
  }
  assert.deepEqual(await rowsOf(app.appId), before);
  assert.equal((await auditRows({ applicationId: oid(app.appId) })).length, auditBefore, 'a refused edit is not audited');
  assert.equal((await save(admin.token, app.appId, { text: 'a'.repeat(8000), basedOnVersion: 1 })).status, 201, 'exactly 8000 characters is fine');
});

test('approving: only the latest version, once, and the row changes in nothing but its approval', async () => {
  aiOff();
  const admin = await makeAdmin('Approving Admin');
  const app = await submitted();
  assert.equal((await approve(admin.token, app.appId, { version: 1 })).json.code, 'ITINERARY_NOT_FOUND', 'nothing to approve yet');
  await generate(admin.token, app.appId);
  await generate(admin.token, app.appId);
  const before = await rowsOf(app.appId);

  const old = await approve(admin.token, app.appId, { version: 1 });
  assert.equal(old.status, 409);
  assert.equal(old.json.code, 'ITINERARY_NOT_LATEST');
  assert.equal((await approve(admin.token, app.appId, { version: 3 })).json.code, 'ITINERARY_NOT_LATEST');
  for (const body of [{}, { version: '2' }, { version: 0 }, { version: 2, text: 'x' }, [2]]) assert.equal((await approve(admin.token, app.appId, body)).status, 400);
  assert.deepEqual(await rowsOf(app.appId), before, 'refusals change nothing');

  const ok = await approve(admin.token, app.appId, { version: 2 });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.data.versions[0].status, 'approved');
  assert.equal(ok.json.data.versions[0].approvedBy.name, 'Approving Admin');
  assert.ok(ok.json.data.versions[0].approvedAt);
  assert.equal(ok.json.data.versions[1].status, 'draft', 'the older version stays a draft');

  const after = await rowsOf(app.appId);
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
  const [audit] = await auditRows({ applicationId: oid(app.appId), action: 'itinerary_approve' });
  assert.equal(audit.letterVersion, 2);
});

// ---------------------------------------------------------------------------
// The stale rule
// ---------------------------------------------------------------------------

test('stale: a change to an answer the itinerary uses makes it stale; a change to one it does not use does not; nothing is regenerated by itself', async () => {
  aiOff();
  const admin = await makeAdmin();
  const app = await submitted();
  await generate(admin.token, app.appId);
  assert.equal((await view(admin.token, app.appId)).json.data.stale, false);

  // The phone number, and money, are not on the itinerary's allowlist: it stays current.
  const phone = await correct(admin.token, app.appId, 0, [{ questionId: 'q2_32', value: { countryCode: '+44', number: '7700 900555' } }]);
  assert.equal(phone.status, 200, phone.text);
  assert.equal((await view(admin.token, app.appId)).json.data.stale, false, 'a phone number is not used by the itinerary');
  const money = await correct(admin.token, app.appId, 1, [{ questionId: 'q6_3', value: { amount: 1700, currency: 'GBP' } }]);
  assert.equal(money.status, 200, money.text);
  assert.equal((await view(admin.token, app.appId)).json.data.stale, false, 'money is not used by the itinerary');

  // The departure date is.
  const dates = await correct(admin.token, app.appId, 2, [{ questionId: 'q1_7', value: '2027-03-20' }]);
  assert.equal(dates.status, 200, dates.text);
  const stale = await view(admin.token, app.appId);
  assert.equal(stale.json.data.stale, true);
  assert.equal(stale.json.data.versions.length, 1, 'nothing was regenerated by itself');
  assert.equal((await rowsOf(app.appId)).length, 1);

  // A stale itinerary cannot be approved.
  const refused = await approve(admin.token, app.appId, { version: 1 });
  assert.equal(refused.status, 409);
  assert.equal(refused.json.code, 'ITINERARY_STALE');

  // A new version (generated, or saved from the text) is current again, with the new dates.
  const fresh = await generate(admin.token, app.appId);
  assert.equal(fresh.json.data.stale, false);
  assert.equal(fresh.json.data.versions[0].text.split('\n\n').length, 2 + 20, '1 to 20 March 2027');
  assert.equal((await correct(admin.token, app.appId, 3, [{ questionId: 'q1_7', value: '2027-03-22' }])).status, 200);
  assert.equal((await view(admin.token, app.appId)).json.data.stale, true);
  const edited = await save(admin.token, app.appId, { text: 'The text, checked against the new answers.', basedOnVersion: 2 });
  assert.equal(edited.json.data.stale, false);
  assert.equal((await approve(admin.token, app.appId, { version: 3 })).status, 200);
  // Approved, and the trip description changes: it is flagged, and stays in the history as it was.
  assert.equal((await correct(admin.token, app.appId, 4, [{ questionId: 'q1_5', value: 'Only Cardiff this time.' }])).status, 200);
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
  const before = await rowsOf(app.appId);

  for (const attempt of [
    () => TouristVisaItinerary.updateOne({ applicationId: id }, { $set: { text: 'x' } }),
    () => TouristVisaItinerary.updateMany({ applicationId: id }, { $set: { source: 'ai' } }),
    () => TouristVisaItinerary.findOneAndUpdate({ applicationId: id }, { $set: { status: 'approved' } }),
    () => TouristVisaItinerary.replaceOne({ applicationId: id }, { applicationId: id }),
    () => TouristVisaItinerary.deleteOne({ applicationId: id }),
    () => TouristVisaItinerary.deleteMany({ applicationId: id }),
    () => TouristVisaItinerary.findOneAndDelete({ applicationId: id }),
    async () => { const doc = await TouristVisaItinerary.findOne({ applicationId: id }); doc.status = 'approved'; await doc.save(); },
    () => TouristVisaItinerary.bulkWrite([{ deleteOne: { filter: { applicationId: id } } }]),
  ]) {
    await assert.rejects(attempt(), /append-only/);
  }
  assert.deepEqual(await rowsOf(app.appId), before);
  // There is no route to change or remove a version.
  for (const method of ['DELETE', 'PATCH']) assert.ok([404, 405].includes((await api(method, base(app.appId), { token: admin.token })).status));
  assert.deepEqual(await rowsOf(app.appId), before);
  // The repository approves a draft once, and not twice.
  const draft = { applicationId: id, version: 1, adminId: oid(admin.userId), at: new Date() };
  assert.equal(await itineraries.approve(draft), true);
  const another = await makeAdmin();
  assert.equal(await itineraries.approve({ ...draft, adminId: oid(another.userId), at: new Date(Date.now() + 60000) }), false);
  assert.equal(String((await rowsOf(app.appId))[0].approvedBy), admin.userId, 'the first approval stands');
  assert.equal(await itineraries.approve({ ...draft, version: 9 }), false);
  // It is its own collection, not the cover letter's.
  assert.equal(TouristVisaItinerary.collection.collectionName, 'touristvisaitineraries');
  assert.equal(await TouristVisaCoverLetter.collection.countDocuments({ applicationId: id }), 0);
});

test('two versions cannot share a number: a second writer with the same number is told the itinerary changed', async () => {
  aiOff();
  const admin = await makeAdmin();
  const app = await submitted();
  await generate(admin.token, app.appId);
  const row = (await rowsOf(app.appId))[0];
  await assert.rejects(
    itineraries.append({ applicationId: row.applicationId, version: 1, text: 'x', source: 'admin', aiAttempted: false, factsHash: 'a'.repeat(64), basedOnRevision: 0, createdBy: row.createdBy, createdAt: new Date() }),
    (error) => error.statusCode === 409 && error.code === 'ITINERARY_CHANGED'
  );
  const results = await Promise.all([generate(admin.token, app.appId), generate(admin.token, app.appId), generate(admin.token, app.appId)]);
  assert.ok(results.every((r) => [201, 409].includes(r.status)), results.map((r) => r.status).join());
  const versions = (await rowsOf(app.appId)).map((r) => r.version);
  assert.equal(new Set(versions).size, versions.length);
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
});

test('a text is bound to its application and version: a copy moved to another version cannot be read', async () => {
  aiOff();
  const admin = await makeAdmin();
  const app = await submitted();
  await generate(admin.token, app.appId);
  await generate(admin.token, app.appId);
  const [one, two] = await rowsOf(app.appId);
  await TouristVisaItinerary.collection.updateOne({ _id: two._id }, { $set: { text: one.text } });
  const res = await view(admin.token, app.appId);
  assert.equal(res.status, 500);
  assert.equal(res.json.code, 'ITINERARY_UNREADABLE');
  assertNone(res.text, ['Day 1', 'Proposed itinerary'], 'the error');
});

test('audit rows hold ids and fixed words only: the four actions are recorded before the data is returned, with no text', async () => {
  aiOff();
  const admin = await makeAdmin();
  const app = await submitted();
  await view(admin.token, app.appId);
  await generate(admin.token, app.appId);
  await save(admin.token, app.appId, { text: 'AUDIT-TEST-TEXT by hand', basedOnVersion: 1 });
  await approve(admin.token, app.appId, { version: 2 });
  const rows = await auditRows({ applicationId: oid(app.appId), action: /^itinerary_/ });
  assert.deepEqual(rows.map((r) => r.action), ['itinerary_view', 'itinerary_generate', 'itinerary_edit', 'itinerary_approve']);
  for (const r of rows) {
    assert.equal(String(r.adminId), admin.userId);
    assertNone(JSON.stringify(r), ['AUDIT-TEST-TEXT', 'Proposed itinerary', 'Day 1', 'Testfirst', 'Testlast', 'London'], `the ${r.action} audit row`);
  }
  assert.deepEqual(Object.keys(rows[0]).sort(), ['_id', 'action', 'adminId', 'applicationId', 'at'].sort(), 'a view records who and when');
  assert.equal(rows[1].letterSource, 'template');
  assert.equal(rows[2].letterSource, 'admin');
  assert.equal(rows[3].letterVersion, 2);
  assert.equal(rows[3].letterSource, 'admin');
  // The activity panel can read them.
  const activity = await api('GET', `/admin/applications/${app.appId}/activity`, { token: admin.token });
  const actions = activity.json.data.activity.map((a) => a.action);
  for (const action of ['itinerary_view', 'itinerary_generate', 'itinerary_edit', 'itinerary_approve']) assert.ok(actions.includes(action), action);
  assertNone(activity.text, ['AUDIT-TEST-TEXT', 'Proposed itinerary'], 'the activity');
});

test('the itinerary never reaches an applicant, and no error or log line holds an itinerary, a fact, a prompt or the key', async () => {
  const app = await submitted();
  const admin = await makeAdmin();
  const lines = capture();
  try {
    useAi(AI_ON);
    await generate(admin.token, app.appId);
    await save(admin.token, app.appId, { text: 'ITINERARY-PRIVACY-TEXT', basedOnVersion: 1 });
    const errors = [
      await save(admin.token, app.appId, { text: 'ITINERARY-PRIVACY-TEXT-2', basedOnVersion: 0 }),
      await save(admin.token, app.appId, { text: 'x', extra: 'ITINERARY-PRIVACY-TEXT-3' }),
      await approve(admin.token, app.appId, { version: 1 }),
    ];
    for (const e of errors) assertNone(e.text, ['ITINERARY-PRIVACY-TEXT', 'Testfirst', 'Proposed itinerary', KEY], 'an error response');
    // A rejected AI answer is logged by its code only.
    useAi(AI_ON, () => chatResponse('{"descriptions": ["Spend the day in Oxford with the SECRET-LOG-WORD museums."]}'));
    await generate(admin.token, app.appId);
  } finally {
    lines.restore();
    aiOff();
  }
  assertNone(lines.lines.join('\n'), ['ITINERARY-PRIVACY-TEXT', 'SECRET-LOG-WORD', 'Testfirst', 'Testlast', 'Planned arrival', KEY, 'Bearer', 'SYSTEM', 'Proposed itinerary'], 'the log');
  assert.ok(lines.lines.some((line) => line.includes('ITINERARY_BAD_ENTRY') || line.includes('ITINERARY_WRONG_COUNT')), 'the rejection is logged by its code');

  // Every applicant-facing response is free of the itinerary.
  for (const path of ['/applications/me', '/applications/me/review']) {
    const res = await api('GET', path, { token: app.token });
    assert.equal(res.status, 200);
    assertNone(res.text, ['ITINERARY-PRIVACY-TEXT', 'Proposed itinerary', 'itinerary', 'Itinerary'], path);
  }
});
