'use strict';

// Drift check: the copies in client/ and backend/ must match shared/tourist-visa/.
// If this fails, run `npm run sync:shared` from the repo root.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { sync, check, FILES, TARGETS, SOURCE } = require('../../scripts/sync-shared');

test('the committed client and backend copies match the canonical files', () => {
  assert.deepEqual(check(), []);
});

test('the backend copy loads and is valid on its own', () => {
  const copy = require(path.join(TARGETS[1], 'engine.js'));
  assert.deepEqual(copy.validateConfig(copy.config), []);
});

test('sync/check behave on a scratch folder: copy, detect drift, ignore line endings', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-sync-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const targets = [path.join(tmp, 'a'), path.join(tmp, 'b')];
  const opts = { source: SOURCE, targets };

  assert.ok(check(opts).length > 0, 'missing targets are reported');

  sync(opts);
  assert.deepEqual(check(opts), []);

  // CRLF checkout of a copy is not drift.
  const engineCopy = path.join(targets[0], 'engine.js');
  fs.writeFileSync(engineCopy, fs.readFileSync(engineCopy, 'utf8').replace(/\n/g, '\r\n'));
  assert.deepEqual(check(opts), []);

  // A real edit is drift.
  fs.appendFileSync(path.join(targets[1], 'questions.json'), ' ');
  fs.appendFileSync(path.join(targets[1], 'engine.d.ts'), '// edited\n');
  const problems = check(opts);
  assert.equal(problems.length, 2, JSON.stringify(problems));
  assert.ok(problems.some((p) => p.includes('questions.json')));

  // Re-running the sync repairs it.
  sync(opts);
  assert.deepEqual(check(opts), []);

  // Missing and extra files are reported.
  fs.rmSync(path.join(targets[0], FILES[1]));
  fs.writeFileSync(path.join(targets[0], 'stray.js'), '');
  const more = check(opts);
  assert.ok(more.some((p) => p.includes(`${FILES[1]}: missing`)));
  assert.ok(more.some((p) => p.includes('stray.js')));
});
