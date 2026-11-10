'use strict';

// Step 7d tests: the follow-up questions of Parts 7 and 8, through the real routes.
// Covers: the three new encrypted fields (visa reference 7.2c, leave-to-remain reference 7.3f,
// breach details 7.6d) stored as ciphertext inside group entries; the 8.1a gate; the cap of 20
// listed visits; and applications saved before this step (old 7.2, 7.3a and 7.6a values stay
// stored and untouched, and an old Yes shows "Needs review").
// In-memory MongoDB, made-up users and answers.

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
    name: `Test Part78 Followups ${userCounter}`,
    email: `test.part78.followups.${userCounter}@example.com`,
    password: 'not-a-real-password',
  });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const res = await api('POST', '/applications', { token });
  return { token, appId: res.json.data.application.id };
}
const put = (token, sectionId, answers) => api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const get = async (token) => (await api('GET', '/applications/me', { token })).json.data.application;
const oid = (appId) => new mongoose.Types.ObjectId(appId);
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: oid(appId) });

const pad = (n) => String(n).padStart(2, '0');
function monthsAgo(n) {
  const d = new Date();
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() - n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

// Made-up answers for the sections before Part 7.
const ADDRESS = { line1: '1 Test Street', town: 'Testville', country: 'GB' };
const gbp = (amount) => ({ amount, currency: 'GBP' });
const BEFORE = [
  ['1', { q1_1: 'tourism', q1_2: false, q1_3: false, q1_4: 'holiday', q1_5: 'Test trip for automated tests.', q1_6: '2027-03-01', q1_7: '2027-03-15' }],
  ['2A', {
    q2_1: 'Testfirst', q2_2: 'Testlast', q2_3: false, q2_4: 'test.applicant@example.com', q2_5: 'me', q2_6: false,
    q2_9: 'test.applicant@example.com', q2_10: 'test.applicant@example.com', q2_11: 'test.applicant@example.com',
  }],
  ['2B', { q2_12: 'female', q2_13: 'single', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville', q2_17: '1990-01-01', q2_18: false, q2_23: false }],
  ['2C', { q2_24: ADDRESS, q2_25: true, q2_27: { years: 2, months: 3 }, q2_28: 'owned', q2_30: false, q2_31: false }],
  ['2D', { q2_32: { countryCode: '+44', number: '7700 900123' }, q2_33: 'in_uk', q2_34: 'mobile', q2_35: ['call'] }],
  ['3', { q3_1: 'FAKE-PASSPORT-9876', q3_2: 'Test Passport Office', q3_3: '2022-05-01', q3_4: '2032-05-01' }],
  ['4B', { q4_7: false }],
  ['4C', { q4_8: true, parents: [{ q4_8a: 'mother', q4_8b: 'Testmother', q4_8c: 'Testsurname', q4_8d: '1962-01-02', q4_8e: 'GB', q4_8f: true }] }],
  ['5', { q5_1: 'retired' }],
  ['6A', { q6_1: 'none', q6_3: gbp(1500), q6_4: gbp(900), q6_5: false }],
  ['6B', { q6_6: false }],
  ['6C', { q6_7: false, q6_7x: 'not_decided' }],
  ['6D', { q6_8: false }],
];

const NO7 = { q7_1: false, q7_3: false, q7_4: false, q7_6: false, q7_7: false };
const VISA = { q7_2a: monthsAgo(30), q7_2b: 'work', q7_2c: 'MADE-UP-VISA-REF-777' };
const LEAVE = { q7_3b: monthsAgo(50), q7_3c: 'study', q7_3d: 'refused', q7_3e: monthsAgo(48), q7_3f: 'MADE-UP-LEAVE-REF-888' };
const BREACH = { q7_6b: 'breached_conditions', q7_6c: monthsAgo(70), q7_6d: 'MADE-UP-BREACH-DETAILS-999' };
const VISIT = { q7_5a: 'tourism', q7_5b: monthsAgo(20), q7_5c: { weeks: 2 } };
const FULL7 = {
  q7_1: true, ukVisas: [VISA, { ...VISA, q7_2c: undefined, q7_2b: 'visitor' }],
  q7_3: true, ukLeaveApplications: [LEAVE],
  q7_4: false,
  q7_6: true, breaches: [BREACH],
  q7_7: false,
};

async function applicationUpToPart6() {
  const ctx = await start();
  for (const [section, answers] of BEFORE) {
    const res = await put(ctx.token, section, answers);
    assert.equal(res.status, 200, `${section}: ${JSON.stringify(res.json)}`);
  }
  return ctx;
}

// ---------------------------------------------------------------------------

test('encryption: 7.2c, 7.3f and 7.6d are ciphertext in the database, inside every group entry, and plain in the answer sent back', async () => {
  const { token, appId } = await applicationUpToPart6();
  const res = await put(token, '7', FULL7);
  assert.equal(res.status, 200, JSON.stringify(res.json));

  const stored = await rawDoc(appId);
  assert.match(stored.answers.ukVisas[0].q7_2c, /^enc:v1:/);
  assert.equal('q7_2c' in stored.answers.ukVisas[1], false, 'an optional reference left empty is not stored at all');
  assert.match(stored.answers.ukLeaveApplications[0].q7_3f, /^enc:v1:/);
  assert.match(stored.answers.breaches[0].q7_6d, /^enc:v1:/);
  const text = JSON.stringify(stored);
  for (const secret of ['MADE-UP-VISA-REF-777', 'MADE-UP-LEAVE-REF-888', 'MADE-UP-BREACH-DETAILS-999']) {
    assert.equal(text.includes(secret), false, `${secret} must not appear anywhere in the stored document`);
  }
  // Everything else in the entries stays readable.
  assert.equal(stored.answers.ukVisas[0].q7_2b, 'work');
  assert.equal(stored.answers.ukLeaveApplications[0].q7_3d, 'refused');
  assert.equal(stored.answers.breaches[0].q7_6b, 'breached_conditions');

  const app = await get(token);
  assert.equal(app.answers.ukVisas[0].q7_2c, 'MADE-UP-VISA-REF-777');
  assert.equal(app.answers.ukLeaveApplications[0].q7_3f, 'MADE-UP-LEAVE-REF-888');
  assert.equal(app.answers.breaches[0].q7_6d, 'MADE-UP-BREACH-DETAILS-999');
  assert.equal(app.sectionStatus['7'], 'saved');
});

test('encryption: only the three new fields are newly encrypted; nothing else in Parts 7 and 8 is ciphertext', async () => {
  const { token, appId } = await applicationUpToPart6();
  assert.equal((await put(token, '7', { ...FULL7, q7_4: true, q7_5: 1, ukVisits: [VISIT], q7_7: true, immigrationProblems: [{ q7_7a: 'refused_visa', q7_7b: 'GB', q7_7c: monthsAgo(100), q7_7d: 'MADE-UP-PROBLEM-TEXT' }] })).status, 200);
  assert.equal((await put(token, '8', { q8_1: 2, q8_1a: ['usa'], q8_2: false })).status, 200);
  const stored = await rawDoc(appId);
  const encrypted = [];
  const walk = (value, where) => {
    if (typeof value === 'string' && value.startsWith('enc:v1:')) encrypted.push(where);
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${where}[${i}]`));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, where ? `${where}.${k}` : k);
  };
  walk(stored.answers, '');
  const inPart78 = encrypted.filter((w) => /q7_|q8_|ukVisits|immigrationProblems|otherCountryTrips|ukVisas|ukLeaveApplications|breaches/.test(w));
  assert.deepEqual(inPart78.sort(), ['breaches[0].q7_6d', 'ukLeaveApplications[0].q7_3f', 'ukVisas[0].q7_2c']);
  assert.equal(JSON.stringify(stored.answers.immigrationProblems).includes('MADE-UP-PROBLEM-TEXT'), true, '7.7d keeps its earlier behaviour: stored as typed');
});

test('encryption: a rejected save stores nothing, and the error messages never contain the typed reference', async () => {
  const { token, appId } = await applicationUpToPart6();
  const snapshot = await rawDoc(appId);
  const res = await put(token, '7', { ...FULL7, ukVisas: [{ ...VISA, q7_2b: 'made_up', q7_2c: 'MADE-UP-VISA-REF-777' }] });
  assert.equal(res.status, 422);
  assert.deepEqual(res.json.errors, { 'ukVisas.0.q7_2b': 'Choose from the listed options' });
  assert.equal(JSON.stringify(res.json).includes('MADE-UP-VISA-REF-777'), false);
  assert.deepEqual(await rawDoc(appId), snapshot);
});

test('GATE 8.1: 8.1a (which places) is optional, needs 8.1 above zero and is pruned when 8.1 goes back to 0', async () => {
  const { token, appId } = await applicationUpToPart6();
  assert.equal((await put(token, '8', { q8_1: 3, q8_2: false })).status, 200, 'optional');
  const ok = await put(token, '8', { q8_1: 3, q8_1a: ['usa', 'eea'], q8_2: false });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.deepEqual((await rawDoc(appId)).answers.q8_1a, ['usa', 'eea']);

  const bad = await put(token, '8', { q8_1: 3, q8_1a: ['mars'], q8_2: false });
  assert.equal(bad.status, 422);
  assert.ok(bad.json.errors.q8_1a);

  const zero = await put(token, '8', { q8_1: 0, q8_1a: ['usa', 'eea'], q8_2: false });
  assert.equal(zero.status, 200, JSON.stringify(zero.json));
  assert.deepEqual(zero.json.data.removed, ['q8_1a']);
  const stored = await rawDoc(appId);
  assert.equal('q8_1a' in stored.answers, false);
  assert.equal(stored.answers.q8_1, 0);
});

test('GATE 7.1, 7.3 and 7.6 together: three No answers remove all three lists in one save', async () => {
  const { token, appId } = await applicationUpToPart6();
  assert.equal((await put(token, '7', FULL7)).status, 200);
  const res = await put(token, '7', { ...NO7, ukVisas: FULL7.ukVisas, ukLeaveApplications: FULL7.ukLeaveApplications, breaches: FULL7.breaches });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.data.removed.sort(), ['breaches', 'ukLeaveApplications', 'ukVisas']);
  const stored = await rawDoc(appId);
  for (const key of ['ukVisas', 'ukLeaveApplications', 'breaches']) assert.equal(key in stored.answers, false, key);
  assert.equal(JSON.stringify(stored).includes('enc:v1:'), true, 'the passport number is still ciphertext');
  assert.equal(stored.answers.q7_1, false);
});

test('the 20 most recent visits: a count of 99 stores 20 visits and the count, and the section stays saved', async () => {
  const { token, appId } = await applicationUpToPart6();
  const res = await put(token, '7', { ...NO7, q7_4: true, q7_5: 99, ukVisits: Array.from({ length: 20 }, () => VISIT) });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const stored = await rawDoc(appId);
  assert.equal(stored.answers.q7_5, 99);
  assert.equal(stored.answers.ukVisits.length, 20);
  const app = await get(token);
  assert.equal(app.sectionStatus['7'], 'saved', 'reading back re-validates with the same cap');
  assert.equal(app.answers.q7_5, 99);
});

// ---------------------------------------------------------------------------
// Applications saved before this step
// ---------------------------------------------------------------------------

/** Put section 7 back into the shape the earlier config (0.7.0) saved: one date, and plain details boxes. */
async function oldPartSeven(appId, answers) {
  const unset = { 'answers.ukVisas': '', 'answers.ukLeaveApplications': '', 'answers.breaches': '' };
  await TouristVisaApplication.collection.updateOne(
    { _id: oid(appId) },
    { $set: { ...Object.fromEntries(Object.entries(answers).map(([k, v]) => [`answers.${k}`, v])), configVersion: '0.7.0-draft' }, $unset: unset }
  );
}

test('old application: a saved No/No/No Part 7 is still saved; old Yes answers (7.1, 7.3, 7.6) need review and nothing is rewritten', async () => {
  const { token, appId } = await applicationUpToPart6();
  assert.equal((await put(token, '7', NO7)).status, 200);
  assert.equal((await put(token, '8', { q8_1: 0, q8_2: false })).status, 200);
  assert.equal((await get(token)).sectionStatus['7'], 'saved', 'all No answers need nothing from the new questions');

  await oldPartSeven(appId, { q7_1: true, q7_2: monthsAgo(30), q7_3: true, q7_3a: 'old leave text', q7_6: true, q7_6a: 'old breach text' });
  const before = await rawDoc(appId);

  const app = await get(token);
  assert.equal(app.sectionStatus['7'], 'needs_review');
  assert.equal(app.sectionStatus['8'], 'saved');
  assert.equal(app.currentSection, '7');
  assert.equal(app.answers.q7_2, before.answers.q7_2, 'the old values are still returned as saved');
  assert.equal(app.answers.q7_3a, 'old leave text');
  assert.deepEqual(await rawDoc(appId), before, 'reading wrote nothing');

  // Saving another section does not touch the old values either.
  assert.equal((await put(token, '6D', { q6_8: false })).status, 200);
  const after = await rawDoc(appId);
  for (const key of ['q7_1', 'q7_2', 'q7_3', 'q7_3a', 'q7_6', 'q7_6a']) assert.deepEqual(after.answers[key], before.answers[key], key);
});

test('old application: answering the new questions saves Part 7 and the old values stay stored as orphans', async () => {
  const { token, appId } = await applicationUpToPart6();
  assert.equal((await put(token, '7', NO7)).status, 200);
  const oldDate = monthsAgo(30);
  await oldPartSeven(appId, { q7_1: true, q7_2: oldDate, q7_3: true, q7_3a: 'old leave text', q7_6: true, q7_6a: 'old breach text' });

  // The old text answers none of the new questions, so a save without the lists is refused.
  const missing = await put(token, '7', { q7_1: true, q7_3: true, q7_4: false, q7_6: true, q7_7: false });
  assert.equal(missing.status, 422);
  assert.deepEqual(missing.json.errors, { ukVisas: 'Add at least one entry', ukLeaveApplications: 'Add at least one entry', breaches: 'Add at least one entry' });
  // The old keys cannot be sent back either.
  const sendOld = await put(token, '7', { ...FULL7, q7_2: oldDate });
  assert.equal(sendOld.status, 400, 'a key the section no longer has is refused as unknown');

  const ok = await put(token, '7', FULL7);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.deepEqual(ok.json.data.removed, [], 'nothing is pruned: the old keys are not part of the questions any more');
  const stored = await rawDoc(appId);
  assert.equal(stored.answers.q7_2, oldDate, 'the old 7.2 date is still in the database');
  assert.equal(stored.answers.q7_3a, 'old leave text');
  assert.equal(stored.answers.q7_6a, 'old breach text');
  assert.equal(stored.answers.ukVisas.length, 2);
  const app = await get(token);
  assert.equal(app.sectionStatus['7'], 'saved');
  assert.equal(app.answers.q7_2, oldDate, 'and it is still returned unchanged');
});

test('keep until answered: a Part 7 gate never answered keeps whatever list is stored; one answered No removes it', async () => {
  const { token, appId } = await applicationUpToPart6();
  // A list stored with no gate answer at all (as an old row could be).
  await TouristVisaApplication.collection.updateOne(
    { _id: oid(appId) },
    { $set: { 'answers.ukVisas': [{ q7_2a: monthsAgo(30), q7_2b: 'work' }] } }
  );
  assert.equal((await put(token, '8', { q8_1: 0, q8_2: false })).status, 200);
  assert.equal((await put(token, '6D', { q6_8: false })).status, 200);
  assert.equal((await rawDoc(appId)).answers.ukVisas.length, 1, 'saving other sections leaves it alone');

  const res = await put(token, '7', { ...NO7, ukVisas: [{ q7_2a: monthsAgo(30), q7_2b: 'work' }] });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.data.removed, ['ukVisas']);
  assert.equal('ukVisas' in (await rawDoc(appId)).answers, false);
});
