'use strict';

// Step 7c tests: the follow-up questions of Parts 5 and 6, through the real routes.
// Covers: every new gate pruning hidden answers on the server (the 5.1 blocks, 5.1k -> 5.1l, 6.1a, 6.5, 6.6,
// 6.7 No, 6.8), an application saved with an old "employed" answer (it stays saved and untouched), old Yes
// answers showing "Needs review", the old placeholder boxes 6.5a, 6.6a and 6.8a staying stored as orphaned
// values, and the answers waiting for a gate that has not been answered yet being kept.
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
    name: `Test Part56 ${userCounter}`,
    email: `test.part56.${userCounter}@example.com`,
    password: 'not-a-real-password',
  });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const res = await api('POST', '/applications', { token });
  return { token, appId: res.json.data.application.id };
}
const put = (token, sectionId, answers) => api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const get = async (token) => (await api('GET', '/applications/me', { token })).json.data.application;
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: new mongoose.Types.ObjectId(appId) });
const seed = (appId, fields) => TouristVisaApplication.collection.updateOne({ _id: new mongoose.Types.ObjectId(appId) }, { $set: fields });
const gbp = (amount) => ({ amount, currency: 'GBP' });

// Made-up answers.
const ADDRESS = { line1: '1 Test Street', town: 'Testville', country: 'GB' };
const EMPLOYED = {
  q5_1: 'employed', q5_2: '2019-04', q5_3: 'Test Employer Ltd', q5_4: ADDRESS,
  q5_5: { countryCode: '+44', number: '20 7946 0000' }, q5_6: 'Test Analyst',
  q5_7: gbp(2500), q5_8: 'Made-up description of a made-up job.', q5_9: 'Previous Test Co',
};
const EMPLOYED_IDS = ['q5_2', 'q5_3', 'q5_4', 'q5_5', 'q5_6', 'q5_7', 'q5_8', 'q5_9'];
const SELF_EMPLOYED = { q5_1: 'self_employed', q5_1a: 'Test Business Ltd', q5_1b: '2020-03', q5_1c: ADDRESS, q5_1d: 'Made-up description of a made-up business.', q5_1e: gbp(3000) };
const STUDENT = { q5_1: 'student', q5_1f: 'Test University', q5_1g: ADDRESS, q5_1h: 'Made-up course' };
const RETIRED = { q5_1: 'retired', q5_1i: '2018-06', q5_1j: gbp(900) };
const SUPPORTED = { q5_1: 'homemaker', q5_1k: 'other', q5_1l: 'Made-up support description' };
const S6A = { q6_1: 'none', q6_3: gbp(1500), q6_4: gbp(900), q6_5: false };
const PAYER = { q6_5b: 'relative', q6_5c: 'Testpayer', q6_5d: 'parent', q6_5e: 'GB', q6_5f: gbp(1500), q6_5g: ['travel', 'living_costs'] };
const RELATIVE = { q6_6b: 'sibling', q6_6c: 'Testrelative', q6_6d: 'Testsurname', q6_6e: '1985-04-02', q6_6f: 'GB', q6_6g: 'british_citizen' };
const STAY = {
  q6_7a: 'Test Hotel', q6_7b: { line1: '2 Test Road', town: 'Testtown', country: 'GB' },
  q6_7c: '2027-03-01', q6_7d: '2027-03-08',
};
const FUNDS = { q6_8b: 'housing_benefit', q6_8c: '2023-01', q6_8d: '2023-06', q6_8e: gbp(250) };

// Every gate: the section, the answers that open it, the answers that close it, and what must disappear.
const GATES = [
  {
    name: '5.1 self-employed block', section: '5', open: SELF_EMPLOYED, close: { ...SELF_EMPLOYED, q5_1: 'retired' },
    removed: ['q5_1a', 'q5_1b', 'q5_1c', 'q5_1d', 'q5_1e'], sample: 'Test Business Ltd',
  },
  {
    name: '5.1 student block', section: '5', open: STUDENT, close: { ...STUDENT, q5_1: 'retired' },
    removed: ['q5_1f', 'q5_1g', 'q5_1h'], sample: 'Made-up course',
  },
  {
    name: '5.1 retired block', section: '5', open: RETIRED, close: { ...RETIRED, q5_1: 'homemaker' },
    removed: ['q5_1i', 'q5_1j'], sample: null,
  },
  {
    name: '5.1k -> 5.1l (support described)', section: '5', open: SUPPORTED, close: { ...SUPPORTED, q5_1k: 'savings' },
    removed: ['q5_1l'], sample: 'Made-up support description',
  },
  {
    name: '5.1 homemaker block closes when the status changes', section: '5', open: SUPPORTED, close: { ...SUPPORTED, q5_1: 'retired' },
    removed: ['q5_1k', 'q5_1l'], sample: 'Made-up support description',
  },
  {
    name: '6.1 -> 6.1a (other income)', section: '6A', open: { ...S6A, q6_1: 'other_income', q6_1a: gbp(400) }, close: { ...S6A, q6_1: 'none', q6_1a: gbp(400) },
    removed: ['q6_1a'], sample: null,
  },
  {
    name: '6.5 (who is paying)', section: '6A', open: { ...S6A, q6_5: true, payers: [PAYER] }, close: { ...S6A, q6_5: false, payers: [PAYER] },
    removed: ['payers'], sample: 'Testpayer',
  },
  {
    name: '6.6 (family in the UK)', section: '6B', open: { q6_6: true, ukFamily: [RELATIVE] }, close: { q6_6: false, ukFamily: [RELATIVE] },
    removed: ['ukFamily'], sample: 'Testrelative',
  },
  {
    name: '6.7 No -> Yes (plans removed when stays are given)', section: '6C',
    open: { q6_7: false, q6_7x: 'paid_stay', q6_7y: 'Test City' }, close: { q6_7: true, accommodation: [STAY], q6_7x: 'paid_stay', q6_7y: 'Test City' },
    removed: ['q6_7x', 'q6_7y'], sample: 'Test City',
  },
  {
    name: '6.8 (public funds)', section: '6D', open: { q6_8: true, publicFunds: [FUNDS] }, close: { q6_8: false, publicFunds: [FUNDS] },
    removed: ['publicFunds'], sample: null,
  },
];

for (const gate of GATES) {
  test(`GATE ${gate.name}: the answers are kept while open, and removed from the database when closed`, async () => {
    const { token, appId } = await start();
    const opened = await put(token, gate.section, gate.open);
    assert.equal(opened.status, 200, JSON.stringify(opened.json));
    for (const key of gate.removed) assert.notEqual((await rawDoc(appId)).answers[key], undefined, `${key} was stored`);

    const closed = await put(token, gate.section, gate.close);
    assert.equal(closed.status, 200, JSON.stringify(closed.json));
    assert.deepEqual(closed.json.data.removed.sort(), [...gate.removed].sort());
    const stored = await rawDoc(appId);
    for (const key of gate.removed) assert.equal(key in stored.answers, false, `${key} was removed from the database`);
    if (gate.sample) assert.equal(JSON.stringify(stored).includes(gate.sample), false, 'no trace of the removed text');
    assert.equal(stored.sectionStatus[gate.section], 'saved', 'the section itself stays saved');
  });
}

test('GATE 6.7 Yes -> No: the stays are removed and the accommodation plans are asked', async () => {
  const { token, appId } = await start();
  assert.equal((await put(token, '6C', { q6_7: true, accommodation: [STAY] })).status, 200);
  const missing = await put(token, '6C', { q6_7: false });
  assert.equal(missing.status, 422);
  assert.equal(missing.json.errors.q6_7x, 'This question is required');
  const no = await put(token, '6C', { q6_7: false, q6_7x: 'family_friends', accommodation: [STAY] });
  assert.equal(no.status, 200, JSON.stringify(no.json));
  assert.deepEqual(no.json.data.removed, ['accommodation']);
  const stored = await rawDoc(appId);
  assert.equal('accommodation' in stored.answers, false);
  assert.equal(stored.answers.q6_7x, 'family_friends');
  assert.equal('q6_7y' in stored.answers, false, 'the area is optional and was not given');
});

test('switching between employment statuses leaves only the block of the status in force', async () => {
  const { token, appId } = await start();
  for (const [answers, kept, gone] of [
    [EMPLOYED, ['q5_3'], ['q5_1a', 'q5_1f', 'q5_1i', 'q5_1k']],
    [SELF_EMPLOYED, ['q5_1a'], ['q5_3', 'q5_1f', 'q5_1i']],
    [STUDENT, ['q5_1f'], ['q5_1a', 'q5_3', 'q5_1i']],
    [RETIRED, ['q5_1i'], ['q5_1f', 'q5_1a', 'q5_3']],
    [SUPPORTED, ['q5_1k', 'q5_1l'], ['q5_1i', 'q5_3']],
    [EMPLOYED, ['q5_3'], ['q5_1k', 'q5_1l', 'q5_1i']],
  ]) {
    const res = await put(token, '5', answers);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const stored = (await rawDoc(appId)).answers;
    for (const id of kept) assert.notEqual(stored[id], undefined, `${answers.q5_1}: ${id} is stored`);
    for (const id of gone) assert.equal(id in stored, false, `${answers.q5_1}: ${id} is gone`);
  }
});

/** An application as step 7b left it (config 0.6.0): employed, and Yes answers with the old placeholder boxes. */
async function oldApplication() {
  const { token, appId } = await start();
  const old = {
    ...EMPLOYED,
    q6_1: 'other_income', q6_3: gbp(1500), q6_4: gbp(900), q6_5: true, q6_5a: 'old payer text',
    q6_6: true, q6_6a: 'old family text',
    q6_7: false,
    q6_8: true, q6_8a: 'old funds text',
  };
  await seed(appId, {
    answers: old,
    sectionStatus: { 5: 'saved', '6A': 'saved', '6B': 'saved', '6C': 'saved', '6D': 'saved' },
    currentSection: '6D',
    configVersion: '0.6.0-draft',
  });
  return { token, appId, old };
}

test('5.1 old "employed" application: the section stays saved, every employer answer comes back unchanged, and reading writes nothing', async () => {
  const { token, appId, old } = await oldApplication();
  const before = await rawDoc(appId);

  const app = await get(token);
  assert.equal(app.sectionStatus['5'], 'saved', 'an employed application needs no new answer, so it is not flagged');
  for (const id of ['q5_1', ...EMPLOYED_IDS]) assert.deepEqual(app.answers[id], old[id], id);
  assert.deepEqual(await rawDoc(appId), before, 'reading the application wrote nothing');
});

test('5.1 old "employed" application: saving other sections, or section 5 itself, never removes an employer answer', async () => {
  const { token, appId, old } = await oldApplication();

  const fix6A = await put(token, '6A', { ...S6A, q6_1: 'other_income', q6_5: true, payers: [PAYER] });
  assert.equal(fix6A.status, 200, JSON.stringify(fix6A.json));
  assert.deepEqual(fix6A.json.data.removed, [], 'no employer answer was reported as removed');
  assert.equal((await put(token, '6B', { q6_6: false })).status, 200);

  let stored = (await rawDoc(appId)).answers;
  for (const id of ['q5_1', ...EMPLOYED_IDS]) assert.deepEqual(stored[id], old[id], `${id} is still stored`);

  const resave = await put(token, '5', EMPLOYED);
  assert.equal(resave.status, 200, JSON.stringify(resave.json));
  assert.deepEqual(resave.json.data.removed, []);
  assert.equal(resave.json.data.application.sectionStatus['5'], 'saved');
  stored = (await rawDoc(appId)).answers;
  for (const id of ['q5_1', ...EMPLOYED_IDS]) assert.deepEqual(stored[id], old[id], `${id} is still stored after re-saving`);
});

test('5.1 answers saved before the status was answered are kept: unrelated saves do not remove them', async () => {
  const { token, appId } = await start();
  const { q5_1, ...withoutStatus } = EMPLOYED;
  assert.equal(q5_1, 'employed');
  await seed(appId, { answers: withoutStatus, sectionStatus: {}, configVersion: '0.5.0-draft' });

  const res = await put(token, '6B', { q6_6: false });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.data.removed, [], 'nothing is reported as removed');
  const stored = (await rawDoc(appId)).answers;
  for (const id of EMPLOYED_IDS) assert.deepEqual(stored[id], withoutStatus[id], `${id} is waiting for 5.1, not removed`);
  // Answering 5.1 with a status that hides them does remove them, as it always did.
  const student = await put(token, '5', STUDENT);
  assert.deepEqual(student.json.data.removed.sort(), [...EMPLOYED_IDS].sort());
  assert.equal('q5_3' in (await rawDoc(appId)).answers, false);
});

test('old Yes answers show Needs review; old answers that need nothing new stay saved; reading changes nothing', async () => {
  const { token, appId, old } = await oldApplication();
  const before = await rawDoc(appId);

  const app = await get(token);
  assert.deepEqual(app.answers, old, 'every saved answer is returned unchanged, the old placeholder text included');
  assert.deepEqual(app.sectionStatus, {
    5: 'saved', '6A': 'needs_review', '6B': 'needs_review', '6C': 'needs_review', '6D': 'needs_review',
  });
  assert.equal(app.currentSection, '1', 'sections 1 to 4 were never saved in this fixture, so the applicant resumes at the first');
  assert.equal(app.configVersion, '0.6.0-draft', 'the version the answers were collected with is kept');
  assert.deepEqual(await rawDoc(appId), before);
});

test('old statuses: self-employed and student need the new answers (Needs review); retired, homemaker and other do not', async () => {
  const cases = [
    [{ q5_1: 'self_employed' }, 'needs_review'],
    [{ q5_1: 'student' }, 'needs_review'],
    [{ q5_1: 'retired' }, 'saved'],
    [{ q5_1: 'homemaker' }, 'saved'],
    [{ q5_1: 'unemployed' }, 'saved'],
    [{ q5_1: 'other' }, 'saved'],
  ];
  for (const [answers, expected] of cases) {
    const { token, appId } = await start();
    await seed(appId, { answers, sectionStatus: { 5: 'saved' }, configVersion: '0.6.0-draft' });
    assert.equal((await get(token)).sectionStatus['5'], expected, answers.q5_1);
  }
});

test('the old placeholder boxes 6.5a, 6.6a and 6.8a stay stored, untouched, after the sections are saved again', async () => {
  const { token, appId, old } = await oldApplication();

  const fixes = [
    ['6A', { ...S6A, q6_1: 'other_income', q6_5: true, payers: [PAYER] }],
    ['6B', { q6_6: true, ukFamily: [RELATIVE] }],
    ['6C', { q6_7: false, q6_7x: 'not_decided' }],
    ['6D', { q6_8: true, publicFunds: [FUNDS] }],
  ];
  for (const [section, answers] of fixes) {
    const res = await put(token, section, answers);
    assert.equal(res.status, 200, `${section}: ${JSON.stringify(res.json)}`);
    assert.deepEqual(res.json.data.removed, [], `${section}: nothing was removed`);
    assert.equal(res.json.data.application.sectionStatus[section], 'saved', section);
  }
  const stored = (await rawDoc(appId)).answers;
  assert.equal(stored.q6_5a, old.q6_5a);
  assert.equal(stored.q6_6a, old.q6_6a);
  assert.equal(stored.q6_8a, old.q6_8a);
  // Closing the gates removes the new groups only, never the orphaned boxes.
  assert.equal((await put(token, '6B', { q6_6: false })).status, 200);
  assert.equal('ukFamily' in (await rawDoc(appId)).answers, false);
  assert.equal((await rawDoc(appId)).answers.q6_6a, old.q6_6a);
});

test('a valid fill-in for each changed section saves, with the entries in order and nothing encrypted', async () => {
  const { token, appId } = await start();
  const sections = [
    ['5', SELF_EMPLOYED],
    ['6A', { ...S6A, q6_1: 'savings_and_income', q6_2: gbp(8000), q6_1a: gbp(400), q6_5: true, payers: [PAYER, { ...PAYER, q6_5c: 'Second Payer', q6_5b: 'employer', q6_5d: 'employer', q6_5f: undefined, q6_5g: undefined }] }],
    ['6B', { q6_6: true, ukFamily: [RELATIVE, { ...RELATIVE, q6_6c: 'Second', q6_6e: undefined, q6_6g: 'dont_know' }] }],
    ['6C', { q6_7: false, q6_7x: 'address_unknown', q6_7y: 'Test City' }],
    ['6D', { q6_8: true, publicFunds: [FUNDS, { q6_8b: 'other', q6_8c: '2022-02' }] }],
  ];
  for (const [section, answers] of sections) {
    const res = await put(token, section, answers);
    assert.equal(res.status, 200, `${section}: ${JSON.stringify(res.json)}`);
  }
  const doc = await rawDoc(appId);
  const stored = doc.answers;
  assert.equal(stored.q5_1a, 'Test Business Ltd');
  assert.deepEqual(stored.payers.map((p) => p.q6_5c), ['Testpayer', 'Second Payer']);
  assert.deepEqual(stored.payers[0].q6_5g, ['travel', 'living_costs']);
  assert.deepEqual(stored.ukFamily.map((r) => r.q6_6c), ['Testrelative', 'Second']);
  assert.deepEqual(stored.publicFunds.map((f) => f.q6_8b), ['housing_benefit', 'other']);
  assert.deepEqual(stored.q6_1a, gbp(400));
  assert.equal(JSON.stringify(stored).includes('enc:v1:'), false, 'nothing in Parts 5 and 6 is encrypted');
  assert.equal(JSON.stringify(doc).includes('Testpayer'), true, 'and it is stored as typed');
});

test('rejected saves change nothing: missing follow-ups, bad dates, bad amounts, too many entries', async () => {
  const { token, appId } = await start();
  const snapshot = await rawDoc(appId);
  const cases = [
    ['5', { q5_1: 'self_employed' }, ['q5_1a', 'q5_1b', 'q5_1c', 'q5_1d', 'q5_1e']],
    ['5', { ...SELF_EMPLOYED, q5_1b: '2090-01' }, ['q5_1b']],
    ['5', { ...SELF_EMPLOYED, q5_1d: 'x'.repeat(2001) }, ['q5_1d']],
    ['5', { q5_1: 'student' }, ['q5_1f']],
    ['5', { q5_1: 'retired', q5_1j: gbp(-1) }, ['q5_1j.amount']],
    ['5', { q5_1: 'other', q5_1k: 'other' }, ['q5_1l']],
    ['6A', { ...S6A, q6_5: true }, ['payers']],
    ['6A', { ...S6A, q6_5: true, payers: [{ ...PAYER, q6_5f: gbp(1000001) }] }, ['payers.0.q6_5f.amount']],
    ['6A', { ...S6A, q6_5: true, payers: Array.from({ length: 6 }, () => PAYER) }, ['payers']],
    ['6B', { q6_6: true, ukFamily: [{}] }, ['ukFamily.0.q6_6b', 'ukFamily.0.q6_6c', 'ukFamily.0.q6_6d', 'ukFamily.0.q6_6f', 'ukFamily.0.q6_6g']],
    ['6B', { q6_6: true, ukFamily: Array.from({ length: 11 }, () => RELATIVE) }, ['ukFamily']],
    ['6C', { q6_7: false }, ['q6_7x']],
    ['6D', { q6_8: true, publicFunds: [{ ...FUNDS, q6_8d: '2022-12' }] }, ['publicFunds.0.q6_8d']],
    ['6D', { q6_8: true, publicFunds: Array.from({ length: 6 }, () => FUNDS) }, ['publicFunds']],
  ];
  for (const [section, answers, keys] of cases) {
    const res = await put(token, section, answers);
    assert.equal(res.status, 422, `${section}: ${JSON.stringify(res.json)}`);
    assert.deepEqual(Object.keys(res.json.errors).sort(), [...keys].sort(), `${section} ${JSON.stringify(keys)}`);
  }
  assert.deepEqual(await rawDoc(appId), snapshot, 'nothing was written');
});
