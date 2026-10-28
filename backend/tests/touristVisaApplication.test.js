'use strict';

// Step 2 tests: create/get my Tourist Visa application against an in-memory MongoDB.
// Run with: npm test   (from backend/). Uses made-up users only; nothing touches a real database.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const util = require('node:util');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const TouristVisaApplication = require('../models/TouristVisaApplication');
const repository = require('../repositories/touristVisaApplicationRepository');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const { errorHandler } = require('../middleware/errorHandler');
const { config: formConfig } = require('../shared/tourist-visa/engine');

let mongod;
let server;
let baseUrl;
let userCounter = 0;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await TouristVisaApplication.init(); // build the unique index before any concurrent test

  const app = express();
  app.use(express.json());
  app.use('/api/tourist-visa', touristVisaRoutes);
  app.use(errorHandler);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve); // port 0 = any free port
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}, { timeout: 120000 });

after(async () => {
  mock.restoreAll();
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

async function makeUser(extra = {}) {
  userCounter += 1;
  const user = await User.create({
    name: `Test User ${userCounter}`,
    email: `test.user.${userCounter}@example.com`,
    password: 'not-a-real-password',
    ...extra,
  });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token };
}

async function api(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}/api/tourist-visa${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON response (for example Express's default 404 page)
  }
  return { status: res.status, json };
}

const countFor = (userId) => TouristVisaApplication.countDocuments({ applicant: userId });

// ---------------------------------------------------------------------------
// Unauthenticated access
// ---------------------------------------------------------------------------

test('unauthenticated requests get 401 and create nothing', async () => {
  const before = await TouristVisaApplication.countDocuments({});

  for (const [method, path] of [['POST', '/applications'], ['GET', '/applications/me']]) {
    const res = await api(method, path);
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.equal(res.json.success, false);
  }
  assert.equal(await TouristVisaApplication.countDocuments({}), before);
});

test('invalid, expired, wrong-secret and unknown-user tokens get 401', async () => {
  const { user } = await makeUser();
  const sign = (payload, secret = process.env.JWT_SECRET, opts = { expiresIn: '1h' }) => jwt.sign(payload, secret, opts);
  const deleted = await makeUser({ isDeleted: true });

  const tokens = {
    garbage: 'not-a-jwt',
    expired: sign({ id: String(user._id) }, undefined, { expiresIn: -10 }),
    wrongSecret: sign({ id: String(user._id) }, 'some-other-secret'),
    unknownUser: sign({ id: String(new mongoose.Types.ObjectId()) }),
    deletedUser: deleted.token,
  };
  for (const [name, token] of Object.entries(tokens)) {
    for (const [method, path] of [['POST', '/applications'], ['GET', '/applications/me']]) {
      const res = await api(method, path, { token });
      assert.equal(res.status, 401, `${name}: ${method} ${path}`);
    }
  }
  assert.equal(await countFor(user._id), 0);
  assert.equal(await countFor(deleted.user._id), 0);
});

// ---------------------------------------------------------------------------
// Create a draft / return the existing one
// ---------------------------------------------------------------------------

test('POST creates a draft with the model defaults and a safe response shape', async () => {
  const { user, token } = await makeUser();
  const res = await api('POST', '/applications', { token });

  assert.equal(res.status, 201);
  assert.equal(res.json.success, true);
  const app = res.json.data.application;
  assert.match(app.id, /^[0-9a-f]{24}$/);
  assert.equal(app.visaType, 'tourist');
  assert.equal(app.status, 'draft');
  assert.equal(app.currentSection, formConfig.sections[0].id);
  assert.equal(app.configVersion, formConfig.version);
  assert.deepEqual(app.answers, {});
  assert.deepEqual(app.sectionStatus, {});
  assert.deepEqual(app.documents, []);
  assert.equal(app.submittedAt, null);
  assert.deepEqual(Object.keys(app).sort(), [
    'answers', 'configVersion', 'createdAt', 'currentSection', 'documents', 'id',
    'sectionStatus', 'status', 'submittedAt', 'updatedAt', 'visaType',
  ]);

  const stored = await TouristVisaApplication.findById(app.id).lean();
  assert.equal(String(stored.applicant), String(user._id));
  assert.equal(stored.isDeleted, false);
});

test('a second POST returns the same draft and does not create another', async () => {
  const { user, token } = await makeUser();
  const first = await api('POST', '/applications', { token });
  const second = await api('POST', '/applications', { token });

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.json.data.application.id, first.json.data.application.id);
  assert.equal(await countFor(user._id), 1);
});

test('concurrent POSTs end up with exactly one draft, all returning it', async () => {
  const { user, token } = await makeUser();
  const results = await Promise.all(Array.from({ length: 6 }, () => api('POST', '/applications', { token })));

  assert.ok(results.every((r) => r.status === 200 || r.status === 201), JSON.stringify(results.map((r) => r.status)));
  assert.equal(new Set(results.map((r) => r.json.data.application.id)).size, 1);
  assert.equal(await countFor(user._id), 1);
});

test('the unique draft index exists and ignores soft-deleted drafts', async () => {
  const indexes = await TouristVisaApplication.collection.indexes();
  const draftIndex = indexes.find((i) => i.key.applicant === 1 && i.unique);
  assert.ok(draftIndex, 'unique applicant index');
  assert.deepEqual(draftIndex.partialFilterExpression, { status: 'draft', isDeleted: false });

  const { user, token } = await makeUser();
  await TouristVisaApplication.create({ applicant: user._id, isDeleted: true });
  const res = await api('POST', '/applications', { token });
  assert.equal(res.status, 201, 'a deleted draft does not block a new one');
  assert.equal(await countFor(user._id), 2);
});

test('an applicant whose application is already submitted gets it back, not a new draft', async () => {
  const { user, token } = await makeUser();
  const submitted = await TouristVisaApplication.create({ applicant: user._id, status: 'submitted', submittedAt: new Date() });

  const res = await api('POST', '/applications', { token });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.application.id, String(submitted._id));
  assert.equal(res.json.data.application.status, 'submitted');
  assert.equal(await countFor(user._id), 1);
});

test('the request body cannot set the owner, status, answers or anything else', async () => {
  const a = await makeUser();
  const b = await makeUser();

  const res = await api('POST', '/applications', {
    token: a.token,
    body: { applicant: String(b.user._id), status: 'completed', answers: { q1_1: 'tourism' }, isDeleted: true, visaType: 'student' },
  });
  assert.equal(res.status, 201);
  const stored = await TouristVisaApplication.findById(res.json.data.application.id).lean();
  assert.equal(String(stored.applicant), String(a.user._id));
  assert.equal(stored.status, 'draft');
  assert.deepEqual(stored.answers, {});
  assert.equal(stored.isDeleted, false);
  assert.equal(stored.visaType, 'tourist');
  assert.equal(await countFor(b.user._id), 0);
});

// ---------------------------------------------------------------------------
// Get my application
// ---------------------------------------------------------------------------

test('GET /applications/me is 404 before an application is started, then returns it', async () => {
  const { token } = await makeUser();
  const none = await api('GET', '/applications/me', { token });
  assert.equal(none.status, 404);
  assert.equal(none.json.success, false);

  const created = await api('POST', '/applications', { token });
  const mine = await api('GET', '/applications/me', { token });
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.json.data.application, created.json.data.application);
});

test('user A cannot read user B\'s application', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const bApp = (await api('POST', '/applications', { token: b.token })).json.data.application;

  // A has not started: they see nothing, not B's application.
  const aBefore = await api('GET', '/applications/me', { token: a.token });
  assert.equal(aBefore.status, 404);
  assert.equal(JSON.stringify(aBefore.json).includes(bApp.id), false);

  // Both started: each sees only their own.
  const aApp = (await api('POST', '/applications', { token: a.token })).json.data.application;
  assert.notEqual(aApp.id, bApp.id);
  assert.equal((await api('GET', '/applications/me', { token: a.token })).json.data.application.id, aApp.id);
  assert.equal((await api('GET', '/applications/me', { token: b.token })).json.data.application.id, bApp.id);

  // Pointing at B through the query string, a header, or an id in the path changes nothing.
  const viaQuery = await api('GET', `/applications/me?applicant=${b.user._id}&id=${bApp.id}`, { token: a.token });
  assert.equal(viaQuery.json.data.application.id, aApp.id);
  const viaHeader = await api('GET', '/applications/me', { token: a.token, headers: { 'X-User-Id': String(b.user._id) } });
  assert.equal(viaHeader.json.data.application.id, aApp.id);
  const viaPath = await api('GET', `/applications/${bApp.id}`, { token: a.token });
  assert.equal(viaPath.status, 404);
  assert.equal(JSON.stringify(viaPath.json || {}).includes(bApp.id), false);
});

test('soft-deleted applications are not returned', async () => {
  const { user, token } = await makeUser();
  await TouristVisaApplication.create({ applicant: user._id, isDeleted: true });
  assert.equal((await api('GET', '/applications/me', { token })).status, 404);
});

test('documents are returned without storage identifiers', async () => {
  const { user, token } = await makeUser();
  await TouristVisaApplication.create({
    applicant: user._id,
    documents: [{ kind: 'passport', originalName: 'test-passport.pdf', mimetype: 'application/pdf', size: 1234, publicId: 'private/SECRET-STORAGE-ID', resourceType: 'raw' }],
  });
  const res = await api('GET', '/applications/me', { token });
  assert.equal(res.status, 200);
  const [doc] = res.json.data.application.documents;
  assert.deepEqual(Object.keys(doc).sort(), ['id', 'kind', 'mimetype', 'originalName', 'size', 'uploadedAt']);
  assert.equal(JSON.stringify(res.json).includes('SECRET-STORAGE-ID'), false);
});

// ---------------------------------------------------------------------------
// Log-safe errors
// ---------------------------------------------------------------------------

function captureOutput() {
  const lines = [];
  const originals = {};
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    originals[method] = console[method];
    console[method] = (...args) => lines.push(args.map((a) => util.inspect(a, { depth: 8 })).join(' '));
  }
  return {
    text: () => lines.join('\n'),
    restore: () => Object.assign(console, originals),
  };
}

test('database errors never put submitted values in the response or in any log line', async () => {
  const { token } = await makeUser();
  const SECRET = 'SECRET-PASSPORT-9999';

  // Real Mongoose errors, built the way a bad write would produce them.
  const validationError = await new TouristVisaApplication({ applicant: `not-an-id-${SECRET}`, status: `bad-${SECRET}` })
    .validate().then(() => null, (e) => e);
  const castError = await TouristVisaApplication.findOne({ _id: `cast-${SECRET}` }).then(() => null, (e) => e);
  const duplicateKey = Object.assign(new Error(`E11000 duplicate key error collection: x index: applicant_1 dup key: { applicant: "${SECRET}" }`), {
    code: 11000,
    keyValue: { applicant: SECRET },
  });
  const plain = new Error(`unexpected failure while handling ${SECRET}`);

  assert.equal(validationError.name, 'ValidationError');
  assert.equal(castError.name, 'CastError');
  assert.ok(validationError.message.includes(SECRET) && castError.message.includes(SECRET), 'the raw errors do contain the value');

  const cases = [
    [validationError, 400],
    [castError, 404],
    [duplicateKey, 409],
    [plain, 500],
  ];

  for (const [error, expectedStatus] of cases) {
    const stub = mock.method(repository, 'findLatestByApplicant', async () => { throw error; });
    const output = captureOutput();
    let res;
    try {
      res = await api('GET', '/applications/me', { token });
    } finally {
      output.restore();
      stub.mock.restore();
    }
    assert.equal(res.status, expectedStatus, error.name);
    assert.equal(res.json.success, false);
    assert.equal(JSON.stringify(res.json).includes(SECRET), false, `response for ${error.name}`);
    assert.equal(output.text().includes(SECRET), false, `log output for ${error.name}:\n${output.text()}`);
    assert.match(output.text(), /Tourist Visa request failed/, 'the failure is still logged, without values');
  }
});

test('errors we throw on purpose keep their own message', async () => {
  const { token } = await makeUser();
  const res = await api('GET', '/applications/me', { token });
  assert.equal(res.status, 404);
  assert.match(res.json.message, /not started a Tourist Visa application/);
});
