'use strict';

// Step 8c-1 tests: the document upload routes (POST/GET/DELETE /api/tourist-visa/applications/me/documents).
// A fake storage replaces Cloudinary (no network, no credentials): it records every upload, delete and link,
// so the tests can check that nothing is left behind. The test app mounts the parsers, the sanitizer and the
// router in the same order as backend/index.js. In-memory MongoDB, made-up users and files.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.TOURIST_VISA_ENABLED = 'true'; // the API is closed unless the switch is exactly true
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const util = require('node:util');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const TouristVisaApplication = require('../models/TouristVisaApplication');
const repository = require('../repositories/touristVisaApplicationRepository');
const documentService = require('../services/touristVisaDocumentService');
const { cleanName } = documentService;
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { createUploadLimiter } = require('../middleware/touristVisaUpload');
const sanitize = require('../middleware/sanitize');
const skipPaths = require('../middleware/skipPaths');
const { errorHandler } = require('../middleware/errorHandler');
const { R2DocumentStorage, missingStorageVariables } = require('../config/touristVisaStorage');
const detectFileType = require('../utils/detectFileType');
const limits = require('../config/touristVisaDocuments');

const { MAX_FILE_BYTES, MAX_TOTAL_BYTES, LINK_TTL_SECONDS } = limits;

let mongod;
let server;
let baseUrl;
let userCounter = 0;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await TouristVisaApplication.init();

  // Same order as index.js: gate (inside the router), Tourist Visa parser, global parsers, sanitizer (skipped here).
  const app = express();
  app.use('/api/tourist-visa', touristVisaBodyParser);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(skipPaths(['/api/tourist-visa'], sanitize));
  app.use('/api/tourist-visa', touristVisaRoutes);
  app.use(errorHandler);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}, { timeout: 120000 });

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Stands in for Cloudinary: remembers what is "stored" and what was asked of it. */
class FakeStorage {
  constructor() {
    this.live = new Map(); // publicId -> bytes
    this.uploads = [];
    this.removed = [];
    this.links = [];
    this.delay = 0;
    this.failUpload = false;
    this.failRemove = false;
    this.configured = true;
  }

  isConfigured() { return this.configured; }

  async upload(buffer, { applicationId, extension }) {
    if (this.failUpload) throw new Error('storage is down');
    if (this.delay) await sleep(this.delay);
    const publicId = `tourist-visa/${applicationId}/${crypto.randomBytes(8).toString('hex')}.${extension}`;
    this.live.set(publicId, buffer.length);
    this.uploads.push({ applicationId, extension, publicId, bytes: buffer.length });
    return { publicId, resourceType: 'raw', bytes: buffer.length };
  }

  async remove(publicId, resourceType) {
    this.removed.push({ publicId, resourceType });
    if (this.failRemove) throw new Error('storage is down');
    this.live.delete(publicId);
  }

  temporaryUrl(doc, expiresAt) {
    this.links.push({ doc, expiresAt });
    return `https://fake-storage.invalid/download?id=${encodeURIComponent(doc.publicId)}&expires=${expiresAt.getTime()}`;
  }
}

function freshStorage() {
  const fake = new FakeStorage();
  documentService.storage = fake;
  documentService.now = () => new Date();
  return fake;
}

// Files: only the first bytes matter to the content check.
const PDF = (size = 64) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(Math.max(0, size - 9), 0x20)]);
const PNG = (size = 64) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(Math.max(0, size - 8), 0)]);
const JPG = (size = 64) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(Math.max(0, size - 4), 0)]);

async function api(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}/api/tourist-visa${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

async function start() {
  userCounter += 1;
  const user = await User.create({
    name: `Test Docs ${userCounter}`,
    email: `test.docs.${userCounter}@example.com`,
    password: 'not-a-real-password',
  });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const created = await api('POST', '/applications', { token });
  return { token, appId: created.json.data.application.id, userId: String(user._id) };
}

/** Sends one file as multipart. Pass `file: null` for none; `fileFirst` puts the file before the slot. */
function upload(token, { slot, file = PDF(), name = 'test-passport.pdf', type = 'application/pdf', extraFields = {}, fileFirst = false } = {}) {
  const form = new FormData();
  const addSlot = () => { if (slot !== undefined) form.append('slot', slot); };
  const addFile = () => { if (file) form.append('file', new Blob([file], { type }), name); };
  if (fileFirst) { addFile(); addSlot(); } else { addSlot(); addFile(); }
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  return api('POST', '/applications/me/documents', { token, body: form });
}

const list = (token) => api('GET', '/applications/me/documents', { token });
const remove = (token, docId) => api('DELETE', `/applications/me/documents/${docId}`, { token });
const oid = (id) => new mongoose.Types.ObjectId(id);
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: oid(appId) });
const docsOf = async (appId) => (await rawDoc(appId)).documents || [];
const setStatus = (appId, status) => TouristVisaApplication.collection.updateOne({ _id: oid(appId) }, { $set: { status } });

/** Puts made-up document references straight into the database, for the cap tests. */
async function seed(appId, items) {
  const documents = items.map(({ slot, bytes }) => {
    const id = crypto.randomUUID();
    return {
      id, slot, publicId: `tourist-visa/${appId}/seed-${id}.pdf`, resourceType: 'raw', format: 'pdf', bytes,
      mime: 'application/pdf', uploadedAt: new Date(), originalName: repository.encryptDocumentName(appId, id, 'seed.pdf'),
    };
  });
  await TouristVisaApplication.collection.updateOne({ _id: oid(appId) }, { $push: { documents: { $each: documents } } });
  return documents;
}

function captureErrors() {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.map((a) => util.inspect(a, { depth: 8 })).join(' '));
  return { lines, restore: () => { console.error = original; } };
}

const VIEW_KEYS = ['id', 'name', 'size', 'slot', 'type', 'uploadedAt'];

// ---------------------------------------------------------------------------
// Valid uploads
// ---------------------------------------------------------------------------

test('a valid PDF, JPG and PNG are accepted; the type comes from the content; the answer is metadata only', async () => {
  const fake = freshStorage();
  const { token, appId } = await start();
  for (const [file, name, mime, ext] of [
    [PDF(), 'passport-scan.pdf', 'application/pdf', 'pdf'],
    [JPG(), 'photo-page.jpg', 'image/jpeg', 'jpg'],
    [PNG(), 'bank.png', 'image/png', 'png'],
  ]) {
    const res = await upload(token, { slot: 'funds', file, name, type: mime });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const doc = res.json.data.document;
    assert.deepEqual(Object.keys(doc).sort(), VIEW_KEYS);
    assert.equal(doc.slot, 'funds');
    assert.equal(doc.name, name);
    assert.equal(doc.size, file.length);
    assert.equal(doc.type, mime);
    assert.equal(fake.uploads.at(-1).extension, ext);
  }
  const stored = await docsOf(appId);
  assert.equal(stored.length, 3);
  assert.deepEqual(stored.map((d) => d.format), ['pdf', 'jpg', 'png']);
  for (const d of stored) {
    assert.equal(d.resourceType, 'raw');
    assert.match(d.id, /^[0-9a-f-]{36}$/);
    assert.ok(d.publicId.startsWith(`tourist-visa/${appId}/`), 'stored under the application folder');
    assert.ok(d.uploadedAt instanceof Date);
  }
});

test('the slot may come after the file in the form', async () => {
  freshStorage();
  const { token } = await start();
  const res = await upload(token, { slot: 'passport', fileFirst: true });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  assert.equal(res.json.data.document.slot, 'passport');
});

test('a file of exactly the size limit is accepted', async () => {
  const fake = freshStorage();
  const { token } = await start();
  const res = await upload(token, { slot: 'passport', file: PDF(MAX_FILE_BYTES) });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  assert.equal(res.json.data.document.size, MAX_FILE_BYTES);
  assert.equal(fake.uploads.length, 1);
});

// ---------------------------------------------------------------------------
// Rejected files: nothing is stored
// ---------------------------------------------------------------------------

test('the content decides, not the name or the declared type: a text file named .pdf is refused, a real PNG named .pdf is a PNG', async () => {
  const fake = freshStorage();
  const { token, appId } = await start();
  const fakePdf = await upload(token, { slot: 'passport', file: Buffer.from('this is plain text, not a pdf'), name: 'passport.pdf', type: 'application/pdf' });
  assert.equal(fakePdf.status, 415);
  assert.equal(fakePdf.json.code, 'WRONG_TYPE');
  assert.equal(fakePdf.json.success, false);

  for (const [name, file] of [
    ['page.html', Buffer.from('<html><script>alert(1)</script></html>')],
    ['tool.exe', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)])],
    ['archive.pdf', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)])],
    ['almost.pdf', Buffer.from('%PDF- no version')],
    ['short.jpg', Buffer.from([0xff, 0xd8])],
    ['lookalike.jpg', Buffer.concat([Buffer.from([0xff, 0xd8, 0x00]), Buffer.alloc(100)])],
    ['lookalike.png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]), Buffer.alloc(100)])],
    ['image.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
  ]) {
    const res = await upload(token, { slot: 'passport', file, name, type: 'application/pdf' });
    assert.equal(res.status, 415, name);
    assert.equal(res.json.code, 'WRONG_TYPE', name);
  }

  const png = await upload(token, { slot: 'passport', file: PNG(), name: 'actually-a-png.pdf', type: 'application/pdf' });
  assert.equal(png.status, 201);
  assert.equal(png.json.data.document.type, 'image/png', 'the type is taken from the content');
  assert.equal(fake.uploads.length, 1);
  assert.equal((await docsOf(appId)).length, 1);
});

test('detectFileType: PDF, JPEG and PNG signatures only', () => {
  assert.equal(detectFileType(PDF()), 'pdf');
  assert.equal(detectFileType(Buffer.from('%PDF-2.0')), 'pdf');
  assert.equal(detectFileType(JPG()), 'jpg');
  assert.equal(detectFileType(PNG()), 'png');
  for (const bad of [Buffer.alloc(0), Buffer.from('GIF89a......'), Buffer.from('%PDF'), Buffer.from('  %PDF-1.7'), Buffer.from('PK\u0003\u0004........'), 'text', null, undefined]) {
    assert.equal(detectFileType(bad), null);
  }
});

test('an empty file is refused', async () => {
  const fake = freshStorage();
  const { token } = await start();
  const res = await upload(token, { slot: 'passport', file: Buffer.alloc(0) });
  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'FILE_EMPTY');
  assert.equal(fake.uploads.length, 0);
});

test('a file over the size limit is refused, whether it declares its size early or not, and nothing is stored', async () => {
  const fake = freshStorage();
  const { token, appId } = await start();
  const justOver = await upload(token, { slot: 'passport', file: PDF(MAX_FILE_BYTES + 1) });
  assert.equal(justOver.status, 413);
  assert.equal(justOver.json.code, 'FILE_TOO_LARGE');
  const farOver = await upload(token, { slot: 'funds', file: PDF(MAX_FILE_BYTES + 200 * 1024) });
  assert.equal(farOver.status, 413);
  assert.equal(farOver.json.code, 'FILE_TOO_LARGE');
  assert.equal(fake.uploads.length, 0);
  assert.equal((await docsOf(appId)).length, 0);
});

test('a missing file, a wrong slot, an extra field or a non-multipart body is refused with its own code', async () => {
  const fake = freshStorage();
  const { token } = await start();
  const noFile = await upload(token, { slot: 'passport', file: null });
  assert.deepEqual([noFile.status, noFile.json.code], [400, 'FILE_REQUIRED']);

  for (const slot of [undefined, '', 'visa', 'PASSPORT', 'passport,funds', 'constructor', '__proto__', 'toString']) {
    const res = await upload(token, { slot });
    assert.deepEqual([res.status, res.json.code], [400, 'INVALID_SLOT'], String(slot));
  }
  const twoSlots = new FormData();
  twoSlots.append('slot', 'passport');
  twoSlots.append('slot', 'funds');
  twoSlots.append('file', new Blob([PDF()], { type: 'application/pdf' }), 'a.pdf');
  const dup = await api('POST', '/applications/me/documents', { token, body: twoSlots });
  assert.deepEqual([dup.status, dup.json.code], [400, 'INVALID_UPLOAD'], 'a third part in the form is refused');

  const extra = await upload(token, { slot: 'passport', extraFields: { a: '1', b: '2' } });
  assert.deepEqual([extra.status, extra.json.code], [400, 'INVALID_UPLOAD']);

  const twoFiles = new FormData();
  twoFiles.append('slot', 'passport');
  twoFiles.append('file', new Blob([PDF()]), 'a.pdf');
  twoFiles.append('file', new Blob([PDF()]), 'b.pdf');
  const many = await api('POST', '/applications/me/documents', { token, body: twoFiles });
  assert.deepEqual([many.status, many.json.code], [400, 'INVALID_UPLOAD']);

  const otherName = new FormData();
  otherName.append('slot', 'passport');
  otherName.append('document', new Blob([PDF()]), 'a.pdf');
  const wrongField = await api('POST', '/applications/me/documents', { token, body: otherName });
  assert.deepEqual([wrongField.status, wrongField.json.code], [400, 'INVALID_UPLOAD']);

  const json = await api('POST', '/applications/me/documents', { token, body: JSON.stringify({ slot: 'passport' }), headers: { 'Content-Type': 'application/json' } });
  assert.deepEqual([json.status, json.json.code], [400, 'INVALID_UPLOAD']);
  assert.equal(fake.uploads.length, 0);
});

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

test('per-slot caps: passport takes 3 files, funds 10, and one slot being full does not block the other', async () => {
  const fake = freshStorage();
  const { token, appId } = await start();
  for (let i = 0; i < 3; i += 1) assert.equal((await upload(token, { slot: 'passport' })).status, 201);
  const fourth = await upload(token, { slot: 'passport' });
  assert.deepEqual([fourth.status, fourth.json.code], [409, 'TOO_MANY_FILES']);
  for (let i = 0; i < 10; i += 1) assert.equal((await upload(token, { slot: 'funds' })).status, 201, `funds ${i + 1}`);
  const eleventh = await upload(token, { slot: 'funds' });
  assert.deepEqual([eleventh.status, eleventh.json.code], [409, 'TOO_MANY_FILES']);
  assert.equal((await docsOf(appId)).length, 13);
  assert.equal(fake.live.size, 13, 'the refused files were never stored');
  assert.equal(fake.uploads.length, 13, 'and were refused before any upload was attempted');

  // Deleting one makes room again.
  const first = (await list(token)).json.data.documents.find((d) => d.slot === 'passport');
  assert.equal((await remove(token, first.id)).status, 200);
  assert.equal((await upload(token, { slot: 'passport' })).status, 201);
});

test('total cap: the last byte that fits is accepted and one more is refused', async () => {
  const fake = freshStorage();
  const { token, appId } = await start();
  await seed(appId, [{ slot: 'funds', bytes: MAX_TOTAL_BYTES - 100 }]);
  const over = await upload(token, { slot: 'passport', file: PDF(101) });
  assert.deepEqual([over.status, over.json.code], [409, 'TOTAL_TOO_LARGE']);
  assert.equal(fake.uploads.length, 0, 'refused before anything is stored');
  assert.equal((await upload(token, { slot: 'passport', file: PDF(100) })).status, 201);
  const full = await upload(token, { slot: 'passport', file: PDF(9) });
  assert.deepEqual([full.status, full.json.code], [409, 'TOTAL_TOO_LARGE']);
  assert.equal((await docsOf(appId)).length, 2);
});

test('parallel uploads at the per-slot cap: exactly the places left are filled, and the losers leave nothing in storage', async () => {
  const fake = freshStorage();
  fake.delay = 40; // every request passes the early check before any of them is written
  const { token, appId } = await start();
  for (let i = 0; i < 2; i += 1) assert.equal((await upload(token, { slot: 'passport' })).status, 201);

  const results = await Promise.all(Array.from({ length: 6 }, () => upload(token, { slot: 'passport' })));
  const won = results.filter((r) => r.status === 201);
  const lost = results.filter((r) => r.status !== 201);
  assert.equal(won.length, 1, JSON.stringify(results.map((r) => r.status)));
  assert.equal(lost.length, 5);
  for (const r of lost) assert.deepEqual([r.status, r.json.code], [409, 'TOO_MANY_FILES']);
  assert.equal((await docsOf(appId)).length, 3, 'never above the cap');
  assert.equal(fake.live.size, 3, 'every losing upload was deleted from storage again');
  assert.equal(fake.removed.length, 5);
});

test('parallel uploads at the total cap: two files that fit alone but not together cannot both be stored', async () => {
  const fake = freshStorage();
  fake.delay = 40;
  const { token, appId } = await start();
  await seed(appId, [{ slot: 'funds', bytes: MAX_TOTAL_BYTES - 150 }]);
  const results = await Promise.all([
    upload(token, { slot: 'passport', file: PDF(100) }),
    upload(token, { slot: 'passport', file: PNG(100) }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(results.find((r) => r.status === 409).json.code, 'TOTAL_TOO_LARGE');
  const total = (await docsOf(appId)).reduce((sum, d) => sum + d.bytes, 0);
  assert.ok(total <= MAX_TOTAL_BYTES, `total ${total}`);
  assert.equal(fake.live.size, 1);
});

test('the repository guards themselves: a submitted application takes no new reference and gives none up, and caps are checked in the write', async () => {
  freshStorage();
  const { appId, userId } = await start();
  const reference = (slot, bytes) => {
    const id = crypto.randomUUID();
    return { id, slot, publicId: `tourist-visa/${appId}/${id}.pdf`, resourceType: 'raw', format: 'pdf', bytes, mime: 'application/pdf', uploadedAt: new Date(), originalName: repository.encryptDocumentName(appId, id, 'x.pdf') };
  };
  const caps = { slotMax: 3, totalMax: 1000 };
  const first = reference('passport', 400);
  assert.equal(await repository.addDocument(appId, userId, first, caps), true);
  assert.equal(await repository.addDocument(appId, userId, reference('passport', 601), caps), false, 'one byte over the total');
  assert.equal(await repository.addDocument(appId, userId, reference('passport', 600), caps), true, 'exactly the total');
  assert.equal(await repository.addDocument(appId, new mongoose.Types.ObjectId(), reference('funds', 1), { slotMax: 9, totalMax: 5000 }), false, 'not the owner, though there is room');
  for (let i = 0; i < 1; i += 1) assert.equal(await repository.addDocument(appId, userId, reference('funds', 0), { slotMax: 1, totalMax: 5000 }), true);
  assert.equal(await repository.addDocument(appId, userId, reference('funds', 0), { slotMax: 1, totalMax: 5000 }), false, 'the slot is full');

  await setStatus(appId, 'submitted');
  assert.equal(await repository.addDocument(appId, userId, reference('funds', 1), { slotMax: 9, totalMax: 5000 }), false, 'locked');
  assert.equal(await repository.removeDocument(appId, userId, first.id), null, 'locked');
  assert.equal((await docsOf(appId)).length, 3);
  await setStatus(appId, 'draft');
  assert.equal(await repository.removeDocument(appId, new mongoose.Types.ObjectId(), first.id), null, 'not the owner');
  assert.equal((await repository.removeDocument(appId, userId, first.id)).id, first.id);
  assert.equal((await docsOf(appId)).length, 2);
});

// ---------------------------------------------------------------------------
// Locked after submit
// ---------------------------------------------------------------------------

test('once the application is submitted, files can be listed but not added or deleted', async () => {
  const fake = freshStorage();
  const { token, appId } = await start();
  const uploaded = (await upload(token, { slot: 'passport' })).json.data.document;
  await setStatus(appId, 'submitted');

  const add = await upload(token, { slot: 'funds' });
  assert.deepEqual([add.status, add.json.code], [409, 'DOCUMENTS_LOCKED']);
  const del = await remove(token, uploaded.id);
  assert.deepEqual([del.status, del.json.code], [409, 'DOCUMENTS_LOCKED']);
  assert.equal(fake.uploads.length, 1);
  assert.equal(fake.removed.length, 0);
  assert.equal((await docsOf(appId)).length, 1);
  const shown = await list(token);
  assert.equal(shown.status, 200);
  assert.equal(shown.json.data.documents.length, 1);

  await setStatus(appId, 'in_review');
  assert.equal((await upload(token, { slot: 'funds' })).json.code, 'DOCUMENTS_LOCKED');
});

test('a submission that lands between the check and the write still leaves no file behind', async () => {
  const fake = freshStorage();
  fake.delay = 60;
  const { token, appId } = await start();
  const pending = upload(token, { slot: 'passport' });
  await sleep(20);
  await setStatus(appId, 'submitted'); // while the file is being stored
  const res = await pending;
  assert.deepEqual([res.status, res.json.code], [409, 'DOCUMENTS_LOCKED']);
  assert.equal((await docsOf(appId)).length, 0);
  assert.equal(fake.live.size, 0, 'the stored file was deleted again');
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

test('deleting a file removes the reference and the stored asset; a second delete or a made-up id is 404', async () => {
  const fake = freshStorage();
  const { token, appId } = await start();
  const doc = (await upload(token, { slot: 'passport' })).json.data.document;
  const stored = (await docsOf(appId))[0];
  assert.equal(fake.live.size, 1);

  const res = await remove(token, doc.id);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(fake.removed, [{ publicId: stored.publicId, resourceType: 'raw' }]);
  assert.equal(fake.live.size, 0);
  assert.equal((await docsOf(appId)).length, 0);
  assert.deepEqual((await list(token)).json.data.documents, []);

  for (const id of [doc.id, crypto.randomUUID(), 'not-an-id', '..%2f..', '%7B%22%24ne%22%3Anull%7D']) {
    const again = await remove(token, id);
    assert.deepEqual([again.status, again.json.code], [404, 'DOCUMENT_NOT_FOUND'], id);
  }
});

test('if the stored asset cannot be deleted the reference is still removed, and the log line has ids only', async () => {
  const fake = freshStorage();
  fake.failRemove = true;
  const { token, appId } = await start();
  const doc = (await upload(token, { slot: 'passport', name: 'JANE-DOE-PASSPORT-SECRET.pdf' })).json.data.document;
  const stored = (await docsOf(appId))[0];

  const out = captureErrors();
  let res;
  try { res = await remove(token, doc.id); } finally { out.restore(); }
  assert.equal(res.status, 200);
  assert.equal((await docsOf(appId)).length, 0);
  const logged = out.lines.join('\n');
  assert.match(logged, /could not be deleted/);
  assert.equal(logged.includes('JANE-DOE'), false, 'no file name in the log');
  assert.equal(logged.includes(stored.publicId), false, 'no storage id in the log');
  assert.equal(logged.includes('storage is down'), false);
});

// ---------------------------------------------------------------------------
// Failures: nothing is left behind
// ---------------------------------------------------------------------------

test('if saving the reference fails after the file was stored, the stored file is deleted and the error is log-safe', async () => {
  const fake = freshStorage();
  const { token, appId } = await start();
  const failing = mock.method(repository, 'addDocument', async () => { throw new Error('database is down JANE-DOE-SECRET'); });
  const out = captureErrors();
  let res;
  try { res = await upload(token, { slot: 'passport', name: 'JANE-DOE-PASSPORT-SECRET.pdf' }); } finally { out.restore(); failing.mock.restore(); }

  assert.equal(res.status, 500);
  assert.equal(res.text.includes('JANE-DOE'), false, 'nothing from the failure reaches the response');
  assert.equal(fake.uploads.length, 1, 'it was stored first');
  assert.equal(fake.live.size, 0, 'and deleted again');
  assert.equal(fake.removed.length, 1);
  assert.equal((await docsOf(appId)).length, 0);
  assert.equal(out.lines.join('\n').includes('JANE-DOE'), false, 'nothing from the failure or the file name reaches the log');
});

test('if the storage fails, the answer is a clean 502 and nothing is saved', async () => {
  const fake = freshStorage();
  fake.failUpload = true;
  const { token, appId } = await start();
  const out = captureErrors();
  let res;
  try { res = await upload(token, { slot: 'passport', name: 'JANE-DOE-PASSPORT-SECRET.pdf' }); } finally { out.restore(); }
  assert.deepEqual([res.status, res.json.code], [502, 'UPLOAD_FAILED']);
  assert.equal((await docsOf(appId)).length, 0);
  assert.equal(out.lines.join('\n').includes('JANE-DOE'), false);
  assert.equal(out.lines.join('\n').includes('storage is down'), false);
});

test('storage that is not configured, or a missing encryption key, refuses the upload before anything is stored', async () => {
  const fake = freshStorage();
  const { token, appId } = await start();
  fake.configured = false;
  const noStorage = await upload(token, { slot: 'passport' });
  assert.deepEqual([noStorage.status, noStorage.json.code], [503, 'STORAGE_UNAVAILABLE']);

  fake.configured = true;
  const key = process.env.FIELD_ENCRYPTION_KEY;
  delete process.env.FIELD_ENCRYPTION_KEY;
  try {
    const noKey = await upload(token, { slot: 'passport' });
    assert.equal(noKey.status, 503);
  } finally {
    process.env.FIELD_ENCRYPTION_KEY = key;
  }
  assert.equal(fake.uploads.length, 0);
  assert.equal((await docsOf(appId)).length, 0);
});

test('the application must exist: uploading, listing and deleting before one is started is a clean 404', async () => {
  freshStorage();
  userCounter += 1;
  const user = await User.create({ name: 'Test No App', email: `test.noapp.${userCounter}@example.com`, password: 'not-a-real-password' });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  for (const res of [await upload(token, { slot: 'passport' }), await list(token), await remove(token, crypto.randomUUID())]) {
    assert.deepEqual([res.status, res.json.code], [404, 'APPLICATION_NOT_FOUND']);
  }
});

// ---------------------------------------------------------------------------
// Names and encryption at rest
// ---------------------------------------------------------------------------

test('the original name is stored as ciphertext bound to the application and the document; it is read back as sent', async () => {
  freshStorage();
  const { token, appId } = await start();
  const name = 'Mädchen-Pass ✓ 2026.pdf';
  const res = await upload(token, { slot: 'passport', name });
  assert.equal(res.status, 201);
  assert.equal(res.json.data.document.name, name);

  const raw = await rawDoc(appId);
  const [doc] = raw.documents;
  assert.match(doc.originalName, /^enc:v1:/);
  assert.equal(JSON.stringify(raw).includes('Mädchen'), false, 'the name is not in the document in plain text');
  assert.equal(JSON.stringify(raw).includes('Pass'), false);
  assert.equal(doc.publicId.includes('Pass'), false, 'and not in the storage id either');
  assert.equal((await list(token)).json.data.documents[0].name, name);

  // The ciphertext is bound to the document: moved to another file, it cannot be read.
  const second = (await upload(token, { slot: 'passport', name: 'other.pdf' })).json.data.document;
  const both = (await docsOf(appId));
  const other = both.find((d) => d.id === second.id);
  await TouristVisaApplication.collection.updateOne(
    { _id: oid(appId), 'documents.id': second.id },
    { $set: { 'documents.$.originalName': doc.originalName } }
  );
  assert.equal(other.id, second.id);
  const swapped = await list(token);
  assert.equal(swapped.status, 500, 'a swapped ciphertext fails to decrypt');
  assert.equal(swapped.text.includes('enc:v1:'), false);
});

test('names are cleaned for display: folders, control characters and direction marks go; the length is capped; an empty name gets a default', () => {
  assert.equal(cleanName('..\\..\\evil/dir\\scan.pdf', 'pdf'), 'scan.pdf');
  assert.equal(cleanName('a\u0000b\u001fc.pdf', 'pdf'), 'abc.pdf');
  assert.equal(cleanName('invoice‮gpj.exe', 'pdf'), 'invoicegpj.exe', 'the right-to-left override is removed');
  assert.equal(cleanName('  many   spaces   .pdf ', 'pdf'), 'many spaces .pdf');
  assert.equal(cleanName('the %22copy%22.pdf', 'pdf'), 'the "copy".pdf', 'a quote arrives from the browser as %22');
  assert.equal(cleanName('line%0Abreak%0D.pdf', 'pdf'), 'linebreak.pdf');
  assert.equal(Array.from(cleanName('x'.repeat(400) + '.pdf', 'pdf')).length, limits.MAX_NAME_LENGTH);
  for (const empty of ['', '   ', '.', '..', '/', undefined, null, 42]) assert.equal(cleanName(empty, 'png'), 'document.png', String(empty));
});

test('a name that looks like markup is kept as text, not changed by the sanitizer, and never becomes part of the storage id', async () => {
  const fake = freshStorage();
  const { token } = await start();
  const name = '<b>passport & "copy".pdf';
  const res = await upload(token, { slot: 'passport', name });
  assert.equal(res.status, 201);
  assert.equal(res.json.data.document.name, name);
  assert.equal(fake.uploads[0].publicId.includes('passport'), false);
});

// ---------------------------------------------------------------------------
// Nothing that points at the file ever reaches the applicant
// ---------------------------------------------------------------------------

test('no link, URL, public id or ciphertext appears in any applicant response', async () => {
  const fake = freshStorage();
  const { token, appId } = await start();
  const responses = [];
  const keep = (res) => { responses.push(res.text); return res; };
  const doc = keep(await upload(token, { slot: 'passport', name: 'scan.pdf' })).json.data.document;
  keep(await upload(token, { slot: 'funds', file: PNG() }));
  keep(await upload(token, { slot: 'funds', file: Buffer.from('not a file') }));
  keep(await list(token));
  keep(await api('GET', '/applications/me', { token }));
  keep(await remove(token, crypto.randomUUID()));
  keep(await remove(token, doc.id));
  keep(await list(token));

  const stored = [...fake.uploads.map((u) => u.publicId)];
  const all = responses.join('\n');
  for (const needle of ['http://', 'https://', 'cloudinary', 'tourist-visa/', 'publicId', 'resourceType', 'enc:v1:', 'secure_url', appId, ...stored]) {
    if (needle === appId) continue; // the application id is the applicant's own, and is not a storage detail
    assert.equal(all.includes(needle), false, `found ${needle}`);
  }
  assert.equal(all.includes('"url"'), false);
});

test('GET returns metadata and the limits only', async () => {
  freshStorage();
  const { token } = await start();
  await upload(token, { slot: 'passport', name: 'scan.pdf' });
  const res = await list(token);
  assert.equal(res.status, 200);
  const [doc] = res.json.data.documents;
  assert.deepEqual(Object.keys(doc).sort(), VIEW_KEYS);
  assert.deepEqual(res.json.data.limits, {
    maxFileBytes: MAX_FILE_BYTES,
    maxTotalBytes: MAX_TOTAL_BYTES,
    allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    slots: { passport: { max: 3 }, funds: { max: 10 } },
  });
  const app = (await api('GET', '/applications/me', { token })).json.data.application;
  assert.deepEqual(Object.keys(app.documents[0]).sort(), VIEW_KEYS, 'the application view shows the same metadata');
});

// ---------------------------------------------------------------------------
// Another user, sign-in, the feature gate
// ---------------------------------------------------------------------------

test("another user cannot see, delete or fill my documents", async () => {
  const fake = freshStorage();
  const mine = await start();
  const theirs = await start();
  const doc = (await upload(mine.token, { slot: 'passport' })).json.data.document;

  const seen = await list(theirs.token);
  assert.equal(seen.status, 200);
  assert.deepEqual(seen.json.data.documents, [], 'their list is their own');
  const del = await remove(theirs.token, doc.id);
  assert.deepEqual([del.status, del.json.code], [404, 'DOCUMENT_NOT_FOUND']);
  assert.equal(fake.removed.length, 0, 'my stored file was not touched');
  assert.equal((await docsOf(mine.appId)).length, 1);

  // Their upload goes to their application only, and my caps are not theirs.
  for (let i = 0; i < 3; i += 1) assert.equal((await upload(mine.token, { slot: 'passport' })).status, i < 2 ? 201 : 409);
  assert.equal((await upload(theirs.token, { slot: 'passport' })).status, 201);
  assert.equal((await docsOf(theirs.appId)).length, 1);
  assert.equal((await docsOf(mine.appId)).length, 3);
});

test('signing in is required on all three routes', async () => {
  const fake = freshStorage();
  const form = new FormData();
  form.append('slot', 'passport');
  form.append('file', new Blob([PDF()]), 'a.pdf');
  const results = [
    await api('POST', '/applications/me/documents', { body: form }),
    await api('GET', '/applications/me/documents'),
    await api('DELETE', `/applications/me/documents/${crypto.randomUUID()}`),
    await api('POST', '/applications/me/documents', { token: 'not-a-token', body: form }),
  ];
  for (const r of results) assert.equal(r.status, 401);
  assert.equal(fake.uploads.length, 0);
});

test('while the feature is closed, all three routes answer 404 FEATURE_CLOSED and nothing is read or stored', async () => {
  const fake = freshStorage();
  const { token } = await start();
  process.env.TOURIST_VISA_ENABLED = 'false';
  try {
    const big = await upload(token, { slot: 'passport', file: PDF(MAX_FILE_BYTES) });
    const results = [big, await list(token), await remove(token, crypto.randomUUID())];
    for (const r of results) {
      assert.equal(r.status, 404);
      assert.equal(r.json.code, 'FEATURE_CLOSED');
    }
  } finally {
    process.env.TOURIST_VISA_ENABLED = 'true';
  }
  assert.equal(fake.uploads.length, 0);
});

// ---------------------------------------------------------------------------
// Parser order: the multipart route works, and only that route
// ---------------------------------------------------------------------------

test('only the upload route takes multipart: every other Tourist Visa route still refuses a body that is not JSON', async () => {
  freshStorage();
  const { token } = await start();
  const form = () => { const f = new FormData(); f.append('slot', 'passport'); return f; };
  for (const [method, path] of [
    ['POST', '/applications'],
    ['PUT', '/applications/me/sections/1'],
    ['POST', '/applications/me/documents/extra'],
    ['PUT', '/applications/me/documents'],
    ['DELETE', `/applications/me/documents/${crypto.randomUUID()}`],
  ]) {
    const res = await api(method, path, { token, body: form() });
    assert.equal(res.status, 415, `${method} ${path}`);
    assert.equal(res.json.message, 'Send the request as application/json.');
  }
  // The upload route itself, with and without a trailing slash and in any letter case, reaches the file reader.
  for (const path of ['/applications/me/documents', '/applications/me/documents/', '/Applications/Me/Documents']) {
    const res = await api('POST', path, { token, body: form() });
    assert.equal(res.json.code, 'FILE_REQUIRED', path);
  }
});

test('the JSON saves still work, and the sanitizer is still skipped for them, after the parser change', async () => {
  freshStorage();
  const { token } = await start();
  const res = await api('PUT', '/applications/me/sections/10B', {
    token, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: { q10_2: 'Tom & Jerry <b>kept</b> as typed' } }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const app = (await api('GET', '/applications/me', { token })).json.data.application;
  assert.equal(app.answers.q10_2, 'Tom & Jerry <b>kept</b> as typed');
});

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------

test('the upload route is rate limited per signed-in user, with its own code, and another user is not affected', async () => {
  freshStorage();
  const busy = await start();
  const calm = await start();
  const statuses = [];
  for (let i = 0; i < limits.UPLOAD_RATE.max + 1; i += 1) statuses.push((await upload(busy.token, { slot: 'passport', file: null })));
  assert.equal(statuses.slice(0, limits.UPLOAD_RATE.max).every((r) => r.status === 400), true, 'the first requests are answered normally');
  const last = statuses.at(-1);
  assert.deepEqual([last.status, last.json.code], [429, 'TOO_MANY_UPLOADS']);
  assert.equal((await upload(calm.token, { slot: 'passport' })).status, 201);
  assert.equal((await list(busy.token)).status, 200, 'only the upload route is limited');
});

test('createUploadLimiter counts per user and takes its numbers as arguments', async () => {
  const app = express();
  app.use((req, res, next) => { req.user = { _id: req.headers['x-user'] }; next(); });
  app.post('/up', createUploadLimiter({ windowMs: 60000, max: 2 }), (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const hit = async (user) => (await fetch(`http://127.0.0.1:${srv.address().port}/up`, { method: 'POST', headers: { 'x-user': user } })).status;
    assert.deepEqual([await hit('a'), await hit('a'), await hit('a'), await hit('b')], [200, 200, 429, 200]);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

// ---------------------------------------------------------------------------
// getTemporaryLink
// ---------------------------------------------------------------------------

test('getTemporaryLink returns a link that expires in exactly 2 minutes, for a stored file only', async () => {
  const fake = freshStorage();
  const { token, appId } = await start();
  const doc = (await upload(token, { slot: 'passport' })).json.data.document;
  const stored = (await docsOf(appId))[0];

  assert.equal(LINK_TTL_SECONDS, 120);
  documentService.now = () => new Date('2026-11-01T10:00:00.000Z');
  const link = await documentService.getTemporaryLink(appId, doc.id);
  assert.equal(link.expiresAt.toISOString(), '2026-11-01T10:02:00.000Z');
  assert.equal(link.expiresAt.getTime() - new Date('2026-11-01T10:00:00.000Z').getTime(), 120 * 1000);
  assert.match(link.url, /^https:\/\/fake-storage\.invalid\/download\?/);
  assert.equal(fake.links.length, 1);
  assert.equal(fake.links[0].doc.publicId, stored.publicId);
  assert.equal(fake.links[0].expiresAt.getTime(), link.expiresAt.getTime());
  assert.equal(new URL(link.url).searchParams.get('expires'), String(link.expiresAt.getTime()));

  documentService.now = () => new Date('2026-11-01T10:30:00.000Z');
  const later = await documentService.getTemporaryLink(appId, doc.id);
  assert.equal(later.expiresAt.toISOString(), '2026-11-01T10:32:00.000Z', 'every link is two minutes from when it is asked for');

  for (const [application, id] of [[appId, crypto.randomUUID()], [appId, 'nope'], [new mongoose.Types.ObjectId().toString(), doc.id]]) {
    await assert.rejects(() => documentService.getTemporaryLink(application, id), (error) => error.statusCode === 404 && ['DOCUMENT_NOT_FOUND', 'APPLICATION_NOT_FOUND'].includes(error.code));
  }
  fake.configured = false;
  await assert.rejects(() => documentService.getTemporaryLink(appId, doc.id), (error) => error.code === 'STORAGE_UNAVAILABLE');
});

test('there is no route that hands out a link: no applicant path reaches getTemporaryLink', async () => {
  freshStorage();
  const { token, appId } = await start();
  const doc = (await upload(token, { slot: 'passport' })).json.data.document;
  for (const [method, path] of [
    ['GET', `/applications/me/documents/${doc.id}`],
    ['GET', `/applications/me/documents/${doc.id}/link`],
    ['GET', `/applications/me/documents/${doc.id}/download`],
    ['GET', `/applications/${appId}/documents/${doc.id}/link`],
  ]) {
    const res = await api(method, path, { token });
    assert.equal(res.status, 404, `${method} ${path}`);
  }
});

// ---------------------------------------------------------------------------
// The real R2 adapter, with a fake client (no network) and the SDK's own offline URL signing
// ---------------------------------------------------------------------------

const CREDENTIALS = {
  R2_ACCOUNT_ID: 'testaccount0123456789abcdef01234567',
  R2_ACCESS_KEY_ID: 'AKIATESTKEY0000000001',
  R2_SECRET_ACCESS_KEY: 'test-only-secret-not-real',
  R2_PRIVATE_BUCKET: 'test-private-bucket',
};

function fakeClient({ fail = false } = {}) {
  const sent = [];
  return {
    sent,
    config: {},
    async send(command) {
      sent.push(command);
      if (fail) throw new Error('secret detail from the provider');
      return {};
    },
  };
}

test('adapter: uploads private files into the application folder with a random key that carries no name', async () => {
  const client = fakeClient();
  const adapter = new R2DocumentStorage({ client, env: CREDENTIALS });
  assert.equal(adapter.isConfigured(), true);
  const result = await adapter.upload(PDF(10), { applicationId: 'app123', extension: 'pdf' });
  const [command] = client.sent;
  assert.ok(command instanceof PutObjectCommand);
  assert.equal(command.input.Bucket, 'test-private-bucket');
  assert.match(command.input.Key, /^tourist-visa\/app123\/[0-9a-f]{32}\.pdf$/);
  assert.equal(command.input.ContentType, 'application/pdf');
  assert.deepEqual(result, { publicId: command.input.Key, resourceType: 'raw', bytes: 10 });

  const second = await adapter.upload(PDF(10), { applicationId: 'app123', extension: 'pdf' });
  assert.notEqual(second.publicId, result.publicId, 'every upload gets a new random key');
});

test('adapter: a failed upload or delete is an error with a fixed message (nothing from the provider leaks)', async () => {
  const adapter = new R2DocumentStorage({ client: fakeClient({ fail: true }), env: CREDENTIALS });
  await assert.rejects(() => adapter.upload(PDF(10), { applicationId: 'a', extension: 'pdf' }), (e) => e.message === 'storage upload failed');
  await assert.rejects(() => adapter.remove('tourist-visa/a/x.pdf', 'raw'), (e) => e.message === 'storage delete failed');
});

test('adapter: delete asks for the object in the private bucket', async () => {
  const client = fakeClient();
  const adapter = new R2DocumentStorage({ client, env: CREDENTIALS });
  await adapter.remove('tourist-visa/a/x.pdf', 'raw');
  const [command] = client.sent;
  assert.ok(command instanceof DeleteObjectCommand);
  assert.equal(command.input.Bucket, 'test-private-bucket');
  assert.equal(command.input.Key, 'tourist-visa/a/x.pdf');
});

test('adapter: the temporary link is a signed, expiring download link and never contains the secret', async () => {
  const adapter = new R2DocumentStorage({ env: CREDENTIALS });
  const expiresAt = new Date(Date.now() + 120 * 1000);
  const link = await adapter.temporaryUrl({ publicId: 'tourist-visa/app123/abc.pdf', resourceType: 'raw' }, expiresAt);
  const url = new URL(link);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.host, 'test-private-bucket.testaccount0123456789abcdef01234567.r2.cloudflarestorage.com');
  assert.equal(url.pathname, '/tourist-visa/app123/abc.pdf');
  const q = url.searchParams;
  assert.equal(q.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  const seconds = Number(q.get('X-Amz-Expires'));
  assert.ok(seconds >= 118 && seconds <= 120, `expires in about two minutes (got ${seconds})`);
  assert.equal(link.includes(CREDENTIALS.R2_SECRET_ACCESS_KEY), false, 'the secret is never in the link');
  assert.ok(q.get('X-Amz-Signature'), 'the link is signed');

  // The expiry is part of the signature: a different expiry gives a different signature.
  const longer = new URL(await adapter.temporaryUrl({ publicId: 'tourist-visa/app123/abc.pdf' }, new Date(Date.now() + 3600 * 1000)));
  assert.notEqual(longer.searchParams.get('X-Amz-Signature'), q.get('X-Amz-Signature'));
});

test('adapter: missing variables are reported by name only, and an unconfigured adapter says so', () => {
  assert.deepEqual(missingStorageVariables({}), ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PRIVATE_BUCKET']);
  assert.deepEqual(missingStorageVariables({ ...CREDENTIALS, R2_ACCESS_KEY_ID: '  ' }), ['R2_ACCESS_KEY_ID']);
  assert.deepEqual(missingStorageVariables(CREDENTIALS), []);
  assert.equal(new R2DocumentStorage({ env: {} }).isConfigured(), false);
});

test('constants: the limits are the agreed ones, in one place', () => {
  assert.equal(limits.MAX_FILE_BYTES, 4 * 1024 * 1024);
  assert.equal(limits.MAX_TOTAL_BYTES, 40 * 1024 * 1024);
  assert.deepEqual(Object.fromEntries(Object.entries(limits.SLOTS).map(([id, s]) => [id, s.max])), { passport: 3, funds: 10 });
  assert.deepEqual(Object.keys(limits.FILE_TYPES), ['pdf', 'jpg', 'png']);
  assert.equal(limits.LINK_TTL_SECONDS, 120);
  assert.equal(limits.STORAGE.deliveryType, 'authenticated');
  assert.equal(limits.STORAGE.resourceType, 'raw');
});

// ---------------------------------------------------------------------------
// Step 8c-2: section 10D follows the files
// ---------------------------------------------------------------------------

const appOf = async (token) => (await api('GET', '/applications/me', { token })).json.data.application;

test('section 10D: not started with no files, in progress with one slot, saved with both, and back again when a file goes', async () => {
  freshStorage();
  const { token, appId } = await start();
  let app = await appOf(token);
  assert.equal(app.sectionStatus['10D'], undefined, 'not started: no status at all');
  assert.equal(app.documentsComplete, false);

  const passport = (await upload(token, { slot: 'passport' })).json.data.document;
  app = await appOf(token);
  assert.equal(app.sectionStatus['10D'], 'in_progress');
  assert.equal(app.documentsComplete, false);

  await upload(token, { slot: 'passport' });
  assert.equal((await appOf(token)).sectionStatus['10D'], 'in_progress', 'a second passport file does not complete it');

  const funds = (await upload(token, { slot: 'funds', file: PNG() })).json.data.document;
  app = await appOf(token);
  assert.equal(app.sectionStatus['10D'], 'saved');
  assert.equal(app.documentsComplete, true);

  assert.equal((await remove(token, funds.id)).status, 200);
  app = await appOf(token);
  assert.equal(app.sectionStatus['10D'], 'in_progress');
  assert.equal(app.documentsComplete, false);

  assert.equal((await remove(token, passport.id)).status, 200);
  await remove(token, (await list(token)).json.data.documents[0].id);
  app = await appOf(token);
  assert.equal(app.sectionStatus['10D'], undefined, 'no files left: not started again');

  const stored = await rawDoc(appId);
  assert.equal(Object.keys(stored.sectionStatus || {}).includes('10D'), false, 'the status is worked out, never stored');
});

test('section 10D: the files-only section cannot be saved, and it is the last place to resume', async () => {
  freshStorage();
  const { token, appId } = await start();
  const before = await rawDoc(appId);
  const res = await api('PUT', '/applications/me/sections/10D', {
    token, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: {} }),
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.message, 'This section has no answers to save. Files are saved as soon as they are uploaded.');
  const withKey = await api('PUT', '/applications/me/sections/10D', {
    token, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: { q10_6: 'x' } }),
  });
  assert.equal(withKey.status, 400);
  assert.deepEqual(await rawDoc(appId), before, 'nothing was written');

  // With Parts 1 to 10C saved the applicant resumes on 10D, whatever its state, because it is the last section.
  const { TouristVisaApplicationService } = require('../services/touristVisaApplicationService');
  const service = new TouristVisaApplicationService();
  const saved = Object.fromEntries(['1', '2A', '2B', '2C', '2D', '3', '4B', '4C', '5', '6A', '6B', '6C', '6D', '7', '8', '9A', '9B', '9C', '10A', '10B', '10C'].map((id) => [id, 'saved']));
  assert.equal(service.resumeSection(saved, {}), '10D', 'no files yet');
  assert.equal(service.resumeSection({ ...saved, '10D': 'in_progress' }, {}), '10D', 'one slot is not enough');
  assert.equal(service.resumeSection({ ...saved, '10D': 'saved' }, {}), '10D', 'complete: the last section stays the resume point');
  assert.equal(service.resumeSection({ ...saved, '10C': undefined }, {}), '10C', 'an earlier section that is not saved comes first');
});

test('section 10D: a locked application keeps its files and their status', async () => {
  freshStorage();
  const { token, appId } = await start();
  await upload(token, { slot: 'passport' });
  await upload(token, { slot: 'funds' });
  await setStatus(appId, 'submitted');
  const app = await appOf(token);
  assert.equal(app.sectionStatus['10D'], 'saved');
  assert.equal(app.documentsComplete, true);
  assert.equal(app.documents.length, 2);
});

test('the dashboard data for 10D never carries a link or storage id either', async () => {
  const fake = freshStorage();
  const { token } = await start();
  await upload(token, { slot: 'passport' });
  const text = JSON.stringify(await appOf(token));
  assert.equal(text.includes(fake.uploads[0].publicId), false);
  assert.equal(text.includes('tourist-visa/'), false);
  assert.equal(text.includes('http'), false);
});

// ---------------------------------------------------------------------------
// The storage cannot be swapped by anything in production
// ---------------------------------------------------------------------------

test('production code cannot swap the storage: the default is the Cloudinary adapter, and no production file assigns or reads a swap', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { TouristVisaDocumentService } = require('../services/touristVisaDocumentService');
  assert.equal(new TouristVisaDocumentService().storage, require('../config/touristVisaStorage'), 'a new service uses the real adapter');

  // Only the tests (which assign a fake on purpose) may touch it. A wrapper outside the repository is the one other way in.
  const root = path.join(__dirname, '..');
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'tests', 'uploads', '.git'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(root);
  assert.ok(files.length > 30, 'the scan found the backend sources');
  const offenders = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (/(?<!this)\.storage\s*=(?!=)/.test(text) || /fake[-_ ]?storage/i.test(text) || /process\.env\.[A-Z_]*(FAKE|MOCK|STUB)[A-Z_]*/.test(text)) offenders.push(path.relative(root, file));
  }
  assert.deepEqual(offenders, [], 'no production file swaps or fakes the storage');
});
