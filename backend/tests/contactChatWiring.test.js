'use strict';

// Boots the REAL backend/index.js (in a child process, in a scratch folder, so the developer's .env is never read) to check what only the
// real wiring can show: the CHAT_ENABLED switch in front of everything, GET /api/chat/status, and that the chat routes are EXEMPT from the
// general limiter (100 requests per 15 minutes per address) while every other API route is not. A made-up user and token, in-memory MongoDB.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');

const SECRET = 'test-only-jwt-secret';
const KEY = crypto.randomBytes(32).toString('base64');
let mongod;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, { timeout: 120000 });
after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.once('error', reject);
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
});

/** Starts the real backend with CHAT_ENABLED set to `value` (not set at all for undefined). */
async function startBackend(value) {
  const port = await freePort();
  const env = { ...process.env };
  for (const name of ['CHAT_ENABLED', 'TOURIST_VISA_ENABLED', 'EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_PASS']) delete env[name];
  if (value !== undefined) env.CHAT_ENABLED = value;
  const state = { output: '', exit: null };
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    cwd: os.tmpdir(),
    env: { ...env, MONGODB_URI: mongod.getUri(), PORT: String(port), JWT_SECRET: SECRET, FIELD_ENCRYPTION_KEY: KEY, FRONTEND_URL: 'http://localhost:3000', NODE_ENV: 'development', SECURITY_LOG: 'off' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { state.output += d; });
  child.stderr.on('data', (d) => { state.output += d; });
  child.on('exit', (code) => { state.exit = code; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i += 1) {
    if (state.exit !== null) throw new Error(`backend exited early (${state.exit}):\n${state.output}`);
    try { if ((await fetch(`${base}/`)).ok) break; } catch { /* not listening yet */ }
    await sleep(200);
  }
  const stop = async () => {
    if (state.exit === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await Promise.race([exited, sleep(5000)]);
    }
  };
  return { base, state, stop };
}

const call = async (base, method, p, { token, body } = {}) => {
  const res = await fetch(`${base}${p}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
};

test('switch off (unset or anything but exactly "true"): /status says { enabled: false }, every other chat route is a fixed 404, nothing is stored', async () => {
  for (const value of [undefined, 'false', 'TRUE']) {
    const backend = await startBackend(value);
    try {
      const status = await call(backend.base, 'GET', '/api/chat/status');
      assert.deepEqual([status.status, status.json.data], [200, { enabled: false }], String(value));
      for (const [method, p] of [['GET', '/api/chat/conversation'], ['POST', '/api/chat/messages'], ['GET', '/api/chat/admin/unread'], ['GET', '/api/chat/unread']]) {
        const res = await call(backend.base, method, p, { body: method === 'POST' ? {} : undefined });
        assert.deepEqual([res.status, res.json.code], [404, 'FEATURE_CLOSED'], `${value}: ${method} ${p}`);
      }
    } finally {
      await backend.stop();
    }
  }
}, { timeout: 120000 });

test('switch on: /status says enabled with the hours, with no sign-in; the chat routes are exempt from the general limiter, other API routes are not', async () => {
  const backend = await startBackend('true');
  try {
    const status = await call(backend.base, 'GET', '/api/chat/status');
    assert.equal(status.status, 200);
    assert.equal(status.json.data.enabled, true);
    assert.equal(status.json.data.hours.text, 'We usually reply between 12 PM and 9 PM (Pakistan time)');

    // 130 anonymous checks in a row: all are the plain 401, none is the general limiter's 429 (it would stop at 100).
    const chat = [];
    for (let i = 0; i < 130; i += 1) chat.push((await call(backend.base, 'GET', '/api/chat/conversation')).status);
    assert.equal(chat.filter((s) => s === 401).length, 130, 'the chat routes are not counted by the general limiter');

    // The same number of requests to an ordinary API route is cut off by it, which shows the limiter is in place.
    const other = [];
    for (let i = 0; i < 130; i += 1) other.push((await call(backend.base, 'GET', '/api/testimonials')).status);
    assert.ok(other.includes(429), 'an ordinary route meets the general limit of 100');
    assert.ok(other.filter((s) => s === 429).length >= 25);
  } finally {
    await backend.stop();
  }
}, { timeout: 180000 });

test('switch on, through the real server: a signed-in user sends and reads; the text is stored as typed (no sanitizer), and the limiter headers are the chat\'s own', async () => {
  const user = await User.create({ name: 'Wiring Person', email: 'wiring.person@example.invalid', password: 'not-a-real-password' });
  const token = jwt.sign({ id: String(user._id) }, SECRET, { expiresIn: '1h' });
  const backend = await startBackend('true');
  try {
    const sent = await call(backend.base, 'POST', '/api/chat/messages', { token, body: { body: 'a < b and <b>bold</b> stays as typed', clientMessageId: crypto.randomUUID(), subject: 'Wiring check' } });
    assert.equal(sent.status, 201, sent.text);
    assert.equal(sent.json.data.message.text, 'a < b and <b>bold</b> stays as typed', 'the general sanitizer is skipped for the chat');
    const read = await call(backend.base, 'GET', '/api/chat/conversation', { token });
    assert.equal(read.status, 200);
    assert.deepEqual(read.json.data.messages.map((m) => m.text), ['a < b and <b>bold</b> stays as typed']);
    assert.equal(read.headers.get('cache-control'), 'no-store');
    assert.equal(read.headers.get('ratelimit-limit'), '600', 'the poll limit of the chat, not the general 100');
    assert.equal(backend.state.output.includes('bold'), false, 'no message text in the server output');
  } finally {
    await backend.stop();
  }
}, { timeout: 120000 });
