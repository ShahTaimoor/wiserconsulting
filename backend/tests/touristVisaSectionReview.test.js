'use strict';

// Step 3 tests: how saving one section affects the others (hidden answers removed,
// dependent sections flagged needs_review), and encryption of repeating-group members.
// The real Parts 1-2 config has no dependency between sections yet, so these tests run
// the real service and repository against a small synthetic config.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const TouristVisaApplication = require('../models/TouristVisaApplication');
const { TouristVisaApplicationRepository } = require('../repositories/touristVisaApplicationRepository');
const { TouristVisaApplicationService } = require('../services/touristVisaApplicationService');
const engine = require('../shared/tourist-visa/engine');

const cfg = {
  version: 'test',
  limits: { txtMax: 100, lngMax: 500, groupMax: 5 },
  parts: [{ id: '1', title: 'P' }],
  sections: ['A', 'B', 'C', 'D'].map((id) => ({ id, part: '1', title: id })),
  groups: [{ id: 'items', section: 'B', entryLabel: 'Item', gate: 'q2_3', max: 3, questions: ['q2_4', 'q2_5'] }],
  questions: [
    { id: 'q1_1', number: '1.1', section: 'A', label: 'Partner?', type: 'YN', required: true },
    { id: 'q1_2', number: '1.2', section: 'A', label: 'Leave date', type: 'DATE', required: true },
    { id: 'q2_1', number: '2.1', section: 'B', label: 'Partner name', type: 'TXT', required: true, showWhen: { q: 'q1_1', eq: true } },
    { id: 'q2_2', number: '2.2', section: 'B', label: 'Secret', type: 'TXT', required: true, sensitive: true },
    { id: 'q2_3', number: '2.3', section: 'B', label: 'Items?', type: 'YN', required: true },
    { id: 'q2_4', number: '2.4', section: 'B', label: 'Item secret', type: 'TXT', required: true, group: 'items', sensitive: true },
    { id: 'q2_5', number: '2.5', section: 'B', label: 'Item note', type: 'TXT', required: true, group: 'items' },
    { id: 'q3_1', number: '3.1', section: 'C', label: 'Expiry', type: 'DATE', required: true, rules: { after: 'q1_2' } },
    { id: 'q4_1', number: '4.1', section: 'D', label: 'Why not?', type: 'TXT', required: true, showWhen: { q: 'q1_1', eq: false } },
  ],
};

let mongod;
let service;
let repository;
let counter = 0;

before(async () => {
  assert.deepEqual(engine.validateConfig(cfg), [], 'the synthetic config is valid');
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await TouristVisaApplication.init();
  repository = new TouristVisaApplicationRepository({ config: cfg });
  service = new TouristVisaApplicationService({ repository, config: cfg });
}, { timeout: 120000 });

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

async function startApplication() {
  counter += 1;
  const user = await User.create({ name: `Test Review ${counter}`, email: `test.review.${counter}@example.com`, password: 'not-a-real-password' });
  const { application } = await service.createOrGetDraft(user._id);
  return { userId: user._id, appId: application.id };
}
const save = (userId, section, answers) => service.saveSection(userId, section, { answers });
const raw = (appId) => TouristVisaApplication.collection.findOne({ _id: new mongoose.Types.ObjectId(appId) });

const A_YES = { q1_1: true, q1_2: '2027-03-15' };
const B_FULL = { q2_1: 'Test Partner', q2_2: 'SECRET-B-1111', q2_3: true, items: [{ q2_4: 'SECRET-ITEM-2222', q2_5: 'note' }] };

async function fullyFilled() {
  const ctx = await startApplication();
  for (const [section, answers] of [['A', A_YES], ['B', B_FULL], ['C', { q3_1: '2028-01-01' }], ['D', {}]]) {
    const r = await save(ctx.userId, section, answers);
    assert.equal(r.saved, true, `${section}: ${JSON.stringify(r)}`);
  }
  return ctx;
}

test('filling every section saves each one and ends on the last section', async () => {
  const { userId, appId } = await startApplication();
  const stage = async (section, answers) => (await save(userId, section, answers)).application;

  assert.equal((await stage('A', A_YES)).currentSection, 'B');
  assert.equal((await stage('B', B_FULL)).currentSection, 'C');
  assert.equal((await stage('C', { q3_1: '2028-01-01' })).currentSection, 'D');
  const done = await stage('D', {}); // 4.1 is hidden while 1.1 is Yes
  assert.equal(done.currentSection, 'D');
  assert.deepEqual(done.sectionStatus, { A: 'saved', B: 'saved', C: 'saved', D: 'saved' });
  assert.equal((await raw(appId)).status, 'draft');
});

test('changing an answer that hides another section\'s question removes it and flags that section', async () => {
  const { userId, appId } = await fullyFilled();

  // 1.1 becomes No: 2.1 (section B) is hidden; 4.1 (section D) is shown and required.
  const r = await save(userId, 'A', { q1_1: false, q1_2: '2027-03-15' });
  assert.equal(r.saved, true, JSON.stringify(r));
  assert.deepEqual(r.needsReview.sort(), ['B', 'D']);
  assert.deepEqual(r.removed, ['q2_1']);

  const stored = await raw(appId);
  assert.equal('q2_1' in stored.answers, false, 'the hidden answer is gone');
  assert.equal(stored.answers.q3_1, '2028-01-01', 'unaffected sections keep their answers');
  assert.deepEqual(stored.sectionStatus, { A: 'saved', B: 'needs_review', C: 'saved', D: 'needs_review' });
  assert.equal(stored.currentSection, 'B', 'the applicant resumes at the first section needing attention');
  assert.deepEqual(r.application.sectionStatus, stored.sectionStatus);
});

test('re-saving a flagged section clears its flag; sections that were not saved are never flagged', async () => {
  const { userId, appId } = await startApplication();
  await save(userId, 'A', A_YES);
  await save(userId, 'C', { q3_1: '2028-01-01' }); // B and D never saved

  const r = await save(userId, 'A', { q1_1: false, q1_2: '2027-03-15' });
  assert.deepEqual(r.needsReview, [], 'B and D were never saved, so there is nothing to review');
  assert.deepEqual((await raw(appId)).sectionStatus, { A: 'saved', C: 'saved' });

  const { userId: u2, appId: id2 } = await fullyFilled();
  await save(u2, 'A', { q1_1: false, q1_2: '2027-03-15' });
  const fixB = await save(u2, 'B', { q2_2: 'SECRET-B-1111', q2_3: false });
  assert.equal(fixB.saved, true, JSON.stringify(fixB));
  assert.deepEqual((await raw(id2)).sectionStatus, { A: 'saved', B: 'saved', C: 'saved', D: 'needs_review' });
  assert.equal((await raw(id2)).currentSection, 'D');
  assert.equal('items' in (await raw(id2)).answers, false, 'turning the gate off removed the group entries');
});

test('a cross-section rule that no longer holds flags the other section', async () => {
  const { userId, appId } = await fullyFilled();

  // 3.1 (section C) must be after 1.2 (section A). Moving 1.2 past it breaks section C.
  const r = await save(userId, 'A', { q1_1: true, q1_2: '2029-01-01' });
  assert.equal(r.saved, true);
  assert.deepEqual(r.needsReview, ['C']);
  assert.deepEqual((await raw(appId)).sectionStatus, { A: 'saved', B: 'saved', C: 'needs_review', D: 'saved' });

  // Moving it back within range flags nothing new.
  const back = await save(userId, 'A', { q1_1: true, q1_2: '2027-03-15' });
  assert.deepEqual(back.needsReview, []);
});

test('saving a section again without changing what other sections depend on flags nothing', async () => {
  const { userId } = await fullyFilled();
  const r = await save(userId, 'A', { ...A_YES });
  assert.deepEqual(r.needsReview, []);
  assert.deepEqual(r.removed, []);
});

test('a section that fails validation changes nothing, including other sections\' flags', async () => {
  const { userId, appId } = await fullyFilled();
  const before = await raw(appId);
  const r = await save(userId, 'A', { q1_1: false }); // missing 1.2
  assert.equal(r.saved, false);
  assert.equal(r.status, 422);
  assert.deepEqual(await raw(appId), before);
});

test('sensitive answers are encrypted at the top level and inside repeating-group entries', async () => {
  const { userId, appId } = await fullyFilled();
  const stored = await raw(appId);

  assert.match(stored.answers.q2_2, /^enc:v1:/);
  assert.match(stored.answers.items[0].q2_4, /^enc:v1:/);
  assert.equal(stored.answers.items[0].q2_5, 'note', 'non-sensitive members stay readable');
  assert.equal(/SECRET-/.test(JSON.stringify(stored)), false);

  const read = await service.getMine(userId);
  assert.equal(read.answers.q2_2, 'SECRET-B-1111');
  assert.deepEqual(read.answers.items, [{ q2_4: 'SECRET-ITEM-2222', q2_5: 'note' }]);
});

test('a group member\'s ciphertext cannot be moved to another entry', async () => {
  const { userId, appId } = await startApplication();
  const two = [{ q2_4: 'SECRET-ONE-1111', q2_5: 'a' }, { q2_4: 'SECRET-TWO-2222', q2_5: 'b' }];
  await save(userId, 'B', { q2_2: 'SECRET-B-1111', q2_3: true, items: two });

  const stored = await raw(appId);
  const swapped = [
    { ...stored.answers.items[0], q2_4: stored.answers.items[1].q2_4 },
    { ...stored.answers.items[1], q2_4: stored.answers.items[0].q2_4 },
  ];
  await TouristVisaApplication.collection.updateOne({ _id: stored._id }, { $set: { 'answers.items': swapped } });
  await assert.rejects(() => service.getMine(userId), (e) => e.statusCode === 500 && !/SECRET/.test(e.message));
});
