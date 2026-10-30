'use strict';

// Step 6d tests: the draft option lists that replaced the [TBC] placeholders, through the real routes.
// Covers: an application saved with the old tbc_* values (it must show "Needs review", keep every
// answer, and not be written to just by being read), and the gates that depend on the new values
// (2.13 -> 4A, 5.1 -> 5.2-5.9). In-memory MongoDB, made-up users and answers.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.TOURIST_VISA_ENABLED = 'true'; // the API is closed unless the switch is exactly true
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { test, before, after } = require('node:test');
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

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${baseUrl}/api/tourist-visa${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function start() {
  userCounter += 1;
  const user = await User.create({
    name: `Test Drafts ${userCounter}`,
    email: `test.drafts.${userCounter}@example.com`,
    password: 'not-a-real-password',
  });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const res = await api('POST', '/applications', { token });
  return { token, appId: res.json.data.application.id };
}
const put = (token, sectionId, answers) => api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const get = async (token) => (await api('GET', '/applications/me', { token })).json.data.application;
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: new mongoose.Types.ObjectId(appId) });

// Made-up answers, with the new real option values.
const ADDRESS = { line1: '1 Test Street', town: 'Testville', country: 'GB' };
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
  q2_17: '1990-01-01', q2_18: false, q2_23: false,
};
const S2C = { q2_24: ADDRESS, q2_25: true, q2_27: { years: 2, months: 3 }, q2_28: 'owned', q2_30: false, q2_31: false };
const S2D = { q2_32: { countryCode: '+44', number: '7700 900123' }, q2_33: 'in_uk', q2_34: 'mobile', q2_35: ['call', 'messaging_app'] };
const S4A = { q4_1: 'Testpartner', q4_2: 'Testsurname', q4_3: '1991-02-03', q4_4: 'GB', q4_5: true, q4_6: false };
const EMPLOYED = {
  q5_1: 'employed', q5_2: '2019-04', q5_3: 'Test Employer Ltd', q5_4: ADDRESS,
  q5_5: { countryCode: '+44', number: '20 7946 0000' }, q5_6: 'Test Analyst',
  q5_7: { amount: 2500, currency: 'GBP' }, q5_8: 'Made-up description of a made-up job.',
};

// ---------------------------------------------------------------------------

test('an application saved with the old placeholder values keeps every answer and shows Needs review, without being written to', async () => {
  const { token, appId } = await start();
  // How step 6c left a saved application: the [TBC] placeholder values in Parts 1 and 2.
  const old = {
    ...S1, q1_4: 'tbc_a',
    ...S2A, q2_5: 'tbc_self',
    ...S2B, q2_12: 'tbc_a', q2_13: 'tbc_married',
    ...S2C, q2_28: 'tbc_owned',
    ...S2D, q2_33: 'tbc_a',
  };
  await TouristVisaApplication.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(appId) },
    { $set: {
      answers: old,
      sectionStatus: { 1: 'saved', '2A': 'saved', '2B': 'saved', '2C': 'saved', '2D': 'saved' },
      currentSection: '2D',
      configVersion: '0.4.0-draft',
    } }
  );
  const before = await rawDoc(appId);

  const app = await get(token);
  assert.deepEqual(app.answers, old, 'every saved answer is returned unchanged, old values included');
  assert.deepEqual(app.sectionStatus, {
    1: 'needs_review', '2A': 'needs_review', '2B': 'needs_review', '2C': 'needs_review', '2D': 'needs_review',
  });
  assert.equal(app.currentSection, '1', 'the applicant is sent to the first section that needs another look');
  assert.equal(app.configVersion, '0.4.0-draft', 'the version the answers were collected with is kept');

  assert.deepEqual(await rawDoc(appId), before, 'reading the application wrote nothing to the database');
});

test('re-saving a section with the new values clears its Needs review flag and nothing else changes', async () => {
  const { token, appId } = await start();
  await TouristVisaApplication.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(appId) },
    { $set: {
      answers: { ...S1, q1_4: 'tbc_a', ...S2A, q2_5: 'tbc_self' },
      sectionStatus: { 1: 'saved', '2A': 'saved' },
      currentSection: '2A',
    } }
  );
  assert.equal((await get(token)).sectionStatus['1'], 'needs_review');

  const fix = await put(token, '1', S1);
  assert.equal(fix.status, 200, JSON.stringify(fix.json));
  assert.equal(fix.json.data.application.sectionStatus['1'], 'saved');
  assert.equal(fix.json.data.application.sectionStatus['2A'], 'needs_review', 'a section not re-saved yet still needs review');
  assert.equal(fix.json.data.application.currentSection, '2A');
  assert.equal((await rawDoc(appId)).answers.q2_5, 'tbc_self', 'the other section is not edited by saving this one');
});

test('an old placeholder value is refused on save, with the list-of-options message', async () => {
  const { token, appId } = await start();
  const snapshot = await rawDoc(appId);
  for (const [section, answers, key] of [
    ['1', { ...S1, q1_4: 'tbc_a' }, 'q1_4'],
    ['2B', { ...S2B, q2_13: 'tbc_married' }, 'q2_13'],
    ['2D', { ...S2D, q2_33: 'tbc_a' }, 'q2_33'],
    ['5', { q5_1: 'tbc_employed' }, 'q5_1'],
  ]) {
    const res = await put(token, section, answers);
    assert.equal(res.status, 422, section);
    assert.equal(res.json.errors[key], 'Choose from the listed options', section);
  }
  assert.deepEqual(await rawDoc(appId), snapshot, 'nothing was written');
});

test('every new option list saves: each value of 2.13, 2.12, 2.5, 2.28, 2.33 and 2.35 is accepted', async () => {
  const { token } = await start();
  for (const v of ['single', 'married', 'civil_partnership', 'unmarried_partner', 'separated', 'divorced', 'widowed']) {
    const res = await put(token, '2B', { ...S2B, q2_13: v });
    assert.equal(res.status, 200, `${v}: ${JSON.stringify(res.json)}`);
  }
  for (const v of ['female', 'male', 'other']) assert.equal((await put(token, '2B', { ...S2B, q2_12: v })).status, 200, v);
  for (const v of ['me', 'family_or_friend', 'representative', 'other']) assert.equal((await put(token, '2A', { ...S2A, q2_5: v })).status, 200, v);
  for (const v of ['owned', 'rented']) assert.equal((await put(token, '2C', { ...S2C, q2_28: v })).status, 200, v);
  for (const v of ['with_family_or_friends', 'employer_provided']) {
    assert.equal((await put(token, '2C', { ...S2C, q2_28: v })).status, 422, `${v} now asks 2.29`);
    assert.equal((await put(token, '2C', { ...S2C, q2_28: v, q2_29: 'Made-up details' })).status, 200, v);
  }
  assert.equal((await put(token, '2C', { ...S2C, q2_28: 'other', q2_29: 'Made-up details' })).status, 200, "'other' opens 2.29");
  for (const v of ['in_home_country', 'in_uk', 'in_other_country']) assert.equal((await put(token, '2D', { ...S2D, q2_33: v })).status, 200, v);
  assert.equal((await put(token, '2D', { ...S2D, q2_35: ['call', 'sms'] })).status, 200, 'the two printout choices still work');
});

test('GATE 2.13 with the real values: Married, civil partnership and unmarried partner show 4A; the others do not, and remove its answers', async () => {
  const { token, appId } = await start();
  for (const status of ['married', 'civil_partnership', 'unmarried_partner']) {
    assert.equal((await put(token, '2B', { ...S2B, q2_13: status })).status, 200, status);
    const res = await put(token, '4A', S4A);
    assert.equal(res.status, 200, `${status}: ${JSON.stringify(res.json)}`);
    assert.equal((await rawDoc(appId)).answers.q4_1, 'Testpartner');
  }
  for (const status of ['single', 'separated', 'divorced', 'widowed']) {
    const set = await put(token, '2B', { ...S2B, q2_13: status });
    assert.equal(set.status, 200, status);
    assert.deepEqual(set.json.data.removed.sort(), ['q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5', 'q4_6'], status);
    const stored = await rawDoc(appId);
    assert.equal('q4_1' in stored.answers, false, `${status}: partner answers are gone`);
    assert.equal('4A' in stored.sectionStatus, false);
    const blocked = await put(token, '4A', S4A);
    assert.equal(blocked.status, 400, status);
    assert.equal(blocked.json.message, 'This section does not apply to your application.');
    // Put a partner back for the next status in the loop.
    await put(token, '2B', { ...S2B, q2_13: 'married' });
    await put(token, '4A', S4A);
  }
});

test('GATE 5.1 with the real values: only Employed shows 5.2-5.9; every other status removes them', async () => {
  const { token, appId } = await start();
  assert.equal((await put(token, '5', EMPLOYED)).status, 200);
  assert.equal((await rawDoc(appId)).answers.q5_3, 'Test Employer Ltd');

  const others = ['self_employed', 'retired', 'student', 'homemaker', 'unemployed', 'other'];
  for (const status of others) {
    assert.equal((await put(token, '5', EMPLOYED)).status, 200);
    const res = await put(token, '5', { ...EMPLOYED, q5_1: status });
    assert.equal(res.status, 200, `${status}: ${JSON.stringify(res.json)}`);
    assert.deepEqual(res.json.data.removed.sort(), ['q5_2', 'q5_3', 'q5_4', 'q5_5', 'q5_6', 'q5_7', 'q5_8'], status);
    const stored = await rawDoc(appId);
    assert.equal('q5_3' in stored.answers, false, status);
    assert.equal(stored.answers.q5_1, status);
  }
  const missing = await put(token, '5', { q5_1: 'employed' });
  assert.equal(missing.status, 422);
  assert.equal(missing.json.errors.q5_3, 'This question is required');
});

test('GATE 6.1 with the real values: only savings and savings_and_income show 6.2', async () => {
  const { token, appId } = await start();
  const base = { q6_3: { amount: 1500, currency: 'GBP' }, q6_4: { amount: 900, currency: 'GBP' }, q6_5: false };
  for (const [v, needsSavings] of [['savings', true], ['savings_and_income', true], ['other_income', false], ['none', false]]) {
    const without = await put(token, '6A', { ...base, q6_1: v });
    assert.equal(without.status, needsSavings ? 422 : 200, v);
    if (needsSavings) assert.equal(without.json.errors.q6_2, 'This question is required', v);
    const withSavings = await put(token, '6A', { ...base, q6_1: v, q6_2: { amount: 8000, currency: 'GBP' } });
    assert.equal(withSavings.status, 200, v);
    assert.equal('q6_2' in (await rawDoc(appId)).answers, needsSavings, `${v}: 6.2 is stored only when it applies`);
  }
});
