'use strict';

// Step 8j-2: backend/scripts/create-first-admin.js, the one way to make the first administrator. It reads the details from environment
// variables only, checks them, refuses a duplicate or a weak password, hashes as the sign-up does, and never prints the password.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-not-real';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { MongoMemoryServer } = require('mongodb-memory-server');
const script = require('../scripts/create-first-admin');
const userRepository = require('../repositories/userRepository');
const userService = require('../services/userService');
const User = require('../models/User');

const GOOD = 'Tr1cky-Made-Up-Pass!';
let mongod;
before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.init();
});
after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
const reset = () => User.deleteMany({});

/** Runs the tool with fakes for the output and the database connection; resolves { code, out, err, connected, loadedEnv }. */
async function runWith(env, overrides = {}) {
  const out = [];
  const err = [];
  const state = { connected: 0, loadedEnv: 0 };
  const code = await script.run({
    env,
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    loadEnv: () => {
      state.loadedEnv += 1;
    },
    connect: async () => {
      state.connected += 1;
    },
    disconnect: async () => {},
    users: userRepository,
    hash: (password) => bcrypt.hash(password, script.BCRYPT_ROUNDS),
    ...overrides,
  });
  return { code, out: out.join('\n'), err: err.join('\n'), ...state };
}
const envWith = (extra = {}) => ({ FIRST_ADMIN_EMAIL: 'first.admin@example.com', FIRST_ADMIN_PASSWORD: GOOD, ...extra });
const noSecret = (result, ...secrets) => {
  for (const secret of secrets) {
    assert.equal(result.out.includes(secret), false, 'the output holds a secret');
    assert.equal(result.err.includes(secret), false, 'the error output holds a secret');
  }
};

test('it creates the first administrator: role 1, a bcrypt hash made as the sign-up makes it, and one line that never holds the password', async () => {
  await reset();
  const result = await runWith(envWith({ FIRST_ADMIN_NAME: 'First Admin' }));
  assert.equal(result.code, 0);
  const user = await User.findOne({ email: 'first.admin@example.com' }).lean();
  assert.equal(user.role, 1);
  assert.equal(user.name, 'First Admin');
  assert.match(user.password, /^\$2[aby]\$10\$/, 'bcrypt with 10 rounds');
  assert.equal(await bcrypt.compare(GOOD, user.password), true);
  assert.notEqual(user.password, GOOD);
  assert.equal(result.out.split('\n').length, 1, 'one line');
  assert.match(result.out, /Administrator account created for first\.admin@example\.com/);
  noSecret(result, GOOD, user.password);
  assert.equal(/mongodb|mongodb\+srv/i.test(result.out + result.err), false, 'no database address');
  // The account signs in through the normal login.
  const login = await userService.login('first.admin@example.com', undefined, GOOD);
  assert.equal(login.user.role, 1);
  assert.ok(login.token);
});

test('the same hashing as the sign-up: 10 rounds in both places', () => {
  assert.equal(script.BCRYPT_ROUNDS, 10);
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'userService.js'), 'utf8');
  assert.match(source, /bcrypt\.hash\(password, 10\)/);
});

test('the email is cleaned as the sign-up cleans it (trimmed, lower case) and the default name is used when none is given', async () => {
  await reset();
  const result = await runWith(envWith({ FIRST_ADMIN_EMAIL: '  First.ADMIN@Example.com ' }));
  assert.equal(result.code, 0);
  const user = await User.findOne({ email: 'first.admin@example.com' }).lean();
  assert.equal(user.name, script.DEFAULT_NAME);
  // The script cleans the email itself (the database model would too), and says so in the line it prints.
  assert.match(result.out, /created for first\.admin@example\.com\./);
  assert.equal(script.cleanEmail('  A.B@Example.COM '), 'a.b@example.com');
});

test('it refuses a duplicate email and changes nothing', async () => {
  await reset();
  await User.create({ name: 'Existing Person', email: 'first.admin@example.com', password: await bcrypt.hash('Another-Pass-1!', 4), role: 0 });
  const before = await User.find({}).lean();
  const result = await runWith(envWith({ FIRST_ADMIN_NAME: 'Different Name' }));
  assert.equal(result.code, 2);
  assert.match(result.err, /already exists/);
  assert.match(result.err, /Nothing was changed/);
  noSecret(result, GOOD);
  assert.deepEqual(await User.find({}).lean(), before);
});

test('it refuses a duplicate name too (the sign-up does), and an existing email in another case', async () => {
  await reset();
  await User.create({ name: script.DEFAULT_NAME, email: 'someone.else@example.com', password: await bcrypt.hash('Another-Pass-1!', 4) });
  assert.equal((await runWith(envWith())).code, 2);
  assert.equal(await User.countDocuments({ role: 1 }), 0);
  await reset();
  await User.create({ name: 'Other Name', email: 'first.admin@example.com', password: await bcrypt.hash('Another-Pass-1!', 4) });
  assert.equal((await runWith(envWith({ FIRST_ADMIN_EMAIL: 'FIRST.ADMIN@example.com', FIRST_ADMIN_NAME: 'Second Name' }))).code, 2);
  assert.equal(await User.countDocuments({}), 1);
});

test('it refuses when the email or the password is missing, and does not even open the database', async () => {
  await reset();
  for (const env of [{}, { FIRST_ADMIN_EMAIL: 'a@example.com' }, { FIRST_ADMIN_PASSWORD: GOOD }, { FIRST_ADMIN_EMAIL: '', FIRST_ADMIN_PASSWORD: GOOD }, { FIRST_ADMIN_EMAIL: 'a@example.com', FIRST_ADMIN_PASSWORD: '' }, { FIRST_ADMIN_EMAIL: '   ', FIRST_ADMIN_PASSWORD: GOOD }]) {
    const result = await runWith(env);
    assert.equal(result.code, 2, JSON.stringify(Object.keys(env)));
    assert.equal(result.connected, 0, 'the database is not opened for a refused run');
    assert.equal(result.loadedEnv, 0, 'the settings file is not read for a refused run');
    assert.match(result.err, /FIRST_ADMIN_EMAIL/);
    noSecret(result, GOOD);
  }
  assert.equal(await User.countDocuments({}), 0);
});

test('it refuses an email that is not an email, and a name that is too long', async () => {
  await reset();
  for (const email of ['not-an-email', 'a@b', '@example.com', 'a b@example.com', `${'a'.repeat(250)}@example.com`]) {
    const result = await runWith(envWith({ FIRST_ADMIN_EMAIL: email }));
    assert.equal(result.code, 2, email.slice(0, 20));
    assert.equal(result.connected, 0);
  }
  assert.equal((await runWith(envWith({ FIRST_ADMIN_NAME: 'x'.repeat(101) }))).code, 2);
  assert.equal(await User.countDocuments({}), 0);
});

test('it refuses a weak password, says why in fixed words, never repeats the password, and does not open the database', async () => {
  await reset();
  // Each case breaks ONE rule and keeps all the others, so that only that rule can refuse it.
  const weak = {
    'short': { password: 'Ab1!xyZ' },
    'one kind of character': { password: 'qzxkvjwpmlhgtrbn' },
    'two kinds only': { password: 'qzxkvjwpmlhg1357' },
    'common word inside': { password: 'My-Password-2027!x' },
    'common digits inside': { password: 'Xy!123456qzkvZ' },
    'the name of the email inside': { password: 'Zephyr.Quill#2027x', email: 'zephyr.quill@example.com' },
    'few different characters': { password: 'aA1!aA1!aA1!aA1!' },
    'longer than the hashing reads': { password: `Aa1!Bb2@Cc3#Dd4$${'Ee5%'.repeat(20)}` },
  };
  for (const [label, { password, email = 'first.admin@example.com' }] of Object.entries(weak)) {
    const result = await runWith(envWith({ FIRST_ADMIN_EMAIL: email, FIRST_ADMIN_PASSWORD: password }));
    assert.equal(result.code, 2, label);
    assert.match(result.err, /too weak/, label);
    assert.equal(result.connected, 0, label);
    noSecret(result, password);
  }
  assert.equal(await User.countDocuments({}), 0);
  // A good one passes (the control).
  assert.deepEqual(script.passwordProblems(GOOD, 'first.admin@example.com'), []);
  assert.deepEqual(script.passwordProblems('Zq9!vN3#wP7$rT5', 'a@example.com'), []);
});

test('it never prints the password or a hash, even when the database fails (only the type or code of an error is shown)', async () => {
  await reset();
  const leaky = new Error(`could not write the document with password ${GOOD}`);
  const failingCreate = await runWith(envWith(), { users: { findByEmailOrName: async () => null, create: async () => { throw leaky; } } });
  assert.equal(failingCreate.code, 1);
  assert.match(failingCreate.err, /could not be created \(Error\)/);
  noSecret(failingCreate, GOOD, 'could not write');

  const failingConnect = await runWith(envWith(), { connect: async () => { throw Object.assign(new Error(`bad uri with ${GOOD}`), { code: 'ENOTFOUND' }); } });
  assert.equal(failingConnect.code, 1);
  assert.match(failingConnect.err, /ENOTFOUND/);
  noSecret(failingConnect, GOOD, 'bad uri');

  const raced = await runWith(envWith(), { users: { findByEmailOrName: async () => null, create: async () => { throw Object.assign(new Error('E11000 duplicate'), { code: 11000 }); } } });
  assert.equal(raced.code, 2, 'a duplicate that appears between the check and the write is refused, not a crash');
  assert.equal(await User.countDocuments({}), 0);
});

test('the database is closed after a run, whatever the outcome', async () => {
  await reset();
  let closed = 0;
  await runWith(envWith(), { disconnect: async () => { closed += 1; } });
  await runWith(envWith(), { disconnect: async () => { closed += 1; } }); // refused: duplicate
  assert.equal(closed, 2);
});

test('the script takes its details from the environment only: no command-line arguments are read, and the password is never logged', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'create-first-admin.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/process\.argv/.test(code), false);
  assert.equal(/console\.(log|error|info|warn)\([^)]*(password|PASSWORD_VARIABLE)/i.test(code), false);
  assert.match(source, /^#!\/usr\/bin\/env node/);
  assert.match(source.slice(0, 3000), /HOW TO RUN/);
});
