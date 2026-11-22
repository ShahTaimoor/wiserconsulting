// The security log: what it records, and what it must never contain. No database.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { securityAudit, maskEmail } = require('../utils/securityLog');

const lines = [];
const realWrite = process.stdout.write.bind(process.stdout);
function capture() { process.stdout.write = (chunk, ...rest) => { const text = String(chunk); if (text.startsWith('{"time"')) { lines.push(JSON.parse(text)); return true; } return realWrite(chunk, ...rest); }; }
function release() { process.stdout.write = realWrite; }

const app = express();
app.set('trust proxy', 1);
app.use(securityAudit);
app.use(express.json());
const asAdmin = (req, res, next) => { req.user = { _id: 'admin-1', role: 1 }; next(); };
app.post('/api/users/login', (req, res) => res.status(400).json({ success: false }));
app.get('/api/form-submissions/customer-submission/:email', (req, res) => res.status(403).json({}));
app.get('/api/private', (req, res) => res.status(401).json({}));
app.get('/api/busy', (req, res) => res.status(429).json({}));
app.put('/api/form-submissions/:id/status', asAdmin, (req, res) => res.json({}));
app.get('/api/fine', (req, res) => res.json({}));

let server; let base;
test.before(async () => { server = http.createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { release(); await new Promise((r) => server.close(r)); });
test.beforeEach(() => { lines.length = 0; capture(); });
test.afterEach(() => release());

async function hit(method, path, body, headers = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  await res.text();
  await new Promise((r) => setTimeout(r, 20));
  return res.status;
}

test('a failed sign-in is logged with a masked e-mail and never the password', async () => {
  await hit('POST', '/api/users/login', { email: 'Jane.Doe@Example.com', password: 'Sup3r-Secret!' }, { 'X-Forwarded-For': '203.0.113.9' });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, 'login_failed');
  assert.equal(lines[0].email, 'j***@example.com');
  assert.equal(lines[0].ip, '203.0.113.9');
  const text = JSON.stringify(lines[0]);
  assert.equal(text.includes('Sup3r-Secret'), false);
  assert.equal(text.includes('jane.doe'), false);
});

test('401, 403 and 429 are logged, and the route is the pattern: the customer e-mail in the address is not kept', async () => {
  await hit('GET', '/api/private');
  await hit('GET', '/api/busy');
  await hit('GET', '/api/form-submissions/customer-submission/someone@example.com', null, { Authorization: 'Bearer abc.def.ghi' });
  assert.deepEqual(lines.map((l) => l.event), ['unauthorized', 'rate_limited', 'forbidden']);
  assert.equal(lines[2].route, '/api/form-submissions/customer-submission/:email');
  const all = JSON.stringify(lines);
  assert.equal(all.includes('someone@example.com'), false);
  assert.equal(all.includes('abc.def.ghi'), false);
});

test('a change made by an administrator is logged with their id; a normal successful request is not logged', async () => {
  await hit('PUT', '/api/form-submissions/64b000000000000000000001/status', { status: 'reviewed', comment: 'private note' });
  await hit('GET', '/api/fine');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, 'admin_action');
  assert.equal(lines[0].userId, 'admin-1');
  assert.equal(lines[0].route, '/api/form-submissions/:id/status');
  assert.equal(JSON.stringify(lines[0]).includes('private note'), false);
});

test('extra values never carry secret-looking or content keys, and maskEmail refuses what is not an e-mail', () => {
  const { record } = require('../utils/securityLog');
  record('probe', { method: 'GET', originalUrl: '/x', ip: '1.1.1.1' }, { password: 'p', token: 't', fileContent: 'c', originalName: 'passport.pdf', reason: 'ok' });
  assert.deepEqual(Object.keys(lines.at(-1)).filter((k) => ['password', 'token', 'fileContent', 'originalName'].includes(k)), []);
  assert.equal(lines.at(-1).reason, 'ok');
  assert.equal(maskEmail('not-an-email'), undefined);
  assert.equal(maskEmail({}), undefined);
});
