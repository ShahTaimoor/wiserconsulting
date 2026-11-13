'use strict';

// Boots the real backend/index.js with the Tourist Visa feature ON but no Cloudinary settings, and checks the
// parts the injected-storage tests cannot: a multipart upload gets through the real parser, sanitizer, rate
// limiter and session order and reaches the document service (which answers "storage not configured"), the
// JSON routes still work, other routes still refuse multipart, and the startup warning names the missing
// variables without any value. The child runs in a scratch working directory, so the developer's real .env is
// not loaded and no real Cloudinary call can happen.

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

const JWT_SECRET = 'test-only-jwt-secret';
const ORIGIN = 'http://localhost:3000';

let mongod;
let child;
let childOutput = '';
let childExit = null;
let baseUrl;
let token;

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
  for (const name of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) delete env[name];
  child = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    cwd: os.tmpdir(),
    env: {
      ...env,
      MONGODB_URI: mongod.getUri(),
      PORT: String(port),
      JWT_SECRET,
      FRONTEND_URL: ORIGIN,
      NODE_ENV: 'development',
      TOURIST_VISA_ENABLED: 'true',
      FIELD_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
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

  const user = await User.create({ name: 'Test Wiring Docs', email: 'test.wiring.docs@example.com', password: 'not-a-real-password' });
  token = jwt.sign({ id: String(user._id) }, JWT_SECRET, { expiresIn: '1h' });
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
  const res = await fetch(`${baseUrl}/api/tourist-visa${p}`, { method, headers: { Origin: ORIGIN, Authorization: `Bearer ${token}`, ...headers }, body });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
};

const pdfForm = (name = 'test-passport.pdf') => {
  const form = new FormData();
  form.append('slot', 'passport');
  form.append('file', new Blob([Buffer.from('%PDF-1.7\n made-up test file')], { type: 'application/pdf' }), name);
  return form;
};

test('startup: the missing file storage settings are named, never shown', () => {
  assert.match(childOutput, /File storage is not configured \(CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET missing\)/);
});

test('real index.js: a multipart upload passes the real middleware order and reaches the service', async () => {
  assert.equal((await call('POST', '/applications')).status, 201);
  const res = await call('POST', '/applications/me/documents', { body: pdfForm() });
  assert.equal(res.status, 503, res.text);
  assert.equal(res.json.code, 'STORAGE_UNAVAILABLE', 'it was read, checked as a PDF and refused only because no storage is configured');
  assert.equal(res.json.success, false);

  const wrong = await call('POST', '/applications/me/documents', { body: (() => { const f = pdfForm(); f.set('slot', 'visa'); return f; })() });
  assert.equal(wrong.json.code, 'INVALID_SLOT');
  const notPdf = new FormData();
  notPdf.append('slot', 'passport');
  notPdf.append('file', new Blob([Buffer.from('plain text')], { type: 'application/pdf' }), 'a.pdf');
  assert.equal((await call('POST', '/applications/me/documents', { body: notPdf })).json.code, 'WRONG_TYPE');
});

test('real index.js: the JSON routes still work, the list works, and other routes still refuse multipart', async () => {
  const saved = await call('PUT', '/applications/me/sections/10B', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: { q10_2: 'Tom & Jerry <b>kept</b>' } }),
  });
  assert.equal(saved.status, 200, saved.text);
  const list = await call('GET', '/applications/me/documents');
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.data.documents, []);
  assert.equal(list.json.data.limits.maxFileBytes, 4 * 1024 * 1024);

  const other = await call('PUT', '/applications/me/sections/1', { body: pdfForm() });
  assert.equal(other.status, 415);
});

test('real index.js: a file over the size limit is refused with its own code', async () => {
  const form = new FormData();
  form.append('slot', 'passport');
  form.append('file', new Blob([Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(4 * 1024 * 1024)])], { type: 'application/pdf' }), 'big.pdf');
  const res = await call('POST', '/applications/me/documents', { body: form });
  assert.equal(res.status, 413);
  assert.equal(res.json.code, 'FILE_TOO_LARGE');
});
