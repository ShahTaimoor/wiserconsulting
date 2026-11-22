// Voice notes on comments: who may record and listen, what is accepted, and what is stored. No database, no network:
// the repositories and the storage are replaced by fakes, the real routers are mounted on a small app.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.R2_ACCOUNT_ID = 'acc123';
process.env.R2_ACCESS_KEY_ID = 'AKIATESTKEY0000000001';
process.env.R2_SECRET_ACCESS_KEY = 'test-only-secret-not-real';
process.env.R2_PUBLIC_BUCKET = 'test-public';
process.env.R2_PRIVATE_BUCKET = 'test-private';
process.env.R2_PUBLIC_BASE_URL = 'https://cdn.example.test';

const userRepository = require('../repositories/userRepository');
const formSubmissionRepository = require('../repositories/formSubmissionRepository');
const formSubmissionService = require('../services/formSubmissionService');
const r2 = require('../config/r2');
const detectAudioType = require('../utils/detectAudioType');
const { errorHandler } = require('../middleware/errorHandler');

const ADMIN = { _id: 'u-admin', name: 'Admin', email: 'admin@example.com', role: 1 };
const OWNER = { _id: 'u-owner', name: 'Owner', email: 'customer@example.com', role: 0 };
const STRANGER = { _id: 'u-stranger', name: 'Stranger', email: 'stranger@example.com', role: 0 };
const USERS = { [ADMIN._id]: ADMIN, [OWNER._id]: OWNER, [STRANGER._id]: STRANGER };
const tokenOf = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
userRepository.findById = async (id) => USERS[id] || null;

// A submission whose comment lists behave like Mongoose's (push gives an _id, .id() finds it).
function list() { const a = []; a.id = (id) => a.find((x) => x._id === id) || null; return a; }
const submission = { _id: 's-1', email: 'customer@example.com', isDeleted: false, adminComments: list(), customerComments: list(), documents: [] };
submission.documents.id = (id) => (id === 'doc-1' ? { _id: 'doc-1', originalname: 'p.pdf' } : null);
let counter = 0;
formSubmissionRepository.findById = async (id) => (id === 's-1' ? submission : null);
formSubmissionRepository.addAdminComment = async (id, data) => { submission.adminComments.push({ _id: `a-${++counter}`, ...data }); };
formSubmissionRepository.addCustomerComment = async (id, data) => { submission.customerComments.push({ _id: `c-${++counter}`, ...data }); };
const stored = [];
r2.uploadBuffer = async (buffer, options) => { stored.push({ bytes: buffer.length, ...options }); return { secure_url: 'r2://private/voice-notes/voice-abc.webm', public_id: 'voice-notes/voice-abc.webm' }; };
const emailed = [];
formSubmissionService.sendCommentEmail = async (s, d, text) => { emailed.push(text); };

const app = express();
app.use(express.json());
app.use('/api', require('../routes/formSubmissionRoutes'));
app.use(errorHandler);

let server; let base;
test.before(async () => { server = http.createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { await new Promise((r) => server.close(r)); });
test.beforeEach(() => { stored.length = 0; emailed.length = 0; submission.adminComments.length = 0; submission.customerComments.length = 0; });

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(200, 1)]);
async function sendVoice(url, user, bytes, { seconds = '12', type = 'audio/webm' } = {}) {
  const form = new FormData();
  form.append('seconds', seconds);
  form.append('voice', new Blob([bytes], { type }), 'voice.webm');
  const res = await fetch(base + url, { method: 'POST', headers: user ? { Authorization: `Bearer ${tokenOf(user)}` } : {}, body: form });
  return { status: res.status, json: await res.json().catch(() => null) };
}
async function get(url, user) {
  const res = await fetch(base + url, { headers: user ? { Authorization: `Bearer ${tokenOf(user)}` } : {} });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test('detectAudioType recognises what a browser records and refuses anything else', () => {
  assert.equal(detectAudioType(WEBM).mime, 'audio/webm');
  assert.equal(detectAudioType(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20)])).ext, 'ogg');
  assert.equal(detectAudioType(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(20)])).ext, 'm4a');
  assert.equal(detectAudioType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(8)])).ext, 'wav');
  assert.equal(detectAudioType(Buffer.from('<html><script>alert(1)</script></html>')), null);
  assert.equal(detectAudioType(Buffer.from('%PDF-1.7 and more bytes here')), null);
});

test('customer voice reply: sign-in and ownership required; stored privately; a fake file is refused', async () => {
  const url = '/api/form-submissions/s-1/customer-voice';
  assert.equal((await sendVoice(url, null, WEBM)).status, 401);
  assert.equal((await sendVoice(url, STRANGER, WEBM)).status, 403);
  assert.deepEqual(stored, []);

  const fake = await sendVoice(url, OWNER, Buffer.from('<html>not audio at all, just text pretending</html>'));
  assert.equal(fake.status, 400);
  assert.deepEqual(stored, []);

  const ok = await sendVoice(url, OWNER, WEBM, { seconds: '12' });
  assert.equal(ok.status, 201);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].visibility, 'private');
  assert.equal(stored[0].mimetype, 'audio/webm');
  assert.equal(submission.customerComments.length, 1);
  assert.equal(submission.customerComments[0].voiceSeconds, 12);
  assert.equal(submission.customerComments[0].voiceRef, 'r2://private/voice-notes/voice-abc.webm');
});

test('the length is clamped to 3 minutes and a non-number is refused', async () => {
  const url = '/api/form-submissions/s-1/customer-voice';
  assert.equal((await sendVoice(url, OWNER, WEBM, { seconds: '999' })).status, 201);
  assert.equal(submission.customerComments[0].voiceSeconds, 180);
  assert.equal((await sendVoice(url, OWNER, WEBM, { seconds: 'abc' })).status, 400);
});

test('an audio upload over 5 MB is refused', async () => {
  const big = Buffer.concat([WEBM, Buffer.alloc(5 * 1024 * 1024 + 10, 2)]);
  const res = await sendVoice('/api/form-submissions/s-1/customer-voice', OWNER, big);
  assert.equal(res.status, 413);
  assert.equal(submission.customerComments.length, 0);
});

test('admin voice note on a document: administrators only; the customer is e-mailed', async () => {
  const url = '/api/form-submissions/s-1/documents/doc-1/voice';
  assert.equal((await sendVoice(url, null, WEBM)).status, 401);
  assert.equal((await sendVoice(url, OWNER, WEBM)).status, 403, 'a customer cannot speak as the administrator');
  assert.equal((await sendVoice(url, ADMIN, WEBM)).status, 201);
  assert.equal(submission.adminComments.length, 1);
  assert.equal(submission.adminComments[0].documentId, 'doc-1');
  assert.equal(emailed.length, 1);
  assert.equal((await sendVoice('/api/form-submissions/s-1/documents/nope/voice', ADMIN, WEBM)).status, 404);
});

test('listening: only the owner or an administrator gets a signed link; the link expires in 10 minutes', async () => {
  await sendVoice('/api/form-submissions/s-1/customer-voice', OWNER, WEBM);
  const commentId = submission.customerComments[0]._id;
  const url = `/api/form-submissions/s-1/voice/customer/${commentId}`;
  assert.equal((await get(url)).status, 401);
  assert.equal((await get(url, STRANGER)).status, 403);
  const own = await get(url, OWNER);
  assert.equal(own.status, 200);
  assert.match(own.json.data.url, /X-Amz-Expires=600/);
  assert.equal((await get(url, ADMIN)).status, 200);
  assert.equal((await get('/api/form-submissions/s-1/voice/customer/missing', OWNER)).status, 404);
  assert.equal((await get(`/api/form-submissions/s-1/voice/other/${commentId}`, OWNER)).status, 400);
});
