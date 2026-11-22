// Who may reach a customer's documents. No database and no network: the repositories are replaced by fakes and the real routers
// are mounted on a small app. Covers the routes that used to answer without any sign-in.
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
const assessmentService = require('../services/assessmentService');
const { AppError, errorHandler } = require('../middleware/errorHandler');

const ADMIN = { _id: 'u-admin', email: 'admin@example.com', role: 1 };
const OWNER = { _id: 'u-owner', name: 'Real Customer', email: 'Customer@Example.com', role: 0 };
const STRANGER = { _id: 'u-stranger', email: 'stranger@example.com', role: 0 };
const USERS = { [ADMIN._id]: ADMIN, [OWNER._id]: OWNER, [STRANGER._id]: STRANGER };
const tokenOf = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

userRepository.findById = async (id) => USERS[id] || null;

const DOC_ID = 'doc-1';
function makeSubmission() {
  const doc = { _id: DOC_ID, fieldName: 'passports', originalname: 'p.pdf', mimetype: 'application/pdf', cloudinaryUrl: 'r2://private/visa-assessments/passports-abc.pdf', cloudinaryPublicId: 'visa-assessments/passports-abc.pdf', uploadType: 'r2' };
  const documents = [{ ...doc, toObject() { return { ...doc }; } }];
  documents.id = (id) => documents.find((d) => d._id === id) || null;
  return { _id: 's-1', email: 'customer@example.com', isDeleted: false, documents, toObject() { return { _id: 's-1', email: 'customer@example.com', documents }; } };
}
const submission = makeSubmission();
const comments = [];
formSubmissionRepository.findById = async (id) => (id === 's-1' ? submission : null);
formSubmissionRepository.findByEmail = async (email) => (email.toLowerCase() === 'customer@example.com' ? submission : null);
const created = [];
formSubmissionRepository.create = async (data) => { created.push(data); return { _id: 's-new' }; };
formSubmissionRepository.addCustomerComment = async (id, data) => { comments.push({ id, data }); };

const reached = [];
assessmentService.mergePDFs = async () => { reached.push('merge'); throw new AppError('stopped after the checks', 418); };
assessmentService.compressPDFs = async () => { reached.push('compress'); throw new AppError('stopped after the checks', 418); };

const app = express();
app.use(require('cookie-parser')());
app.use(express.json());
app.use('/api', require('../routes/assessmentRoutes'));
app.use('/api', require('../routes/formSubmissionRoutes'));
app.use(errorHandler);

let server;
let base;
test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((resolve) => server.close(resolve)); });

async function call(method, url, { user, body } = {}) {
  const headers = {};
  if (user) headers.Authorization = `Bearer ${tokenOf(user)}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: response.status, json, text };
}

test.beforeEach(() => { reached.length = 0; comments.length = 0; });

for (const route of ['merge-pdfs', 'compress-pdfs']) {
  test(`POST /api/${route}: no sign-in is 401, a customer is 403, only an administrator gets through`, async () => {
    const body = { submissionId: 's-1', documentIds: [DOC_ID], customerName: 'X', compressionLevel: 'low' };
    assert.equal((await call('POST', `/api/${route}`, { body })).status, 401);
    assert.equal((await call('POST', `/api/${route}`, { user: OWNER, body })).status, 403, 'even the owner of the submission');
    assert.deepEqual(reached, [], 'nothing was built for either of them');
    assert.equal((await call('POST', `/api/${route}`, { user: ADMIN, body })).status, 418, 'the administrator reaches the service');
    assert.equal(reached.length, 1);
  });
}

test('GET customer-submission/:email: sign-in required; only that customer or an administrator; the links are signed, never r2://', async () => {
  const url = '/api/form-submissions/customer-submission/customer@example.com';
  assert.equal((await call('GET', url)).status, 401);
  assert.equal((await call('GET', url, { user: STRANGER })).status, 403);

  const own = await call('GET', url, { user: OWNER });
  assert.equal(own.status, 200, 'the customer, whose e-mail differs only in letter case');
  const link = own.json.data.submission.documents[0].cloudinaryUrl;
  assert.match(link, /^https:\/\/test-private\.acc123\.r2\.cloudflarestorage\.com\/visa-assessments\/passports-abc\.pdf\?/);
  assert.match(link, /X-Amz-Expires=3600/);
  assert.equal(own.text.includes('r2://'), false);
  assert.equal(own.text.includes('test-only-secret-not-real'), false);

  assert.equal((await call('GET', url, { user: ADMIN })).status, 200);
});

test('GET file/:submissionId/:documentId: sign-in required; a stranger, and an unknown submission, are both 403', async () => {
  const url = `/api/form-submissions/file/s-1/${DOC_ID}`;
  assert.equal((await call('GET', url)).status, 401);
  assert.equal((await call('GET', url, { user: STRANGER })).status, 403);
  assert.equal((await call('GET', `/api/form-submissions/file/nope/${DOC_ID}`, { user: STRANGER })).status, 403, 'does not reveal which ids exist');
  const own = await call('GET', url, { user: OWNER });
  assert.equal(own.status, 200);
  assert.match(own.json.data.fileUrl, /X-Amz-Signature=/);
});

test('POST customer-comment: sign-in required; only the owner or an administrator can write into a submission', async () => {
  const url = '/api/form-submissions/s-1/customer-comment';
  const body = { message: 'Thank you.' };
  assert.equal((await call('POST', url, { body })).status, 401);
  assert.equal((await call('POST', url, { user: STRANGER, body })).status, 403);
  assert.deepEqual(comments, [], 'nothing was written');
  assert.equal((await call('POST', url, { user: OWNER, body })).status, 200);
  assert.equal(comments.length, 1);
});

test('the debug upload route and the public local upload route are gone', async () => {
  assert.equal((await call('POST', '/api/test-pdf-upload')).status, 404);
  assert.equal((await call('POST', '/api/submit-assessment-local')).status, 404);
});

test('a locally stored upload always gets an extension from its file type, never from the name the sender gave', async () => {
  const { localStorage } = require('../config/upload');
  const name = await new Promise((resolve, reject) =>
    localStorage.getFilename({}, { fieldname: 'passports', originalname: 'evil.html', mimetype: 'image/png' }, (e, n) => (e ? reject(e) : resolve(n))));
  assert.match(name, /^passports-\d+-\d+\.png$/);
  const odd = await new Promise((resolve, reject) =>
    localStorage.getFilename({}, { fieldname: 'passports', originalname: 'x.svg', mimetype: 'image/svg+xml' }, (e, n) => (e ? reject(e) : resolve(n))));
  assert.doesNotMatch(odd, /\.svg$/);
});

test('a sign-in cookie is accepted for reading only, never for changes (another website could send it on its own)', async () => {
  const cookie = { Cookie: `token=${tokenOf(OWNER)}` };
  const read = await fetch(`${base}/api/form-submissions/customer-submission/customer@example.com`, { headers: cookie });
  assert.equal(read.status, 200);
  const write = await fetch(`${base}/api/form-submissions/s-1/customer-comment`, { method: 'POST', headers: { ...cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hi' }) });
  assert.equal(write.status, 401);
  assert.deepEqual(comments, []);
});

test('an upload whose content is not a PDF, JPG or PNG is refused before anything is stored', async () => {
  const { storeFilesInR2 } = require('../config/upload');
  const req = { files: { passports: [{ fieldname: 'passports', originalname: 'a.pdf', mimetype: 'application/pdf', buffer: Buffer.from('<html><script>alert(1)</script></html>') }] } };
  const error = await new Promise((resolve) => storeFilesInR2(req, {}, resolve));
  assert.equal(error.statusCode ?? error.status, 400);
});

test('POST submit-assessment: sign-in required; who applied comes from the account; the travel details are optional', async () => {
  assert.equal((await call('POST', '/api/submit-assessment', { body: {} })).status, 401);
  assert.deepEqual(created, []);
  const res = await call('POST', '/api/submit-assessment', { user: OWNER, body: { name: 'Someone Else', email: 'other@example.com', status: 'completed' } });
  assert.equal(res.status, 201);
  assert.equal(created.length, 1);
  assert.equal(created[0].name, 'Real Customer');
  assert.equal(created[0].email, 'Customer@Example.com');
  assert.equal(created[0].status, 'pending');
});
