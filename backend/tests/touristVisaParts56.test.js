'use strict';

// Step 6b tests: Parts 5 and 6 on the real config, through the real routes.
// Covers: the three new gates (5.1, 6.1, 6.7) pruning hidden answers on the server, amount limits,
// the stay dates checked against the travel dates in section 1 (a rule across sections), overlapping
// stays, and applications saved before this step. In-memory MongoDB, made-up users and answers.

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
    name: `Test Parts56 ${userCounter}`,
    email: `test.parts56.${userCounter}@example.com`,
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
const gbp = (amount) => ({ amount, currency: 'GBP' });
const S1 = {
  q1_1: 'tourism', q1_2: false, q1_3: false, q1_4: 'tbc_a',
  q1_5: 'Test trip for automated tests.', q1_6: '2027-03-01', q1_7: '2027-03-15',
};
const S2A = {
  q2_1: 'Testfirst', q2_2: 'Testlast', q2_3: false,
  q2_4: 'test.applicant@example.com', q2_5: 'tbc_self', q2_6: false,
  q2_9: 'test.applicant@example.com', q2_10: 'test.applicant@example.com', q2_11: 'test.applicant@example.com',
};
const S2B = {
  q2_12: 'tbc_a', q2_13: 'tbc_single', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville',
  q2_17: '1990-01-01', q2_18: false, q2_23: false,
};
const S2C = { q2_24: ADDRESS, q2_25: true, q2_27: { years: 2, months: 3 }, q2_28: 'tbc_owned', q2_30: false, q2_31: false };
const S2D = { q2_32: { countryCode: '+44', number: '7700 900123' }, q2_33: 'tbc_a', q2_34: 'mobile', q2_35: ['call'] };
const S3 = { q3_1: 'FAKE-PASSPORT-9876', q3_2: 'Test Passport Office', q3_3: '2022-05-01', q3_4: '2032-05-01' };
const DEPENDANT = { q4_7a: 'tbc_child', q4_7b: 'Testchild', q4_7c: 'Testsurname', q4_7d: '2015-06-07', q4_7e: true, q4_7f: false };
const S4B = { q4_7: true, dependants: [DEPENDANT] };
const PARENT = { q4_8a: 'tbc_mother', q4_8b: 'Testmother', q4_8c: 'Testsurname', q4_8d: '1962-01-02', q4_8e: 'GB', q4_8f: true };
const S4C = { parents: [PARENT] };

const S5 = {
  q5_1: 'tbc_employed', q5_2: '2019-04', q5_3: 'Test Employer Ltd', q5_4: ADDRESS,
  q5_5: { countryCode: '+44', number: '20 7946 0000' }, q5_6: 'Test Analyst',
  q5_7: gbp(2500.5), q5_8: 'Made-up description of a made-up job.', q5_9: 'Previous Test Co',
};
const S6A = { q6_1: 'tbc_savings', q6_2: gbp(8000), q6_3: gbp(1500), q6_4: gbp(900), q6_5: false };
const S6B = { q6_6: false };
const STAY = {
  q6_7a: 'Test Hotel', q6_7b: { line1: '2 Test Road', town: 'Testtown', country: 'GB' },
  q6_7c: '2027-03-01', q6_7d: '2027-03-08',
};
const stayOn = (from, to, name = 'Test Hotel') => ({ ...STAY, q6_7a: name, q6_7c: from, q6_7d: to });
const S6C = { q6_7: true, accommodation: [STAY, stayOn('2027-03-08', '2027-03-15', 'Second Test Hotel')] };
const S6D = { q6_8: false };

const ALL = [
  ['1', S1], ['2A', S2A], ['2B', S2B], ['2C', S2C], ['2D', S2D], ['3', S3], ['4B', S4B], ['4C', S4C],
  ['5', S5], ['6A', S6A], ['6B', S6B], ['6C', S6C], ['6D', S6D],
];

async function fullApplication() {
  const ctx = await start();
  for (const [section, answers] of ALL) {
    const res = await put(ctx.token, section, answers);
    assert.equal(res.status, 200, `${section}: ${JSON.stringify(res.json)}`);
  }
  return ctx;
}

const EMPLOYED_IDS = ['q5_2', 'q5_3', 'q5_4', 'q5_5', 'q5_6', 'q5_7', 'q5_8', 'q5_9'];

// ---------------------------------------------------------------------------

test('a complete application: Parts 5 and 6 save, amounts stay numbers, and the last section is where the applicant resumes', async () => {
  const { token, appId } = await fullApplication();
  const app = await get(token);

  assert.deepEqual(app.sectionStatus, {
    1: 'saved', '2A': 'saved', '2B': 'saved', '2C': 'saved', '2D': 'saved', 3: 'saved',
    '4B': 'saved', '4C': 'saved', 5: 'saved', '6A': 'saved', '6B': 'saved', '6C': 'saved', '6D': 'saved',
  });
  assert.equal(app.currentSection, '7', 'Parts 1-6 are saved: resume at the first section of Part 7');

  const stored = await rawDoc(appId);
  assert.deepEqual(stored.answers.q5_7, gbp(2500.5));
  assert.equal(stored.answers.q5_3, 'Test Employer Ltd');
  assert.equal(stored.answers.accommodation.length, 2);
  assert.equal(stored.answers.accommodation[1].q6_7a, 'Second Test Hotel');
  assert.match(stored.answers.q3_1, /^enc:v1:/, 'the passport number is still encrypted');
});

test('GATE CHANGE 5.1: changing the employment status prunes 5.2 to 5.9 on the server', async () => {
  const { token, appId } = await fullApplication();
  const before = await rawDoc(appId);
  for (const id of EMPLOYED_IDS) assert.notEqual(before.answers[id], undefined, `${id} was stored`);

  const res = await put(token, '5', { ...S5, q5_1: 'tbc_student' });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.data.removed.sort(), EMPLOYED_IDS);
  assert.deepEqual(res.json.data.needsReview, []);

  const stored = await rawDoc(appId);
  for (const id of EMPLOYED_IDS) assert.equal(id in stored.answers, false, `${id} was removed from the database`);
  assert.equal(JSON.stringify(stored.answers).includes('Test Employer Ltd'), false);
  assert.equal(stored.answers.q5_1, 'tbc_student');
  assert.equal(stored.sectionStatus['5'], 'saved', 'the section stays saved: it still applies, with fewer questions');

  // Everything else is untouched.
  assert.deepEqual(stored.answers.q6_3, gbp(1500));
  assert.equal(stored.answers.accommodation.length, 2);
  assert.match(stored.answers.q3_1, /^enc:v1:/);
});

test('changing 5.1 back to employed asks for 5.2 to 5.8 again, with the old answers gone', async () => {
  const { token } = await fullApplication();
  await put(token, '5', { q5_1: 'tbc_not_working' });

  const back = await put(token, '5', { q5_1: 'tbc_employed' });
  assert.equal(back.status, 422);
  assert.deepEqual(Object.keys(back.json.errors).sort(), ['q5_2', 'q5_3', 'q5_4', 'q5_5', 'q5_6', 'q5_7', 'q5_8']);
});

test('GATE CHANGE 6.1: changing to an answer without savings prunes 6.2', async () => {
  const { token, appId } = await fullApplication();
  assert.deepEqual((await rawDoc(appId)).answers.q6_2, gbp(8000));

  const res = await put(token, '6A', { ...S6A, q6_1: 'tbc_none' });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.data.removed, ['q6_2']);
  assert.deepEqual(res.json.data.needsReview, []);

  const stored = await rawDoc(appId);
  assert.equal('q6_2' in stored.answers, false);
  assert.equal(stored.answers.q6_1, 'tbc_none');
  assert.deepEqual(stored.answers.q6_3, gbp(1500), 'the other amounts are untouched');

  const missing = await put(token, '6A', { ...S6A, q6_2: undefined });
  assert.equal(missing.status, 422);
  assert.equal(missing.json.errors.q6_2, 'This question is required', 'savings are asked again when 6.1 includes savings');
});

test('GATE CHANGE 6.7: changing to No prunes every place of stay', async () => {
  const { token, appId } = await fullApplication();
  assert.equal((await rawDoc(appId)).answers.accommodation.length, 2);

  const res = await put(token, '6C', { q6_7: false, accommodation: S6C.accommodation });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.data.removed, ['accommodation']);

  const stored = await rawDoc(appId);
  assert.equal('accommodation' in stored.answers, false);
  assert.equal(JSON.stringify(stored.answers).includes('Test Hotel'), false);
  assert.equal(stored.answers.q6_7, false);
  assert.equal(stored.sectionStatus['6C'], 'saved');
});

test('amounts: negative and too-large values are refused, with nothing written', async () => {
  const { token, appId } = await start();
  const snapshot = await rawDoc(appId);

  const negative = await put(token, '5', { ...S5, q5_7: gbp(-100) });
  assert.equal(negative.status, 422);
  assert.equal(negative.json.errors['q5_7.amount'], 'Cannot be negative');

  const huge = await put(token, '6A', { ...S6A, q6_2: gbp(100000001) });
  assert.equal(huge.status, 422);
  assert.equal(huge.json.errors['q6_2.amount'], 'Amount cannot be more than 100,000,000');

  const spend = await put(token, '6A', { ...S6A, q6_3: gbp(1000001), q6_4: gbp(-1) });
  assert.equal(spend.json.errors['q6_3.amount'], 'Amount cannot be more than 1,000,000');
  assert.equal(spend.json.errors['q6_4.amount'], 'Cannot be negative');

  assert.deepEqual(await rawDoc(appId), snapshot, 'rejected saves change nothing');

  const limit = await put(token, '6A', { ...S6A, q6_2: gbp(100000000), q6_3: gbp(1000000), q6_4: gbp(0) });
  assert.equal(limit.status, 200, 'the maximum itself, and zero, are accepted');
});

test('6C: a stay must be inside the travel dates saved in section 1 (a rule across sections)', async () => {
  const { token, appId } = await start();
  await put(token, '1', S1); // 2027-03-01 to 2027-03-15

  const before = await put(token, '6C', { q6_7: true, accommodation: [stayOn('2027-02-27', '2027-03-05')] });
  assert.equal(before.status, 422);
  assert.equal(before.json.errors['accommodation.0.q6_7c'], 'Must be on or after the date in question 1.6');

  const after = await put(token, '6C', { q6_7: true, accommodation: [stayOn('2027-03-10', '2027-03-20')] });
  assert.equal(after.status, 422);
  assert.equal(after.json.errors['accommodation.0.q6_7d'], 'Must be on or before the date in question 1.7');

  assert.equal('accommodation' in (await rawDoc(appId)).answers, false, 'nothing was saved');
  const whole = await put(token, '6C', { q6_7: true, accommodation: [stayOn('2027-03-01', '2027-03-15')] });
  assert.equal(whole.status, 200, JSON.stringify(whole.json));
});

test('6C: stays that overlap are refused; stays that meet on one day are accepted', async () => {
  const { token, appId } = await start();
  await put(token, '1', S1);

  const overlap = await put(token, '6C', {
    q6_7: true, accommodation: [stayOn('2027-03-01', '2027-03-09'), stayOn('2027-03-08', '2027-03-15', 'Second')],
  });
  assert.equal(overlap.status, 422);
  assert.deepEqual(overlap.json.errors, { 'accommodation.1.q6_7c': 'Overlaps the dates of Place of stay 1' });
  assert.equal('accommodation' in (await rawDoc(appId)).answers, false);

  const meet = await put(token, '6C', S6C);
  assert.equal(meet.status, 200, JSON.stringify(meet.json));
});

test('moving the travel dates so a saved stay no longer fits flags 6C for review, and re-saving 6C clears it', async () => {
  const { token, appId } = await start();
  await put(token, '1', S1);
  await put(token, '6C', S6C); // stays 2027-03-01 to 2027-03-15

  const moved = await put(token, '1', { ...S1, q1_7: '2027-03-10' });
  assert.equal(moved.status, 200, JSON.stringify(moved.json));
  assert.deepEqual(moved.json.data.needsReview, ['6C']);
  assert.equal((await rawDoc(appId)).sectionStatus['6C'], 'needs_review');
  assert.equal((await get(token)).currentSection, '2A', 'sections before it are still unsaved');

  const fixed = await put(token, '6C', { q6_7: true, accommodation: [stayOn('2027-03-01', '2027-03-10')] });
  assert.equal(fixed.status, 200, JSON.stringify(fixed.json));
  assert.equal(fixed.json.data.application.sectionStatus['6C'], 'saved');

  const unchanged = await put(token, '1', { ...S1, q1_7: '2027-03-10' });
  assert.deepEqual(unchanged.json.data.needsReview, [], 'saving section 1 again without changing the dates flags nothing');
});

test('6C can be saved before section 1; the date check applies once section 1 is saved', async () => {
  const { token } = await start();
  const early = await put(token, '6C', { q6_7: true, accommodation: [stayOn('2030-01-01', '2030-01-09')] });
  assert.equal(early.status, 200, JSON.stringify(early.json));

  const later = await put(token, '1', S1);
  assert.equal(later.status, 200);
  assert.deepEqual(later.json.data.needsReview, ['6C']);
});

test('a No on 6.7 needs no further answers; a Yes on 6.5, 6.6 or 6.8 asks for one details box', async () => {
  const { token } = await start();
  assert.equal((await put(token, '6C', { q6_7: false })).status, 200);
  const noDetails = await put(token, '6B', { q6_6: true });
  assert.equal(noDetails.status, 422);
  assert.equal(noDetails.json.errors.q6_6a, 'This question is required');
  assert.equal((await put(token, '6B', { q6_6: true, q6_6a: 'Made-up details' })).status, 200);
  assert.equal((await put(token, '6D', { q6_8: true, q6_8a: 'Made-up details' })).status, 200);
  assert.equal((await put(token, '6A', { ...S6A, q6_5: true, q6_5a: 'Made-up details' })).status, 200);
  assert.equal((await put(token, '6B', {})).status, 422);
});

test('applications saved under config 0.2.0 (Parts 1-4 only) keep their answers and resume at Part 5', async () => {
  const { token, appId } = await start();
  // Save Parts 1-4 through the real routes (so the passport number is encrypted), then put the
  // application back into the shape the previous step left it in.
  for (const [section, answers] of ALL.slice(0, 8)) assert.equal((await put(token, section, answers)).status, 200, section);
  await TouristVisaApplication.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(appId) },
    { $set: { currentSection: '4C', configVersion: '0.2.0-draft' } }
  );

  const app = await get(token);
  assert.equal(app.answers.dependants[0].q4_7b, 'Testchild', 'saved answers are returned unchanged');
  assert.equal(app.answers.parents.length, 1);
  assert.deepEqual(Object.values(app.sectionStatus).filter((s) => s !== 'saved'), [], 'no saved section is flagged');
  assert.equal(app.currentSection, '5', 'the stored resume point was the old last section; the new Part 5 is next');
  assert.equal(app.configVersion, '0.2.0-draft');

  const resave = await put(token, '4C', S4C);
  assert.equal(resave.status, 200, JSON.stringify(resave.json));
  assert.equal(resave.json.data.application.currentSection, '5');
});

test('an unknown section is still a 404', async () => {
  const { token } = await start();
  assert.equal((await put(token, '6E', {})).status, 404);
  assert.equal((await put(token, '9', {})).status, 404);
});
