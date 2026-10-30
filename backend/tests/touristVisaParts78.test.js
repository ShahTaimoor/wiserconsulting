'use strict';

// Step 6c tests: Parts 7 and 8 on the real config, through the real routes.
// Covers: every new gate pruning hidden answers on the server (7.1, 7.3, 7.4, 7.6, 7.7, 8.2 and the
// 6.5, 6.6 and 6.8 details boxes), the count-driven visits group (7.5), the 10-year look-back and
// "cannot be in the future" checks, and applications saved before this step.
// In-memory MongoDB, made-up users and answers. Dates are worked out from today because the
// server checks them against the real clock.

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
    name: `Test Parts78 ${userCounter}`,
    email: `test.parts78.${userCounter}@example.com`,
    password: 'not-a-real-password',
  });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const res = await api('POST', '/applications', { token });
  return { token, appId: res.json.data.application.id };
}
const put = (token, sectionId, answers) => api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const get = async (token) => (await api('GET', '/applications/me', { token })).json.data.application;
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: new mongoose.Types.ObjectId(appId) });

// Dates relative to today (UTC), so the tests keep working as time passes.
const pad = (n) => String(n).padStart(2, '0');
function monthsAgo(n) {
  const d = new Date();
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() - n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}
function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}
const daysAhead = (n) => daysAgo(-n);

// Made-up answers.
const ADDRESS = { line1: '1 Test Street', town: 'Testville', country: 'GB' };
const gbp = (amount) => ({ amount, currency: 'GBP' });
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
const S2D = { q2_32: { countryCode: '+44', number: '7700 900123' }, q2_33: 'in_uk', q2_34: 'mobile', q2_35: ['call'] };
const S3 = { q3_1: 'FAKE-PASSPORT-9876', q3_2: 'Test Passport Office', q3_3: '2022-05-01', q3_4: '2032-05-01' };
const S4B = { q4_7: false };
const PARENT = { q4_8a: 'mother', q4_8b: 'Testmother', q4_8c: 'Testsurname', q4_8d: '1962-01-02', q4_8e: 'GB', q4_8f: true };
const S4C = { parents: [PARENT] };
const S5 = { q5_1: 'student' };
const S6A = { q6_1: 'none', q6_3: gbp(1500), q6_4: gbp(900), q6_5: false };
const S6B = { q6_6: false };
const S6C = { q6_7: false };
const S6D = { q6_8: false };

const VISIT = { q7_5a: 'tourism', q7_5b: monthsAgo(20), q7_5c: { weeks: 2 } };
const PROBLEM = { q7_7a: 'refused_visa', q7_7b: 'GB', q7_7c: monthsAgo(200), q7_7d: 'Made-up details of what happened.' };
const NO7 = { q7_1: false, q7_3: false, q7_4: false, q7_6: false, q7_7: false };
const S7 = {
  q7_1: true, q7_2: monthsAgo(30), q7_3: false, q7_4: true, q7_5: 2,
  ukVisits: [VISIT, { ...VISIT, q7_5b: monthsAgo(40), q7_5c: { days: 4 } }],
  q7_6: false, q7_7: true, immigrationProblems: [PROBLEM],
};
const TRIP = { q8_2a: 'FR', q8_2b: 'tourism', q8_2c: daysAgo(400), q8_2d: daysAgo(390) };
const S8 = { q8_1: 3, q8_2: true, otherCountryTrips: [TRIP] };

const ALL = [
  ['1', S1], ['2A', S2A], ['2B', S2B], ['2C', S2C], ['2D', S2D], ['3', S3], ['4B', S4B], ['4C', S4C],
  ['5', S5], ['6A', S6A], ['6B', S6B], ['6C', S6C], ['6D', S6D], ['7', S7], ['8', S8],
];

async function fullApplication() {
  const ctx = await start();
  for (const [section, answers] of ALL) {
    const res = await put(ctx.token, section, answers);
    assert.equal(res.status, 200, `${section}: ${JSON.stringify(res.json)}`);
  }
  return ctx;
}

// ---------------------------------------------------------------------------

test('a complete application: Parts 7 and 8 save, the visits keep their order, and the applicant resumes on the last section', async () => {
  const { token, appId } = await fullApplication();
  const app = await get(token);

  assert.equal(app.sectionStatus['7'], 'saved');
  assert.equal(app.sectionStatus['8'], 'saved');
  assert.equal(Object.values(app.sectionStatus).filter((s) => s !== 'saved').length, 0);
  assert.equal(app.currentSection, '8', 'everything applicable is saved: resume on the last section');

  const stored = await rawDoc(appId);
  assert.equal(stored.answers.q7_5, 2);
  assert.deepEqual(stored.answers.ukVisits.map((v) => v.q7_5c), [{ weeks: 2 }, { days: 4 }]);
  assert.equal(stored.answers.immigrationProblems[0].q7_7b, 'GB');
  assert.equal(stored.answers.q8_1, 3);
  assert.equal(stored.answers.otherCountryTrips[0].q8_2a, 'FR');
  assert.match(stored.answers.q3_1, /^enc:v1:/, 'the passport number is still encrypted');
});

test('GATE 7.1: changing to No prunes the application date', async () => {
  const { token, appId } = await fullApplication();
  assert.equal((await rawDoc(appId)).answers.q7_2, S7.q7_2);

  const res = await put(token, '7', { ...S7, q7_1: false, q7_2: S7.q7_2 });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.data.removed, ['q7_2']);
  assert.deepEqual(res.json.data.needsReview, []);
  assert.equal('q7_2' in (await rawDoc(appId)).answers, false);
  assert.equal((await rawDoc(appId)).answers.q7_4, true, 'the rest of the section is untouched');

  const back = await put(token, '7', { ...S7, q7_1: true, q7_2: undefined });
  assert.equal(back.status, 422);
  assert.equal(back.json.errors.q7_2, 'This question is required');
});

// Every Yes/No that opens a plain "Please give details" box: Yes keeps the box, No removes it.
const DETAILS_GATES = [
  { name: '6.5', section: '6A', base: S6A, gate: 'q6_5', follow: 'q6_5a' },
  { name: '6.6', section: '6B', base: S6B, gate: 'q6_6', follow: 'q6_6a' },
  { name: '6.8', section: '6D', base: S6D, gate: 'q6_8', follow: 'q6_8a' },
  { name: '7.3', section: '7', base: S7, gate: 'q7_3', follow: 'q7_3a' },
  { name: '7.6', section: '7', base: S7, gate: 'q7_6', follow: 'q7_6a' },
];
for (const { name, section, base, gate, follow } of DETAILS_GATES) {
  test(`GATE ${name}: Yes asks for the details box and keeps it; changing to No removes it from the database`, async () => {
    const { token, appId } = await fullApplication();
    const missing = await put(token, section, { ...base, [gate]: true });
    assert.equal(missing.status, 422, JSON.stringify(missing.json));
    assert.equal(missing.json.errors[follow], 'This question is required');

    const yes = await put(token, section, { ...base, [gate]: true, [follow]: 'Plain made-up details' });
    assert.equal(yes.status, 200, JSON.stringify(yes.json));
    assert.equal((await rawDoc(appId)).answers[follow], 'Plain made-up details');

    const no = await put(token, section, { ...base, [gate]: false, [follow]: 'stale details' });
    assert.equal(no.status, 200, JSON.stringify(no.json));
    assert.deepEqual(no.json.data.removed, [follow]);
    const stored = await rawDoc(appId);
    assert.equal(follow in stored.answers, false);
    assert.equal(JSON.stringify(stored).includes('Plain made-up details'), false, 'the old text is gone from the whole document');
    assert.equal(JSON.stringify(stored).includes('stale details'), false);
    assert.equal(stored.answers[gate], false);
  });
}

test('GATE 7.4: changing to No prunes the visit count and every visit', async () => {
  const { token, appId } = await fullApplication();
  assert.equal((await rawDoc(appId)).answers.ukVisits.length, 2);

  const res = await put(token, '7', { ...S7, q7_4: false });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.data.removed.sort(), ['q7_5', 'ukVisits']);
  const stored = await rawDoc(appId);
  assert.equal('q7_5' in stored.answers, false);
  assert.equal('ukVisits' in stored.answers, false);
  assert.equal(stored.answers.q7_7, true, 'the rest of the section is untouched');
  assert.equal(stored.answers.immigrationProblems.length, 1);

  const back = await put(token, '7', { ...S7, q7_4: true, q7_5: undefined, ukVisits: undefined });
  assert.equal(back.status, 422);
  assert.equal(back.json.errors.q7_5, 'This question is required');
});

test('GATE 7.7: changing to No prunes every immigration problem', async () => {
  const { token, appId } = await fullApplication();
  const res = await put(token, '7', { ...S7, q7_7: false });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.data.removed, ['immigrationProblems']);
  const stored = await rawDoc(appId);
  assert.equal('immigrationProblems' in stored.answers, false);
  assert.equal(JSON.stringify(stored.answers).includes('Made-up details of what happened'), false);
  assert.equal(stored.answers.ukVisits.length, 2);
});

test('GATE 8.2: changing to No prunes every trip, and 8.1 stays', async () => {
  const { token, appId } = await fullApplication();
  const res = await put(token, '8', { q8_1: 3, q8_2: false, otherCountryTrips: [TRIP] });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.data.removed, ['otherCountryTrips']);
  const stored = await rawDoc(appId);
  assert.equal('otherCountryTrips' in stored.answers, false);
  assert.equal(stored.answers.q8_1, 3);
  assert.equal(stored.sectionStatus['8'], 'saved');
});

test('count-driven group: 7.5 must match the number of visits, and nothing is written when it does not', async () => {
  const { token, appId } = await start();
  const snapshot = await rawDoc(appId);

  const tooFew = await put(token, '7', { ...S7, q7_5: 3 });
  assert.equal(tooFew.status, 422);
  assert.deepEqual(tooFew.json.errors, { ukVisits: 'Give details for exactly 3 visits' });
  const tooMany = await put(token, '7', { ...S7, q7_5: 1 });
  assert.equal(tooMany.status, 422);
  assert.deepEqual(tooMany.json.errors, { ukVisits: 'Give details for exactly 1 visit' });
  assert.deepEqual(await rawDoc(appId), snapshot, 'rejected saves change nothing');

  const ok = await put(token, '7', S7);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal((await rawDoc(appId)).answers.ukVisits.length, 2);

  const fewer = await put(token, '7', { ...S7, q7_5: 1, ukVisits: [VISIT] });
  assert.equal(fewer.status, 200, JSON.stringify(fewer.json));
  assert.equal((await rawDoc(appId)).answers.ukVisits.length, 1, 'the group follows the new count');
  assert.equal((await rawDoc(appId)).answers.q7_5, 1);
});

test('count-driven group: counts of 0, over the limit and fractions are refused on 7.5 only', async () => {
  const { token } = await start();
  for (const [count, message] of [[0, 'Number is too small'], [21, 'Number is too large'], [1.5, 'Enter a whole number'], [-1, 'Number is too small']]) {
    const res = await put(token, '7', { ...S7, q7_5: count });
    assert.equal(res.status, 422, String(count));
    assert.deepEqual(res.json.errors, { q7_5: message }, String(count));
  }
  const limit = await put(token, '7', { ...S7, q7_5: 20, ukVisits: Array.from({ length: 20 }, () => VISIT) });
  assert.equal(limit.status, 200, JSON.stringify(limit.json));
});

test('dates: events in Parts 7 and 8 cannot be in the future, and "past 10 years" dates cannot be older', async () => {
  const { token, appId } = await start();
  const snapshot = await rawDoc(appId);

  const old = await put(token, '7', { ...S7, q7_2: monthsAgo(130), ukVisits: [{ ...VISIT, q7_5b: monthsAgo(140) }, VISIT] });
  assert.equal(old.status, 422);
  assert.deepEqual(old.json.errors, { q7_2: 'Must be within the past 10 years', 'ukVisits.0.q7_5b': 'Must be within the past 10 years' });

  const future = await put(token, '7', { ...S7, q7_2: monthsAgo(-2), immigrationProblems: [{ ...PROBLEM, q7_7c: monthsAgo(-1) }] });
  assert.equal(future.status, 422);
  assert.deepEqual(future.json.errors, { q7_2: 'Cannot be in the future', 'immigrationProblems.0.q7_7c': 'Cannot be in the future' });

  const trips = await put(token, '8', { q8_1: 0, q8_2: true, otherCountryTrips: [{ ...TRIP, q8_2c: daysAhead(5), q8_2d: daysAhead(9) }] });
  assert.deepEqual(trips.json.errors, { 'otherCountryTrips.0.q8_2c': 'Cannot be in the future', 'otherCountryTrips.0.q8_2d': 'Cannot be in the future' });
  const ancient = await put(token, '8', { q8_1: 0, q8_2: true, otherCountryTrips: [{ ...TRIP, q8_2c: daysAgo(4400), q8_2d: daysAgo(4390) }] });
  assert.deepEqual(ancient.json.errors, { 'otherCountryTrips.0.q8_2d': 'Must be within the past 10 years' });
  const order = await put(token, '8', { q8_1: 0, q8_2: true, otherCountryTrips: [{ ...TRIP, q8_2c: daysAgo(100), q8_2d: daysAgo(100) }] });
  assert.deepEqual(order.json.errors, { 'otherCountryTrips.0.q8_2d': 'Must be after the date in question 8.2c' });

  assert.deepEqual(await rawDoc(appId), snapshot, 'rejected saves change nothing');
  assert.equal((await put(token, '7', { ...S7, immigrationProblems: [{ ...PROBLEM, q7_7c: monthsAgo(480) }] })).status, 200, '7.7 says ever: a 40-year-old event is fine');
});

test('applications saved under config 0.3.0 (Parts 1-6) keep their answers; a saved Yes without the new details box needs review', async () => {
  const { token, appId } = await start();
  for (const [section, answers] of ALL.slice(0, 13)) assert.equal((await put(token, section, answers)).status, 200, section);
  // Put the application back into the shape step 6b left it in: 6.6 answered Yes, saved before 6.6a existed.
  await TouristVisaApplication.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(appId) },
    { $set: { 'answers.q6_6': true, currentSection: '6D', configVersion: '0.3.0-draft' } }
  );

  const app = await get(token);
  assert.equal(app.answers.q6_6, true, 'the saved answer is returned unchanged');
  assert.equal(app.answers.q6_3.amount, 1500);
  assert.equal(app.configVersion, '0.3.0-draft');
  assert.equal(app.sectionStatus['6B'], 'needs_review');
  assert.deepEqual(Object.entries(app.sectionStatus).filter(([, s]) => s !== 'saved').map(([id]) => id), ['6B']);
  assert.equal(app.currentSection, '6B');

  const fix = await put(token, '6B', { q6_6: true, q6_6a: 'Plain made-up details' });
  assert.equal(fix.status, 200, JSON.stringify(fix.json));
  assert.equal(fix.json.data.application.sectionStatus['6B'], 'saved');
  assert.equal(fix.json.data.application.currentSection, '7', 'the new Part 7 is next');
});

test('an unknown section is still a 404', async () => {
  const { token } = await start();
  assert.equal((await put(token, '9', {})).status, 404);
  assert.equal((await put(token, '8A', {})).status, 404);
});
