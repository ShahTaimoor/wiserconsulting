'use strict';

// Step 8b-1 tests: Part 9 (sections 9A, 9B, 9C) through the real routes.
// Covers: every new gate pruning hidden answers on the server (one test per gate), the new answers stored
// as ciphertext (the Yes/No answers and their details, but not the declaration ticks), the declaration
// record (wording hash, time, user, config version, no IP address), a changed wording asking for the tick
// again, and applications saved before Part 9 staying untouched.
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
const engine = require('../shared/tourist-visa/engine');
const { TouristVisaApplicationService } = require('../services/touristVisaApplicationService');

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
  return { status: res.status, json: await res.json().catch(() => null), text: undefined };
}

async function start() {
  userCounter += 1;
  const user = await User.create({
    name: `Test Part9 ${userCounter}`,
    email: `test.part9.${userCounter}@example.com`,
    password: 'not-a-real-password',
  });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const res = await api('POST', '/applications', { token });
  return { token, appId: res.json.data.application.id, userId: String(user._id) };
}
const put = (token, sectionId, answers) => api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const get = async (token) => (await api('GET', '/applications/me', { token })).json.data.application;
const oid = (id) => new mongoose.Types.ObjectId(id);
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: oid(appId) });
const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

// Made-up answers: every Part 9 question No, every tick given.
const S9A = { q9_11: true, q9_1: false, q9_12: true, q9_2: false };
const S9B = { q9_13: true, q9_3: false, q9_4: false, q9_5: false, q9_14: true, q9_6: false, q9_7: false };
const S9C = { q9_8: false, q9_9: false, q9_10: false };
const DETAILS = 'MADE-UP-DETAILS-OF-WHAT-HAPPENED';
const SECTIONS9 = [['9A', S9A], ['9B', S9B], ['9C', S9C]];

// Parts 1 to 8, for the "application saved before Part 9" tests.
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
  ['7', { q7_1: false, q7_3: false, q7_4: false, q7_6: false, q7_7: false }],
  ['8', { q8_1: 0, q8_2: false }],
];

// ---------------------------------------------------------------------------
// One test per gate
// ---------------------------------------------------------------------------

const GATES = [
  ['q9_1', '9A', S9A], ['q9_2', '9A', S9A],
  ['q9_3', '9B', S9B], ['q9_4', '9B', S9B], ['q9_5', '9B', S9B], ['q9_6', '9B', S9B], ['q9_7', '9B', S9B],
  ['q9_8', '9C', S9C], ['q9_9', '9C', S9C], ['q9_10', '9C', S9C],
];
for (const [gate, section, base] of GATES) {
  const follow = `${gate}a`;
  test(`GATE ${gate.slice(1).replace('_', '.')}: Yes asks for the details (stored encrypted); changing to No removes them from the database`, async () => {
    const { token, appId } = await start();
    assert.equal((await put(token, section, base)).status, 200);
    assert.equal(typeof (await rawDoc(appId)).answers[gate], 'string', 'the Yes/No answer is stored as ciphertext');
    assert.match((await rawDoc(appId)).answers[gate], /^enc:v1:/);

    const before = await rawDoc(appId);
    const missing = await put(token, section, { ...base, [gate]: true });
    assert.equal(missing.status, 422, JSON.stringify(missing.json));
    assert.deepEqual(missing.json.errors, { [follow]: 'This question is required' });
    assert.deepEqual(await rawDoc(appId), before, 'a rejected save changes nothing');

    const yes = await put(token, section, { ...base, [gate]: true, [follow]: DETAILS });
    assert.equal(yes.status, 200, JSON.stringify(yes.json));
    const stored = await rawDoc(appId);
    assert.match(stored.answers[gate], /^enc:v1:/);
    assert.match(stored.answers[follow], /^enc:v1:/);
    assert.equal(JSON.stringify(stored).includes(DETAILS), false, 'the details are not in the document in plain text');
    const app = await get(token);
    assert.equal(app.answers[gate], true);
    assert.equal(app.answers[follow], DETAILS, 'the owner reads them back decrypted');

    const no = await put(token, section, { ...base, [gate]: false, [follow]: 'stale details' });
    assert.equal(no.status, 200, JSON.stringify(no.json));
    assert.deepEqual(no.json.data.removed, [follow]);
    const after = await rawDoc(appId);
    assert.equal(follow in after.answers, false);
    assert.match(after.answers[gate], /^enc:v1:/);
    assert.equal((await get(token)).answers[gate], false, 'a stored No reads back as false, not as missing');
  });
}

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

test('encryption: every Part 9 Yes/No answer and details box is ciphertext, the ticks are not, and the owner reads everything back', async () => {
  const { token, appId } = await start();
  for (const [section, answers] of SECTIONS9) assert.equal((await put(token, section, answers)).status, 200, section);
  assert.equal((await put(token, '9C', { ...S9C, q9_8: true, q9_8a: DETAILS })).status, 200);

  const stored = (await rawDoc(appId)).answers;
  const encrypted = Object.keys(stored).filter((id) => typeof stored[id] === 'string' && stored[id].startsWith('enc:v1:')).sort();
  assert.deepEqual(encrypted, ['q9_1', 'q9_10', 'q9_2', 'q9_3', 'q9_4', 'q9_5', 'q9_6', 'q9_7', 'q9_8', 'q9_8a', 'q9_9'].sort());
  for (const id of ['q9_11', 'q9_12', 'q9_13', 'q9_14']) assert.equal(stored[id], true, `${id} (a tick) is stored as it is`);

  const app = await get(token);
  assert.deepEqual(Object.fromEntries(Object.entries(app.answers).filter(([id]) => id.startsWith('q9_'))), { ...S9A, ...S9B, ...S9C, q9_8: true, q9_8a: DETAILS });
  for (const section of ['9A', '9B', '9C']) assert.equal(app.sectionStatus[section], 'saved', section);
});

test('encryption: a ciphertext cannot be moved to another question (it is bound to the field)', async () => {
  const { token, appId } = await start();
  await put(token, '9A', S9A);
  const stored = (await rawDoc(appId)).answers;
  await TouristVisaApplication.collection.updateOne({ _id: oid(appId) }, { $set: { 'answers.q9_2': stored.q9_1 } });
  const res = await api('GET', '/applications/me', { token });
  assert.equal(res.status, 500, 'a swapped ciphertext fails to decrypt');
  assert.equal(JSON.stringify(res.json).includes('enc:v1:'), false);
});

test('encryption: a rejected save stores nothing and its error never contains what was typed', async () => {
  const { token, appId } = await start();
  const snapshot = await rawDoc(appId);
  const tooLong = `${DETAILS}${'x'.repeat(2001)}`;
  const res = await put(token, '9A', { ...S9A, q9_1: true, q9_1a: tooLong });
  assert.equal(res.status, 422);
  assert.deepEqual(res.json.errors, { q9_1a: 'Must be 2000 characters or fewer' });
  assert.equal(JSON.stringify(res.json).includes('MADE-UP-DETAILS'), false);
  assert.deepEqual(await rawDoc(appId), snapshot);
});

// ---------------------------------------------------------------------------
// Declaration record
// ---------------------------------------------------------------------------

test('declaration record: wording hash, time, user and config version for each tick, and nothing else', async () => {
  const { token, appId, userId } = await start();
  const started = Date.now();
  assert.equal((await put(token, '9A', S9A)).status, 200);
  const records = (await rawDoc(appId)).declarations;
  assert.deepEqual(Object.keys(records).sort(), ['q9_11', 'q9_12']);
  for (const id of ['q9_11', 'q9_12']) {
    const record = records[id];
    assert.deepEqual(Object.keys(record).sort(), ['acceptedAt', 'acceptedBy', 'configVersion', 'wordingSha256'], 'no IP address, browser or other data');
    assert.equal(record.wordingSha256, sha256(engine.wordingOf(engine.config, id)));
    assert.equal(record.configVersion, engine.config.version);
    assert.equal(String(record.acceptedBy), userId);
    assert.ok(record.acceptedAt instanceof Date && record.acceptedAt.getTime() >= started - 1000 && record.acceptedAt.getTime() <= Date.now() + 1000);
  }
  assert.notEqual(records.q9_11.wordingSha256, records.q9_12.wordingSha256, 'each tick has its own wording');
  assert.match(records.q9_11.wordingSha256, /^[0-9a-f]{64}$/);

  // Saving the section again keeps the original record (same time, same user).
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await put(token, '9A', { ...S9A, q9_1: true, q9_1a: DETAILS })).status, 200);
  const again = (await rawDoc(appId)).declarations;
  assert.equal(again.q9_11.acceptedAt.getTime(), records.q9_11.acceptedAt.getTime());
  assert.equal(String(again.q9_12.acceptedBy), userId);

  // The other sections add their own ticks; a section with no tick adds none.
  assert.equal((await put(token, '9B', S9B)).status, 200);
  assert.equal((await put(token, '9C', S9C)).status, 200);
  assert.deepEqual(Object.keys((await rawDoc(appId)).declarations).sort(), ['q9_11', 'q9_12', 'q9_13', 'q9_14']);
});

test('declaration record: a tick that is not given leaves no record, and the applicant never sees the records', async () => {
  const { token, appId } = await start();
  const snapshot = await rawDoc(appId);
  for (const bad of [false, undefined]) {
    const res = await put(token, '9A', { ...S9A, q9_12: bad });
    assert.equal(res.status, 422);
    assert.equal(res.json.errors.q9_12, bad === false ? 'You must tick this box to continue' : 'This question is required');
  }
  assert.deepEqual(await rawDoc(appId), snapshot, 'nothing written, so no record');
  assert.equal((await rawDoc(appId)).declarations && Object.keys((await rawDoc(appId)).declarations).length, 0);

  await put(token, '9A', S9A);
  const body = JSON.stringify((await api('GET', '/applications/me', { token })).json);
  assert.equal(body.includes('declarations'), false);
  assert.equal(body.includes('wordingSha256'), false);
  assert.equal(body.includes((await rawDoc(appId)).declarations.q9_11.wordingSha256), false);
});

test('declaration record: changed wording shows the tick unticked and the section as Needs review, until it is ticked again', async () => {
  const { token, appId, userId } = await start();
  await put(token, '9A', S9A);
  const original = (await rawDoc(appId)).declarations;

  const changed = JSON.parse(JSON.stringify(engine.config));
  changed.questions.find((q) => q.id === 'q9_11').help += ' An extra sentence added by the senior.';
  const service = new TouristVisaApplicationService({ config: changed });

  const before = await rawDoc(appId);
  const view = await service.getMine(userId);
  assert.equal('q9_11' in view.answers, false, 'the tick whose wording changed is shown unticked');
  assert.equal(view.answers.q9_12, true, 'the other tick is untouched');
  assert.equal(view.sectionStatus['9A'], 'needs_review');
  assert.deepEqual(await rawDoc(appId), before, 'reading wrote nothing');
  assert.equal((await get(token)).sectionStatus['9A'], 'saved', 'with the current wording nothing is stale');

  await new Promise((r) => setTimeout(r, 30));
  const saved = await service.saveSection(oid(userId), '9A', { answers: S9A });
  assert.equal(saved.saved, true, JSON.stringify(saved));
  const updated = (await rawDoc(appId)).declarations;
  assert.notEqual(updated.q9_11.wordingSha256, original.q9_11.wordingSha256);
  assert.equal(updated.q9_11.wordingSha256, sha256(engine.wordingOf(changed, 'q9_11')));
  assert.ok(updated.q9_11.acceptedAt.getTime() > original.q9_11.acceptedAt.getTime());
  assert.equal(updated.q9_12.acceptedAt.getTime(), original.q9_12.acceptedAt.getTime(), 'the unchanged tick keeps its record');
  assert.equal((await service.getMine(userId)).sectionStatus['9A'], 'saved');
});

// ---------------------------------------------------------------------------
// Applications saved before Part 9
// ---------------------------------------------------------------------------

test('an application saved before Part 9: its answers and statuses are untouched, Part 9 is not started, and reading writes nothing', async () => {
  const { token, appId } = await start();
  for (const [section, answers] of BEFORE) assert.equal((await put(token, section, answers)).status, 200, section);
  const before = await rawDoc(appId);

  const app = await get(token);
  assert.deepEqual(await rawDoc(appId), before, 'reading wrote nothing');
  for (const [section] of BEFORE) assert.equal(app.sectionStatus[section], 'saved', section);
  for (const section of ['9A', '9B', '9C']) assert.equal(section in app.sectionStatus, false, `${section} has not been started`);
  assert.equal(app.currentSection, '9A');
  assert.equal(Object.keys(app.answers).some((id) => id.startsWith('q9_')), false);

  for (const [section, answers] of SECTIONS9) assert.equal((await put(token, section, answers)).status, 200, section);
  const after = await rawDoc(appId);
  for (const [id, value] of Object.entries(before.answers)) assert.deepEqual(after.answers[id], value, `${id} is unchanged`);
  const finished = await get(token);
  for (const section of ['9A', '9B', '9C']) assert.equal(finished.sectionStatus[section], 'saved', section);
  assert.equal(Object.values(finished.sectionStatus).filter((s) => s !== 'saved').length, 0);
  assert.equal(finished.currentSection, '9C', 'everything applicable is saved: resume on the last section');
  assert.match(after.answers.q3_1, /^enc:v1:/, 'the passport number is still ciphertext');
});

test('Part 9 sections can be saved in any order, an unknown section is still a 404 and an unknown key still a 400', async () => {
  const { token } = await start();
  for (const [section, answers] of [...SECTIONS9].reverse()) assert.equal((await put(token, section, answers)).status, 200, section);
  assert.equal((await put(token, '9D', {})).status, 404);
  assert.equal((await put(token, '9A', { ...S9A, q9_99: true })).status, 400);
  assert.equal((await put(token, '9A', { ...S9A, q9_3: false })).status, 400, 'a question of another section is not accepted here');
});
