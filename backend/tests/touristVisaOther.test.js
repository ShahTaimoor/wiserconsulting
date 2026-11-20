'use strict';

// Config 1.4.0: "Other (please write)" in list questions, through the real routes: saving, the required text, switching away, a
// tampered companion, readiness and submit, the review, the answers PDF, the administrator's view and corrections, the facts and
// template for the cover letter and itinerary, and an application submitted under 1.3.0 (no Other), which keeps its own config.
// An in-memory replica set, a fake file storage, made-up users and answers.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.TOURIST_VISA_ENABLED = 'true';
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const User = require('../models/User');
const TouristVisaApplication = require('../models/TouristVisaApplication');
const TouristVisaAudit = require('../models/TouristVisaAudit');
const TouristVisaChange = require('../models/TouristVisaChange');
const TouristVisaNote = require('../models/TouristVisaNote');
const TouristVisaCoverLetter = require('../models/TouristVisaCoverLetter');
const TouristVisaItinerary = require('../models/TouristVisaItinerary');
const TouristVisaConfigSnapshot = require('../models/TouristVisaConfigSnapshot');
const engine = require('../shared/tourist-visa/engine');
const cover = require('../shared/tourist-visa/coverLetterFacts');
const itinerary = require('../shared/tourist-visa/itineraryFacts');
const documentService = require('../services/touristVisaDocumentService');
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const { buildTemplate } = require('../utils/touristVisaCoverLetterTemplate');
const { substitute } = require('../utils/touristVisaCoverLetterChecks');
const { detailsOf } = require('../utils/touristVisaItineraryPdf');
const { FILE_NAME, SECTIONS } = require('./helpers/touristVisaFixtures');
const { uploadRemainingShared } = require('./helpers/documentSlots');
const { inspectPdf } = require('./helpers/pdfInspect');

let replSet;
let server;
let baseUrl;
let userCounter = 0;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  for (const model of [TouristVisaApplication, TouristVisaAudit, TouristVisaChange, TouristVisaNote, TouristVisaCoverLetter, TouristVisaItinerary, TouristVisaConfigSnapshot]) await model.init();
  const app = express();
  app.use('/api/tourist-visa', touristVisaBodyParser);
  app.use(express.json());
  app.use('/api/tourist-visa', touristVisaRoutes);
  app.use(errorHandler);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}, { timeout: 180000 });

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

class FakeStorage {
  isConfigured() { return true; }
  async upload(buffer, { applicationId, extension }) { return { publicId: `tourist-visa/${applicationId}/${crypto.randomBytes(8).toString('hex')}.${extension}`, resourceType: 'raw', bytes: buffer.length }; }
  async remove() {}
  temporaryUrl() { return 'https://fake-storage.invalid/download'; }
}
documentService.storage = new FakeStorage();

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${baseUrl}/api/tourist-visa${path}`, {
    method,
    headers: { ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}
async function getPdf(path, token) {
  const res = await fetch(`${baseUrl}/api/tourist-visa${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const bytes = Buffer.from(await res.arrayBuffer());
  const isPdf = (res.headers.get('content-type') || '').startsWith('application/pdf');
  return { status: res.status, buffer: isPdf ? bytes : null, text: isPdf ? '' : bytes.toString('utf8') };
}
async function makeUser(role = 0) {
  userCounter += 1;
  const user = await User.create({ name: `Other Option ${userCounter}`, email: `test.otheroption.${userCounter}@example.com`, password: 'not-a-real-password', role });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token, userId: String(user._id) };
}
const oid = (id) => new mongoose.Types.ObjectId(id);
const rawDoc = (appId) => TouristVisaApplication.collection.findOne({ _id: oid(appId) });
const put = (token, sectionId, answers) => api('PUT', `/applications/me/sections/${sectionId}`, { token, body: { answers } });
const submit = (token) => api('POST', '/applications/me/submit', { token, body: { declarationAccepted: true } });
const edit = (token, appId, body) => api('PUT', `/admin/applications/${appId}/changes`, { token, body });
const rowsOf = (review) => review.parts.flatMap((p) => p.sections.flatMap((s) => s.rows));
const flat = (text) => text.replace(/\s+/g, ' ');

const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60, 0x20)]);
function upload(token, slot, name) {
  const form = new FormData();
  form.append('slot', slot);
  form.append('file', new Blob([PDF_BYTES], { type: 'application/pdf' }), name);
  return api('POST', '/applications/me/documents', { token, body: form });
}

const WORDS = 'To attend my cousin\'s wedding';
const S1 = { q1_1: 'tourism', q1_2: false, q1_3: false, q1_4: 'holiday', q1_5: 'A made-up trip.', q1_6: '2027-03-01', q1_7: '2027-03-15' };
const S1_OTHER = { ...S1, q1_1: 'other', q1_1_other: WORDS };
const REASON = 'MADE-UP-REASON: corrected after the phone call';

async function started() {
  const person = await makeUser(0);
  const created = await api('POST', '/applications', { token: person.token });
  return { ...person, appId: created.json.data.application.id };
}
async function readyApplicant(section1 = S1) {
  const person = await started();
  for (const [id, answers] of SECTIONS('Testfirst', 'Testlast', 'test.other@example.com')) {
    const res = await put(person.token, id, id === '1' ? section1 : answers);
    assert.equal(res.status, 200, `${id}: ${JSON.stringify(res.json)}`);
  }
  assert.equal((await upload(person.token, 'passport', FILE_NAME)).status, 201);
  assert.equal((await upload(person.token, 'funds', 'bank-statement.pdf')).status, 201);
  await uploadRemainingShared(upload, person.token);
  return person;
}
async function submitted(section1 = S1) {
  const person = await readyApplicant(section1);
  const res = await submit(person.token);
  assert.equal(res.status, 200, res.text);
  return person;
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

test('Other with its text is saved: the choice stays the option value, the words sit next to it, nothing else is added', async () => {
  const person = await started();
  const res = await put(person.token, '1', S1_OTHER);
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.json.data.removed, []);
  const stored = await rawDoc(person.appId);
  assert.equal(stored.answers.q1_1, 'other');
  assert.equal(stored.answers.q1_1_other, WORDS);
  assert.equal('q1_4' in stored.answers, false);
  const mine = await api('GET', '/applications/me', { token: person.token });
  assert.equal(mine.json.data.application.answers.q1_1, 'other');
  assert.equal(mine.json.data.application.answers.q1_1_other, WORDS);
  assert.equal(mine.json.data.application.sectionStatus['1'], 'saved');
});

test('Other without the text, with only spaces, too long, or with angle brackets, is refused and nothing is written', async () => {
  const person = await started();
  const before = await rawDoc(person.appId);
  for (const [text, message] of [[undefined, 'This question is required'], ['', 'This question is required'], ['   ', 'This question is required'], ['x'.repeat(101), 'Must be 100 characters or fewer'], ['<b>wedding</b>', 'Do not use the < or > characters']]) {
    const res = await put(person.token, '1', { ...S1, q1_1: 'other', q1_1_other: text });
    assert.equal(res.status, 422, JSON.stringify(text));
    assert.deepEqual(res.json.errors, { q1_1_other: message }, JSON.stringify(text));
    assert.equal(res.text.includes('wedding'), false, 'the answer is never repeated');
  }
  assert.deepEqual((await rawDoc(person.appId)).answers, before.answers);
});

test('switching away from Other removes the written text from the stored answers, the old words are gone', async () => {
  const person = await started();
  assert.equal((await put(person.token, '1', S1_OTHER)).status, 200);
  const res = await put(person.token, '1', { ...S1, q1_1: 'business' });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.json.data.removed.includes('q1_1_other'));
  const stored = await rawDoc(person.appId);
  assert.equal('q1_1_other' in stored.answers, false);
  assert.equal(JSON.stringify(stored.answers).includes('cousin'), false);
});

test('a companion sent when Other is not chosen is dropped (never stored, never an error), and a companion for a question without Other is refused', async () => {
  const person = await started();
  const res = await put(person.token, '1', { ...S1, q1_1: 'tourism', q1_1_other: 'sneaky words' });
  assert.equal(res.status, 200, res.text);
  assert.equal(JSON.stringify((await rawDoc(person.appId)).answers).includes('sneaky'), false);
  for (const key of ['q1_2_other', 'q1_3_other', 'q1_6_other']) {
    const refused = await put(person.token, '1', { ...S1, [key]: 'injected' });
    assert.notEqual(refused.status, 200, key);
    assert.equal(JSON.stringify((await rawDoc(person.appId)).answers).includes('injected'), false, key);
  }
  // The text of one section cannot be sent through another section's save.
  const other = await put(person.token, '8', { q8_1: 0, q8_2: false, q8_3: false, q1_1_other: 'cross-section' });
  assert.notEqual(other.status, 200);
  assert.equal(JSON.stringify((await rawDoc(person.appId)).answers).includes('cross-section'), false);
});

test('an Other inside a repeating group is saved per entry, and removed with the entry or the group', async () => {
  const person = await started();
  const trip = (patch) => ({ q8_2a: 'FR', q8_2b: 'tourism', q8_2c: '2025-07-01', q8_2d: '2025-07-10', ...patch });
  const res = await put(person.token, '8', { q8_1: 0, q8_2: true, q8_3: false, otherCountryTrips: [trip({ q8_2b: 'other', q8_2b_other: 'A pilgrimage' }), trip({})] });
  assert.equal(res.status, 200, res.text);
  const stored = (await rawDoc(person.appId)).answers.otherCountryTrips;
  assert.equal(stored[0].q8_2b_other, 'A pilgrimage');
  assert.equal('q8_2b_other' in stored[1], false);
  const missing = await put(person.token, '8', { q8_1: 0, q8_2: true, q8_3: false, otherCountryTrips: [trip({ q8_2b: 'other' })] });
  assert.deepEqual(missing.json.errors, { 'otherCountryTrips.0.q8_2b_other': 'This question is required' });
  const closed = await put(person.token, '8', { q8_1: 0, q8_2: false, q8_3: false });
  assert.deepEqual(closed.json.data.removed, ['otherCountryTrips']);
  assert.equal(JSON.stringify((await rawDoc(person.appId)).answers).includes('pilgrimage'), false);
});

// ---------------------------------------------------------------------------
// Readiness and submit
// ---------------------------------------------------------------------------

test('an application with Other chosen and no text (saved before the box existed) is not ready: section 1 is named, nothing is submitted; writing the text makes it ready', async () => {
  const person = await readyApplicant(S1_OTHER);
  await TouristVisaApplication.collection.updateOne({ _id: oid(person.appId) }, { $unset: { 'answers.q1_1_other': '' } });
  const before = await rawDoc(person.appId);
  const refused = await submit(person.token);
  assert.equal(refused.status, 422, refused.text);
  assert.equal(refused.json.code, 'NOT_READY');
  assert.deepEqual(refused.json.sections.map((s) => s.id), ['1']);
  assert.equal(refused.json.sections[0].problems, 1);
  assert.equal((await rawDoc(person.appId)).status, 'draft');
  assert.deepEqual((await rawDoc(person.appId)).answers, before.answers);
  assert.equal((await put(person.token, '1', S1_OTHER)).status, 200);
  assert.equal((await submit(person.token)).status, 200);
});

test('a whole application is submitted with an Other answer and without one, under config 1.6.0', async () => {
  const withOther = await submitted(S1_OTHER);
  const a = await rawDoc(withOther.appId);
  assert.equal(a.status, 'submitted');
  assert.equal(a.configVersion, '1.6.0');
  assert.equal(a.answers.q1_1_other, WORDS);
  const snapshot = await TouristVisaConfigSnapshot.findById(a.configSha256).lean();
  assert.ok(JSON.parse(snapshot.json).questions.some((q) => q.id === 'q1_1_other'), 'the config it was submitted under has the text box');
  const plain = await submitted(S1);
  assert.equal((await rawDoc(plain.appId)).status, 'submitted');
});

// ---------------------------------------------------------------------------
// The review and the answers PDF
// ---------------------------------------------------------------------------

test('the review shows "Other: <words>" on the question and no row for the text box', async () => {
  const person = await readyApplicant(S1_OTHER);
  const review = await api('GET', '/applications/me/review', { token: person.token });
  assert.equal(review.status, 200, review.text);
  const rows = rowsOf(review.json.data.review);
  assert.equal(rows.find((r) => r.id === 'q1_1').value, `Other: ${WORDS}`);
  assert.equal(rows.some((r) => r.id === 'q1_1_other'), false);
  assert.equal(review.text.includes('Other (please write)'), false);
});

test('the answers PDF prints the written answer after "Other:", for the applicant and for the administrator', async () => {
  const person = await submitted(S1_OTHER);
  const mine = await getPdf('/applications/me/pdf/answers', person.token);
  assert.equal(mine.status, 200, mine.text);
  const text = flat((await inspectPdf(mine.buffer)).text);
  assert.ok(text.includes('Other: To attend my cousin'), 'the words follow "Other:"');
  assert.ok(text.includes('wedding'));
  assert.equal(text.includes('Other (please write)'), false);
  const admin = await makeUser(1);
  const theirs = await getPdf(`/admin/applications/${person.appId}/pdf/answers`, admin.token);
  assert.equal(theirs.status, 200);
  assert.ok(flat((await inspectPdf(theirs.buffer)).text).includes('Other: To attend my cousin'));
});

// ---------------------------------------------------------------------------
// The administrator
// ---------------------------------------------------------------------------

test('the administrator sees the written answer and the edit form offers the text box', async () => {
  const person = await submitted(S1_OTHER);
  const admin = await makeUser(1);
  const overview = await api('GET', `/admin/applications/${person.appId}`, { token: admin.token });
  assert.equal(overview.status, 200, overview.text);
  assert.equal(rowsOf(overview.json.data.review).find((r) => r.id === 'q1_1').value, `Other: ${WORDS}`);
  const form = await api('GET', `/admin/applications/${person.appId}/edit-form`, { token: admin.token });
  assert.equal(form.status, 200, form.text);
  assert.ok(form.text.includes('q1_1_other'), 'the edit form is built from the config it was submitted under, which has the box');
});

test('a correction can change the written answer, and changing the choice to Other needs the words in the same request', async () => {
  const person = await submitted(S1);
  const admin = await makeUser(1);
  // To Other without the words: refused (the box has just become necessary and the request did not answer it).
  const without = await edit(admin.token, person.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q1_1', value: 'other' }] });
  assert.ok([400, 422].includes(without.status), without.text);
  assert.equal((await rawDoc(person.appId)).answers.q1_1, 'tourism', 'nothing changed');
  // To Other with the words: the preview lists both, the correction is applied.
  const changes = [{ questionId: 'q1_1', value: 'other' }, { questionId: 'q1_1_other', value: WORDS }];
  const preview = await edit(admin.token, person.appId, { expectedRevision: 0, changes, dryRun: true });
  assert.equal(preview.status, 200, preview.text);
  // The choice is a change; the words are the question the change has just made necessary, answered in the same request.
  const choice = preview.json.data.changes.find((c) => c.questionId === 'q1_1');
  assert.equal(choice.new, `Other: ${WORDS}`);
  const words = preview.json.data.required.find((c) => c.questionId === 'q1_1_other');
  assert.equal(words.new, WORDS);
  assert.match(words.label, /Written answer to/);
  assert.ok(preview.json.data.removed.some((r) => r.questionId === 'q1_4'), 'the holiday question is removed, as for any reason that is not tourism');
  const applied = await edit(admin.token, person.appId, { expectedRevision: 0, reason: REASON, changes });
  assert.equal(applied.status, 200, applied.text);
  const stored = await rawDoc(person.appId);
  assert.equal(stored.answers.q1_1, 'other');
  assert.equal(stored.answers.q1_1_other, WORDS);
  // The words themselves can be corrected, with the same rules.
  const tooLong = await edit(admin.token, person.appId, { expectedRevision: 1, reason: REASON, changes: [{ questionId: 'q1_1_other', value: 'x'.repeat(101) }] });
  assert.ok([400, 422].includes(tooLong.status), tooLong.text);
  const fixed = await edit(admin.token, person.appId, { expectedRevision: 1, reason: REASON, changes: [{ questionId: 'q1_1_other', value: 'For a family wedding' }] });
  assert.equal(fixed.status, 200, fixed.text);
  assert.equal((await rawDoc(person.appId)).answers.q1_1_other, 'For a family wedding');
});

test('a correction that changes the choice away from Other removes the words and lists them as removed', async () => {
  const person = await submitted(S1_OTHER);
  const admin = await makeUser(1);
  const body = { expectedRevision: 0, changes: [{ questionId: 'q1_1', value: 'business' }] };
  const preview = await edit(admin.token, person.appId, { ...body, dryRun: true });
  assert.equal(preview.status, 200, preview.text);
  assert.ok(preview.json.data.removed.some((r) => r.questionId === 'q1_1_other' && r.old === WORDS), JSON.stringify(preview.json.data.removed));
  assert.equal((await edit(admin.token, person.appId, { ...body, reason: REASON })).status, 200);
  const stored = await rawDoc(person.appId);
  assert.equal('q1_1_other' in stored.answers, false);
  assert.equal(stored.answers.q1_1, 'business');
});

test('a correction cannot add the text box of a question that has no Other', async () => {
  const person = await submitted(S1);
  const admin = await makeUser(1);
  for (const questionId of ['q1_2_other', 'q2_12_other', 'q1_1_other_other']) {
    const res = await edit(admin.token, person.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId, value: 'injected' }] });
    assert.ok([400, 404, 422].includes(res.status), `${questionId}: ${res.status}`);
  }
  // The text box of a question that allows Other, but whose choice is not Other: not asked, so not accepted.
  const hidden = await edit(admin.token, person.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q1_1_other', value: 'words' }] });
  assert.ok([400, 422].includes(hidden.status), hidden.text);
  assert.equal(JSON.stringify((await rawDoc(person.appId)).answers).includes('injected'), false);
  assert.equal('q1_1_other' in (await rawDoc(person.appId)).answers, false);
});

// ---------------------------------------------------------------------------
// The facts, the template and the itinerary header
// ---------------------------------------------------------------------------

const FACT_ANSWERS = { q1_1: 'other', q1_1_other: 'Attending the wedding of my friend Ahmed Khan, call +44 7700 900123', q1_6: '2027-03-01', q1_7: '2027-03-15', q2_1: 'Ahmed', q2_2: 'Khan', q6_7: false, q6_7x: 'other', q6_7x_other: 'A houseboat moored in Bath' };
const submittedAt = new Date('2026-11-01T12:00:00Z');

test('the cover letter template uses the applicant\'s own words for an Other reason and plan, restores what was redacted, and never says "another reason"', () => {
  const facts = cover.buildFacts(engine.config, FACT_ANSWERS, { submittedAt });
  for (const secret of ['Ahmed', 'Khan', '7700']) assert.equal(facts.text.includes(secret), false, `${secret} reached the facts the AI sees`);
  const letter = buildTemplate(facts);
  assert.equal(letter.includes('another reason'), false, letter);
  assert.match(letter, /The main reason for my visit is attending the wedding of my friend \[R\d+\], call \[R\d+\]\./);
  assert.match(letter, /My plan for accommodation is a houseboat moored in Bath\./);
  // The server puts back what it took out, exactly as typed.
  const restored = substitute(letter, facts.tokens, facts.redactions);
  const text = typeof restored === 'string' ? restored : restored.text;
  assert.ok(text.includes('attending the wedding of my friend Ahmed Khan, call +44 7700 900123'), text);
  // Not Other: the fixed sentences, exactly as before.
  const plain = buildTemplate(cover.buildFacts(engine.config, { q1_1: 'business', q1_6: '2027-03-01', q1_7: '2027-03-15' }, { submittedAt }));
  assert.match(plain, /I am visiting for business\./);
});

test('the itinerary facts carry the written plan as a data block and the PDF header prints it with the redacted pieces put back', () => {
  const facts = itinerary.buildItineraryFacts(engine.config, FACT_ANSWERS, { submittedAt });
  assert.equal(facts.text.includes('7700'), false);
  assert.ok(facts.text.includes('<data name="Plans for accommodation">'), facts.text);
  assert.equal(/Plans for accommodation: [Oo]ther|somewhere else/.test(facts.text), false);
  const withName = itinerary.buildItineraryFacts(engine.config, { ...FACT_ANSWERS, q6_7x_other: 'With my friend Ahmed Khan on a houseboat' }, { submittedAt });
  assert.match(withName.values.accommodationPlan, /\[R\d+\]/, 'the name is a token for the AI');
  const staying = detailsOf(withName, 'Test Traveller').find((d) => d.label === 'Staying').value;
  assert.equal(staying, 'With my friend Ahmed Khan on a houseboat', 'the header has the real words');
});

// ---------------------------------------------------------------------------
// An application submitted under 1.3.0 (no Other)
// ---------------------------------------------------------------------------

async function oldConfig() {
  const old = JSON.parse(JSON.stringify(engine.config));
  old.version = '1.3.0';
  old.questions = old.questions.filter((q) => !q.otherOf);
  for (const q of old.questions) {
    delete q.allowOther;
    if (q.id === 'q1_1') q.options.find((o) => o.value === 'other').label = 'Another reason';
  }
  for (const g of old.groups) g.questions = g.questions.filter((id) => !id.endsWith('_other'));
  const json = JSON.stringify(old);
  const sha = crypto.createHash('sha256').update(json, 'utf8').digest('hex');
  await TouristVisaConfigSnapshot.updateOne({ _id: sha }, { $setOnInsert: { version: old.version, json, createdAt: new Date() } }, { upsert: true });
  return { sha, old };
}

test('an application submitted under 1.3.0 keeps its config: it opens, reviews, exports and takes a correction, and shows "Another reason" without asking for words', async () => {
  const person = await submitted(S1);
  const { sha } = await oldConfig();
  await TouristVisaApplication.collection.updateOne({ _id: oid(person.appId) }, { $set: { configSha256: sha, configVersion: '1.3.0', 'answers.q1_1': 'other' }, $unset: { 'answers.q1_4': '' } });
  const before = await rawDoc(person.appId);
  assert.equal('q1_1_other' in before.answers, false);

  const mine = await api('GET', '/applications/me', { token: person.token });
  assert.equal(mine.status, 200, mine.text);
  assert.equal(mine.json.data.application.configVersion, '1.3.0');
  const review = await api('GET', '/applications/me/review', { token: person.token });
  assert.equal(review.status, 200, review.text);
  assert.equal(rowsOf(review.json.data.review).find((r) => r.id === 'q1_1').value, 'Another reason');
  const pdf = await getPdf('/applications/me/pdf/answers', person.token);
  assert.equal(pdf.status, 200, pdf.text);
  const text = flat((await inspectPdf(pdf.buffer)).text);
  assert.ok(text.includes('Another reason'));
  assert.equal(text.includes('Other:'), false);

  const admin = await makeUser(1);
  assert.equal((await api('GET', `/admin/applications/${person.appId}`, { token: admin.token })).status, 200);
  assert.equal((await getPdf(`/admin/applications/${person.appId}/pdf/answers`, admin.token)).status, 200);
  const form = await api('GET', `/admin/applications/${person.appId}/edit-form`, { token: admin.token });
  assert.equal(form.status, 200, form.text);
  assert.equal(form.text.includes('q1_1_other'), false, 'the edit form is built from the old config');
  const fixed = await edit(admin.token, person.appId, { expectedRevision: 0, reason: REASON, changes: [{ questionId: 'q1_5', value: 'A corrected made-up trip.' }] });
  assert.equal(fixed.status, 200, fixed.text);
  const after = await rawDoc(person.appId);
  assert.equal(after.configSha256, sha, 'it stays on the config it was submitted under');
  assert.equal('q1_1_other' in after.answers, false);
  // Under the old config the box does not exist, so it cannot be added by a correction either.
  const added = await edit(admin.token, person.appId, { expectedRevision: 1, reason: REASON, changes: [{ questionId: 'q1_1_other', value: 'words' }] });
  assert.ok([400, 404, 422].includes(added.status), added.text);
});

// ---------------------------------------------------------------------------
// Nothing else changed shape
// ---------------------------------------------------------------------------

test('the stored answers of a question without Other, and of a list question that is not Other, have exactly the shape they had', async () => {
  const person = await readyApplicant(S1);
  const answers = (await rawDoc(person.appId)).answers;
  assert.equal(answers.q1_1, 'tourism');
  assert.equal(answers.q1_4, 'holiday');
  assert.deepEqual(Object.keys(answers).filter((k) => k.endsWith('_other')), []);
  assert.equal(answers.q2_13, 'single');
});
