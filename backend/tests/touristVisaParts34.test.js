'use strict';

// Step 6a tests: Parts 3 and 4 on the real config, through the real routes.
// Covers: a gate in Part 2 (2.13) hiding a whole section (4A), the passport leave-date rule
// across sections (3.4 vs 1.7), the always-open parents group, encryption of the passport number,
// and applications saved before this step. In-memory MongoDB, made-up users and answers.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
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
    name: `Test Parts34 ${userCounter}`,
    email: `test.parts34.${userCounter}@example.com`,
    password: 'not-a-real-password',
  });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const res = await api('POST', '/applications', { token });
  return { token, appId: res.json.data.application.id };
}
const put = (token, sectionId, answers) => api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const get = async (token) => (await api('GET', '/applications/me', { token })).json.data.application;
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: new mongoose.Types.ObjectId(appId) });

// Made-up answers.
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
  q2_12: 'female', q2_13: 'married', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville',
  q2_17: '1990-01-01', q2_18: false, q2_23: false,
};
const S2C = { q2_24: ADDRESS, q2_25: true, q2_27: { years: 2, months: 3 }, q2_28: 'owned', q2_30: false, q2_31: false };
const S2D = { q2_32: { countryCode: '+44', number: '7700 900123' }, q2_33: 'in_uk', q2_34: 'mobile', q2_35: ['call'] };
const S3 = { q3_1: 'FAKE-PASSPORT-9876', q3_2: 'Test Passport Office', q3_3: '2022-05-01', q3_4: '2032-05-01' };
const S4A = { q4_1: 'Testpartner', q4_2: 'Testsurname', q4_3: '1991-02-03', q4_4: 'GB', q4_5: true, q4_6: false };
const DEPENDANT = { q4_7a: 'son', q4_7b: 'Testchild', q4_7c: 'Testsurname', q4_7d: '2015-06-07', q4_7e: true, q4_7f: false };
const S4B = { q4_7: true, dependants: [DEPENDANT] };
const PARENT = { q4_8a: 'mother', q4_8b: 'Testmother', q4_8c: 'Testsurname', q4_8d: '1962-01-02', q4_8e: 'GB', q4_8f: true };
const S4C = { parents: [PARENT, { ...PARENT, q4_8a: 'father', q4_8b: 'Testfather', q4_8f: false }] };

const ALL = [['1', S1], ['2A', S2A], ['2B', S2B], ['2C', S2C], ['2D', S2D], ['3', S3], ['4A', S4A], ['4B', S4B], ['4C', S4C]];

async function fullApplication() {
  const ctx = await start();
  for (const [section, answers] of ALL) {
    const res = await put(ctx.token, section, answers);
    assert.equal(res.status, 200, `${section}: ${JSON.stringify(res.json)}`);
  }
  return ctx;
}

const PARTNER_IDS = ['q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5', 'q4_6'];

// ---------------------------------------------------------------------------

test('a complete application: every section saves, the passport number is ciphertext, the rest is readable', async () => {
  const { token, appId } = await fullApplication();
  const app = await get(token);

  assert.deepEqual(app.sectionStatus, { 1: 'saved', '2A': 'saved', '2B': 'saved', '2C': 'saved', '2D': 'saved', 3: 'saved', '4A': 'saved', '4B': 'saved', '4C': 'saved' });
  assert.equal(app.currentSection, '5', 'Parts 1-4 saved: resume at the first section of Part 5');
  assert.equal(app.answers.q3_1, 'FAKE-PASSPORT-9876');
  assert.equal(app.answers.q4_1, 'Testpartner');
  assert.equal(app.answers.dependants[0].q4_7b, 'Testchild');
  assert.equal(app.answers.parents.length, 2);

  const stored = await rawDoc(appId);
  assert.match(stored.answers.q3_1, /^enc:v1:/);
  assert.equal(stored.answers.q3_2, 'Test Passport Office', 'only the number is encrypted');
  assert.equal(JSON.stringify(stored).includes('FAKE-PASSPORT-9876'), false);
});

test('GATE CHANGE: changing 2.13 to a status without a partner prunes the 4A answers on the server and clears its status', async () => {
  const { token, appId } = await fullApplication();
  const before = await rawDoc(appId);
  for (const id of PARTNER_IDS) assert.notEqual(before.answers[id], undefined, `${id} was stored`);
  assert.equal(before.sectionStatus['4A'], 'saved');

  const res = await put(token, '2B', { ...S2B, q2_13: 'single' });
  assert.equal(res.status, 200, JSON.stringify(res.json));

  // The response says what was removed, and nothing else is flagged: 4B and 4C do not depend on 2.13.
  assert.deepEqual(res.json.data.removed.sort(), PARTNER_IDS);
  assert.deepEqual(res.json.data.needsReview, []);

  // The database no longer holds the partner's details, in any form.
  const stored = await rawDoc(appId);
  for (const id of PARTNER_IDS) assert.equal(id in stored.answers, false, `${id} was removed from the database`);
  assert.equal(JSON.stringify(stored.answers).includes('Testpartner'), false);
  assert.equal('4A' in stored.sectionStatus, false, '4A has no status: it no longer applies');

  // Everything else is untouched.
  assert.equal(stored.answers.q2_13, 'single');
  assert.match(stored.answers.q3_1, /^enc:v1:/);
  assert.equal(stored.answers.dependants.length, 1);
  assert.equal(stored.answers.parents.length, 2);
  assert.equal(stored.sectionStatus['4B'], 'saved');

  // What the applicant sees: no 4A row, resume skips it.
  const app = await get(token);
  assert.equal('4A' in app.sectionStatus, false);
  assert.equal(app.currentSection, '5');
  assert.deepEqual(res.json.data.application.sectionStatus, app.sectionStatus);
});

test('changing 2.13 back brings 4A back as not started, with the old answers gone', async () => {
  const { token, appId } = await fullApplication();
  await put(token, '2B', { ...S2B, q2_13: 'single' });

  const back = await put(token, '2B', { ...S2B, q2_13: 'unmarried_partner' });
  assert.equal(back.status, 200);
  assert.deepEqual(back.json.data.needsReview, [], 'a section that was never re-saved is not flagged');
  assert.equal('4A' in back.json.data.application.sectionStatus, false);
  assert.equal(back.json.data.application.currentSection, '4A', 'resume points at the section that is back');
  assert.equal('q4_1' in (await rawDoc(appId)).answers, false);

  const fill = await put(token, '4A', S4A);
  assert.equal(fill.status, 200, JSON.stringify(fill.json));
  assert.equal(fill.json.data.application.sectionStatus['4A'], 'saved');
  assert.equal(fill.json.data.application.currentSection, '5');
});

test('a section that does not apply cannot be saved, and nothing is written', async () => {
  // A new application has no 2.13 answer yet, so 4A does not apply.
  const fresh = await start();
  const before = await rawDoc(fresh.appId);
  const res = await put(fresh.token, '4A', S4A);
  assert.equal(res.status, 400);
  assert.equal(res.json.message, 'This section does not apply to your application.');
  assert.deepEqual(await rawDoc(fresh.appId), before);

  // Same after 2.13 says single.
  const { token, appId } = await fullApplication();
  await put(token, '2B', { ...S2B, q2_13: 'single' });
  const snapshot = await rawDoc(appId);
  const again = await put(token, '4A', S4A);
  assert.equal(again.status, 400);
  assert.deepEqual(await rawDoc(appId), snapshot);
});

test('the 2.23 follow-up is pruned when 2.23 changes to No', async () => {
  const { token, appId } = await start();
  const yes = await put(token, '2B', { ...S2B, q2_23: true, q2_23a: 'Plain made-up details' });
  assert.equal(yes.status, 200, JSON.stringify(yes.json));
  assert.equal((await rawDoc(appId)).answers.q2_23a, 'Plain made-up details');

  const missing = await put(token, '2B', { ...S2B, q2_23: true });
  assert.equal(missing.status, 422);
  assert.equal(missing.json.errors.q2_23a, 'This question is required');

  const no = await put(token, '2B', { ...S2B, q2_23: false, q2_23a: 'stale details' });
  assert.equal(no.status, 200);
  assert.deepEqual(no.json.data.removed, ['q2_23a']);
  assert.equal('q2_23a' in (await rawDoc(appId)).answers, false);
});

test('3.4 must be after the planned leave date saved in section 1 (a rule across sections)', async () => {
  const { token } = await start();
  await put(token, '1', S1); // leaves on 2027-03-15

  const same = await put(token, '3', { ...S3, q3_4: '2027-03-15' });
  assert.equal(same.status, 422);
  assert.equal(same.json.errors.q3_4, 'Must be after the date in question 1.7');

  const ok = await put(token, '3', { ...S3, q3_4: '2027-03-16' });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
});

test('moving the leave date past the passport expiry flags section 3 for review, and re-saving 3 clears it', async () => {
  const { token, appId } = await start();
  await put(token, '1', S1);
  await put(token, '3', { ...S3, q3_4: '2027-06-01' });

  const moved = await put(token, '1', { ...S1, q1_7: '2027-07-01' });
  assert.equal(moved.status, 200, JSON.stringify(moved.json));
  assert.deepEqual(moved.json.data.needsReview, ['3']);
  assert.equal((await rawDoc(appId)).sectionStatus['3'], 'needs_review');
  assert.equal((await get(token)).currentSection, '2A', 'sections before it are still unsaved');

  const fixed = await put(token, '3', { ...S3, q3_4: '2027-08-01' });
  assert.equal(fixed.status, 200);
  assert.equal(fixed.json.data.application.sectionStatus['3'], 'saved');
});

test('saving the passport before section 1 works; the leave-date check applies once section 1 is saved', async () => {
  const { token } = await start();
  const early = await put(token, '3', { ...S3, q3_4: '2027-01-01' });
  assert.equal(early.status, 200, JSON.stringify(early.json));

  const later = await put(token, '1', S1); // leaves on 2027-03-15, after the passport expires
  assert.equal(later.status, 200);
  assert.deepEqual(later.json.data.needsReview, ['3']);
});

test('4B: a Yes needs at least one dependant; a No removes them', async () => {
  const { token, appId } = await start();
  const none = await put(token, '4B', { q4_7: true });
  assert.equal(none.status, 422);
  assert.equal(none.json.errors.dependants, 'Add at least one entry');

  assert.equal((await put(token, '4B', S4B)).status, 200);
  assert.equal((await rawDoc(appId)).answers.dependants[0].q4_7e, true, 'Yes/No members are stored as booleans');

  const no = await put(token, '4B', { q4_7: false, dependants: [DEPENDANT] });
  assert.equal(no.status, 200);
  assert.deepEqual(no.json.data.removed, ['dependants']);
  assert.equal('dependants' in (await rawDoc(appId)).answers, false);
});

test('4C: the parents group is always open and needs at least one parent, entries keep their order', async () => {
  const { token, appId } = await start();

  for (const answers of [{}, { parents: [] }]) {
    const res = await put(token, '4C', answers);
    assert.equal(res.status, 422);
    assert.equal(res.json.errors.parents, 'Add at least one entry');
  }

  const blank = await put(token, '4C', { parents: [{}] });
  assert.equal(blank.status, 422);
  assert.deepEqual(Object.keys(blank.json.errors).sort(), ['parents.0.q4_8a', 'parents.0.q4_8b', 'parents.0.q4_8c', 'parents.0.q4_8d', 'parents.0.q4_8e', 'parents.0.q4_8f']);

  const ok = await put(token, '4C', S4C);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const stored = (await rawDoc(appId)).answers.parents;
  assert.deepEqual(stored.map((p) => p.q4_8b), ['Testmother', 'Testfather']);
});

test('applications saved before step 6a (config 0.1.0) keep their answers and resume at the new Part 3', async () => {
  const { token, appId } = await start();
  const answers = { ...S1, ...S2A, ...S2B, q2_13: 'single', ...S2C, ...S2D };
  await TouristVisaApplication.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(appId) },
    { $set: {
      answers,
      sectionStatus: { 1: 'saved', '2A': 'saved', '2B': 'saved', '2C': 'saved', '2D': 'saved' },
      currentSection: '2D',
      configVersion: '0.1.0-draft',
    } }
  );

  const app = await get(token);
  assert.deepEqual(app.answers, answers, 'every saved answer is returned unchanged');
  assert.deepEqual(app.sectionStatus, { 1: 'saved', '2A': 'saved', '2B': 'saved', '2C': 'saved', '2D': 'saved' });
  assert.equal(app.currentSection, '3', 'the stored resume point was the old last section; the new Part 3 is next');
  assert.equal(app.configVersion, '0.1.0-draft', 'the version the answers were collected with is kept');

  // Part 2 can still be re-saved as it was.
  const resave = await put(token, '2B', { ...S2B, q2_13: 'single' });
  assert.equal(resave.status, 200, JSON.stringify(resave.json));
});

test('an old saved 2B with 2.23 = Yes is shown as needing review, because the follow-up 2.23a is new', async () => {
  const { token, appId } = await start();
  const answers = { ...S1, ...S2A, ...S2B, q2_13: 'single', q2_23: true, ...S2C, ...S2D };
  await TouristVisaApplication.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(appId) },
    { $set: {
      answers,
      sectionStatus: { 1: 'saved', '2A': 'saved', '2B': 'saved', '2C': 'saved', '2D': 'saved' },
      currentSection: '2D',
    } }
  );

  const app = await get(token);
  assert.equal(app.sectionStatus['2B'], 'needs_review');
  assert.equal(app.sectionStatus['2C'], 'saved');
  assert.equal(app.currentSection, '2B');
  assert.equal(app.answers.q2_23, true, 'the saved answer is not touched');

  const fix = await put(token, '2B', { ...S2B, q2_13: 'single', q2_23: true, q2_23a: 'Plain made-up details' });
  assert.equal(fix.status, 200, JSON.stringify(fix.json));
  assert.equal(fix.json.data.application.sectionStatus['2B'], 'saved');
  assert.equal(fix.json.data.application.currentSection, '3');
});

test('an unknown section is still a 404', async () => {
  const { token } = await start();
  assert.equal((await put(token, '4D', {})).status, 404);
});
