'use strict';

// Step 8j-2b: "Sign in with Google" and "Sign in with GitHub" are gone. This file starts the REAL index.js (in a child process, on a free
// port, against an in-memory database, with the settings file switched off) and checks: the old routes are 404; the password sign-in
// and sign-up still work; an account with no password (an old Google account) gets exactly the normal failure answer; and nothing of the
// removed code (routes, passport, session, packages, schema) is left in the backend. Everything here is made-up data.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { MongoMemoryServer } = require('mongodb-memory-server');

const BACKEND = path.join(__dirname, '..');
const GOOD = 'Made-Up-Pass-1';
let mongod;
let child;
let base;
let User;
let output = '';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function call(method, url, body) {
  const response = await fetch(base + url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  let json = null;
  let text = '';
  try {
    text = await response.text();
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: response.status, json, text };
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  User = require('../models/User');
  await User.init();
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['-r', path.join(__dirname, 'helpers', 'noDotenv.js'), path.join(BACKEND, 'index.js')], {
    cwd: BACKEND,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: 'test',
      PORT: String(port),
      MONGODB_URI: mongod.getUri(),
      JWT_SECRET: 'test-only-jwt-secret-not-real',
      FRONTEND_URL: 'http://localhost:3000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  // Wait until the real app answers.
  const deadline = Date.now() + 30000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`the app stopped at start-up: ${output.slice(0, 400)}`);
    try {
      const res = await fetch(`${base}/`);
      if (res.status === 200) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error('the app did not start in time');
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
  await mongoose.disconnect();
  await mongod.stop();
});

test('the removed sign-in routes are 404 in the real app (GET, and POST with a valid-looking body)', async () => {
  const urls = [
    '/api/auth/google',
    '/api/auth/google/callback',
    '/api/auth/google/token',
    '/api/auth/github',
    '/api/auth/github/callback',
    '/api/auth/me',
    '/api/auth/logout',
    '/api/auth',
    '/auth-success',
    '/api/auth-success',
  ];
  for (const url of urls) {
    for (const method of ['GET', 'POST']) {
      const res = await call(method, url, method === 'GET' ? undefined : { access_token: 'made-up-token' });
      assert.equal(res.status, 404, `${method} ${url} -> ${res.status}`);
    }
  }
  assert.equal(await User.countDocuments({}), 0, 'no account was made by any of those calls');
});

test('a 404 for the Google token route leaves no session cookie and no redirect to /auth-success', async () => {
  const response = await fetch(`${base}/api/auth/google/callback?code=made-up`, { redirect: 'manual' });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('set-cookie'), null, 'no session cookie is set any more');
});

test('password sign-up and sign-in still work', async () => {
  const signup = await call('POST', '/api/signup', { name: 'Password Person', email: 'Password.Person@Example.com', password: GOOD });
  assert.equal(signup.status, 201);
  const login = await call('POST', '/api/login', { email: 'password.person@example.com', password: GOOD });
  assert.equal(login.status, 200);
  assert.ok(login.json.data.token);
  assert.equal(login.json.data.user.email, 'password.person@example.com');
  assert.equal(login.json.data.user.password, undefined);
  const wrong = await call('POST', '/api/login', { email: 'password.person@example.com', password: 'Wrong-Pass-1' });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.json.message, 'Invalid credentials');
});

test('the strict sign-up and sign-in schemas still accept good bodies and refuse an unknown key', async () => {
  const { signupSchema, loginSchema } = require('../validations/userValidation');
  assert.equal(signupSchema.safeParse({ body: { name: 'A Person', email: 'a@example.com', password: GOOD } }).success, true);
  assert.equal(loginSchema.safeParse({ body: { email: 'a@example.com', password: GOOD } }).success, true);
  assert.equal(loginSchema.safeParse({ body: { name: 'A Person', password: GOOD } }).success, true);
  assert.equal(signupSchema.safeParse({ body: { name: 'A Person', email: 'a@example.com', password: GOOD, role: 1 } }).success, false);
  assert.equal(loginSchema.safeParse({ body: { email: 'a@example.com', password: GOOD, googleId: 'g' } }).success, false);
  const sent = await call('POST', '/api/login', { email: 'a@example.com', password: GOOD, role: 1 });
  assert.equal(sent.status, 400);
});

test('an account with no password (an old Google account) gets the normal failure answer, the same as an unknown email or a wrong password', async () => {
  await User.create({ name: 'Old Google Person', email: 'old.google@example.com', googleId: 'g-made-up-1', avatar: 'https://example.invalid/a.png' });
  const stored = await User.findOne({ email: 'old.google@example.com' }).lean();
  assert.equal(stored.password, undefined, 'the made-up account really has no password');

  const noPassword = await call('POST', '/api/login', { email: 'old.google@example.com', password: GOOD });
  const unknown = await call('POST', '/api/login', { email: 'nobody.here@example.com', password: GOOD });
  const wrong = await call('POST', '/api/login', { email: 'password.person@example.com', password: 'Wrong-Pass-1' });
  for (const res of [noPassword, unknown, wrong]) {
    assert.equal(res.status, 400);
    assert.equal(res.json.message, 'Invalid credentials');
  }
  assert.deepEqual(noPassword.json, unknown.json, 'the same body: nothing says that this account exists or how it was made');
  assert.equal(noPassword.text.toLowerCase().includes('google'), false);
  assert.equal(noPassword.json.data?.token, undefined);
  assert.equal(noPassword.json.token, undefined);

  // By name too (the login also accepts a name), and with other made-up passwords, including the empty one and a non-text one.
  for (const body of [
    { name: 'Old Google Person', password: GOOD },
    { email: 'old.google@example.com', password: ' ' },
    { email: 'old.google@example.com', password: 'undefined' },
    { email: 'old.google@example.com', password: 'null' },
  ]) {
    const res = await call('POST', '/api/login', body);
    assert.equal(res.status, 400, JSON.stringify(Object.keys(body)));
    assert.equal(res.json.message, 'Invalid credentials');
  }
  assert.equal((await call('POST', '/api/login', { email: 'old.google@example.com', password: '' })).status, 400);
  assert.equal((await call('POST', '/api/login', { email: 'old.google@example.com', password: null })).status, 400);
  assert.equal((await call('POST', '/api/login', { email: 'old.google@example.com', password: ['x'] })).status, 400);
  assert.equal((await call('POST', '/api/login', { email: 'old.google@example.com', password: { $ne: null } })).status, 400);
});

test('an account whose stored password is empty or not text also gets the normal failure answer, never a 500', async () => {
  await User.collection.insertOne({ name: 'Empty Password Person', email: 'empty.password@example.com', password: '', googleId: 'g-made-up-2', role: 0, isDeleted: false });
  await User.collection.insertOne({ name: 'Null Password Person', email: 'null.password@example.com', password: null, googleId: 'g-made-up-3', role: 0, isDeleted: false });
  for (const email of ['empty.password@example.com', 'null.password@example.com']) {
    const res = await call('POST', '/api/login', { email, password: GOOD });
    assert.equal(res.status, 400, email);
    assert.equal(res.json.message, 'Invalid credentials');
  }
});

test('an account with both a Google id and a password can still sign in with the password; the stored records are untouched by all of this', async () => {
  await User.create({ name: 'Linked Person', email: 'linked@example.com', googleId: 'g-made-up-4', password: await bcrypt.hash(GOOD, 4) });
  const res = await call('POST', '/api/login', { email: 'linked@example.com', password: GOOD });
  assert.equal(res.status, 200);
  const old = await User.findOne({ email: 'old.google@example.com' }).lean();
  assert.equal(old.googleId, 'g-made-up-1');
  assert.equal(old.avatar, 'https://example.invalid/a.png');
  assert.equal(await User.countDocuments({ googleId: { $exists: true } }), 4, 'the googleId values are all still there');
});

test('the service itself (not only the route) answers "Invalid credentials" when the password given is missing or not text', async () => {
  const userService = require('../services/userService');
  for (const email of ['old.google@example.com', 'linked@example.com', 'empty.password@example.com']) {
    for (const password of [undefined, null, '', 123, ['x'], { $ne: null }]) {
      await assert.rejects(() => userService.login(email, undefined, password), (error) => error.message === 'Invalid credentials' && error.statusCode === 400, `${email} / ${typeof password}`);
    }
  }
  await assert.rejects(() => userService.login('nobody.here@example.com', undefined, GOOD), (error) => error.message === 'Invalid credentials');
});

test('the user model keeps its googleId field and the others (no migration)', () => {
  const paths = Object.keys(User.schema.paths);
  for (const field of ['googleId', 'avatar', 'password', 'email', 'name', 'role', 'isDeleted']) assert.ok(paths.includes(field), field);
});

// The Passport.js library: a require of it, one of its calls, or one of its strategy packages.
const PASSPORT_JS = /require\(\s*['"]passport|from\s+['"]passport|\bpassport\.(?:use|authenticate|initialize|session|serializeUser|deserializeUser)\b|passport-(?:google|github|oauth)/i;

test('the Passport.js pattern catches real Passport code and ignores the visa passport document', () => {
  for (const line of ["const passport = require('passport');", "app.use(passport.initialize());", "passport.use(new GoogleStrategy({}));", "const { Strategy } = require('passport-google-oauth20');", "import passport from 'passport';"]) {
    assert.equal(PASSPORT_JS.test(line), true, line);
  }
  for (const line of ["passport: Object.freeze({ max: 3, question: '10.6' }),", "// Uploaded files (passport and funds).", "the passport number is still ciphertext", "slot: 'passport'"]) {
    assert.equal(PASSPORT_JS.test(line), false, line);
  }
});

test('nothing of the removed code is left: files, mounts, packages, schema, environment names', () => {
  assert.equal(fs.existsSync(path.join(BACKEND, 'routes', 'authRoutes.js')), false);
  assert.equal(fs.existsSync(path.join(BACKEND, 'config', 'passport.js')), false);

  const index = fs.readFileSync(path.join(BACKEND, 'index.js'), 'utf8');
  assert.equal(/passport|express-session|session\(|authRoutes|\/api\/auth|SESSION_SECRET/.test(index), false, 'index.js');

  const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND, 'package.json'), 'utf8'));
  const lock = fs.readFileSync(path.join(BACKEND, 'package-lock.json'), 'utf8');
  for (const name of ['passport', 'passport-google-oauth20', 'express-session', 'google-auth-library', 'passport-github2', 'passport-github']) {
    assert.equal(name in (pkg.dependencies || {}), false, `${name} in dependencies`);
    assert.equal(name in (pkg.devDependencies || {}), false, `${name} in devDependencies`);
    assert.equal(lock.includes(`"node_modules/${name}"`), false, `${name} in the lock file`);
  }

  const userValidation = require('../validations/userValidation');
  assert.deepEqual(Object.keys(userValidation).sort(), ['loginSchema', 'signupSchema', 'updateProfileSchema', 'updateUserRoleSchema']);

  const userService = require('../services/userService');
  const userController = require('../controllers/userController');
  const userRepository = require('../repositories/userRepository');
  assert.equal(typeof userService.handleGoogleAuth, 'undefined');
  assert.equal(typeof userController.handleGoogleToken, 'undefined');
  assert.equal(typeof userRepository.findByGoogleId, 'undefined');

  // No source file (tests and the user model aside) names the removed sign-ins or their settings.
  const skip = new Set(['node_modules', 'tests', 'uploads', 'logs']);
  const offenders = [];
  (function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(full);
      else if (entry.name.endsWith('.js') && !/models[\\/]User\.js$/.test(full) && !/scripts[\\/]/.test(full)) {
        const text = fs.readFileSync(full, 'utf8');
        // "passport" alone is not a signal: the Tourist Visa feature has a passport document. Only Passport.js itself counts.
        if (PASSPORT_JS.test(text) || /googleapis|google-auth-library|GOOGLE_CLIENT|GOOGLE_CALLBACK|GITHUB_CLIENT|auth-success|oauth/i.test(text)) offenders.push(path.relative(BACKEND, full));
      }
    }
  })(BACKEND);
  // The settings file is not a source file; the upload config has a document category called "passports", which is unrelated.
  assert.deepEqual(offenders.filter((file) => !/config[\\/](upload|cloudinary)\.js$/.test(file)), []);
});
