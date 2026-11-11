'use strict';

// The server-side feature switch (TOURIST_VISA_ENABLED). The Tourist Visa API is open only when the
// variable is exactly "true". While it is not, every request under /api/tourist-visa gets one fixed
// 404 {code: "FEATURE_CLOSED"} before sign-in checks, body parsing and any database access, and
// nothing is logged. Made-up users and answers only.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
delete process.env.TOURIST_VISA_ENABLED; // each test sets what it needs

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const TouristVisaApplication = require('../models/TouristVisaApplication');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const touristVisaFeatureGate = require('../middleware/touristVisaFeatureGate');
const { errorHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const CLOSED_BODY = { success: false, code: 'FEATURE_CLOSED', message: 'The Tourist Visa application is not open.' };

const servers = [];
async function listen(app) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

/** The app wired the way backend/index.js wires it: gate first, then the Tourist Visa parser, then the router. */
function indexLikeApp() {
  const app = express();
  app.use('/api/tourist-visa', touristVisaFeatureGate);
  app.use('/api/tourist-visa', touristVisaBodyParser);
  app.use(express.json());
  app.use('/api/tourist-visa', touristVisaRoutes);
  app.use(errorHandler);
  return app;
}

/** Only the router, without the gate in front of it (defence in depth). */
function routerOnlyApp() {
  const app = express();
  app.use('/api/tourist-visa', touristVisaRoutes);
  app.use(errorHandler);
  return app;
}

after(async () => {
  for (const s of servers) await new Promise((resolve) => s.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

let mongod;

const send = async (base, method, path, { headers = {}, body } = {}) => {
  const res = await fetch(`${base}/api/tourist-visa${path}`, { method, headers, body });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, cache: res.headers.get('cache-control') };
};

const MARKER = 'MARKER-NOT-TO-BE-ECHOED-4242';
const validLookingToken = () => jwt.sign({ id: String(new mongoose.Types.ObjectId()) }, process.env.JWT_SECRET, { expiresIn: '1h' });

/** Every kind of request a caller could make under the prefix. */
function allRequests() {
  const json = { 'Content-Type': 'application/json' };
  const auth = { Authorization: `Bearer ${validLookingToken()}` };
  return [
    ['create (no token)', 'POST', '/applications', {}],
    ['create (token)', 'POST', '/applications', { headers: auth }],
    ['get mine (no token)', 'GET', '/applications/me', {}],
    ['get mine (token)', 'GET', '/applications/me', { headers: auth }],
    ['save section (token, JSON)', 'PUT', '/applications/me/sections/1', { headers: { ...json, ...auth }, body: JSON.stringify({ answers: { q1_5: MARKER } }) }],
    ['save section (no token)', 'PUT', '/applications/me/sections/1', { headers: json, body: JSON.stringify({ answers: {} }) }],
    ['save section (malformed JSON)', 'PUT', '/applications/me/sections/1', { headers: { ...json, ...auth }, body: `{"answers":{"q1_5":"${MARKER}", }` }],
    ['save section (form-encoded)', 'PUT', '/applications/me/sections/1', { headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `answers=${MARKER}` }],
    ['save unknown section', 'PUT', '/applications/me/sections/ZZ', { headers: { ...json, ...auth }, body: '{}' }],
    ['delete', 'DELETE', '/applications/me', { headers: auth }],
    ['patch', 'PATCH', '/applications/me', { headers: { ...json, ...auth }, body: '{}' }],
    ['the prefix itself', 'GET', '', {}],
    ['a path that does not exist', 'GET', `/something/else?probe=${MARKER}`, { headers: { 'X-Probe': MARKER } }],
    ['a bad token', 'GET', '/applications/me', { headers: { Authorization: 'Bearer not-a-token' } }],
  ];
}

// Values that must NOT open the API.
const CLOSED_VALUES = [undefined, '', 'false', 'FALSE', 'False', 'TRUE', 'True', '1', 'yes', 'on', ' true', 'true ', 'true\n', 'enabled', '0'];

for (const value of CLOSED_VALUES) {
  test(`switch ${value === undefined ? 'unset' : JSON.stringify(value)}: every route returns the fixed closed answer, before sign-in and body parsing`, async () => {
    if (value === undefined) delete process.env.TOURIST_VISA_ENABLED;
    else process.env.TOURIST_VISA_ENABLED = value;
    const base = await listen(indexLikeApp());

    for (const [name, method, path, options] of allRequests()) {
      const res = await send(base, method, path, options);
      assert.equal(res.status, 404, name);
      assert.deepEqual(res.json, CLOSED_BODY, name);
      assert.equal(res.cache, 'no-store', name);
      assert.equal(res.text.includes(MARKER), false, `${name}: nothing the caller sent comes back`);
    }
  });
}

test('closed: no database access, no model call, no log line and no console output, with no database connected at all', async () => {
  delete process.env.TOURIST_VISA_ENABLED;
  assert.equal(mongoose.connection.readyState, 0, 'the test runs with no database connection');

  const operations = [];
  mongoose.set('debug', (collection, method) => operations.push(`${collection}.${method}`));

  const modelCalls = [];
  const spies = [];
  for (const [model, names] of [
    [User, ['findById', 'findOne', 'find', 'create']],
    [TouristVisaApplication, ['findOne', 'find', 'create', 'findOneAndUpdate', 'updateOne', 'countDocuments']],
  ]) {
    for (const name of names) spies.push(mock.method(model, name, () => { modelCalls.push(`${model.modelName}.${name}`); throw new Error('database call while closed'); }));
  }
  const logged = [];
  for (const target of [logger, console]) {
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
      if (typeof target[level] === 'function') spies.push(mock.method(target, level, (...args) => { logged.push(`${level}: ${String(args[0]).slice(0, 60)}`); }));
    }
  }

  try {
    const base = await listen(indexLikeApp());
    for (const [name, method, path, options] of allRequests()) {
      const res = await send(base, method, path, options);
      assert.equal(res.status, 404, name);
    }
  } finally {
    for (const spy of spies) spy.mock.restore();
    mongoose.set('debug', false);
  }

  assert.deepEqual(operations, [], 'no database operation was issued');
  assert.deepEqual(modelCalls, [], 'no model method was called');
  assert.deepEqual(logged, [], 'nothing was logged');
  assert.equal(mongoose.connection.readyState, 0, 'and nothing connected');
});

test('closed: the router on its own is closed too, and answers before the sign-in check', async () => {
  delete process.env.TOURIST_VISA_ENABLED;
  const base = await listen(routerOnlyApp());
  for (const [name, method, path, options] of allRequests().slice(0, 6)) {
    const res = await send(base, method, path, options);
    assert.equal(res.status, 404, name);
    assert.deepEqual(res.json, CLOSED_BODY, name);
  }
});

test('closed: the answer differs from the API\'s own "not started" 404, which has no code', async () => {
  assert.equal(CLOSED_BODY.code, 'FEATURE_CLOSED');
  assert.equal(touristVisaFeatureGate.FEATURE_CLOSED_CODE, 'FEATURE_CLOSED');
  // The service's not-started 404 is an AppError with a message and no code; see the open-state test below.
});

test('open ("true"): the gate lets requests through to sign-in checks, body parsing and the routes', async () => {
  process.env.TOURIST_VISA_ENABLED = 'true';
  const base = await listen(indexLikeApp());

  const noToken = await send(base, 'POST', '/applications');
  assert.equal(noToken.status, 401, 'the sign-in check runs again');
  assert.notEqual(noToken.json && noToken.json.code, 'FEATURE_CLOSED');

  const bad = await send(base, 'PUT', '/applications/me/sections/1', {
    headers: { 'Content-Type': 'application/json' },
    body: `{"answers":{"q1_5":"${MARKER}", }`,
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.message, 'The request body is not valid JSON.', 'the Tourist Visa body parser runs again');

  const form = await send(base, 'PUT', '/applications/me/sections/1', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'a=b',
  });
  assert.equal(form.status, 415);
});

// ---- with a database: the same user, the switch flipped on and off ----------------------------

test('with a database: "true" behaves as before, and turning the switch off leaves the stored data untouched', async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await TouristVisaApplication.init();

  const user = await User.create({ name: 'Test Switch User', email: 'test.switch@example.com', password: 'not-a-real-password' });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const auth = { Authorization: `Bearer ${token}` };
  const json = { 'Content-Type': 'application/json' };
  const S1 = {
    q1_1: 'tourism', q1_2: false, q1_3: false, q1_4: 'holiday',
    q1_5: 'Test trip for automated tests.', q1_6: '2027-03-01', q1_7: '2027-03-15',
  };

  process.env.TOURIST_VISA_ENABLED = 'true';
  const base = await listen(indexLikeApp());

  const notStarted = await send(base, 'GET', '/applications/me', { headers: auth });
  assert.equal(notStarted.status, 404);
  assert.notEqual(notStarted.json.code, 'FEATURE_CLOSED', 'the not-started 404 is not the closed answer');
  assert.equal(notStarted.json.code, undefined);
  assert.match(notStarted.json.message, /not started/);

  const created = await send(base, 'POST', '/applications', { headers: auth });
  assert.equal(created.status, 201);
  const saved = await send(base, 'PUT', '/applications/me/sections/1', { headers: { ...json, ...auth }, body: JSON.stringify({ answers: S1 }) });
  assert.equal(saved.status, 200, saved.text);
  const mine = await send(base, 'GET', '/applications/me', { headers: auth });
  assert.equal(mine.status, 200);
  assert.equal(mine.json.data.application.answers.q1_5, S1.q1_5);

  const collection = TouristVisaApplication.collection;
  const before = await collection.find({}).toArray();

  // Switch off: the same signed-in user, the same requests.
  process.env.TOURIST_VISA_ENABLED = 'false';
  const operations = [];
  mongoose.set('debug', (name, method) => operations.push(`${name}.${method}`));
  try {
    for (const [method, path, options] of [
      ['GET', '/applications/me', { headers: auth }],
      ['POST', '/applications', { headers: auth }],
      ['PUT', '/applications/me/sections/1', { headers: { ...json, ...auth }, body: JSON.stringify({ answers: { ...S1, q1_5: 'changed text' } }) }],
    ]) {
      const res = await send(base, method, path, options);
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.deepEqual(res.json, CLOSED_BODY, `${method} ${path}`);
    }
  } finally {
    mongoose.set('debug', false);
  }
  assert.deepEqual(operations, [], 'no database operation while closed, even though a database is connected');
  assert.deepEqual(await collection.find({}).toArray(), before, 'the stored application is exactly as it was');

  // Switch on again: everything is still there.
  process.env.TOURIST_VISA_ENABLED = 'true';
  const again = await send(base, 'GET', '/applications/me', { headers: auth });
  assert.equal(again.status, 200);
  assert.equal(again.json.data.application.answers.q1_5, S1.q1_5, 'nothing changed while it was closed');
});
