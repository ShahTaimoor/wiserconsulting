'use strict';

// Step 8j-3, B6: every Tourist Visa API answer carries Cache-Control: no-store (applicant answers, drafts, the list of files, the review, the
// admin lists and detail, the letter, the itinerary, the notes, the audit rows, and every error answer), except the public status answer, which
// keeps its short public caching. One shared middleware (middleware/touristVisaNoStore.js), tested per router and through the real index.js.

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
const touristVisaNoStore = require('../middleware/touristVisaNoStore');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const adminRoutes = require('../routes/touristVisaAdminRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const { startIndex, waitUntilUp, rawRequest } = require('./helpers/childApp');

// ---------------------------------------------------------------------------------------------- the middleware

function runMiddleware(req) {
  const headers = {};
  const res = { set: (name, value) => { headers[name] = value; return res; } };
  return new Promise((resolve) => touristVisaNoStore(req, res, () => resolve(headers)));
}

test('the middleware sets no-store on every request, and skips only GET <mount>/status', async () => {
  for (const [method, path] of [['GET', '/applications/me'], ['POST', '/applications'], ['PUT', '/applications/me/sections/1'], ['DELETE', '/applications/me/documents/x'], ['GET', '/admin/applications'], ['GET', '/rates'], ['GET', '/'], ['POST', '/status'], ['GET', '/status/'], ['GET', '/status/anything'], ['GET', '/statuses'], ['HEAD', '/status']]) {
    assert.deepEqual(await runMiddleware({ method, path }), { 'Cache-Control': 'no-store' }, `${method} ${path}`);
  }
  assert.deepEqual(await runMiddleware({ method: 'GET', path: '/status' }), {}, 'the public status answer is left alone');
});

test('both routers put the no-store layer before every route, so even an unmatched path and an error answer carry it', () => {
  for (const [name, router] of [['applicant router', touristVisaRoutes], ['admin router', adminRoutes]]) {
    const at = router.stack.findIndex((layer) => layer.handle === touristVisaNoStore);
    assert.ok(at >= 0, `${name} uses the shared middleware`);
    const firstRoute = router.stack.findIndex((layer) => layer.route || layer.name === 'router');
    assert.ok(at < firstRoute, `${name}: before any route or sub-router`);
    const sign = router.stack.findIndex((layer) => layer.handle && layer.handle.name === 'isAuthorized');
    if (sign >= 0) assert.ok(at < sign, `${name}: before the sign-in check, so a 401 carries it`);
  }
});

// ---------------------------------------------------------------------------------------------- the routers, answer by answer

let mongod;
let server;
let port;
let standalonePort;
let standaloneServer;
let applicant;
let admin;
let other;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.init();
  const make = async (name, role) => {
    const user = await User.create({ name, email: `${name.replace(/\s+/g, '.').toLowerCase()}@example.com`, password: 'not-a-real-password', role });
    return { id: String(user._id), token: jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
  };
  applicant = await make('Store Applicant', 0);
  admin = await make('Store Admin', 1);
  other = await make('Store Other', 0);
  const app = express();
  app.use('/api/tourist-visa', touristVisaBodyParser);
  app.use(express.json());
  app.use('/api/tourist-visa', touristVisaRoutes);
  app.use(errorHandler);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
  // The admin router on its own, with nothing in front of it (no sign-in, no parent): it must still mark its answers.
  const solo = express();
  solo.use('/solo-admin', adminRoutes);
  solo.use(errorHandler);
  await new Promise((resolve) => { standaloneServer = solo.listen(0, '127.0.0.1', resolve); });
  standalonePort = standaloneServer.address().port;
}, { timeout: 120000 });

after(async () => {
  for (const s of [server, standaloneServer]) if (s) await new Promise((resolve) => s.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const get = (path, token, p = port) => rawRequest(p, { method: 'GET', path: `/api/tourist-visa${path}`, headers: token ? { Authorization: `Bearer ${token}` } : {} });
const send = (method, path, token, body) => rawRequest(port, { method, path: `/api/tourist-visa${path}`, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }) }, body });
const ID = '64b64b64b64b64b64b64b64b';

test('applicant router: answers, drafts, files, review, PDF and every error answer are no-store', async () => {
  const created = await send('POST', '/applications', applicant.token);
  assert.equal(created.status, 201);
  const answers = [
    ['create', created],
    ['401 anonymous', await get('/applications/me')],
    ['401 bad token', await get('/applications/me', 'not-a-token')],
    ['my application', await get('/applications/me', applicant.token)],
    ['404 no application', await get('/applications/me', other.token)],
    ['my files', await get('/applications/me/documents', applicant.token)],
    ['my review', await get('/applications/me/review', applicant.token)],
    ['save a section', await send('PUT', '/applications/me/sections/1', applicant.token, JSON.stringify({ answers: { q1_1: 'tourism' } }))],
    ['400 no answers in the body', await send('PUT', '/applications/me/sections/1', applicant.token, JSON.stringify({}))],
    ['404 unknown section', await send('PUT', '/applications/me/sections/ZZ', applicant.token, JSON.stringify({ answers: {} }))],
    ['delete a file that is not there', await send('DELETE', `/applications/me/documents/${ID}`, applicant.token)],
    ['submit before it is ready', await send('POST', '/applications/me/submit', applicant.token, JSON.stringify({ declarationAccepted: true }))],
    ['my PDF of a draft', await get('/applications/me/pdf/answers', applicant.token)],
    ['403 admin area, not an admin', await get('/admin/applications', applicant.token)],
    ['404 unknown path', await get('/no-such-route', applicant.token)],
  ];
  for (const [label, res] of answers) assert.equal(res.headers['cache-control'], 'no-store', `${label} (${res.status})`);
  assert.ok(answers.some(([, res]) => res.status === 200), 'the list holds real successes');
  assert.ok(answers.some(([, res]) => res.status >= 400), 'and real errors');
});

test('admin router (through the parent): lists, detail, activity, notes, flags, letter, itinerary, edit form and PDFs are no-store, errors included', async () => {
  const answers = [
    ['list', await get('/admin/applications', admin.token)],
    ['list with a search', await get('/admin/applications?q=test&status=submitted', admin.token)],
    ['bad query', await get('/admin/applications?status=nonsense', admin.token)],
    ['overview of an unknown id', await get(`/admin/applications/${ID}`, admin.token)],
    ['activity', await get(`/admin/applications/${ID}/activity`, admin.token)],
    ['notes', await get(`/admin/applications/${ID}/notes`, admin.token)],
    ['add a note', await send('POST', `/admin/applications/${ID}/notes`, admin.token, JSON.stringify({ kind: 'note', text: 'made-up' }))],
    ['flags', await send('PUT', `/admin/applications/${ID}/flags`, admin.token, JSON.stringify({ flags: [] }))],
    ['changes history', await get(`/admin/applications/${ID}/changes`, admin.token)],
    ['edit form', await get(`/admin/applications/${ID}/edit-form`, admin.token)],
    ['cover letter', await get(`/admin/applications/${ID}/cover-letter`, admin.token)],
    ['generate a cover letter', await send('POST', `/admin/applications/${ID}/cover-letter/generate`, admin.token)],
    ['itinerary', await get(`/admin/applications/${ID}/itinerary`, admin.token)],
    ['generate an itinerary', await send('POST', `/admin/applications/${ID}/itinerary/generate`, admin.token)],
    ['PDF of the answers', await get(`/admin/applications/${ID}/pdf/answers`, admin.token)],
    ['PDF of the letter', await get(`/admin/applications/${ID}/pdf/cover-letter`, admin.token)],
    ['PDF of the itinerary', await get(`/admin/applications/${ID}/pdf/itinerary`, admin.token)],
    ['a file link', await get(`/admin/applications/${ID}/documents/${ID}/link`, admin.token)],
    ['status change', await send('PATCH', `/admin/applications/${ID}/status`, admin.token, JSON.stringify({ status: 'in_review' }))],
    ['401 anonymous', await get('/admin/applications')],
    ['403 not an admin', await get('/admin/applications', applicant.token)],
  ];
  for (const [label, res] of answers) assert.equal(res.headers['cache-control'], 'no-store', `${label} (${res.status})`);
  assert.equal(answers.find(([label]) => label === 'list')[1].status, 200);
});

test('admin router on its own (no parent, no sign-in): an answer and an unmatched path are marked too', async () => {
  const unmatched = await rawRequest(standalonePort, { method: 'GET', path: '/solo-admin/nothing-here' });
  assert.equal(unmatched.status, 404);
  assert.equal(unmatched.headers['cache-control'], 'no-store');
});

// ---------------------------------------------------------------------------------------------- the real index.js

test('the real server: Tourist Visa answers are no-store, including refusals from the body parser and the feature gate; the status answer keeps its public caching', async () => {
  const db = await MongoMemoryServer.create();
  const secret = 'made-up-jwt-secret-for-the-child';
  const env = { MONGODB_URI: db.getUri(), NODE_ENV: 'test', TOURIST_VISA_ENABLED: 'true', JWT_SECRET: secret, FIELD_ENCRYPTION_KEY: process.env.FIELD_ENCRYPTION_KEY };
  // The database is stopped in an outer finally, so a failing assertion cannot leave it running (it would keep the test process alive).
  try {
  const open = await startIndex(env);
  try {
    await waitUntilUp(open);
    const status = await rawRequest(open.port, { path: '/api/tourist-visa/status' });
    assert.equal(status.status, 200);
    assert.deepEqual(status.json, { open: true });
    assert.equal(status.headers['cache-control'], 'public, max-age=60', 'the status answer keeps its caching');
    const token = jwt.sign({ id: ID }, secret, { expiresIn: '1h' });
    const refusals = [
      ['401 anonymous', await rawRequest(open.port, { path: '/api/tourist-visa/applications/me' })],
      ['401 unknown user', await rawRequest(open.port, { path: '/api/tourist-visa/applications/me', headers: { Authorization: `Bearer ${token}` } })],
      ['415 not JSON', await rawRequest(open.port, { method: 'PUT', path: '/api/tourist-visa/applications/me/sections/1', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${token}` }, body: 'a=b' })],
      ['400 broken JSON', await rawRequest(open.port, { method: 'PUT', path: '/api/tourist-visa/applications/me/sections/1', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{"a":' })],
      ['403 foreign origin', await rawRequest(open.port, { method: 'POST', path: '/api/tourist-visa/applications', headers: { Origin: 'https://evil.example.org', Authorization: `Bearer ${token}` } })],
      ['admin area, anonymous', await rawRequest(open.port, { path: '/api/tourist-visa/admin/applications' })],
      ['status with a trailing slash is not the public answer', await rawRequest(open.port, { path: '/api/tourist-visa/status/' })],
      ['POST to the status path', await rawRequest(open.port, { method: 'POST', path: '/api/tourist-visa/status', headers: { Authorization: `Bearer ${token}` } })],
    ];
    for (const [label, res] of refusals) assert.equal(res.headers['cache-control'], 'no-store', `${label} (${res.status})`);
    // The rest of the API is untouched: it does not get the header from this change.
    const other = await rawRequest(open.port, { path: '/api/approved-visas' });
    assert.notEqual(other.headers['cache-control'], 'no-store');
    // A refusal from the general rate limiter (before the router is reached) is marked too. 100 requests in 15 minutes are allowed for an
    // address; this loop uses cheap anonymous reads until the limiter answers.
    let limited = null;
    for (let i = 0; i < 150 && !limited; i += 1) {
      const res = await rawRequest(open.port, { path: '/api/tourist-visa/applications/me' });
      if (res.status === 429) limited = res;
    }
    assert.ok(limited, 'the general limiter answered at some point');
    assert.equal(limited.headers['cache-control'], 'no-store', 'the rate-limit refusal is not cached either');
  } finally {
    await open.stop();
  }
  // Closed: the gate's own answer was already no-store, and still is; the status answer says closed.
  const closed = await startIndex({ MONGODB_URI: db.getUri(), NODE_ENV: 'test' });
  try {
    await waitUntilUp(closed);
    const answer = await rawRequest(closed.port, { path: '/api/tourist-visa/applications/me' });
    assert.equal(answer.status, 404);
    assert.equal(answer.json.code, 'FEATURE_CLOSED');
    assert.equal(answer.headers['cache-control'], 'no-store');
    const status = await rawRequest(closed.port, { path: '/api/tourist-visa/status' });
    assert.deepEqual(status.json, { open: false });
    assert.equal(status.headers['cache-control'], 'public, max-age=60');
  } finally {
    await closed.stop();
  }
  } finally {
    await db.stop();
  }
});
