'use strict';

// Step 8j-2, finding A2: PUT /api/update-profile changes only name, phone, address and city. It used to pass the whole request body to the
// database, so a user could send {"role":1} and become an administrator, or replace their password with plain text.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers/testApp');
const userService = require('../services/userService');

let app;
before(async () => {
  app = await startTestApp();
});
after(async () => {
  await app.stop();
});

const stored = (id) => app.models.User.findById(id).lean();

test('a normal user sending {"role":1} stays a normal user and the request is refused with a 400', async () => {
  const { user, token } = await app.makeUser();
  const res = await app.call('PUT', '/api/update-profile', { body: { name: 'Still Me', role: 1 }, token });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /Unrecognized key/i);
  assert.equal((await stored(user._id)).role, 0);
  assert.equal((await stored(user._id)).name, user.name, 'nothing of a refused request is applied');
  // and the admin-only routes are still closed to them
  assert.equal((await app.call('GET', '/api/all-users', { token })).status, 403);
});

test('sending password, email, isDeleted, googleId, role or avatar changes nothing, alone or together', async () => {
  const { user, token } = await app.makeUser({ email: 'keeper@example.com' });
  const before = await stored(user._id);
  const attempts = [
    { password: 'plain-text-here' },
    { email: 'someone.else@example.com' },
    { isDeleted: true },
    { googleId: 'g-12345' },
    { role: 1 },
    { avatar: 'https://example.invalid/x.png' },
    { _id: '000000000000000000000000' },
    { $set: { role: 1 } },
    { name: 'New Name', phone: '1', password: 'x', email: 'y@example.com', isDeleted: true, role: 1 },
  ];
  for (const body of attempts) {
    const res = await app.call('PUT', '/api/update-profile', { body, token });
    assert.equal(res.status, 400, JSON.stringify(Object.keys(body)));
  }
  const after = await stored(user._id);
  assert.equal(after.password, before.password, 'the stored hash is untouched');
  assert.match(after.password, /^\$2[aby]\$/, 'and it is still a bcrypt hash');
  assert.equal(after.email, 'keeper@example.com');
  assert.equal(after.isDeleted, false);
  assert.equal(after.role, 0);
  assert.equal(after.googleId, undefined);
  assert.equal(after.avatar, undefined);
  assert.equal(after.name, before.name);
});

test('the allowed fields still update, and nothing else changes with them', async () => {
  const { user, token } = await app.makeUser();
  const before = await stored(user._id);
  const res = await app.call('PUT', '/api/update-profile', { body: { name: '  Changed Name  ', phone: '+44 7700 900000', address: '1 Test Street', city: 'Testville' }, token });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.data.user, { id: String(user._id), name: 'Changed Name', phone: '+44 7700 900000', address: '1 Test Street', city: 'Testville' });
  const after = await stored(user._id);
  assert.deepEqual([after.name, after.phone, after.address, after.city], ['Changed Name', '+44 7700 900000', '1 Test Street', 'Testville']);
  assert.deepEqual([after.role, after.email, after.password, after.isDeleted], [before.role, before.email, before.password, before.isDeleted]);
  // a single field
  const one = await app.call('PUT', '/api/update-profile', { body: { city: 'Elsewhere' }, token });
  assert.equal(one.status, 200);
  assert.equal((await stored(user._id)).city, 'Elsewhere');
  assert.equal((await stored(user._id)).name, 'Changed Name');
});

test('an unknown key gives a 400 that names it', async () => {
  const { token } = await app.makeUser();
  const res = await app.call('PUT', '/api/update-profile', { body: { nickname: 'x' }, token });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /Unrecognized key.*nickname/i);
});

test('an empty body changes nothing and is accepted, as before; wrong types are refused', async () => {
  const { user, token } = await app.makeUser();
  const before = await stored(user._id);
  assert.equal((await app.call('PUT', '/api/update-profile', { body: {}, token })).status, 200);
  assert.equal((await stored(user._id)).name, before.name);
  for (const body of [{ name: 5 }, { name: { $ne: '' } }, { phone: ['1'] }, { city: null }, { name: '' }]) {
    assert.equal((await app.call('PUT', '/api/update-profile', { body, token })).status, 400, JSON.stringify(body));
  }
});

test('no sign-in is still a 401', async () => {
  const res = await app.call('PUT', '/api/update-profile', { body: { name: 'x' } });
  assert.equal(res.status, 401);
});

test('the service copies only the profile fields even when a caller hands it more (a second layer, under the validation)', async () => {
  const { user } = await app.makeUser({ email: 'second-layer@example.com' });
  const before = await stored(user._id);
  const result = await userService.updateProfile(String(user._id), { name: 'Only This', role: 1, password: 'plain', email: 'x@example.com', isDeleted: true, googleId: 'g', city: 5 });
  assert.equal(result.user.name, 'Only This');
  const after = await stored(user._id);
  assert.deepEqual([after.role, after.password, after.email, after.isDeleted, after.googleId, after.city], [0, before.password, 'second-layer@example.com', false, undefined, undefined]);
});

test('pickProfileFields: only own text fields of the four, never anything inherited or odd', () => {
  const { pickProfileFields, PROFILE_FIELDS } = userService;
  assert.deepEqual(PROFILE_FIELDS, ['name', 'phone', 'address', 'city']);
  assert.deepEqual(pickProfileFields({ name: 'a', phone: 'b', address: 'c', city: 'd', role: 1 }), { name: 'a', phone: 'b', address: 'c', city: 'd' });
  assert.deepEqual(pickProfileFields({ role: 1, password: 'x' }), {});
  assert.deepEqual(pickProfileFields(Object.create({ name: 'inherited' })), {});
  assert.deepEqual(pickProfileFields({ name: 5, phone: null, address: undefined, city: {} }), {});
  for (const odd of [null, undefined, 'text', 5, []]) assert.deepEqual(pickProfileFields(odd), {});
});

test('a user who has been removed cannot update a profile', async () => {
  const { user, token } = await app.makeUser();
  await app.models.User.updateOne({ _id: user._id }, { isDeleted: true });
  const res = await app.call('PUT', '/api/update-profile', { body: { name: 'x' }, token });
  assert.equal(res.status, 401);
});
