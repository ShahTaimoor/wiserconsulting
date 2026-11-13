'use strict';

// Step 8j-2, finding A1: there is no route that creates an administrator. POST /api/create-admin used to need no sign-in at all.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestApp, BACKEND } = require('./helpers/testApp');

let app;
before(async () => {
  app = await startTestApp();
});
after(async () => {
  await app.stop();
});

const ADMIN_BODY = { name: 'Proof Intruder', email: 'intruder@example.com', password: 'Made-Up-Pass-1' };

test('a stranger (no sign-in) gets a 404 from POST /api/create-admin and no account is made', async () => {
  const before = await app.models.User.countDocuments({});
  const res = await app.call('POST', '/api/create-admin', { body: ADMIN_BODY });
  assert.equal(res.status, 404);
  assert.equal(await app.models.User.countDocuments({}), before);
  assert.equal(await app.models.User.countDocuments({ email: ADMIN_BODY.email }), 0);
});

test('a signed-in ordinary user gets a 404 too, and no administrator appears', async () => {
  const { token } = await app.makeUser();
  const admins = await app.models.User.countDocuments({ role: 1 });
  const res = await app.call('POST', '/api/create-admin', { body: ADMIN_BODY, token });
  assert.equal(res.status, 404);
  assert.equal(await app.models.User.countDocuments({ role: 1 }), admins);
});

test('even a signed-in administrator gets a 404: the route does not exist for anyone', async () => {
  const { token } = await app.makeUser({ role: 1 });
  const res = await app.call('POST', '/api/create-admin', { body: ADMIN_BODY, token });
  assert.equal(res.status, 404);
  assert.equal(await app.models.User.countDocuments({ email: ADMIN_BODY.email }), 0);
});

test('the other methods and the usual variants of the address are not routes either', async () => {
  for (const [method, url] of [['GET', '/api/create-admin'], ['PUT', '/api/create-admin'], ['POST', '/api/create-admin/'], ['POST', '/api/admin/create'], ['POST', '/api/auth/create-admin']]) {
    const res = await app.call(method, url, method === 'GET' ? {} : { body: ADMIN_BODY });
    assert.equal(res.status, 404, `${method} ${url}`);
  }
  assert.equal(await app.models.User.countDocuments({ email: ADMIN_BODY.email }), 0);
});

test('nothing in the server code, the client or the scripts still refers to the route, the controller method or the service method', () => {
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.next', 'uploads', 'tests'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.(js|ts|tsx|mjs|cjs|json|md)$/.test(entry.name) && entry.name !== 'package-lock.json') out.push(full);
    }
    return out;
  };
  const roots = [BACKEND, path.join(BACKEND, '..', 'client', 'src')].filter((dir) => fs.existsSync(dir));
  const hits = [];
  for (const file of roots.flatMap((dir) => walk(dir))) {
    const text = fs.readFileSync(file, 'utf8');
    if (/create-admin|createAdmin/.test(text)) hits.push(path.relative(path.join(BACKEND, '..'), file).replace(/\\/g, '/'));
  }
  assert.deepEqual(hits, []);
  const routes = fs.readFileSync(path.join(BACKEND, 'routes', 'userRoutes.js'), 'utf8');
  assert.equal(/router\.(get|post|put|patch|delete)\(\s*["'`]\/create-admin/.test(routes), false);
  const userService = require('../services/userService');
  const userController = require('../controllers/userController');
  assert.equal(typeof userService.createAdmin, 'undefined');
  assert.equal(typeof userController.createAdmin, 'undefined');
  assert.equal(typeof require('../validations/userValidation').createAdminSchema, 'undefined');
});
