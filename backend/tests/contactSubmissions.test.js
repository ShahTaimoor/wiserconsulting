'use strict';

// The OLD contact-form routes (/api/contacts), the ones the old admin Contact screens use while the chat is switched off:
//  - GET /api/contacts/:id only READS (it used to mark the message read); marking read is PATCH /api/contacts/:id/read;
//  - the search and the status filter work together, and the search also looks in the subject; the search text is literal text;
//  - an invalid status is a 400 with a clear message, never a 500.
// In-memory MongoDB, made-up people and made-up messages only. Who may call what is unchanged and checked here too.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers/testApp');

let app;
let admin;
let person;
let Submission;

before(async () => {
  app = await startTestApp();
  admin = await app.makeUser({ role: 1, email: 'admin.contacts@example.com' });
  person = await app.makeUser({ role: 0, email: 'person.contacts@example.com' });
  Submission = app.models.ContactSubmission;
});
after(async () => {
  await app.stop();
});
beforeEach(async () => {
  await Submission.deleteMany({});
});

let counter = 0;
const make = (extra = {}) => {
  counter += 1;
  return Submission.create({ name: `Made Up Person ${counter}`, email: `made.up.${counter}@example.com`, phone: `0300000${String(counter).padStart(4, '0')}`, subject: `Subject ${counter}`, message: `Message number ${counter}`, ...extra });
};
const statusOf = async (id) => (await Submission.findById(id).lean()).status;
const list = (query = '', token = admin.token) => app.call('GET', `/api/contacts${query}`, { token });
const names = (res) => res.json.data.map((row) => row.name).sort();

// ---------------------------------------------------------------------------------------------- 1. reading does not change anything

test('GET /api/contacts/:id returns the message and changes NOTHING (the status stays "new", however often it is read)', async () => {
  const row = await make();
  for (let i = 0; i < 3; i += 1) {
    const res = await app.call('GET', `/api/contacts/${row._id}`, { token: admin.token });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.status, 'new');
    assert.equal(res.json.data.subject, row.subject);
  }
  assert.equal(await statusOf(row._id), 'new');
  const before = await Submission.findById(row._id).lean();
  await app.call('GET', `/api/contacts/${row._id}`, { token: admin.token });
  const after = await Submission.findById(row._id).lean();
  assert.deepEqual(after, before, 'the stored record (including updatedAt) is exactly as it was');
});

test('GET /api/contacts/:id: who may read it is unchanged (401 without a sign-in, 403 for a normal user, 404 for an unknown id)', async () => {
  const row = await make();
  assert.equal((await app.call('GET', `/api/contacts/${row._id}`)).status, 401);
  assert.equal((await app.call('GET', `/api/contacts/${row._id}`, { token: person.token })).status, 403);
  assert.equal((await app.call('GET', '/api/contacts/0123456789abcdef01234567', { token: admin.token })).status, 404);
});

// ---------------------------------------------------------------------------------------------- 1. the explicit mark-read

test('PATCH /api/contacts/:id/read: "new" becomes "read"; the answer has the same shape as GET /:id', async () => {
  const row = await make();
  const got = await app.call('GET', `/api/contacts/${row._id}`, { token: admin.token });
  const res = await app.call('PATCH', `/api/contacts/${row._id}/read`, { token: admin.token });
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
  assert.equal(res.json.data.status, 'read');
  assert.equal(await statusOf(row._id), 'read');
  assert.deepEqual(Object.keys(res.json.data).sort(), Object.keys(got.json.data).sort(), 'the same fields as the old screens read');
  assert.equal(res.json.data._id, String(row._id));
  assert.equal(res.json.data.message, row.message);
});

test('PATCH /api/contacts/:id/read: any other status is left alone, and repeating it is harmless', async () => {
  for (const status of ['read', 'responded', 'archived']) {
    const row = await make({ status });
    const res = await app.call('PATCH', `/api/contacts/${row._id}/read`, { token: admin.token });
    assert.equal(res.status, 200, status);
    assert.equal(res.json.data.status, status, `${status} stays ${status}`);
    assert.equal(await statusOf(row._id), status);
  }
  const row = await make();
  for (let i = 0; i < 3; i += 1) assert.equal((await app.call('PATCH', `/api/contacts/${row._id}/read`, { token: admin.token })).json.data.status, 'read');
});

test('PATCH /api/contacts/:id/read: admin only, a bad id is a 400, an unknown or deleted one is a 404, and nothing else in the record changes', async () => {
  const row = await make();
  const url = `/api/contacts/${row._id}/read`;
  assert.equal((await app.call('PATCH', url)).status, 401);
  assert.equal((await app.call('PATCH', url, { token: person.token })).status, 403);
  assert.equal(await statusOf(row._id), 'new', 'the refused calls changed nothing');
  for (const bad of ['not-an-id', '123', '0123456789abcdef0123456', '0123456789abcdef012345678', '%24ne']) {
    assert.equal((await app.call('PATCH', `/api/contacts/${bad}/read`, { token: admin.token })).status, 400, bad);
  }
  assert.equal((await app.call('PATCH', '/api/contacts/0123456789abcdef01234567/read', { token: admin.token })).status, 404);
  const gone = await make({ isDeleted: true });
  assert.equal((await app.call('PATCH', `/api/contacts/${gone._id}/read`, { token: admin.token })).status, 404);
  assert.equal(await statusOf(gone._id), 'new', 'a deleted message is not touched');
  // a body is ignored: it cannot set another status or field
  const before = await Submission.findById(row._id).lean();
  const res = await app.call('PATCH', url, { token: admin.token, body: { status: 'archived', name: 'Changed', isDeleted: true } });
  assert.equal(res.status, 200);
  const after = await Submission.findById(row._id).lean();
  assert.equal(after.status, 'read');
  assert.equal(after.name, before.name);
  assert.equal(after.isDeleted, false);
});

// ---------------------------------------------------------------------------------------------- 2. search, filter, subject, escaping, paging

async function seed() {
  const a = await make({ name: 'Alice Anders', subject: 'Visa for Canada', message: 'Hello there', status: 'new' });
  const b = await make({ name: 'Bob Brown', subject: 'Canada study permit', message: 'About fees', status: 'read' });
  const c = await make({ name: 'Carol Clark', subject: 'Question about fees', message: 'Please call me', status: 'responded' });
  const d = await make({ name: 'Dave Dunn', subject: 'Invoice (urgent) [2]', message: 'a.b*c+d? ^start$ {x} | \\ end', status: 'new' });
  return { a, b, c, d };
}

test('SEARCH looks in the subject too (and still in the name, e-mail, phone and message)', async () => {
  const { a } = await seed();
  assert.deepEqual(names(await list('?search=canada')), ['Alice Anders', 'Bob Brown'], 'the subject');
  assert.deepEqual(names(await list('?search=ALICE')), ['Alice Anders'], 'the name, any case');
  assert.deepEqual(names(await list(`?search=${encodeURIComponent(a.email)}`)), ['Alice Anders'], 'the e-mail');
  assert.deepEqual(names(await list(`?search=${encodeURIComponent(a.phone)}`)), ['Alice Anders'], 'the phone');
  assert.deepEqual(names(await list('?search=please%20call')), ['Carol Clark'], 'the message');
  assert.deepEqual(names(await list('?search=nothing-matches-this')), []);
});

test('SEARCH and the STATUS filter work together (both must match); each alone still works', async () => {
  await seed();
  assert.deepEqual(names(await list('?search=canada&status=new')), ['Alice Anders']);
  assert.deepEqual(names(await list('?search=canada&status=read')), ['Bob Brown']);
  assert.deepEqual(names(await list('?search=canada&status=archived')), []);
  assert.deepEqual(names(await list('?search=fees&status=responded')), ['Carol Clark']);
  assert.deepEqual(names(await list('?status=new')), ['Alice Anders', 'Dave Dunn']);
  assert.deepEqual(names(await list('?status=')), ['Alice Anders', 'Bob Brown', 'Carol Clark', 'Dave Dunn'], 'an empty status means all');
  assert.deepEqual(names(await list('')), ['Alice Anders', 'Bob Brown', 'Carol Clark', 'Dave Dunn']);
  assert.deepEqual(names(await list('?search=%20%20')), ['Alice Anders', 'Bob Brown', 'Carol Clark', 'Dave Dunn'], 'blank search text is no search');
});

test('SEARCH text is literal: regex characters match only themselves, and nothing crashes or hangs', async () => {
  await seed();
  assert.deepEqual(names(await list('?search=.*')), [], '".*" is not a pattern that matches everything');
  assert.deepEqual(names(await list(`?search=${encodeURIComponent('.*')}&status=new`)), []);
  assert.deepEqual(names(await list(`?search=${encodeURIComponent('(urgent)')}`)), ['Dave Dunn'], 'brackets are plain characters');
  assert.deepEqual(names(await list(`?search=${encodeURIComponent('[2]')}`)), ['Dave Dunn']);
  assert.deepEqual(names(await list(`?search=${encodeURIComponent('a.b*c+d?')}`)), ['Dave Dunn'], 'the dot is a dot, not any character');
  assert.deepEqual(names(await list(`?search=${encodeURIComponent('axb')}`)), [], 'so "axb" does not match "a.b"');
  assert.deepEqual(names(await list(`?search=${encodeURIComponent('^start$')}`)), ['Dave Dunn']);
  assert.deepEqual(names(await list(`?search=${encodeURIComponent('{x} |')}`)), ['Dave Dunn']);
  assert.deepEqual(names(await list(`?search=${encodeURIComponent('\\ end')}`)), ['Dave Dunn'], 'a backslash is a backslash');
  for (const nasty of ['(', ')', '[', '\\', '(a+)+$', '(.*)*x', '*', '+', '?', '{1,', '|', '$^', '(?<=x)']) {
    const started = Date.now();
    const res = await list(`?search=${encodeURIComponent(nasty)}`);
    assert.ok([200].includes(res.status), `${JSON.stringify(nasty)} gave ${res.status}`);
    assert.ok(Date.now() - started < 3000, `${JSON.stringify(nasty)} was slow`);
  }
  // long text is cut to 100 characters, as before
  assert.equal((await list(`?search=${'a'.repeat(5000)}`)).status, 200);
});

test('SEARCH text that is not plain text (a repeated parameter) is a 400; bracket forms are never read as database operators', async () => {
  await seed();
  for (const query of ['?search=a&search=b', '?search=a&search=b&search=c']) {
    const res = await list(query);
    assert.equal(res.status, 400, query);
    assert.equal(res.json.success, false);
  }
  // This app reads the query as plain "key=value" text (Express 5 default), so "search[$ne]=x" is just an unknown parameter called "search[$ne]":
  // it is ignored, and it can never become an operator such as { $ne: "x" } for the database.
  for (const query of ['?search[$ne]=x', '?search[$regex]=.*', '?search[a][b]=c']) {
    const res = await list(query);
    assert.equal(res.status, 200, query);
    assert.deepEqual(names(res), ['Alice Anders', 'Bob Brown', 'Carol Clark', 'Dave Dunn'], `${query}: nothing was filtered or matched by an operator`);
  }
});

test('PAGING still works with a search and with a status filter (the totals and the pages follow the filtered result)', async () => {
  for (let i = 0; i < 12; i += 1) await make({ subject: `Canada trip ${i}`, status: i % 3 === 0 ? 'read' : 'new' });
  await make({ subject: 'Something else', status: 'new' });
  const first = await list('?search=canada&limit=5&page=1');
  assert.equal(first.json.data.length, 5);
  assert.deepEqual([first.json.meta.totalItems, first.json.meta.totalPages, first.json.meta.currentPage], [12, 3, 1]);
  const last = await list('?search=canada&limit=5&page=3');
  assert.equal(last.json.data.length, 2);
  const filtered = await list('?search=canada&status=read&limit=3&page=1');
  assert.deepEqual([filtered.json.data.length, filtered.json.meta.totalItems, filtered.json.meta.totalPages], [3, 4, 2]);
  const noSearch = await list('?status=new&limit=4&page=2');
  assert.deepEqual([noSearch.json.data.length, noSearch.json.meta.totalItems], [4, 9]);
  const all = await list('?limit=100');
  assert.equal(all.json.meta.totalItems, 13);
  assert.equal((await list('?page=abc&limit=xyz')).status, 200, 'unreadable paging numbers fall back to the defaults, as before');
});

test('a deleted message never appears in the list or the search, and the list still needs an administrator', async () => {
  await make({ name: 'Visible Person', subject: 'Canada' });
  await make({ name: 'Deleted Person', subject: 'Canada', isDeleted: true });
  assert.deepEqual(names(await list('?search=canada')), ['Visible Person']);
  assert.deepEqual(names(await list('')), ['Visible Person']);
  assert.equal((await app.call('GET', '/api/contacts')).status, 401);
  assert.equal((await list('', person.token)).status, 403);
});

// ---------------------------------------------------------------------------------------------- 3. an invalid status is a 400

test('GET /api/contacts?status=<invalid> is a 400 with a clear message (never a 500, never a database operator)', async () => {
  await seed();
  for (const query of ['?status=bogus', '?status=NEW', '?status=new%20', '?status=new&status=read', '?status=null', '?status=%24where']) {
    const res = await list(query);
    assert.equal(res.status, 400, query);
    assert.equal(res.json.success, false);
    assert.match(res.json.message, /Invalid status\. Use one of: new, read, responded, archived\./, query);
  }
  for (const ok of ['new', 'read', 'responded', 'archived']) assert.equal((await list(`?status=${ok}`)).status, 200, ok);
  // Bracket forms are not parsed into operators (see the search test): they are an unknown parameter and change nothing.
  for (const query of ['?status[$ne]=new', '?status[$in][]=new']) assert.deepEqual(names(await list(query)), ['Alice Anders', 'Bob Brown', 'Carol Clark', 'Dave Dunn'], query);
  assert.equal((await list('?search=canada&status=bogus')).status, 400, 'also together with a search');
});

test('PATCH /api/contacts/:id/status: an invalid status is a 400 with a clear message and changes nothing; valid ones work; a missing one is still "Status is required"', async () => {
  const row = await make();
  const url = `/api/contacts/${row._id}/status`;
  for (const status of ['bogus', 'NEW', 'read ', '', 0, 5, true, ['read'], { $ne: 'x' }]) {
    const res = await app.call('PATCH', url, { token: admin.token, body: { status } });
    assert.equal(res.status, 400, JSON.stringify(status));
    assert.equal(res.json.success, false);
    assert.equal(await statusOf(row._id), 'new', 'the record did not change');
  }
  const bogus = await app.call('PATCH', url, { token: admin.token, body: { status: 'bogus' } });
  assert.match(bogus.json.message, /Invalid status\. Use one of: new, read, responded, archived\./);
  const missing = await app.call('PATCH', url, { token: admin.token, body: {} });
  assert.equal(missing.status, 400);
  assert.equal(missing.json.message, 'Status is required', 'the old message for a missing status is kept');
  for (const status of ['read', 'responded', 'archived', 'new']) {
    const res = await app.call('PATCH', url, { token: admin.token, body: { status } });
    assert.equal(res.status, 200, status);
    assert.equal(res.json.data.status, status);
    assert.equal(await statusOf(row._id), status);
  }
  assert.equal((await app.call('PATCH', url, { body: { status: 'read' } })).status, 401);
  assert.equal((await app.call('PATCH', url, { token: person.token, body: { status: 'read' } })).status, 403);
});

test('the other old routes are as they were: statistics, reply, delete and the public create', async () => {
  const row = await make();
  assert.equal((await app.call('GET', '/api/contacts/stats', { token: admin.token })).status, 200);
  assert.equal((await app.call('GET', '/api/contacts/stats', { token: person.token })).status, 403);
  assert.equal((await app.call('DELETE', `/api/contacts/${row._id}`, { token: person.token })).status, 403);
  assert.equal((await app.call('DELETE', `/api/contacts/${row._id}`, { token: admin.token })).status, 200);
  assert.equal((await Submission.findById(row._id).lean()).isDeleted, true, 'a soft delete, as before');
  const created = await app.call('POST', '/api/contacts', { body: { name: 'Public Visitor', email: 'Visitor@Example.com', phone: '0300', subject: 'Hello', message: 'Hi' } });
  assert.equal(created.status, 201);
  assert.equal((await Submission.findOne({ email: 'visitor@example.com' }).lean()).status, 'new');
  assert.equal((await app.call('POST', '/api/contacts', { body: { name: 'x' } })).status, 400);
});
