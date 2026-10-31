'use strict';

// Step 8b-2 tests: Part 10A, 10B and 10C through the real routes.
// Covers: every 10.1 choice opening and removing its own details box on the server (one test per gate),
// the exclusive "None of these", the encrypted fields stored as ciphertext (10.1 and its boxes, the 10.5
// Yes/No and the National Insurance number) and the plain ones left readable (10.2 to 10.4), the National
// Insurance number stored in capitals with no spaces, and applications saved before Part 10 staying untouched.
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
    name: `Test Part10 ${userCounter}`,
    email: `test.part10.${userCounter}@example.com`,
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
const isCipher = (value) => typeof value === 'string' && value.startsWith('enc:v1:');

// Made-up answers for the three new sections.
const S10A = { q10_1: ['none'] };
const S10C = { q10_4: 'english', q10_5: false };
const DETAILS = 'MADE-UP-DETAILS-OF-WHAT-HAPPENED';
const NI_TYPED = 'ab 12 34 56 c';
const NI_STORED = 'AB123456C';
const CHOICES = [
  ['conviction', 'q10_1a'], ['driving', 'q10_1b'], ['arrest_charge', 'q10_1c'],
  ['out_of_court', 'q10_1d'], ['civil_judgment', 'q10_1e'], ['immigration_penalty', 'q10_1f'],
];
const SECTIONS10 = [['10A', S10A], ['10B', {}], ['10C', S10C]];

// Parts 1 to 9, for the "application saved before Part 10" tests.
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
  ['9A', { q9_11: true, q9_1: false, q9_12: true, q9_2: false }],
  ['9B', { q9_13: true, q9_3: false, q9_4: false, q9_5: false, q9_14: true, q9_6: false, q9_7: false }],
  ['9C', { q9_8: false, q9_9: false, q9_10: false }],
];

// ---------------------------------------------------------------------------
// One test per 10.1 choice
// ---------------------------------------------------------------------------

for (const [choice, follow] of CHOICES) {
  test(`GATE 10.1 ${choice}: ticking it asks for its details (stored encrypted); unticking removes them from the database`, async () => {
    const { token, appId } = await start();
    const own = { q10_1: [choice] };

    const before = await rawDoc(appId);
    const missing = await put(token, '10A', own);
    assert.equal(missing.status, 422, JSON.stringify(missing.json));
    assert.deepEqual(missing.json.errors, { [follow]: 'This question is required' });
    assert.deepEqual(await rawDoc(appId), before, 'a rejected save changes nothing');

    const yes = await put(token, '10A', { ...own, [follow]: DETAILS });
    assert.equal(yes.status, 200, JSON.stringify(yes.json));
    const stored = await rawDoc(appId);
    assert.ok(isCipher(stored.answers.q10_1), 'the ticked list is stored as ciphertext');
    assert.ok(isCipher(stored.answers[follow]), 'the details are stored as ciphertext');
    assert.equal(JSON.stringify(stored).includes(DETAILS), false, 'the details are not in the document in plain text');
    assert.equal(JSON.stringify(stored).includes(choice), false, 'the ticked choice is not in the document in plain text');
    const app = await get(token);
    assert.deepEqual(app.answers.q10_1, [choice], 'the owner reads the list back decrypted');
    assert.equal(app.answers[follow], DETAILS);
    assert.equal(app.sectionStatus['10A'], 'saved');

    // Untick it (tick "None of these" instead): the box and its answer are removed.
    const none = await put(token, '10A', { q10_1: ['none'], [follow]: 'stale details' });
    assert.equal(none.status, 200, JSON.stringify(none.json));
    assert.deepEqual(none.json.data.removed, [follow]);
    const after = await rawDoc(appId);
    assert.equal(follow in after.answers, false);
    assert.ok(isCipher(after.answers.q10_1));
    assert.deepEqual((await get(token)).answers.q10_1, ['none']);
  });
}

test('10.1: several choices need a box each; unticking one removes only its box', async () => {
  const { token, appId } = await start();
  const all = { q10_1: CHOICES.map((c) => c[0]) };
  const missing = await put(token, '10A', all);
  assert.equal(missing.status, 422);
  assert.deepEqual(Object.keys(missing.json.errors).sort(), CHOICES.map((c) => c[1]).sort());

  const full = { ...all, ...Object.fromEntries(CHOICES.map(([, id]) => [id, `${DETAILS}-${id}`])) };
  assert.equal((await put(token, '10A', full)).status, 200);
  assert.equal(Object.keys((await rawDoc(appId)).answers).filter((id) => id.startsWith('q10_1')).length, 7);

  const fewer = { q10_1: ['driving', 'conviction'], q10_1a: full.q10_1a, q10_1b: full.q10_1b, q10_1c: 'stale' };
  const res = await put(token, '10A', fewer);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual([...res.json.data.removed].sort(), ['q10_1c', 'q10_1d', 'q10_1e', 'q10_1f'], 'every box whose choice is no longer ticked goes, sent or only stored');
  const stored = (await rawDoc(appId)).answers;
  assert.deepEqual(Object.keys(stored).filter((id) => id.startsWith('q10_1')).sort(), ['q10_1', 'q10_1a', 'q10_1b']);
  const app = await get(token);
  assert.deepEqual(app.answers.q10_1, ['driving', 'conviction']);
  assert.equal(app.answers.q10_1b, full.q10_1b);
});

test('10.1: "None of these" with another choice is refused and nothing is written; alone it is stored encrypted', async () => {
  const { token, appId } = await start();
  const before = await rawDoc(appId);
  const res = await put(token, '10A', { q10_1: ['none', 'conviction'], q10_1a: DETAILS });
  assert.equal(res.status, 422, JSON.stringify(res.json));
  assert.deepEqual(res.json.errors, { q10_1: '"None of these" cannot be chosen together with other options' });
  assert.equal(JSON.stringify(res.json).includes(DETAILS), false);
  assert.deepEqual(await rawDoc(appId), before);

  assert.equal((await put(token, '10A', { q10_1: [] })).status, 422, 'an empty list is not an answer');
  assert.equal((await put(token, '10A', { q10_1: ['made_up'] })).status, 422);

  assert.equal((await put(token, '10A', S10A)).status, 200);
  const stored = (await rawDoc(appId)).answers;
  assert.ok(isCipher(stored.q10_1));
  assert.deepEqual(Object.keys(stored).filter((id) => id.startsWith('q10_')), ['q10_1']);
  assert.deepEqual((await get(token)).answers.q10_1, ['none']);
});

// ---------------------------------------------------------------------------
// 10B and 10C
// ---------------------------------------------------------------------------

test('10B: the two boxes are optional and stored as typed (not encrypted); 10.3 stands alone', async () => {
  const { token, appId } = await start();
  assert.equal((await put(token, '10B', {})).status, 200, 'both left empty is a valid save');
  assert.equal((await get(token)).sectionStatus['10B'], 'saved');
  assert.deepEqual(Object.keys((await rawDoc(appId)).answers), []);

  assert.equal((await put(token, '10B', { q10_3: 'Only the second box.' })).status, 200);
  assert.deepEqual((await rawDoc(appId)).answers, { q10_3: 'Only the second box.' });

  assert.equal((await put(token, '10B', { q10_2: 'First box.', q10_3: 'Second box.' })).status, 200);
  assert.deepEqual((await rawDoc(appId)).answers, { q10_2: 'First box.', q10_3: 'Second box.' });
  assert.deepEqual(Object.fromEntries(Object.entries((await get(token)).answers).filter(([id]) => id.startsWith('q10_'))), { q10_2: 'First box.', q10_3: 'Second box.' });

  const tooLong = await put(token, '10B', { q10_2: 'x'.repeat(2001) });
  assert.equal(tooLong.status, 422);
  assert.deepEqual(tooLong.json.errors, { q10_2: 'Must be 2000 characters or fewer' });
  assert.equal((await put(token, '10B', { q10_2: 'x'.repeat(2000) })).status, 200);
});


test('10.4: the language is stored as typed; Other asks which language; changing it removes that answer', async () => {
  const { token, appId } = await start();
  const missing = await put(token, '10C', { q10_4: 'other', q10_5: false });
  assert.equal(missing.status, 422);
  assert.deepEqual(missing.json.errors, { q10_4a: 'This question is required' });

  assert.equal((await put(token, '10C', { q10_4: 'other', q10_4a: 'Sindhi', q10_5: false })).status, 200);
  let stored = (await rawDoc(appId)).answers;
  assert.equal(stored.q10_4, 'other', '10.4 is stored as it is');
  assert.equal(stored.q10_4a, 'Sindhi', 'the language is stored as it is');
  assert.ok(isCipher(stored.q10_5), 'the National Insurance Yes/No is ciphertext even when it is No');

  const back = await put(token, '10C', { q10_4: 'urdu', q10_4a: 'Sindhi', q10_5: false });
  assert.equal(back.status, 200, JSON.stringify(back.json));
  assert.deepEqual(back.json.data.removed, ['q10_4a']);
  stored = (await rawDoc(appId)).answers;
  assert.equal('q10_4a' in stored, false);
  assert.equal(stored.q10_4, 'urdu');

  assert.equal((await put(token, '10C', { q10_4: 'klingon', q10_5: false })).status, 422);
});

test('10.5: the number is stored in capitals with no spaces, encrypted; the owner reads it back normalised', async () => {
  const { token, appId } = await start();
  const missing = await put(token, '10C', { ...S10C, q10_5: true });
  assert.equal(missing.status, 422);
  assert.deepEqual(missing.json.errors, { q10_5a: 'This question is required' });

  const res = await put(token, '10C', { ...S10C, q10_5: true, q10_5a: NI_TYPED });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const raw = await rawDoc(appId);
  assert.ok(isCipher(raw.answers.q10_5), 'the Yes/No is ciphertext');
  assert.ok(isCipher(raw.answers.q10_5a), 'the number is ciphertext');
  for (const text of [NI_TYPED, NI_STORED, NI_TYPED.toUpperCase(), 'AB 12 34 56 C', '123456']) {
    assert.equal(JSON.stringify(raw).includes(text), false, `${text} is not in the document in plain text`);
  }
  const app = await get(token);
  assert.equal(app.answers.q10_5, true);
  assert.equal(app.answers.q10_5a, NI_STORED, 'it comes back as stored: capitals, no spaces');
  assert.equal(app.sectionStatus['10C'], 'saved');

  // Saving the stored form again is fine and changes nothing about the value.
  assert.equal((await put(token, '10C', { ...S10C, q10_5: true, q10_5a: NI_STORED })).status, 200);
  assert.equal((await get(token)).answers.q10_5a, NI_STORED);
});

test('10.5: a wrong number is refused with a message that does not repeat it, and nothing is written', async () => {
  const { token, appId } = await start();
  assert.equal((await put(token, '10C', { ...S10C, q10_5: true, q10_5a: NI_STORED })).status, 200);
  const before = await rawDoc(appId);
  for (const typed of ['GB123456C', 'bg 12 34 56 c', 'ZZ123456C', 'AB12345C', 'AB1234567C', 'AB123456E', 'DA123456C']) {
    const res = await put(token, '10C', { ...S10C, q10_5: true, q10_5a: typed });
    assert.equal(res.status, 422, typed);
    assert.deepEqual(res.json.errors, { q10_5a: 'Enter a National Insurance number in the format AB 12 34 56 C' }, typed);
    assert.equal(JSON.stringify(res.json).toLowerCase().includes(typed.toLowerCase()), false, `${typed} is not echoed`);
    assert.deepEqual(await rawDoc(appId), before, `${typed}: nothing written`);
  }
  assert.equal((await get(token)).answers.q10_5a, NI_STORED, 'the earlier number is still there');
});

test('10.5: No removes a stored number from the database', async () => {
  const { token, appId } = await start();
  assert.equal((await put(token, '10C', { ...S10C, q10_5: true, q10_5a: NI_TYPED })).status, 200);
  const res = await put(token, '10C', { ...S10C, q10_5a: NI_TYPED });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.data.removed, ['q10_5a']);
  const stored = (await rawDoc(appId)).answers;
  assert.equal('q10_5a' in stored, false);
  assert.ok(isCipher(stored.q10_5));
  assert.equal((await get(token)).answers.q10_5, false, 'a stored No reads back as false, not as missing');
});

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

test('encryption: exactly 10.1, its boxes, 10.5 and the number are ciphertext; 10.2 to 10.4 are not; no earlier question is newly encrypted', async () => {
  const { token, appId } = await start();
  for (const [section, answers] of BEFORE) assert.equal((await put(token, section, answers)).status, 200, section);

  const all = { q10_1: CHOICES.map((c) => c[0]), ...Object.fromEntries(CHOICES.map(([, id]) => [id, DETAILS])) };
  assert.equal((await put(token, '10A', all)).status, 200);
  assert.equal((await put(token, '10B', { q10_2: 'Plain one.', q10_3: 'Plain two.' })).status, 200);
  assert.equal((await put(token, '10C', { q10_4: 'other', q10_4a: 'Sindhi', q10_5: true, q10_5a: NI_TYPED })).status, 200);

  const stored = (await rawDoc(appId)).answers;
  const encrypted = Object.keys(stored).filter((id) => isCipher(stored[id])).sort();
  assert.deepEqual(
    encrypted,
    ['q3_1', ...Array.from({ length: 10 }, (_, i) => `q9_${i + 1}`), 'q10_1', ...CHOICES.map((c) => c[1]), 'q10_5', 'q10_5a'].sort(),
    'the passport number and the ten Part 9 answers were already encrypted; nothing else outside Part 10 is'
  );
  for (const id of ['q10_2', 'q10_3', 'q10_4', 'q10_4a']) assert.equal(isCipher(stored[id]), false, `${id} is stored as it is`);
  assert.equal(stored.q10_4a, 'Sindhi');
  const text = JSON.stringify(await rawDoc(appId));
  for (const secret of [DETAILS, NI_STORED]) assert.equal(text.includes(secret), false, `${secret} is not in plain text`);

  const app = await get(token);
  assert.deepEqual(app.answers.q10_1, CHOICES.map((c) => c[0]));
  for (const [, id] of CHOICES) assert.equal(app.answers[id], DETAILS);
  assert.equal(app.answers.q10_5, true);
  assert.equal(app.answers.q10_5a, NI_STORED);
});

test('encryption: a ciphertext cannot be moved to another question (it is bound to the field)', async () => {
  const { token, appId } = await start();
  await put(token, '10C', { ...S10C, q10_5: true, q10_5a: NI_STORED });
  await put(token, '10A', { q10_1: ['conviction'], q10_1a: DETAILS });
  const stored = (await rawDoc(appId)).answers;
  await TouristVisaApplication.collection.updateOne({ _id: oid(appId) }, { $set: { 'answers.q10_5a': stored.q10_1a } });
  const res = await api('GET', '/applications/me', { token });
  assert.equal(res.status, 500, 'a swapped ciphertext fails to decrypt');
  assert.equal(JSON.stringify(res.json).includes('enc:v1:'), false);
});

test('encryption: a rejected save stores nothing and its error never contains what was typed', async () => {
  const { token, appId } = await start();
  const snapshot = await rawDoc(appId);
  const tooLong = `${DETAILS}${'x'.repeat(2001)}`;
  const res = await put(token, '10A', { q10_1: ['driving'], q10_1b: tooLong });
  assert.equal(res.status, 422);
  assert.deepEqual(res.json.errors, { q10_1b: 'Must be 2000 characters or fewer' });
  assert.equal(JSON.stringify(res.json).includes('MADE-UP-DETAILS'), false);
  assert.deepEqual(await rawDoc(appId), snapshot);
});

// ---------------------------------------------------------------------------
// Applications saved before Part 10
// ---------------------------------------------------------------------------

test('an application saved before Part 10: its answers, ticks and statuses are untouched, Part 10 is not started, and reading writes nothing', async () => {
  const { token, appId } = await start();
  for (const [section, answers] of BEFORE) assert.equal((await put(token, section, answers)).status, 200, section);
  const before = await rawDoc(appId);

  const app = await get(token);
  assert.deepEqual(await rawDoc(appId), before, 'reading wrote nothing');
  for (const [section] of BEFORE) assert.equal(app.sectionStatus[section], 'saved', section);
  for (const section of ['10A', '10B', '10C']) assert.equal(section in app.sectionStatus, false, `${section} has not been started`);
  assert.equal(app.currentSection, '10A');
  assert.equal(Object.keys(app.answers).some((id) => id.startsWith('q10_')), false);

  for (const [section, answers] of SECTIONS10) assert.equal((await put(token, section, answers)).status, 200, section);
  const after = await rawDoc(appId);
  for (const [id, value] of Object.entries(before.answers)) assert.deepEqual(after.answers[id], value, `${id} is unchanged`);
  assert.deepEqual(after.declarations, before.declarations, 'Part 10 has no declaration ticks, so no record is added');
  assert.deepEqual(Object.keys(after.declarations).sort(), ['q9_11', 'q9_12', 'q9_13', 'q9_14']);
  const finished = await get(token);
  for (const section of ['10A', '10B', '10C']) assert.equal(finished.sectionStatus[section], 'saved', section);
  assert.equal(Object.values(finished.sectionStatus).filter((s) => s !== 'saved').length, 0);
  assert.equal(finished.currentSection, '10C', 'everything applicable is saved: resume on the last section');
  assert.match(after.answers.q3_1, /^enc:v1:/, 'the passport number is still ciphertext');
});

test('Part 10 sections can be saved in any order, an unknown section is still a 404 and an unknown key still a 400', async () => {
  const { token } = await start();
  for (const [section, answers] of [...SECTIONS10].reverse()) assert.equal((await put(token, section, answers)).status, 200, section);
  assert.equal((await put(token, '10D', {})).status, 404, 'the documents section is not built yet');
  assert.equal((await put(token, '10A', { ...S10A, q10_99: true })).status, 400);
  assert.equal((await put(token, '10A', { ...S10A, q10_4: 'english' })).status, 400, 'a question of another section is not accepted here');
  assert.equal((await put(token, '10B', { q10_1: ['none'] })).status, 400);
});
