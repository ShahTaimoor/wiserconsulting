'use strict';

// Step 8j-3, B3: forged cross-site requests. One shared middleware (middleware/touristVisaOriginGuard.js), tested three ways: the rule itself
// (no server), the real Tourist Visa routers with a representative route of each kind (JSON, body-less, multipart upload, delete, admin write),
// and the REAL index.js started in a child process (before CORS, only while the feature is open). Made-up data only.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.TOURIST_VISA_ENABLED = 'true';
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const { createOriginGuard, STATE_CHANGING, REFUSED_CODE } = require('../middleware/touristVisaOriginGuard');
const { getAllowedOrigins } = require('../config/allowedOrigins');
const { startIndex, waitUntilUp, rawRequest } = require('./helpers/childApp');

const ALLOWED = 'http://localhost:3000';
const FOREIGN = 'https://evil.example.org';

// ---------------------------------------------------------------------------------------------- the rule

/** Runs the middleware on a fake request; resolves 'passed' or the error it passed on. */
function run(guard, { method = 'POST', headers = {} } = {}) {
  return new Promise((resolve) => {
    guard({ method, headers }, {}, (error) => resolve(error || 'passed'));
  });
}
const lower = (headers) => Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));

test('the allowed origins are one shared list: the local ones, the two production ones, and FRONTEND_URL when it is set', () => {
  const list = getAllowedOrigins({ FRONTEND_URL: 'https://app.example.test' });
  assert.deepEqual(list, ['https://app.example.test', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001', 'https://wiserconsulting.info', 'https://www.wiserconsulting.info']);
  assert.deepEqual(getAllowedOrigins({}), list.slice(1));
});

test('a state-changing request with a foreign Origin is a 403 ORIGIN_NOT_ALLOWED, whatever else it carries', async () => {
  const guard = createOriginGuard({ getOrigins: () => [ALLOWED] });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const extra of [{}, { Authorization: 'Bearer abc' }, { Cookie: 'token=abc' }, { Authorization: 'Bearer abc', Cookie: 'token=abc' }]) {
      const result = await run(guard, { method, headers: lower({ Origin: FOREIGN, ...extra }) });
      assert.equal(result.statusCode, 403, `${method} ${Object.keys(extra)}`);
      assert.equal(result.code, REFUSED_CODE);
      assert.equal(result.message.includes('evil'), false, 'the answer never repeats the origin');
    }
  }
});

test('Origin is compared exactly: other schemes, ports, subdomains, a trailing slash, case, "null" and an empty value are all foreign', async () => {
  const guard = createOriginGuard({ getOrigins: () => [ALLOWED] });
  for (const origin of ['http://localhost:3001', 'https://localhost:3000', 'http://localhost:3000/', 'HTTP://LOCALHOST:3000', 'http://localhost:3000.evil.example', 'http://x.localhost:3000', 'null', '', ' http://localhost:3000', '*']) {
    const result = await run(guard, { headers: { origin, authorization: 'Bearer abc' } });
    assert.equal(result.statusCode, 403, JSON.stringify(origin));
  }
  assert.equal(await run(guard, { headers: { origin: ALLOWED, authorization: 'Bearer abc' } }), 'passed');
});

test('an allowed Origin passes, with a token in the header, with a cookie only, or with nothing (the sign-in check decides, not this rule)', async () => {
  const guard = createOriginGuard({ getOrigins: () => [ALLOWED] });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const extra of [{}, { authorization: 'Bearer abc' }, { cookie: 'token=abc' }]) {
      assert.equal(await run(guard, { method, headers: { origin: ALLOWED, ...extra } }), 'passed', `${method} ${Object.keys(extra)}`);
    }
  }
});

test('no Origin: a request with an Authorization Bearer header passes (with or without a cookie); a cookie-only request is a 403; a request with neither passes on to the 401', async () => {
  const guard = createOriginGuard({ getOrigins: () => [ALLOWED] });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(await run(guard, { method, headers: { authorization: 'Bearer abc' } }), 'passed');
    assert.equal(await run(guard, { method, headers: { authorization: 'Bearer abc', cookie: 'token=abc' } }), 'passed');
    const cookieOnly = await run(guard, { method, headers: { cookie: 'token=abc' } });
    assert.equal(cookieOnly.statusCode, 403, `${method} cookie only`);
    assert.equal(cookieOnly.code, REFUSED_CODE);
    assert.equal(await run(guard, { method, headers: {} }), 'passed', 'nothing that could sign in: left to the 401');
  }
  // An Authorization header that is not a Bearer token does not count as one.
  assert.equal((await run(guard, { headers: { authorization: 'Basic abc', cookie: 'token=abc' } })).statusCode, 403);
  assert.equal((await run(guard, { headers: { authorization: 'Bearer', cookie: 'token=abc' } })).statusCode, 403);
  assert.equal((await run(guard, { headers: { authorization: '', cookie: 'token=abc' } })).statusCode, 403);
  assert.equal((await run(guard, { headers: { cookie: '   ' } })), 'passed');
});

test('GET, HEAD and OPTIONS are never touched, even from a foreign origin', async () => {
  const guard = createOriginGuard({ getOrigins: () => [ALLOWED] });
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(await run(guard, { method, headers: { origin: FOREIGN, cookie: 'token=abc' } }), 'passed', method);
  }
  assert.deepEqual([...STATE_CHANGING].sort(), ['DELETE', 'PATCH', 'POST', 'PUT']);
});

test('the list is read when the request arrives: a changed FRONTEND_URL is honoured without a restart of the middleware', async () => {
  let origins = [ALLOWED];
  const guard = createOriginGuard({ getOrigins: () => origins });
  assert.equal((await run(guard, { headers: { origin: 'https://new.example.test', authorization: 'Bearer abc' } })).statusCode, 403);
  origins = [ALLOWED, 'https://new.example.test'];
  assert.equal(await run(guard, { headers: { origin: 'https://new.example.test', authorization: 'Bearer abc' } }), 'passed');
});

// ---------------------------------------------------------------------------------------------- the real routers

let mongod;
let server;
let port;
let applicant;
let admin;
const BOUNDARY = '----made-up-boundary';

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.init();
  const make = async (name, role) => {
    const user = await User.create({ name, email: `${name.replace(/\s+/g, '.').toLowerCase()}@example.com`, password: 'not-a-real-password', role });
    return { id: String(user._id), token: jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
  };
  applicant = await make('Origin Applicant', 0);
  admin = await make('Origin Admin', 1);
  const app = express();
  app.use('/api/tourist-visa', touristVisaBodyParser);
  app.use(express.json());
  app.use(cookieParser()); // as index.js: the cookie is read, so a cookie-only request would otherwise sign in
  app.use('/api/tourist-visa', touristVisaRoutes);
  app.use(errorHandler);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
}, { timeout: 120000 });

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const ID = '64b64b64b64b64b64b64b64b';
/** The representative state-changing routes, one of each kind: [label, method, path, who, body, contentType]. */
const ROUTES = [
  ['applicant: create (body-less POST)', 'POST', '/applications', 'applicant'],
  ['applicant: save a section (JSON PUT)', 'PUT', '/applications/me/sections/1', 'applicant', JSON.stringify({ answers: {} })],
  ['applicant: upload (multipart POST)', 'POST', '/applications/me/documents', 'applicant', `--${BOUNDARY}\r\nContent-Disposition: form-data; name="slot"\r\n\r\npassport\r\n--${BOUNDARY}--\r\n`, `multipart/form-data; boundary=${BOUNDARY}`],
  ['applicant: delete a file (DELETE)', 'DELETE', `/applications/me/documents/${ID}`, 'applicant'],
  ['applicant: submit (POST)', 'POST', '/applications/me/submit', 'applicant', JSON.stringify({ declarationAccepted: true })],
  ['admin: status (PATCH)', 'PATCH', `/admin/applications/${ID}/status`, 'admin', JSON.stringify({ status: 'in_review' })],
  ['admin: correct answers (PUT)', 'PUT', `/admin/applications/${ID}/changes`, 'admin', JSON.stringify({ expectedRevision: 0, reason: 'MADE-UP reason for the test', changes: [], dryRun: true })],
  ['admin: add a note (POST)', 'POST', `/admin/applications/${ID}/notes`, 'admin', JSON.stringify({ kind: 'note', text: 'made-up note' })],
  ['admin: flags (PUT)', 'PUT', `/admin/applications/${ID}/flags`, 'admin', JSON.stringify({ flags: [] })],
  ['admin: generate a cover letter (body-less POST)', 'POST', `/admin/applications/${ID}/cover-letter/generate`, 'admin'],
  ['admin: generate an itinerary (body-less POST)', 'POST', `/admin/applications/${ID}/itinerary/generate`, 'admin'],
  ['admin: save a cover letter (PUT)', 'PUT', `/admin/applications/${ID}/cover-letter`, 'admin', JSON.stringify({ text: 'made-up', basedOnVersion: 1 })],
  ['admin: approve an itinerary (POST)', 'POST', `/admin/applications/${ID}/itinerary/approve`, 'admin', JSON.stringify({ version: 1 })],
];

function send([, method, path, who, body, contentType], { origin, bearer = true, cookie = false } = {}) {
  const user = who === 'admin' ? admin : applicant;
  const headers = {};
  if (origin !== undefined) headers.Origin = origin;
  if (bearer) headers.Authorization = `Bearer ${user.token}`;
  if (cookie) headers.Cookie = `token=${user.token}`;
  if (body !== undefined) { headers['Content-Type'] = contentType || 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
  return rawRequest(port, { method, path: `/api/tourist-visa${path}`, headers, body });
}

test('a foreign Origin is a 403 ORIGIN_NOT_ALLOWED on every kind of state-changing route, with a valid token, and nothing is created', async () => {
  const before = await mongoose.connection.db.collection('touristvisaapplications').countDocuments({});
  for (const route of ROUTES) {
    for (const origin of [FOREIGN, 'null']) {
      const res = await send(route, { origin });
      assert.equal(res.status, 403, `${route[0]} from ${origin}: ${res.text}`);
      assert.equal(res.json.code, REFUSED_CODE);
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.equal(res.text.includes('evil'), false);
    }
  }
  assert.equal(await mongoose.connection.db.collection('touristvisaapplications').countDocuments({}), before);
});

test('a good Origin passes the guard on the same routes: the answer is whatever the route says, never the guard\'s 403', async () => {
  for (const route of ROUTES) {
    const res = await send(route, { origin: ALLOWED });
    assert.notEqual(res.status, 403, `${route[0]}: ${res.text}`);
    assert.notEqual(res.json && res.json.code, REFUSED_CODE, route[0]);
  }
  // And a real one works end to end.
  const created = await send(ROUTES[0], { origin: ALLOWED });
  assert.ok([200, 201].includes(created.status), `created or already there: ${created.status}`);
});

test('with no Origin: a Bearer token works on every kind of route; the same request carried only by the cookie is a 403; with neither it is the usual 401', async () => {
  for (const route of ROUTES) {
    const withToken = await send(route, {});
    assert.notEqual(withToken.status, 403, `${route[0]} with a token: ${withToken.text}`);
    const cookieOnly = await send(route, { bearer: false, cookie: true });
    assert.equal(cookieOnly.status, 403, `${route[0]} with only a cookie`);
    assert.equal(cookieOnly.json.code, REFUSED_CODE);
    const nothing = await send(route, { bearer: false });
    assert.equal(nothing.status, 401, `${route[0]} with nothing`);
  }
});

test('the body-less requests that were the worry (generate a letter, generate an itinerary, create an application) cannot be forged by a cookie alone', async () => {
  const before = await mongoose.connection.db.collection('touristvisaapplications').countDocuments({});
  const stranger = await make2();
  const res = await rawRequest(port, { method: 'POST', path: '/api/tourist-visa/applications', headers: { Cookie: `token=${stranger}` } });
  assert.equal(res.status, 403);
  assert.equal(await mongoose.connection.db.collection('touristvisaapplications').countDocuments({}), before, 'nothing was created');
  for (const kind of ['cover-letter', 'itinerary']) {
    const gen = await rawRequest(port, { method: 'POST', path: `/api/tourist-visa/admin/applications/${ID}/${kind}/generate`, headers: { Cookie: `token=${admin.token}`, Origin: FOREIGN } });
    assert.equal(gen.status, 403, kind);
  }
});
async function make2() {
  const user = await User.create({ name: 'Cookie Only', email: 'cookie.only@example.com', password: 'not-a-real-password' });
  return jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

test('reads are not touched by the guard: a GET with a foreign Origin or a cookie only is answered by the route itself', async () => {
  for (const path of ['/applications/me', '/admin/applications']) {
    const who = path.startsWith('/admin') ? admin : applicant;
    const res = await rawRequest(port, { method: 'GET', path: `/api/tourist-visa${path}`, headers: { Origin: FOREIGN, Cookie: `token=${who.token}` } });
    assert.notEqual(res.json && res.json.code, REFUSED_CODE, path);
    assert.ok([200, 404].includes(res.status), `${path}: ${res.status}`);
  }
});

test('every state-changing route of both routers is behind the guard: the guard is the first thing the applicant router does after the gate and the no-store header', () => {
  const guardIndex = touristVisaRoutes.stack.findIndex((layer) => layer.handle && layer.handle.name === 'touristVisaOriginGuard');
  const authIndex = touristVisaRoutes.stack.findIndex((layer) => layer.handle && layer.handle.name === 'isAuthorized');
  assert.ok(guardIndex >= 0, 'the guard is on the router');
  assert.ok(guardIndex < authIndex, 'it runs before the sign-in check, so a forged request never reaches the database');
  const firstRoute = touristVisaRoutes.stack.findIndex((layer) => layer.route || (layer.name === 'router'));
  assert.ok(guardIndex < firstRoute, 'and before any route');
});

// ---------------------------------------------------------------------------------------------- the real index.js

test('the real server: while the feature is open a foreign Origin gets the clean 403 (before CORS), a good Origin works; while it is closed nothing changes', async () => {
  // Open.
  const dbOpen = await MongoMemoryServer.create();
  const secret = 'made-up-jwt-secret-for-the-child';
  const open = await startIndex({ MONGODB_URI: dbOpen.getUri(), NODE_ENV: 'test', TOURIST_VISA_ENABLED: 'true', JWT_SECRET: secret, FIELD_ENCRYPTION_KEY: process.env.FIELD_ENCRYPTION_KEY });
  try {
    await waitUntilUp(open);
    // The child has its own database: the user is made there through the app's own sign-up and login.
    const signup = await rawRequest(open.port, { method: 'POST', path: '/api/signup', headers: { 'Content-Type': 'application/json', Origin: ALLOWED }, body: JSON.stringify({ name: 'Child Applicant', email: 'child.applicant@example.com', password: 'Made-Up-Pass-1' }) });
    assert.equal(signup.status, 201, signup.text);
    const loginBody = JSON.stringify({ email: 'child.applicant@example.com', password: 'Made-Up-Pass-1' });
    const login = await rawRequest(open.port, { method: 'POST', path: '/api/login', headers: { 'Content-Type': 'application/json', Origin: ALLOWED, 'Content-Length': Buffer.byteLength(loginBody) }, body: loginBody });
    assert.equal(login.status, 200, login.text);
    const token = login.json.data.token;

    const foreign = await rawRequest(open.port, { method: 'POST', path: '/api/tourist-visa/applications', headers: { Origin: FOREIGN, Authorization: `Bearer ${token}` } });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.json.code, REFUSED_CODE);
    assert.equal(foreign.headers['cache-control'], 'no-store');
    assert.equal(foreign.text.includes('evil'), false);

    const cookieOnly = await rawRequest(open.port, { method: 'POST', path: '/api/tourist-visa/applications', headers: { Cookie: `token=${token}` } });
    assert.equal(cookieOnly.status, 403, 'a cookie alone does not work');

    const good = await rawRequest(open.port, { method: 'POST', path: '/api/tourist-visa/applications', headers: { Origin: ALLOWED, Authorization: `Bearer ${token}` } });
    assert.equal(good.status, 201, good.text);
    const noOrigin = await rawRequest(open.port, { method: 'POST', path: '/api/tourist-visa/applications', headers: { Authorization: `Bearer ${token}` } });
    assert.equal(noOrigin.status, 200, 'the same request again returns the existing draft');
  } finally {
    await open.stop();
    await dbOpen.stop();
  }

  // Closed: the guard does nothing; the fixed answer is exactly what it was.
  const dbClosed = await MongoMemoryServer.create();
  const closed = await startIndex({ MONGODB_URI: dbClosed.getUri(), NODE_ENV: 'test' });
  try {
    await waitUntilUp(closed);
    const viaGoodOrigin = await rawRequest(closed.port, { method: 'POST', path: '/api/tourist-visa/applications', headers: { Origin: ALLOWED, Authorization: 'Bearer anything' } });
    assert.equal(viaGoodOrigin.status, 404);
    assert.equal(viaGoodOrigin.json.code, 'FEATURE_CLOSED');
    const cookieOnly = await rawRequest(closed.port, { method: 'POST', path: '/api/tourist-visa/applications', headers: { Cookie: 'token=anything' } });
    assert.equal(cookieOnly.status, 404, 'closed: the fixed answer, not the guard\'s');
    assert.equal(cookieOnly.json.code, 'FEATURE_CLOSED');
    const foreign = await rawRequest(closed.port, { method: 'POST', path: '/api/tourist-visa/applications', headers: { Origin: FOREIGN, Authorization: 'Bearer anything' } });
    assert.notEqual(foreign.json && foreign.json.code, REFUSED_CODE, 'closed: this is the old behaviour (CORS refuses it), not the guard');
  } finally {
    await closed.stop();
    await dbClosed.stop();
  }
});
