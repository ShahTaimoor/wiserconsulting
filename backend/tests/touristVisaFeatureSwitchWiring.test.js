'use strict';

// Boots the real backend/index.js with TOURIST_VISA_ENABLED unset and checks what a closed
// deployment does: the same fixed answer for every kind of request, before sign-in, body parsing,
// rate limiting and the database; a browser on the allowed origin can read it; the rest of the API
// is unaffected; and nothing about the requests reaches the log (logging is set to verbose here).
// The child runs in a scratch working directory, so the developer's real .env is not loaded.
// The encryption key is deliberately NOT set: a closed deployment must not need it or complain.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const TouristVisaApplication = require('../models/TouristVisaApplication');

const JWT_SECRET = 'test-only-jwt-secret';
const CLOSED_BODY = { success: false, code: 'FEATURE_CLOSED', message: 'The Tourist Visa application is not open.' };
const MARKER = 'MARKER-WIRING-NOT-LOGGED-9191';
const ORIGIN = 'http://localhost:3000';

let mongod;
let child;
let childOutput = '';
let childExit = null;
let baseUrl;
let outputAfterStart = '';

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.once('error', reject);
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;

  const env = { ...process.env };
  delete env.TOURIST_VISA_ENABLED;
  delete env.FIELD_ENCRYPTION_KEY;
  child = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    cwd: os.tmpdir(),
    env: {
      ...env,
      MONGODB_URI: mongod.getUri(),
      PORT: String(port),
      JWT_SECRET,
      SESSION_SECRET: 'test-only-session-secret',
      FRONTEND_URL: ORIGIN,
      NODE_ENV: 'development', // verbose logging on, so a log line about a request would show
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { childOutput += d; });
  child.stderr.on('data', (d) => { childOutput += d; });
  child.on('exit', (code) => { childExit = code; });

  for (let i = 0; i < 150; i += 1) {
    if (childExit !== null) throw new Error(`backend exited early (${childExit}):\n${childOutput}`);
    try {
      if ((await fetch(`${baseUrl}/`)).ok) break;
    } catch {
      // not listening yet
    }
    await sleep(200);
  }
  await sleep(300);
  outputAfterStart = childOutput;
}, { timeout: 120000 });

after(async () => {
  if (child && childExit === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await Promise.race([exited, sleep(5000)]);
  }
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const call = async (method, p, { headers = {}, body } = {}) => {
  const res = await fetch(`${baseUrl}/api/tourist-visa${p}`, { method, headers: { Origin: ORIGIN, ...headers }, body });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
};

test('a closed deployment starts quietly: no complaint about the missing encryption key', () => {
  assert.equal(/FIELD_ENCRYPTION_KEY/.test(outputAfterStart), false, outputAfterStart);
});

test('real index.js, switch unset: every kind of request gets the fixed closed answer, and a signed-in user is not even looked up', async () => {
  const user = await User.create({ name: 'Test Closed User', email: 'test.closed@example.com', password: 'not-a-real-password' });
  const token = jwt.sign({ id: String(user._id) }, JWT_SECRET, { expiresIn: '1h' });
  const auth = { Authorization: `Bearer ${token}` };
  const json = { 'Content-Type': 'application/json' };

  const cases = [
    ['create, signed in', 'POST', '/applications', { headers: auth }],
    ['create, no token', 'POST', '/applications', {}],
    ['get, signed in', 'GET', '/applications/me', { headers: auth }],
    ['get, bad token', 'GET', '/applications/me', { headers: { Authorization: 'Bearer nope' } }],
    ['save, signed in', 'PUT', '/applications/me/sections/1', { headers: { ...json, ...auth }, body: JSON.stringify({ answers: { q1_5: MARKER } }) }],
    ['save, malformed JSON (would be 400)', 'PUT', '/applications/me/sections/1', { headers: { ...json, ...auth }, body: `{"answers":{"q1_5":"${MARKER}", }` }],
    ['save, form-encoded (would be 415)', 'PUT', '/applications/me/sections/1', { headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `answers=${MARKER}` }],
    ['save, no token (would be 401)', 'PUT', '/applications/me/sections/1', { headers: json, body: '{}' }],
    ['other method', 'DELETE', '/applications/me', { headers: auth }],
    ['unknown path', 'GET', `/nothing/here?probe=${MARKER}`, {}],
  ];
  for (const [name, method, p, options] of cases) {
    const res = await call(method, p, options);
    assert.equal(res.status, 404, name);
    assert.deepEqual(res.json, CLOSED_BODY, name);
    assert.equal(res.text.includes(MARKER), false, name);
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN, `${name}: a browser on the allowed origin can read the answer`);
  }

  assert.equal(await TouristVisaApplication.collection.countDocuments({}), 0, 'no application was created');
});

test('real index.js, switch unset: the CORS preflight still works, and the rest of the API is unaffected', async () => {
  const pre = await fetch(`${baseUrl}/api/tourist-visa/applications/me`, {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN);

  assert.equal((await fetch(`${baseUrl}/api/approved-visas`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/`)).status, 200);
  // Another prefix that merely starts the same way is not caught by the gate.
  const other = await fetch(`${baseUrl}/api/tourist-visas`);
  assert.notEqual((await other.text()).includes('FEATURE_CLOSED'), true);
});

test('real index.js, switch unset: nothing about the requests reached the log', async () => {
  await sleep(300); // let the child flush its output
  assert.equal(childOutput, outputAfterStart, `new output after the requests:\n${childOutput.slice(outputAfterStart.length)}`);
  assert.equal(childOutput.includes(MARKER), false);
  assert.equal(childExit, null, 'and the backend is still running');
});
