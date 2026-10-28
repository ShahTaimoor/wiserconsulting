'use strict';

// Boots the real backend/index.js against an in-memory MongoDB to check the wiring:
// the Tourist Visa routes are mounted at /api/tourist-visa and need a token.
// The child process runs in a scratch working directory, so the developer's real
// .env is not loaded, and MONGODB_URI points at the in-memory database.

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

const JWT_SECRET = 'test-only-jwt-secret';
const FIELD_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');
let mongod;
let child;
let childOutput = '';
let childExit = null;
let baseUrl;
let port;

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.once('error', reject);
  srv.listen(0, '127.0.0.1', () => {
    const { port: p } = srv.address();
    srv.close(() => resolve(p));
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;

  child = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    cwd: os.tmpdir(),
    env: {
      ...process.env,
      MONGODB_URI: mongod.getUri(),
      PORT: String(port),
      JWT_SECRET,
      FIELD_ENCRYPTION_KEY,
      SESSION_SECRET: 'test-only-session-secret',
      FRONTEND_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { childOutput += d; });
  child.stderr.on('data', (d) => { childOutput += d; });
  child.on('exit', (code) => { childExit = code; });

  for (let i = 0; i < 150; i += 1) {
    if (childExit !== null) throw new Error(`backend exited early (${childExit}):\n${childOutput}`);
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await sleep(200);
  }
  throw new Error(`backend did not start:\n${childOutput}`);
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

const call = async (method, p, token, body) => {
  const res = await fetch(`${baseUrl}/api/tourist-visa${p}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
};

async function signedInUser(label) {
  const user = await User.create({ name: `Test ${label}`, email: `test.${label}@example.com`, password: 'not-a-real-password' });
  const token = jwt.sign({ id: String(user._id) }, JWT_SECRET, { expiresIn: '1h' });
  await call('POST', '/applications', token);
  return token;
}

test('index.js mounts the Tourist Visa routes and requires a token', async () => {
  assert.equal((await call('POST', '/applications')).status, 401);
  assert.equal((await call('GET', '/applications/me')).status, 401);

  const user = await User.create({ name: 'Test Wiring User', email: 'test.wiring@example.com', password: 'not-a-real-password' });
  const token = jwt.sign({ id: String(user._id) }, JWT_SECRET, { expiresIn: '1h' });

  const none = await call('GET', '/applications/me', token);
  assert.equal(none.status, 404);

  const created = await call('POST', '/applications', token);
  assert.equal(created.status, 201);
  assert.equal(created.json.data.application.status, 'draft');

  const again = await call('POST', '/applications', token);
  assert.equal(again.status, 200);
  assert.equal(again.json.data.application.id, created.json.data.application.id);

  const mine = await call('GET', '/applications/me', token);
  assert.equal(mine.status, 200);
  assert.equal(mine.json.data.application.id, created.json.data.application.id);
});

test('the other API routes are still mounted after the change', async () => {
  const res = await fetch(`${baseUrl}/api/approved-visas`);
  assert.equal(res.status, 200);
});

test('saving a section through index.js keeps free text as typed, including < and >', async () => {
  const token = await signedInUser('save.wiring');
  const text = 'Visit <b>Test</b> City if 2 < 3 and 5 > 4';
  const answers = {
    q1_1: 'tourism', q1_2: false, q1_3: false, q1_4: 'tbc_a', q1_5: text, q1_6: '2027-03-01', q1_7: '2027-03-15',
  };
  const saved = await call('PUT', '/applications/me/sections/1', token, JSON.stringify({ answers }));
  assert.equal(saved.status, 200, saved.text);
  const mine = await call('GET', '/applications/me', token);
  assert.equal(mine.json.data.application.answers.q1_5, text, 'the global sanitizer did not touch it');
});

test('a malformed body sent through index.js leaks nothing to the response or the backend logs', async () => {
  const token = await signedInUser('leak.wiring');
  const SECRET = 'SECRET-WIRING-TEXT-7777';

  for (const body of [`{"answers":{"q1_5":"${SECRET}", "q1_6": }}`, `{"answers":{"q1_5":"${SECRET}"`, SECRET]) {
    const res = await call('PUT', '/applications/me/sections/1', token, body);
    assert.equal(res.status, 400);
    assert.equal(res.json.message, 'The request body is not valid JSON.');
    assert.equal(res.text.includes(SECRET), false);
  }
  await sleep(300); // let the child flush its output
  assert.match(childOutput, /Tourist Visa request body rejected/, 'the failure was logged');
  assert.equal(childOutput.includes(SECRET), false, `backend output:
${childOutput}`);
});

test('a non-JSON body to the Tourist Visa routes is refused before the global parsers', async () => {
  const token = await signedInUser('type.wiring');
  const res = await fetch(`${baseUrl}/api/tourist-visa/applications/me/sections/1`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'answers=anything',
  });
  assert.equal(res.status, 415);
});
