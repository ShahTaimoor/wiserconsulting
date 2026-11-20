'use strict';

// Config 1.6.0 through the real routes: the new section 10E (the places the applicant plans to visit when 6.7 is No) and "Who are you staying with?"
// (6.7e) in the Place of stay group. Covers: the server enforcing the town check and the dates, the 10-place cap, a section that does not apply,
// switching 6.7 after answering, the dashboard (what a draft sees), readiness and the review. In-memory MongoDB, made-up users and answers.

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
const { SECTIONS } = require('./helpers/touristVisaFixtures');

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
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function start() {
  userCounter += 1;
  const user = await User.create({ name: `Test Places ${userCounter}`, email: `test.places.${userCounter}@example.com`, password: 'not-a-real-password' });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const res = await api('POST', '/applications', { token });
  return { token, appId: res.json.data.application.id };
}
const put = (token, sectionId, answers) => api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const get = async (token) => (await api('GET', '/applications/me', { token })).json.data.application;
const section = (id) => SECTIONS().find(([sid]) => sid === id)[1];

// The visit is 2027-03-01 to 2027-03-15 (section 1 of the fixtures).
const place = (name, from, to, extra = {}) => ({ q10_28a: name, q10_28b: from, q10_28c: to, ...extra });
const written = (text, from = '2027-03-01', to = '2027-03-05') => place('other', from, to, { q10_28a_other: text });
const planned = (...entries) => ({ q10_28: true, plannedPlaces: entries });
const STAY = (who = 'family', extra = {}) => ({ q6_7a: 'Test Hotel', q6_7b: { line1: '2 Test Road', town: 'Testtown', country: 'GB' }, q6_7c: '2027-03-01', q6_7d: '2027-03-08', q6_7e: who, ...extra });

/** A draft with section 1 saved and 6.7 answered No (which opens the new section). */
async function noAddress() {
  const person = await start();
  assert.equal((await put(person.token, '1', section('1'))).status, 200);
  assert.equal((await put(person.token, '6C', { q6_7: false, q6_7x: 'not_decided' })).status, 200);
  return person;
}

test('6.7 No: the new section is on the dashboard, not started, and asks 10.28 first; the places are asked only after a Yes', async () => {
  const { token } = await noAddress();
  const app = await get(token);
  assert.equal(app.sectionStatus['10E'], undefined, 'not started');
  assert.equal(app.sectionStatus['6C'], 'saved');
  assert.equal((await put(token, '10E', {})).json.errors.q10_28, 'This question is required');
  assert.equal((await put(token, '10E', { q10_28: true })).json.errors.plannedPlaces, 'Add at least one entry');
  assert.equal((await put(token, '10E', { q10_28: false })).status, 200);
  assert.equal((await get(token)).sectionStatus['10E'], 'saved');
});

test('a place from the list, and a written place that is a town or city, are saved with their dates', async () => {
  const { token } = await noAddress();
  const res = await put(token, '10E', planned(place('Bath', '2027-03-01', '2027-03-04'), written('Stoke on Trent', '2027-03-04', '2027-03-06'), place('London', '2027-03-08', '2027-03-08')));
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const app = await get(token);
  assert.equal(app.sectionStatus['10E'], 'saved');
  assert.deepEqual(app.answers.plannedPlaces.map((p) => p.q10_28a), ['Bath', 'other', 'London']);
  assert.equal(app.answers.plannedPlaces[1].q10_28a_other, 'Stoke on Trent');
});

test('the server refuses a written place that is not a town or city, whatever the form did: digits, an address, a hotel word, HTML, a long text', async () => {
  const { token } = await noAddress();
  const MESSAGE = 'Write only the name of a town or city';
  const refused = async (text) => {
    const res = await put(token, '10E', planned(written(text)));
    assert.equal(res.status, 422, text);
    return res.json.errors['plannedPlaces.0.q10_28a_other'];
  };
  assert.equal(await refused('Bristol 2'), MESSAGE);
  assert.equal(await refused('12 Acacia Avenue'), MESSAGE);
  assert.equal(await refused('Hilton Hotel'), MESSAGE);
  assert.equal(await refused('Premier Inn London'), MESSAGE);
  assert.equal(await refused('London, UK'), MESSAGE);
  assert.equal(await refused('<b>Bath</b>'), 'Do not use the < or > characters');
  assert.equal(await refused('x'.repeat(101)), 'Must be 100 characters or fewer');
  assert.equal((await get(token)).sectionStatus['10E'], undefined, 'nothing was saved');
  // The same text typed against a place from the list is dropped, not stored.
  const kept = await put(token, '10E', planned(place('London', '2027-03-01', '2027-03-04', { q10_28a_other: '12 Acacia Avenue' })));
  assert.equal(kept.status, 200);
  assert.equal((await get(token)).answers.plannedPlaces[0].q10_28a_other, undefined);
});

test('the dates are checked by the server: inside the visit, leave on or after arrival, no overlap (touching is fine), and ten places at most', async () => {
  const { token } = await noAddress();
  const errorsOf = async (...entries) => (await put(token, '10E', planned(...entries))).json.errors || {};
  assert.equal((await errorsOf(place('Bath', '2027-02-27', '2027-03-04')))['plannedPlaces.0.q10_28b'], 'Must be on or after the date in question 1.6');
  assert.equal((await errorsOf(place('Bath', '2027-03-10', '2027-03-16')))['plannedPlaces.0.q10_28c'], 'Must be on or before the date in question 1.7');
  assert.equal((await errorsOf(place('Bath', '2027-03-06', '2027-03-05')))['plannedPlaces.0.q10_28c'], 'Must be on or after the date in question 10.28b');
  assert.equal((await errorsOf(place('Bath', '2027-03-01', '2027-03-06'), place('York', '2027-03-05', '2027-03-09')))['plannedPlaces.1.q10_28b'], 'Overlaps the dates of Place you will visit 1');
  assert.deepEqual(await errorsOf(place('Bath', '2027-03-01', '2027-03-05'), place('York', '2027-03-05', '2027-03-09')), {}, 'touching is fine');
  const day = (n) => `2027-03-${String(n).padStart(2, '0')}`;
  const ten = Array.from({ length: 10 }, (_, i) => place('London', day(i + 1), day(i + 1)));
  assert.equal((await put(token, '10E', planned(...ten))).status, 200);
  assert.equal((await put(token, '10E', planned(...ten, place('Bath', day(11), day(11))))).status, 422);
});

test('with 6.7 Yes the new section does not apply: nothing is asked, nothing is listed, and a save of it is refused or stores nothing', async () => {
  const person = await start();
  assert.equal((await put(person.token, '1', section('1'))).status, 200);
  assert.equal((await put(person.token, '6C', { q6_7: true, accommodation: [STAY()] })).status, 200);
  const app = await get(person.token);
  assert.equal('10E' in app.sectionStatus, false);
  const res = await put(person.token, '10E', planned(place('Bath', '2027-03-01', '2027-03-04')));
  assert.equal(res.status, 400, 'a section that does not apply is refused');
  assert.equal((await get(person.token)).answers.plannedPlaces, undefined, 'nothing of it is stored');
  assert.equal((await get(person.token)).answers.q10_28, undefined);
});

test('6.7e: the "who are you staying with" answer is required, has its Other box, and an Other text is dropped for the other choices', async () => {
  const person = await start();
  assert.equal((await put(person.token, '1', section('1'))).status, 200);
  const { q6_7e, ...without } = STAY();
  assert.equal((await put(person.token, '6C', { q6_7: true, accommodation: [without] })).json.errors['accommodation.0.q6_7e'], 'This question is required');
  assert.equal((await put(person.token, '6C', { q6_7: true, accommodation: [STAY('other')] })).json.errors['accommodation.0.q6_7e_other'], 'This question is required');
  for (const who of ['paid_stay', 'family', 'friends']) assert.equal((await put(person.token, '6C', { q6_7: true, accommodation: [STAY(who)] })).status, 200, who);
  assert.equal((await put(person.token, '6C', { q6_7: true, accommodation: [STAY('other', { q6_7e_other: 'A made-up host' })] })).status, 200);
  assert.equal((await get(person.token)).answers.accommodation[0].q6_7e_other, 'A made-up host');
  assert.equal((await put(person.token, '6C', { q6_7: true, accommodation: [STAY('friends', { q6_7e_other: 'ignored' })] })).status, 200);
  assert.equal((await get(person.token)).answers.accommodation[0].q6_7e_other, undefined, 'dropped');
});

test('switching 6.7 after answering: the answers of the hidden questions are dropped by the usual rule, and the dashboard follows', async () => {
  const { token } = await noAddress();
  assert.equal((await put(token, '10E', planned(place('Bath', '2027-03-01', '2027-03-04')))).status, 200);
  assert.equal((await get(token)).sectionStatus['10E'], 'saved');
  // 6.7 goes to Yes: the places and the 10.28 answer are removed, and 10E is no longer listed.
  const toYes = await put(token, '6C', { q6_7: true, accommodation: [STAY()] });
  assert.equal(toYes.status, 200, JSON.stringify(toYes.json));
  let app = await get(token);
  assert.equal(app.answers.plannedPlaces, undefined);
  assert.equal(app.answers.q10_28, undefined);
  assert.equal('10E' in app.sectionStatus, false);
  // And back to No: the stays are removed and the new section is asked again, not started.
  assert.equal((await put(token, '6C', { q6_7: false, q6_7x: 'not_decided' })).status, 200);
  app = await get(token);
  assert.equal(app.answers.accommodation, undefined);
  assert.equal(app.sectionStatus['10E'], undefined);
});

test('the places answered No: the places and the area box (6.7y) follow the answer, and 6.7y is only asked then', async () => {
  const { token } = await noAddress();
  assert.equal((await put(token, '10E', planned(place('Bath', '2027-03-01', '2027-03-04')))).status, 200);
  assert.equal((await put(token, '6C', { q6_7: false, q6_7x: 'paid_stay', q6_7y: 'Oxford' }, token)).status, 200);
  assert.equal((await get(token)).answers.q6_7y, undefined, 'the places are known, so the fallback area is not kept');
  assert.equal((await put(token, '10E', { q10_28: false, plannedPlaces: [place('Bath', '2027-03-01', '2027-03-04')] })).status, 200);
  assert.equal((await get(token)).answers.plannedPlaces, undefined, 'No removes the places');
  assert.equal((await put(token, '6C', { q6_7: false, q6_7x: 'paid_stay', q6_7y: 'Oxford' })).status, 200);
  assert.equal((await get(token)).answers.q6_7y, 'Oxford', 'and the area is asked and kept again');
});

test('a complete draft with 6.7 No cannot be submitted without the new section, and the refusal names 10E', async () => {
  const person = await start();
  for (const [id, answers] of SECTIONS()) {
    if (id === '10E') continue;
    const res = await put(person.token, id, answers);
    assert.equal(res.status, 200, `${id}: ${JSON.stringify(res.json)}`);
  }
  const res = await api('POST', '/applications/me/submit', { token: person.token, body: { declarationAccepted: true } });
  assert.equal(res.status, 422);
  assert.equal(res.json.code, 'NOT_READY');
  assert.ok(res.json.sections.some((s) => s.id === '10E'), JSON.stringify(res.json.sections));
  assert.equal((await put(person.token, '10E', { q10_28: false })).status, 200);
  const again = await api('POST', '/applications/me/submit', { token: person.token, body: { declarationAccepted: true } });
  assert.equal((again.json.sections || []).some((s) => s.id === '10E'), false, 'the new section no longer blocks the submit');
});
