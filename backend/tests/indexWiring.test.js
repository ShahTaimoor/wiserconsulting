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

const call = async (method, p, token) => {
  const res = await fetch(`${baseUrl}/api/tourist-visa${p}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

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
