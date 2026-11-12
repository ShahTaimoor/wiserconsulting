'use strict';

// Step 8j-3, B9: dedicated rate limits on applicant submit, admin edit and preview, notes and flags, admin list and search (document upload had its
// own limiter already, tested in touristVisaDocuments.test.js). Each is separate from the AI, PDF and upload limiters, counted per signed-in user,
// answers 429 with a fixed message and code past its cap and not before. The numbers are written out here on purpose (not read from the config) so
// that a changed number is noticed. Real routers, an in-memory database, made-up users.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.TOURIST_VISA_ENABLED = 'true';
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const adminRoutes = require('../routes/touristVisaAdminRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const limits = require('../middleware/touristVisaLimits');
const { pdfLimiter } = require('../middleware/touristVisaPdfLimit');
const { rawRequest } = require('./helpers/childApp');

const { LIMITS, createLimiter } = limits;

let mongod;
let server;
let port;
let counter = 0;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.init();
  const app = express();
  app.use('/api/tourist-visa', touristVisaBodyParser);
  app.use(express.json());
  app.use('/api/tourist-visa', touristVisaRoutes);
  app.use(errorHandler);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
}, { timeout: 120000 });

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

async function person(role) {
  counter += 1;
  const user = await User.create({ name: `Limit Person ${counter}`, email: `limit.person.${counter}@example.com`, password: 'not-a-real-password', role });
  return { id: String(user._id), token: jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
}
const call = (who, method, path, body) => rawRequest(port, { method, path: `/api/tourist-visa${path}`, headers: { Authorization: `Bearer ${who.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }) }, body });
const ID = '64b64b64b64b64b64b64b64b';

/** Sends `count` requests from `who` and returns the list of statuses. */
async function burst(count, make) {
  const statuses = [];
  for (let i = 0; i < count; i += 1) statuses.push((await make(i)).status);
  return statuses;
}

/** The standard check: the first `cap` requests are not 429, the next one is, with the code and message; the headers name the cap. */
async function assertCap({ label, cap, code, message, make, windowSeconds }) {
  const statuses = await burst(cap, make);
  assert.equal(statuses.includes(429), false, `${label}: nothing is turned away before ${cap} (got ${statuses.filter((s) => s === 429).length} 429s)`);
  const over = await make(cap);
  assert.equal(over.status, 429, `${label}: request ${cap + 1} is refused`);
  assert.equal(over.json.code, code, label);
  assert.equal(over.json.message, message, label);
  assert.equal(over.headers['cache-control'], 'no-store', `${label}: a refusal is not cached either`);
  assert.equal(over.headers['ratelimit-limit'], String(cap), `${label}: the header names the cap`);
  assert.ok(Number(over.headers['ratelimit-reset']) <= windowSeconds, `${label}: the window is at most ${windowSeconds} s`);
  assert.equal((await make(cap + 1)).status, 429, `${label}: and it stays refused`);
  return statuses;
}

// ---------------------------------------------------------------------------------------------- the numbers and the wiring

test('the four limits are what the design says, each with its own code and a fixed message', () => {
  assert.deepEqual(Object.keys(LIMITS).sort(), ['edit', 'list', 'notes', 'submit']);
  const expected = { submit: [60 * 60 * 1000, 15, 'TOO_MANY_SUBMISSIONS'], edit: [10 * 60 * 1000, 60, 'TOO_MANY_EDITS'], notes: [10 * 60 * 1000, 60, 'TOO_MANY_NOTES'], list: [10 * 60 * 1000, 120, 'TOO_MANY_LIST_REQUESTS'] };
  for (const [name, [windowMs, max, code]] of Object.entries(expected)) {
    assert.deepEqual([LIMITS[name].windowMs, LIMITS[name].max, LIMITS[name].code], [windowMs, max, code], name);
    assert.match(LIMITS[name].message, /Please wait a few minutes and try again\.$/, name);
  }
  assert.equal(Object.isFrozen(LIMITS), true);
});

test('each limit is on exactly its routes, and nothing else: submit; edit form + corrections; notes + flags; the list', () => {
  const where = (router, path, method) => router.stack.find((layer) => layer.route && layer.route.path === path && layer.route.methods[method]);
  const has = (layer, limiter) => layer.route.stack.some((s) => s.handle === limiter);
  const wanted = [
    [touristVisaRoutes, '/applications/me/submit', 'post', limits.submitLimiter],
    [adminRoutes, '/applications', 'get', limits.listLimiter],
    [adminRoutes, '/applications/:id/edit-form', 'get', limits.editLimiter],
    [adminRoutes, '/applications/:id/changes', 'put', limits.editLimiter],
    [adminRoutes, '/applications/:id/notes', 'post', limits.notesLimiter],
    [adminRoutes, '/applications/:id/flags', 'put', limits.notesLimiter],
  ];
  const all = [limits.submitLimiter, limits.editLimiter, limits.notesLimiter, limits.listLimiter];
  assert.equal(new Set(all).size, 4, 'four separate limiters, so four separate budgets');
  const seen = new Set();
  for (const [router, path, method, limiter] of wanted) {
    const layer = where(router, path, method);
    assert.ok(layer, `${method} ${path} is registered`);
    assert.ok(has(layer, limiter), `${method} ${path} has its limiter`);
    for (const other of all.filter((l) => l !== limiter)) assert.equal(has(layer, other), false, `${method} ${path} has only its own`);
    assert.equal(has(layer, pdfLimiter), false, 'and not the PDF limiter');
    seen.add(layer);
  }
  // No other route carries one of the four.
  for (const router of [touristVisaRoutes, adminRoutes]) {
    for (const layer of router.stack.filter((l) => l.route && !seen.has(l))) {
      for (const limiter of all) assert.equal(layer.route.stack.some((s) => s.handle === limiter), false, `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`);
    }
  }
  // The route that already had its own limiter (uploads) is not one of the four, and keeps it.
  const upload = where(touristVisaRoutes, '/applications/me/documents', 'post');
  assert.ok(upload.route.stack.length >= 3, 'the upload route keeps its limiter, parser and handler');
});

test('the limiter counts per signed-in user, falls back to the network address for a request with no user, and answers through the error handler with a fixed message', async () => {
  const limiter = createLimiter({ windowMs: 60000, max: 2, code: 'TOO_MANY_TESTS', message: 'Made-up limit message.' });
  const app = express();
  app.use((req, res, next) => { const id = req.get('x-user'); if (id) req.user = { _id: id }; next(); });
  app.get('/', limiter, (req, res) => res.send('ok'));
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ code: error.code, message: error.message }));
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const p = srv.address().port;
    const hit = (user) => rawRequest(p, { path: '/', headers: user ? { 'x-user': user } : {} });
    assert.deepEqual([(await hit('a')).status, (await hit('a')).status, (await hit('a')).status], [200, 200, 429]);
    assert.equal((await hit('b')).status, 200, 'another user has a budget of their own');
    const refusal = await hit('a');
    assert.deepEqual(refusal.json, { code: 'TOO_MANY_TESTS', message: 'Made-up limit message.' });
    // No user: counted by address.
    assert.deepEqual([(await hit()).status, (await hit()).status, (await hit()).status], [200, 200, 429]);
    assert.equal((await hit('c')).status, 200, 'and that did not touch a signed-in user\'s budget');
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

// ---------------------------------------------------------------------------------------------- past the cap, route by route

test('applicant submit: 15 an hour per user; the 16th is a 429 TOO_MANY_SUBMISSIONS with the fixed sentence; another applicant is not affected', async () => {
  const one = await person(0);
  const two = await person(0);
  await assertCap({
    label: 'submit', cap: 15, code: 'TOO_MANY_SUBMISSIONS', windowSeconds: 3600,
    message: 'You have tried to submit several times in a short while. Please wait a few minutes and try again.',
    make: () => call(one, 'POST', '/applications/me/submit', JSON.stringify({ declarationAccepted: true })),
  });
  const fine = await call(two, 'POST', '/applications/me/submit', JSON.stringify({ declarationAccepted: true }));
  assert.notEqual(fine.status, 429, 'another applicant');
  // The other work of the same applicant is not stopped: reading and saving go on.
  assert.notEqual((await call(one, 'GET', '/applications/me')).status, 429);
  assert.notEqual((await call(one, 'POST', '/applications')).status, 429);
});

test('admin corrections and previews: the edit form and the changes share 60 in 10 minutes per administrator; the 61st is a 429 TOO_MANY_EDITS', async () => {
  const one = await person(1);
  const two = await person(1);
  // Mix the two routes: the budget is one.
  await assertCap({
    label: 'edit', cap: 60, code: 'TOO_MANY_EDITS', windowSeconds: 600,
    message: 'Too many corrections or previews in a short time. Please wait a few minutes and try again.',
    make: (i) => (i % 2 === 0
      ? call(one, 'GET', `/admin/applications/${ID}/edit-form`)
      : call(one, 'PUT', `/admin/applications/${ID}/changes`, JSON.stringify({ expectedRevision: 0, reason: 'MADE-UP reason for the test', changes: [], dryRun: true }))),
  });
  assert.notEqual((await call(two, 'GET', `/admin/applications/${ID}/edit-form`)).status, 429, 'another administrator');
  // The same administrator can still do everything else: notes, list, reading.
  assert.notEqual((await call(one, 'GET', '/admin/applications')).status, 429);
  assert.notEqual((await call(one, 'POST', `/admin/applications/${ID}/notes`, JSON.stringify({ kind: 'note', text: 'made-up' }))).status, 429);
});

test('notes, call log and flags: 60 in 10 minutes per administrator together; the 61st is a 429 TOO_MANY_NOTES; reading the notes is not counted', async () => {
  const one = await person(1);
  const two = await person(1);
  await assertCap({
    label: 'notes', cap: 60, code: 'TOO_MANY_NOTES', windowSeconds: 600,
    message: 'Too many notes, calls or flag changes in a short time. Please wait a few minutes and try again.',
    make: (i) => (i % 2 === 0
      ? call(one, 'POST', `/admin/applications/${ID}/notes`, JSON.stringify({ kind: 'note', text: 'made-up' }))
      : call(one, 'PUT', `/admin/applications/${ID}/flags`, JSON.stringify({ flags: [] }))),
  });
  assert.notEqual((await call(two, 'POST', `/admin/applications/${ID}/notes`, JSON.stringify({ kind: 'note', text: 'made-up' }))).status, 429, 'another administrator');
  assert.notEqual((await call(one, 'GET', `/admin/applications/${ID}/notes`)).status, 429, 'reading the notes has no limit of this kind');
  assert.notEqual((await call(one, 'GET', `/admin/applications/${ID}/edit-form`)).status, 429, 'and the edit budget is separate');
});

test('admin list and search: 120 in 10 minutes per administrator; the 121st is a 429 TOO_MANY_LIST_REQUESTS (a search is the same route, so the same budget)', async () => {
  const one = await person(1);
  const two = await person(1);
  await assertCap({
    label: 'list', cap: 120, code: 'TOO_MANY_LIST_REQUESTS', windowSeconds: 600,
    message: 'Too many searches or page changes in a short time. Please wait a few minutes and try again.',
    make: (i) => call(one, 'GET', i % 3 === 0 ? '/admin/applications' : `/admin/applications?q=test${i}&status=submitted&page=${(i % 5) + 1}`),
  });
  assert.equal((await call(two, 'GET', '/admin/applications')).status, 200, 'another administrator');
  assert.notEqual((await call(one, 'GET', `/admin/applications/${ID}`)).status, 429, 'opening one application is not a list request');
});

test('the refusals are before the work: a request turned away by a limit records no audit row and changes nothing', async () => {
  const one = await person(1);
  await burst(120, () => call(one, 'GET', '/admin/applications'));
  const audit = mongoose.connection.db.collection('touristvisaaudit');
  const before = await audit.countDocuments({});
  const over = await call(one, 'GET', '/admin/applications');
  assert.equal(over.status, 429);
  assert.equal(await audit.countDocuments({}), before);
});

test('normal use stays well under every cap: a long applicant session and a busy administrator session never meet a limit', async () => {
  // An applicant: the form saves a section when the person presses "Save and continue" (about 20 sections), they reload a few times and
  // submit a couple of times. 40 saves, 30 reads, 4 submits is far more than a real session.
  const applicant = await person(0);
  const statuses = [];
  statuses.push((await call(applicant, 'POST', '/applications')).status);
  for (let i = 0; i < 40; i += 1) statuses.push((await call(applicant, 'PUT', '/applications/me/sections/1', JSON.stringify({ answers: { q1_1: 'tourism' } }))).status);
  for (let i = 0; i < 30; i += 1) statuses.push((await call(applicant, 'GET', '/applications/me')).status);
  for (let i = 0; i < 4; i += 1) statuses.push((await call(applicant, 'POST', '/applications/me/submit', JSON.stringify({ declarationAccepted: true }))).status);
  assert.equal(statuses.includes(429), false, 'the applicant is never turned away');

  // An administrator working through a morning: 40 list pages and searches, 20 edit-form openings and previews, 20 notes and flags.
  const admin = await person(1);
  const adminStatuses = [];
  for (let i = 0; i < 40; i += 1) adminStatuses.push((await call(admin, 'GET', `/admin/applications?q=a${i}`)).status);
  for (let i = 0; i < 20; i += 1) adminStatuses.push((await call(admin, 'GET', `/admin/applications/${ID}/edit-form`)).status);
  for (let i = 0; i < 20; i += 1) adminStatuses.push((await call(admin, 'POST', `/admin/applications/${ID}/notes`, JSON.stringify({ kind: 'note', text: 'made-up' }))).status);
  assert.equal(adminStatuses.includes(429), false, 'the administrator is never turned away');
});
