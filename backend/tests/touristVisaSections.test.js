'use strict';

// Step 3 tests: save one section (PUT .../sections/:sectionId), with field encryption.
// In-memory MongoDB, made-up users, made-up answers.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
const crypto = require('node:crypto');
const KEY_A = crypto.randomBytes(32).toString('base64');
const KEY_B = crypto.randomBytes(32).toString('base64');
process.env.FIELD_ENCRYPTION_KEY = KEY_A;

const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const TouristVisaApplication = require('../models/TouristVisaApplication');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const captureOutput = require('./helpers/captureOutput');

let mongod;
let server;
let baseUrl;
let userCounter = 0;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await TouristVisaApplication.init();

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

afterEach(() => {
  process.env.FIELD_ENCRYPTION_KEY = KEY_A; // tests that change the key restore it even on failure
});

async function makeUser() {
  userCounter += 1;
  const user = await User.create({
    name: `Test User ${userCounter}`,
    email: `test.sections.${userCounter}@example.com`,
    password: 'not-a-real-password',
  });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token };
}

async function api(method, path, { token, body, raw } = {}) {
  const res = await fetch(`${baseUrl}/api/tourist-visa${path}`, {
    method,
    headers: {
      ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const start = async () => {
  const who = await makeUser();
  const res = await api('POST', '/applications', { token: who.token });
  return { ...who, appId: res.json.data.application.id };
};
const put = (token, sectionId, answers) =>
  api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const get = (token) => api('GET', '/applications/me', { token });
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: new mongoose.Types.ObjectId(appId) });

// Made-up answers (same as the shared engine tests).
const S1 = {
  q1_1: 'tourism', q1_2: false, q1_3: false, q1_4: 'holiday',
  q1_5: 'Test trip for automated tests.', q1_6: '2027-03-01', q1_7: '2027-03-15',
};
const S2A = {
  q2_1: 'Testfirst', q2_2: 'Testlast', q2_3: false,
  q2_4: 'test.applicant@example.com', q2_5: 'me', q2_6: false,
  q2_9: 'test.applicant@example.com', q2_10: 'test.applicant@example.com', q2_11: 'test.applicant@example.com',
};
const S2B = {
  q2_12: 'female', q2_13: 'single', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville',
  q2_17: '1990-01-01', q2_18: true, q2_19: 'FAKE-ID-0001', q2_20: 'Test Authority',
  q2_21: '2020-01-01', q2_22: '2030-01-01', q2_23: false,
};

// ---------------------------------------------------------------------------
// Saving and resuming
// ---------------------------------------------------------------------------

test('saving a valid section stores it, marks it saved and moves the resume point on', async () => {
  const { token, appId } = await start();
  const res = await put(token, '1', S1);

  assert.equal(res.status, 200, JSON.stringify(res.json));
  const app = res.json.data.application;
  assert.equal(app.answers.q1_5, S1.q1_5);
  assert.deepEqual(app.sectionStatus, { 1: 'saved' });
  assert.equal(app.currentSection, '2A');
  assert.deepEqual(res.json.data.needsReview, []);
  assert.deepEqual((await get(token)).json.data.application, app);

  const raw = await rawDoc(appId);
  assert.equal(raw.answers.q1_1, 'tourism');
  assert.equal(raw.status, 'draft');
});

test('invalid answers are rejected with per-question errors and nothing is written', async () => {
  const { token, appId } = await start();

  const order = await put(token, '1', { ...S1, q1_7: S1.q1_6 });
  assert.equal(order.status, 422);
  assert.match(order.json.errors.q1_7, /after the date in question 1\.6/);

  const impossible = await put(token, '1', { ...S1, q1_6: '2027-02-30' });
  assert.equal(impossible.status, 422);
  assert.equal(impossible.json.errors.q1_6, 'Enter a real date');

  const empty = await put(token, '1', {});
  assert.equal(empty.status, 422);
  assert.deepEqual(Object.keys(empty.json.errors).sort(), ['q1_1', 'q1_2', 'q1_3', 'q1_5', 'q1_6', 'q1_7']);

  const raw = await rawDoc(appId);
  assert.deepEqual(raw.answers, {});
  assert.deepEqual(raw.sectionStatus, {});
  assert.equal(raw.currentSection, '1');
});

test('the resume point is the first section that is not saved', async () => {
  const { token } = await start();
  assert.equal((await put(token, '2A', S2A)).json.data.application.currentSection, '1');
  assert.equal((await put(token, '1', S1)).json.data.application.currentSection, '2B');
  const third = await put(token, '2B', S2B);
  assert.equal(third.json.data.application.currentSection, '2C');
});

test('sections are saved independently: saving one never overwrites another', async () => {
  const { token, appId } = await start();
  await put(token, '1', S1);
  await put(token, '2A', S2A);
  await put(token, '1', { ...S1, q1_5: 'Changed text for section one.' });

  const raw = await rawDoc(appId);
  assert.equal(raw.answers.q1_5, 'Changed text for section one.');
  assert.equal(raw.answers.q2_1, 'Testfirst');
  assert.deepEqual(raw.sectionStatus, { 1: 'saved', '2A': 'saved' });
});

test('concurrent saves of different sections both land', async () => {
  const { token, appId } = await start();
  const [a, b, c] = await Promise.all([put(token, '1', S1), put(token, '2A', S2A), put(token, '2B', S2B)]);
  assert.deepEqual([a.status, b.status, c.status], [200, 200, 200]);

  const raw = await rawDoc(appId);
  assert.equal(raw.answers.q1_1, 'tourism');
  assert.equal(raw.answers.q2_1, 'Testfirst');
  assert.equal(raw.answers.q2_16, 'Testville');
  assert.deepEqual(raw.sectionStatus, { 1: 'saved', '2A': 'saved', '2B': 'saved' });
});

test('repeating-group entries are saved and returned', async () => {
  const { token } = await start();
  const entries = [{ q2_3a: 'Alias', q2_3b: 'One' }, { q2_3a: 'Second', q2_3b: 'Alias' }];
  const res = await put(token, '2A', { ...S2A, q2_3: true, otherNames: entries });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.data.application.answers.otherNames, entries);
});

test('free text is stored exactly as typed, including < and >', async () => {
  const { token } = await start();
  const text = 'Plan: visit <b>Test</b> City if 2 < 3 and 5 > 4';
  const res = await put(token, '1', { ...S1, q1_5: text });
  assert.equal(res.status, 200);
  assert.equal((await get(token)).json.data.application.answers.q1_5, text);
});

// ---------------------------------------------------------------------------
// Hidden answers
// ---------------------------------------------------------------------------

test('answers that become hidden are removed, including stale ones sent by the client', async () => {
  const { token, appId } = await start();
  const second = 'second@example.com';
  const withSecond = await put(token, '2A', { ...S2A, q2_6: true, q2_7: second, q2_8: 'other', q2_10: second });
  assert.equal(withSecond.status, 200, JSON.stringify(withSecond.json));
  assert.equal((await rawDoc(appId)).answers.q2_7, second);

  const without = await put(token, '2A', { ...S2A, q2_6: false, q2_7: second, q2_8: 'other' });
  assert.equal(without.status, 200, JSON.stringify(without.json));
  assert.deepEqual(without.json.data.removed.sort(), ['q2_7', 'q2_8']);
  const raw = await rawDoc(appId);
  assert.equal('q2_7' in raw.answers, false);
  assert.equal('q2_8' in raw.answers, false);
  assert.equal(raw.answers.q2_10, 'test.applicant@example.com');
});

test('switching 2.3 to No removes the stored other-name entries', async () => {
  const { token, appId } = await start();
  await put(token, '2A', { ...S2A, q2_3: true, otherNames: [{ q2_3a: 'Alias', q2_3b: 'One' }] });
  assert.ok((await rawDoc(appId)).answers.otherNames);
  await put(token, '2A', S2A);
  assert.equal('otherNames' in (await rawDoc(appId)).answers, false);
});

test('an optional answer that is cleared is removed from the stored answers', async () => {
  const { token, appId } = await start();
  await put(token, '2B', S2B);
  assert.equal((await rawDoc(appId)).answers.q2_21 !== undefined, true);

  const { q2_21, ...withoutIssueDate } = S2B;
  const res = await put(token, '2B', withoutIssueDate);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal('q2_21' in (await rawDoc(appId)).answers, false);
  assert.deepEqual(res.json.data.removed, ['q2_21']);
});

// ---------------------------------------------------------------------------
// Rejected requests
// ---------------------------------------------------------------------------

test('unknown section ids are rejected', async () => {
  const { token, appId } = await start();
  for (const id of ['9Z', '2a', 'constructor', '__proto__', 'toString', '1%2F2A', 'x'.repeat(300)]) {
    const res = await put(token, id, S1);
    assert.equal(res.status, 404, id);
  }
  assert.deepEqual((await rawDoc(appId)).answers, {});
});

test('unknown keys are rejected and nothing from the request is stored', async () => {
  const { token, appId } = await start();

  const foreign = await put(token, '1', { ...S1, q2_1: 'Belongs to section 2A' });
  assert.equal(foreign.status, 400);
  assert.equal(foreign.json.message, 'Some fields do not belong to this section.');
  const invented = await put(token, '1', { ...S1, isAdmin: true });
  assert.equal(invented.status, 400);
  const proto = await api('PUT', '/applications/me/sections/1', { token, raw: `{"answers":{"__proto__":{"polluted":true},"q1_1":"tourism"}}` });
  assert.equal(proto.status, 400);
  assert.equal({}.polluted, undefined);

  const topLevel = await api('PUT', '/applications/me/sections/1', { token, body: { answers: S1, applicant: 'someone', status: 'submitted' } });
  assert.equal(topLevel.status, 400);

  const raw = await rawDoc(appId);
  assert.deepEqual(raw.answers, {});
  assert.equal(raw.status, 'draft');
});

test('a body that is not { answers: {...} } is rejected', async () => {
  const { token } = await start();
  for (const body of [{}, { answers: [] }, { answers: 'text' }, { answers: null }, [], { Answers: S1 }]) {
    const res = await api('PUT', '/applications/me/sections/1', { token, body });
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  const noBody = await api('PUT', '/applications/me/sections/1', { token });
  assert.equal(noBody.status, 400);
});

test('saving needs a started application and a signed-in user', async () => {
  const { token } = await makeUser();
  assert.equal((await put(token, '1', S1)).status, 404);
  assert.equal((await put(undefined, '1', S1)).status, 401);
  assert.equal((await put('not-a-token', '1', S1)).status, 401);
});

test('another user cannot save into my application', async () => {
  const a = await start();
  await put(a.token, '1', S1);
  const before = await rawDoc(a.appId);

  // B has not started: nothing to save into, and nothing of A's is touched.
  const b = await makeUser();
  assert.equal((await put(b.token, '1', { ...S1, q1_5: 'B was here' })).status, 404);

  // B has an application: the save lands in B's, whatever the body says about A.
  const bApp = (await api('POST', '/applications', { token: b.token })).json.data.application.id;
  const aimed = await api('PUT', '/applications/me/sections/1', {
    token: b.token, body: { answers: { ...S1, q1_5: 'B text' }, applicationId: a.appId, applicant: String(a.user._id) },
  });
  assert.equal(aimed.status, 400);
  assert.equal((await put(b.token, '1', { ...S1, q1_5: 'B text' })).status, 200);

  assert.equal((await rawDoc(bApp)).answers.q1_5, 'B text');
  assert.deepEqual(await rawDoc(a.appId), before, "A's document is byte-for-byte unchanged");
});

test('a submitted application is locked', async () => {
  for (const status of ['submitted', 'in_review', 'completed']) {
    const { user, token } = await makeUser();
    const locked = await TouristVisaApplication.create({
      applicant: user._id, status, answers: { q1_5: 'Original text.' }, sectionStatus: { 1: 'saved' }, submittedAt: new Date(),
    });
    const before = await rawDoc(String(locked._id));

    const res = await put(token, '1', { ...S1, q1_5: 'Edited after submit.' });
    assert.equal(res.status, 409, status);
    assert.match(res.json.message, /can no longer be edited/);
    assert.deepEqual(await rawDoc(String(locked._id)), before, status);
  }
});

test('a submission that lands between the check and the write is still refused', async () => {
  // The repository only matches drafts, so even a caller that skipped the status check cannot write.
  const { user } = await makeUser();
  const locked = await TouristVisaApplication.create({ applicant: user._id, status: 'submitted' });
  const repository = require('../repositories/touristVisaApplicationRepository');
  const result = await repository.saveSection(locked._id, user._id, {
    answers: { q1_5: 'x' }, unset: [], sectionStatus: { 1: 'saved' }, currentSection: '2A',
  });
  assert.equal(result, null);
  assert.deepEqual((await rawDoc(String(locked._id))).answers, {});
});

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

test('a sensitive answer is ciphertext in the database and plaintext through the API', async () => {
  const { token, appId } = await start();
  const ID = 'FAKE-ID-0001';
  const res = await put(token, '2B', { ...S2B, q2_19: ID });
  assert.equal(res.status, 200, JSON.stringify(res.json));

  const raw = await rawDoc(appId);
  assert.match(raw.answers.q2_19, /^enc:v1:[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
  assert.equal(JSON.stringify(raw).includes(ID), false, 'the plaintext is nowhere in the stored document');
  assert.equal(raw.answers.q2_16, 'Testville', 'non-sensitive answers are stored as typed');

  assert.equal(res.json.data.application.answers.q2_19, ID);
  assert.equal((await get(token)).json.data.application.answers.q2_19, ID);
});

test('each write uses a fresh IV, so the same value never produces the same ciphertext', async () => {
  const { token, appId } = await start();
  await put(token, '2B', S2B);
  const first = (await rawDoc(appId)).answers.q2_19;
  await put(token, '2B', S2B);
  assert.notEqual((await rawDoc(appId)).answers.q2_19, first);
});

test('only the owner gets decrypted answers', async () => {
  const a = await start();
  const b = await start();
  await put(a.token, '2B', { ...S2B, q2_19: 'A-FAKE-ID-1111' });
  await put(b.token, '2B', { ...S2B, q2_19: 'B-FAKE-ID-2222' });
  assert.equal((await get(a.token)).json.data.application.answers.q2_19, 'A-FAKE-ID-1111');
  assert.equal((await get(b.token)).json.data.application.answers.q2_19, 'B-FAKE-ID-2222');
});

test('without a usable key nothing is saved, for any section', async () => {
  const { token, appId } = await start();
  const bad = { missing: undefined, blank: '  ', tooShort: crypto.randomBytes(16).toString('base64'), notBase64: 'not a key !!' };

  for (const [name, value] of Object.entries(bad)) {
    if (value === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
    else process.env.FIELD_ENCRYPTION_KEY = value;

    for (const [section, answers] of [['1', S1], ['2B', S2B]]) {
      const res = await put(token, section, answers);
      assert.equal(res.status, 503, `${name}: section ${section}`);
      assert.match(res.json.message, /Secure storage is not configured/);
    }
    const raw = await rawDoc(appId);
    assert.deepEqual(raw.answers, {}, name);
    assert.deepEqual(raw.sectionStatus, {}, name);
  }
});

test('reading works without the key until encrypted answers exist; then it fails closed', async () => {
  const plainUser = await start();
  const sensitiveUser = await start();
  await put(plainUser.token, '1', S1);
  await put(sensitiveUser.token, '2B', S2B);

  delete process.env.FIELD_ENCRYPTION_KEY;
  assert.equal((await get(plainUser.token)).status, 200);
  const blocked = await get(sensitiveUser.token);
  assert.equal(blocked.status, 503);
  assert.equal(JSON.stringify(blocked.json).includes('FAKE-ID'), false);
});

test('a wrong key, a swapped ciphertext or a plaintext value in a sensitive field is refused, without leaking', async () => {
  const a = await start();
  const b = await start();
  await put(a.token, '2B', { ...S2B, q2_19: 'A-SECRET-ID-1111' });
  await put(b.token, '2B', { ...S2B, q2_19: 'B-SECRET-ID-2222' });
  const bCipher = (await rawDoc(b.appId)).answers.q2_19;
  const oid = (id) => new mongoose.Types.ObjectId(id);

  const attempt = async (label) => {
    const output = captureOutput();
    let res;
    try {
      res = await get(a.token);
    } finally {
      output.restore();
    }
    assert.equal(res.status, 500, label);
    assert.equal(res.json.message, 'Your saved answers could not be read. Please contact support.', label);
    for (const text of [JSON.stringify(res.json), output.text()]) {
      assert.equal(/SECRET-ID|FAKE-ID|enc:v1/.test(text), false, `${label}: leaked\n${text}`);
    }
    assert.match(output.text(), /could not be decrypted/, `${label}: failure is logged`);
  };

  // 1. The key was changed.
  process.env.FIELD_ENCRYPTION_KEY = KEY_B;
  await attempt('wrong key');
  process.env.FIELD_ENCRYPTION_KEY = KEY_A;
  assert.equal((await get(a.token)).json.data.application.answers.q2_19, 'A-SECRET-ID-1111');

  // 2. Another application's ciphertext copied in: the application id is part of what is authenticated.
  const original = (await rawDoc(a.appId)).answers.q2_19;
  await TouristVisaApplication.collection.updateOne({ _id: oid(a.appId) }, { $set: { 'answers.q2_19': bCipher } });
  await attempt('ciphertext from another application');

  // 3. Plaintext where ciphertext is required.
  await TouristVisaApplication.collection.updateOne({ _id: oid(a.appId) }, { $set: { 'answers.q2_19': 'A-SECRET-ID-1111' } });
  await attempt('plaintext in a sensitive field');

  // 4. Altered ciphertext.
  await TouristVisaApplication.collection.updateOne({ _id: oid(a.appId) }, { $set: { 'answers.q2_19': original.slice(0, -4) + 'AAAA' } });
  await attempt('altered ciphertext');

  await TouristVisaApplication.collection.updateOne({ _id: oid(a.appId) }, { $set: { 'answers.q2_19': original } });
  assert.equal((await get(a.token)).status, 200);
});
