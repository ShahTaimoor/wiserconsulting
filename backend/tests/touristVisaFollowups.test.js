'use strict';

// Step 7b tests: the follow-up questions added to Parts 1 to 4, through the real routes.
// Covers: every new gate pruning hidden answers on the server (1.2, 1.3, 2.23, 2.28 -> 2.29, 2.30,
// 2.31, 4.8 both ways, and the inside-an-entry questions 2.23e, 2.31e and 4.8h/4.8i), the new
// sensitive fields being ciphertext in the database, old Yes answers showing "Needs review", and
// old values that no longer have a question (such as the old 2.23a text) staying stored, untouched.
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
    name: `Test Followups ${userCounter}`,
    email: `test.followups.${userCounter}@example.com`,
    password: 'not-a-real-password',
  });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const res = await api('POST', '/applications', { token });
  return { token, appId: res.json.data.application.id };
}
const put = (token, sectionId, answers) => api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const get = async (token) => (await api('GET', '/applications/me', { token })).json.data.application;
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: new mongoose.Types.ObjectId(appId) });
const gbp = (amount) => ({ amount, currency: 'GBP' });

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
  q2_12: 'female', q2_13: 'single', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville',
  q2_17: '1990-01-01', q2_18: false, q2_23: false,
};
const S2C = { q2_24: ADDRESS, q2_25: true, q2_27: { years: 2, months: 3 }, q2_28: 'owned', q2_30: false, q2_31: false };
const S2D = { q2_32: { countryCode: '+44', number: '7700 900123' }, q2_33: 'in_uk', q2_34: 'mobile', q2_35: ['call'] };
const PARENT = { q4_8a: 'mother', q4_8b: 'Testmother', q4_8c: 'Testsurname', q4_8d: '1962-01-02', q4_8e: 'GB', q4_8f: true };

const COMPANION = { q1_3a: 'friend', q1_3b: 'Testcompanion', q1_3c: 'Testsurname' };
const NATIONALITY = { q2_23b: 'FR', q2_23c: 'birth', q2_23d: true };
const TREATMENT = { q2_31a: '2023-04', q2_31b: 'Made-up treatment description', q2_31c: 'Test Hospital', q2_31d: true };
const LICENCE = 'TESTLICENCE12345';

// Every gate: the section, the answers that open it, the answers that close it, and what must disappear.
const GATES = [
  {
    name: '1.2 (organised group)', section: '1',
    open: { ...S1, q1_2: true, q1_2a: 'Test Tours Ltd', q1_2b: 'tour' }, close: { ...S1, q1_2: false, q1_2a: 'Test Tours Ltd', q1_2b: 'tour' },
    removed: ['q1_2a', 'q1_2b'], gone: ['q1_2a', 'q1_2b'], sample: 'Test Tours Ltd',
  },
  {
    name: '1.3 (companions)', section: '1',
    open: { ...S1, q1_3: true, companions: [COMPANION] }, close: { ...S1, q1_3: false, companions: [COMPANION] },
    removed: ['companions'], gone: ['companions'], sample: 'Testcompanion',
  },
  {
    name: '2.23 (other nationalities)', section: '2B',
    open: { ...S2B, q2_23: true, otherNationalities: [NATIONALITY] }, close: { ...S2B, q2_23: false, otherNationalities: [NATIONALITY] },
    removed: ['otherNationalities'], gone: ['otherNationalities'], sample: null,
  },
  {
    name: '2.28 -> 2.29 (living situation details)', section: '2C',
    open: { ...S2C, q2_28: 'with_family_or_friends', q2_29: 'Made-up living details' }, close: { ...S2C, q2_28: 'owned', q2_29: 'Made-up living details' },
    removed: ['q2_29'], gone: ['q2_29'], sample: 'Made-up living details',
  },
  {
    name: '2.30 (licence number)', section: '2C',
    open: { ...S2C, q2_30: true, q2_30a: LICENCE }, close: { ...S2C, q2_30: false, q2_30a: LICENCE },
    removed: ['q2_30a'], gone: ['q2_30a'], sample: LICENCE,
  },
  {
    name: '2.31 (medical treatment)', section: '2C',
    open: { ...S2C, q2_31: true, medicalTreatments: [TREATMENT] }, close: { ...S2C, q2_31: false, medicalTreatments: [TREATMENT] },
    removed: ['medicalTreatments'], gone: ['medicalTreatments'], sample: 'Made-up treatment description',
  },
  {
    name: '4.8 Yes -> No (parents)', section: '4C',
    open: { q4_8: true, parents: [PARENT] }, close: { q4_8: false, parents: [PARENT], q4_8g: 'I was adopted' },
    removed: ['parents'], gone: ['parents'], sample: 'Testmother',
  },
];

for (const gate of GATES) {
  test(`GATE ${gate.name}: the follow-ups are kept while open, and removed from the database when closed`, async () => {
    const { token, appId } = await start();
    const opened = await put(token, gate.section, gate.open);
    assert.equal(opened.status, 200, JSON.stringify(opened.json));
    for (const key of gate.gone) assert.notEqual((await rawDoc(appId)).answers[key], undefined, `${key} was stored`);

    const closed = await put(token, gate.section, gate.close);
    assert.equal(closed.status, 200, JSON.stringify(closed.json));
    assert.deepEqual(closed.json.data.removed.sort(), [...gate.removed].sort());
    const stored = await rawDoc(appId);
    for (const key of gate.gone) assert.equal(key in stored.answers, false, `${key} was removed from the database`);
    if (gate.sample) assert.equal(JSON.stringify(stored).includes(gate.sample), false, 'no trace of the removed text');
    assert.equal(stored.sectionStatus[gate.section], 'saved', 'the section itself stays saved');
  });
}

test('GATE 4.8 No -> Yes: the optional reason is removed when parents are given', async () => {
  const { token, appId } = await start();
  assert.equal((await put(token, '4C', { q4_8: false, q4_8g: 'I was adopted' })).status, 200);
  assert.equal((await rawDoc(appId)).answers.q4_8g, 'I was adopted');
  assert.equal((await put(token, '4C', { q4_8: false })).status, 200, 'the reason is optional');

  const yes = await put(token, '4C', { q4_8: true, parents: [PARENT], q4_8g: 'I was adopted' });
  assert.equal(yes.status, 200, JSON.stringify(yes.json));
  assert.deepEqual(yes.json.data.removed, []);
  assert.equal('q4_8g' in (await rawDoc(appId)).answers, false, 'a Yes never stores the reason');
  // Going back to No removes the parents again.
  const back = await put(token, '4C', { q4_8: false });
  assert.deepEqual(back.json.data.removed, ['parents']);
});

test('GATE inside an entry: 2.23e, 2.31e and 4.8h/4.8i are removed when their entry question changes', async () => {
  const { token, appId } = await start();

  await put(token, '2B', { ...S2B, q2_23: true, otherNationalities: [{ ...NATIONALITY, q2_23d: false, q2_23e: '2015-06' }] });
  assert.equal((await rawDoc(appId)).answers.otherNationalities[0].q2_23e, '2015-06');
  await put(token, '2B', { ...S2B, q2_23: true, otherNationalities: [{ ...NATIONALITY, q2_23d: true, q2_23e: '2015-06' }] });
  assert.equal('q2_23e' in (await rawDoc(appId)).answers.otherNationalities[0], false, 'held again: the end date is gone');

  await put(token, '2C', { ...S2C, q2_31: true, medicalTreatments: [{ ...TREATMENT, q2_31d: false, q2_31e: gbp(120.5) }] });
  assert.deepEqual((await rawDoc(appId)).answers.medicalTreatments[0].q2_31e, gbp(120.5));
  await put(token, '2C', { ...S2C, q2_31: true, medicalTreatments: [{ ...TREATMENT, q2_31d: true, q2_31e: gbp(120.5) }] });
  assert.equal('q2_31e' in (await rawDoc(appId)).answers.medicalTreatments[0], false, 'paid in full: the amount owing is gone');

  await put(token, '4C', { q4_8: true, parents: [{ ...PARENT, q4_8f: false, q4_8h: 'FR', q4_8i: '2001-05' }] });
  const before = (await rawDoc(appId)).answers.parents[0];
  assert.deepEqual([before.q4_8h, before.q4_8i], ['FR', '2001-05']);
  await put(token, '4C', { q4_8: true, parents: [{ ...PARENT, q4_8f: true, q4_8h: 'FR', q4_8i: '2001-05' }] });
  const after = (await rawDoc(appId)).answers.parents[0];
  assert.deepEqual([('q4_8h' in after), ('q4_8i' in after)], [false, false], 'the same nationality: the previous one is gone');
});

test('a rejected save changes nothing: missing follow-ups, a future date, an over-long licence number, too many entries', async () => {
  const { token, appId } = await start();
  const snapshot = await rawDoc(appId);
  const cases = [
    ['1', { ...S1, q1_2: true }, { q1_2a: 'This question is required' }],
    ['1', { ...S1, q1_3: true, companions: [{ ...COMPANION, q1_3d: '2090-01-01' }] }, { 'companions.0.q1_3d': 'Cannot be in the future' }],
    ['2B', { ...S2B, q2_23: true, otherNationalities: [{ q2_23b: 'FR' }] }, { 'otherNationalities.0.q2_23c': 'This question is required', 'otherNationalities.0.q2_23d': 'This question is required' }],
    ['2C', { ...S2C, q2_28: 'other' }, { q2_29: 'This question is required' }],
    ['2C', { ...S2C, q2_30: true, q2_30a: 'x'.repeat(31) }, { q2_30a: 'Must be 30 characters or fewer' }],
    ['2C', { ...S2C, q2_31: true, medicalTreatments: [{ ...TREATMENT, q2_31a: '2090-01' }] }, { 'medicalTreatments.0.q2_31a': 'Cannot be in the future' }],
    ['4C', { q4_8: true, parents: Array.from({ length: 5 }, () => PARENT) }, { parents: 'You can add up to 4 entries' }],
    ['4C', { q4_8: true, parents: [{ ...PARENT, q4_8f: false }] }, { 'parents.0.q4_8h': 'This question is required' }],
  ];
  for (const [section, answers, errors] of cases) {
    const res = await put(token, section, answers);
    assert.equal(res.status, 422, `${section}: ${JSON.stringify(res.json)}`);
    assert.deepEqual(res.json.errors, errors, section);
  }
  assert.deepEqual(await rawDoc(appId), snapshot, 'nothing was written');
});

test('the new sensitive fields are ciphertext in the database: licence number and treatment text', async () => {
  const { token, appId } = await start();
  const res = await put(token, '2C', {
    ...S2C, q2_30: true, q2_30a: LICENCE, q2_31: true,
    medicalTreatments: [TREATMENT, { ...TREATMENT, q2_31b: 'Second made-up treatment', q2_31c: 'Other Clinic' }],
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));

  const stored = await rawDoc(appId);
  assert.match(stored.answers.q2_30a, /^enc:v1:/);
  assert.match(stored.answers.medicalTreatments[0].q2_31b, /^enc:v1:/);
  assert.match(stored.answers.medicalTreatments[1].q2_31b, /^enc:v1:/);
  assert.notEqual(stored.answers.medicalTreatments[0].q2_31b, stored.answers.medicalTreatments[1].q2_31b);
  // Nothing readable anywhere in the stored document.
  const everything = JSON.stringify(stored);
  for (const secret of [LICENCE, 'Made-up treatment description', 'Second made-up treatment']) {
    assert.equal(everything.includes(secret), false, `${secret} is not stored in plain text`);
  }
  // The rest of the entry is stored as typed.
  assert.equal(stored.answers.medicalTreatments[0].q2_31c, 'Test Hospital');
  assert.equal(stored.answers.medicalTreatments[0].q2_31a, '2023-04');

  // The owner gets them back readable.
  const mine = await get(token);
  assert.equal(mine.answers.q2_30a, LICENCE);
  assert.equal(mine.answers.medicalTreatments[0].q2_31b, 'Made-up treatment description');
  assert.equal(mine.answers.medicalTreatments[1].q2_31b, 'Second made-up treatment');
});

test('the licence number is optional: leaving it out stores nothing', async () => {
  const { token, appId } = await start();
  assert.equal((await put(token, '2C', { ...S2C, q2_30: true })).status, 200);
  assert.equal('q2_30a' in (await rawDoc(appId)).answers, false);
});

/** An application as step 7a left it (config 0.5.0): Yes answers with no follow-ups, the old 2.23a text, parents without 4.8. */
async function oldApplication() {
  const { token, appId } = await start();
  const old = {
    ...S1, q1_2: true, q1_3: true,
    ...S2A,
    ...S2B, q2_23: true, q2_23a: 'old details text, a question that no longer exists',
    ...S2C, q2_28: 'with_family_or_friends', q2_30: true, q2_31: true,
    ...S2D,
    parents: [PARENT],
  };
  await TouristVisaApplication.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(appId) },
    { $set: {
      answers: old,
      sectionStatus: { 1: 'saved', '2A': 'saved', '2B': 'saved', '2C': 'saved', '2D': 'saved', '4C': 'saved' },
      currentSection: '4C',
      configVersion: '0.5.0-draft',
    } }
  );
  return { token, appId, old };
}

test('old Yes answers show Needs review, old No answers stay saved, and reading changes nothing in the database', async () => {
  const { token, appId, old } = await oldApplication();
  const before = await rawDoc(appId);

  const app = await get(token);
  assert.deepEqual(app.answers, old, 'every saved answer is returned unchanged, the old 2.23a text included');
  assert.deepEqual(app.sectionStatus, {
    1: 'needs_review', '2A': 'saved', '2B': 'needs_review', '2C': 'needs_review', '2D': 'saved', '4C': 'needs_review',
  });
  assert.equal(app.currentSection, '1');
  assert.equal(app.configVersion, '0.5.0-draft');
  assert.deepEqual(await rawDoc(appId), before, 'reading the application wrote nothing');
});

test('old values with no question any more are left in the database untouched, even after the sections are saved again', async () => {
  const { token, appId } = await oldApplication();
  const OLD_TEXT = 'old details text, a question that no longer exists';

  const fix2B = await put(token, '2B', { ...S2B, q2_23: true, otherNationalities: [NATIONALITY] });
  assert.equal(fix2B.status, 200, JSON.stringify(fix2B.json));
  assert.equal(fix2B.json.data.application.sectionStatus['2B'], 'saved');
  let stored = await rawDoc(appId);
  assert.equal(stored.answers.q2_23a, OLD_TEXT, 'the orphaned 2.23a text is still stored');
  assert.deepEqual(fix2B.json.data.removed, [], 'and it was not reported as removed');

  // Saving other sections, including the ones that flag or prune, leaves it alone too.
  assert.equal((await put(token, '2A', S2A)).status, 200);
  assert.equal((await put(token, '2B', { ...S2B, q2_23: false })).status, 200, 'even closing the 2.23 gate only removes the group');
  stored = await rawDoc(appId);
  assert.equal(stored.answers.q2_23a, OLD_TEXT);
  assert.equal('otherNationalities' in stored.answers, false);
  assert.deepEqual(stored.answers.parents, [PARENT], 'the old parents are still stored: 4.8 has not been answered, so they are waiting, not hidden');
  assert.equal(stored.answers.q1_2, true, 'and so are the old Yes answers of the other sections');

  // It never comes back to the applicant as an answer to any question on screen.
  const mine = await get(token);
  assert.equal(mine.answers.q2_23a, OLD_TEXT, 'the API returns stored answers as they are; no form question reads it');
});

test('each old Yes section can be fixed by saving it once: Needs review turns into saved, one section at a time', async () => {
  const { token } = await oldApplication();
  const fixes = [
    ['1', { ...S1, q1_2: true, q1_2a: 'Test Tours Ltd', q1_3: true, companions: [COMPANION] }],
    ['2B', { ...S2B, q2_23: true, otherNationalities: [NATIONALITY] }],
    ['2C', { ...S2C, q2_28: 'with_family_or_friends', q2_29: 'Made-up living details', q2_30: true, q2_31: true, medicalTreatments: [TREATMENT] }],
    ['4C', { q4_8: true, parents: [PARENT] }],
  ];
  for (const [section, answers] of fixes) {
    const res = await put(token, section, answers);
    assert.equal(res.status, 200, `${section}: ${JSON.stringify(res.json)}`);
    assert.equal(res.json.data.application.sectionStatus[section], 'saved', section);
  }
  const app = await get(token);
  assert.deepEqual(Object.values(app.sectionStatus).filter((s) => s !== 'saved'), []);
});

test('a valid fill-in for each changed section saves, with the answers in order', async () => {
  const { token, appId } = await start();
  const sections = [
    ['1', { ...S1, q1_2: true, q1_2a: 'Test Tours Ltd', q1_2b: 'school_college', q1_3: true, companions: [COMPANION, { ...COMPANION, q1_3b: 'Second', q1_3d: '1991-05-06', q1_3e: 'GB' }] }],
    ['2A', { ...S2A, q2_3: true, otherNames: [{ q2_3a: 'Alias', q2_3b: 'One', q2_3c: 'nickname' }] }],
    ['2B', { ...S2B, q2_23: true, otherNationalities: [NATIONALITY, { q2_23b: 'DE', q2_23c: 'descent', q2_23d: false, q2_23e: '2012-09' }] }],
    ['2C', { ...S2C, q2_28: 'other', q2_29: 'Made-up living details', q2_30: true, q2_30a: LICENCE, q2_31: true, medicalTreatments: [TREATMENT, { ...TREATMENT, q2_31d: false, q2_31e: gbp(80) }] }],
    ['4C', { q4_8: true, parents: [PARENT, { ...PARENT, q4_8a: 'father', q4_8b: 'Testfather', q4_8f: false, q4_8h: 'FR', q4_8i: '2001-05' }] }],
  ];
  for (const [section, answers] of sections) {
    const res = await put(token, section, answers);
    assert.equal(res.status, 200, `${section}: ${JSON.stringify(res.json)}`);
  }
  const stored = (await rawDoc(appId)).answers;
  assert.deepEqual(stored.companions.map((c) => c.q1_3b), ['Testcompanion', 'Second']);
  assert.deepEqual(stored.otherNationalities.map((n) => n.q2_23b), ['FR', 'DE']);
  assert.deepEqual(stored.parents.map((p) => p.q4_8b), ['Testmother', 'Testfather']);
  assert.equal(stored.otherNames[0].q2_3c, 'nickname');
});
