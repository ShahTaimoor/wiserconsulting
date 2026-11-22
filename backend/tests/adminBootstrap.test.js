// The administrator account from the environment. No database: the users are an in-memory fake.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureAdminFromEnv } = require('../services/adminBootstrap');

const GOOD = 'Tr1cky-Horse-Battery!';
function fakeUsers(initial = []) {
  const rows = initial.map((u, i) => ({ _id: `u${i}`, isDeleted: false, role: 0, ...u }));
  return {
    rows,
    findAnyByEmail: async (email) => rows.find((r) => r.email === email) || null,
    findOtherByName: async (name, email) => rows.find((r) => r.name === name && r.email !== email && !r.isDeleted) || null,
    create: async (data) => { rows.push({ _id: `n${rows.length}`, isDeleted: false, ...data }); },
    updateById: async (id, data) => { Object.assign(rows.find((r) => r._id === id), data); },
  };
}
// a transparent "hash": easy to inspect, never the password itself in a log
const hash = async (p) => `hashed:${p}`;
const compare = async (p, stored) => stored === `hashed:${p}`;
const run = (env, users, extra = {}) => ensureAdminFromEnv({ env, users, hash, compare, report: () => {}, fail: (t) => (extra.fails ||= []).push(t), ...extra });

test('nothing happens unless both the e-mail and the password are set', async () => {
  const users = fakeUsers();
  assert.equal((await run({}, users)).status, 'not_configured');
  assert.equal((await run({ ADMIN_USER_EMAIL: 'boss@example.com' }, users)).status, 'not_configured');
  assert.equal((await run({ ADMIN_USER_PASSWORD: GOOD }, users)).status, 'not_configured');
  assert.equal(users.rows.length, 0);
});

test('a new administrator is created with role 1, a lower-case e-mail and a hashed password', async () => {
  const users = fakeUsers();
  const result = await run({ ADMIN_USER_EMAIL: '  Boss@Example.com ', ADMIN_USER_PASSWORD: GOOD, ADMIN_USER_NAME: 'The Boss' }, users);
  assert.equal(result.status, 'created');
  assert.deepEqual(users.rows.map((r) => [r.email, r.name, r.role]), [['boss@example.com', 'The Boss', 1]]);
  assert.notEqual(users.rows[0].password, GOOD);
});

test('a weak password or a bad e-mail is refused, reported without the value, and nothing is created', async () => {
  const users = fakeUsers();
  const extra = {};
  assert.equal((await run({ ADMIN_USER_EMAIL: 'boss@example.com', ADMIN_USER_PASSWORD: 'short' }, users, extra)).status, 'weak_password');
  assert.equal((await run({ ADMIN_USER_EMAIL: 'not-an-email', ADMIN_USER_PASSWORD: GOOD }, users, extra)).status, 'invalid_email');
  assert.equal(users.rows.length, 0);
  assert.ok(extra.fails.length === 2);
  assert.equal(extra.fails.join(' ').includes('short'), false);
  assert.equal(extra.fails.join(' ').includes(GOOD), false);
});

test('an existing account is promoted, and its password follows the environment; running again changes nothing', async () => {
  const users = fakeUsers([{ name: 'Old', email: 'boss@example.com', password: 'hashed:something-else', role: 0 }]);
  const env = { ADMIN_USER_EMAIL: 'boss@example.com', ADMIN_USER_PASSWORD: GOOD };
  const first = await run(env, users);
  assert.equal(first.status, 'updated');
  assert.deepEqual(first.changed.sort(), ['password', 'role']);
  assert.equal(users.rows[0].role, 1);
  assert.equal(users.rows[0].password, `hashed:${GOOD}`);
  assert.equal((await run(env, users)).status, 'unchanged');
});

test('a deleted account with that e-mail is brought back instead of creating a duplicate', async () => {
  const users = fakeUsers([{ name: 'Gone', email: 'boss@example.com', password: `hashed:${GOOD}`, role: 1, isDeleted: true }]);
  const result = await run({ ADMIN_USER_EMAIL: 'boss@example.com', ADMIN_USER_PASSWORD: GOOD }, users);
  assert.deepEqual([result.status, result.changed], ['updated', ['isDeleted']]);
  assert.equal(users.rows.length, 1);
  assert.equal(users.rows[0].isDeleted, false);
});

test('a name used by another account is reported, and nothing is created', async () => {
  const users = fakeUsers([{ name: 'Administrator', email: 'someone@example.com', password: 'x' }]);
  assert.equal((await run({ ADMIN_USER_EMAIL: 'boss@example.com', ADMIN_USER_PASSWORD: GOOD }, users)).status, 'name_taken');
  assert.equal(users.rows.length, 1);
});

test('a database failure is reported by its type only and does not throw', async () => {
  const users = fakeUsers();
  users.findAnyByEmail = async () => { throw Object.assign(new Error('secret connection string'), { code: 'ECONNRESET' }); };
  const extra = {};
  assert.equal((await run({ ADMIN_USER_EMAIL: 'boss@example.com', ADMIN_USER_PASSWORD: GOOD }, users, extra)).status, 'error');
  assert.equal(extra.fails.join(' ').includes('secret'), false);
});
