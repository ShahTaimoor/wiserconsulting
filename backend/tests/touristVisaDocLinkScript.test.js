'use strict';

// Tests for backend/scripts/tourist-visa-doc-link.js, the developer tool that prints a 2-minute link.
// No database, no storage and no network: the tool is run with everything it touches passed in, and once as a
// child process with no confirmation to see the real refusal. The child never gets past the refusal, so it does
// not read backend/.env.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const { run, CONFIRM_FLAG, CONFIRM_ENV } = require('../scripts/tourist-visa-doc-link');
const { TouristVisaDocumentService } = require('../services/touristVisaDocumentService');
const { AppError } = require('../middleware/errorHandler');

const APP_ID = '0123456789abcdef01234567';
const DOC_ID = '3f2c1a9e-5b7d-4c1e-9a30-1d2e3f4a5b6c';
const SECRET = 'test-only-api-secret-value';
const MONGO = 'mongodb://test-user:test-only-password@localhost:27017/test-db';
const ENV = {
  MONGODB_URI: MONGO,
  CLOUDINARY_CLOUD_NAME: 'test-cloud',
  CLOUDINARY_API_KEY: '123456789012345',
  CLOUDINARY_API_SECRET: SECRET,
};
const NOW = new Date('2026-11-01T10:00:00.000Z');

function harness({ env = ENV, service, argv = [APP_ID, DOC_ID, CONFIRM_FLAG] } = {}) {
  const log = { out: [], err: [], calls: [] };
  const deps = {
    argv,
    env,
    out: (line) => log.out.push(line),
    err: (line) => log.err.push(line),
    service: service || {
      getTemporaryLink: async (applicationId, docId) => {
        log.calls.push(['link', applicationId, docId]);
        return { url: 'https://api.example.invalid/download?signature=abc', expiresAt: new Date(NOW.getTime() + 120000) };
      },
    },
    connect: async () => log.calls.push(['connect']),
    disconnect: async () => log.calls.push(['disconnect']),
    loadEnv: () => log.calls.push(['loadEnv']),
  };
  return { log, deps };
}

test('it prints the two ids, the expiry and the link, and connects before asking and disconnects after', async () => {
  const { log, deps } = harness();
  assert.equal(await run(deps), 0);
  assert.deepEqual(log.calls, [['loadEnv'], ['connect'], ['link', APP_ID, DOC_ID], ['disconnect']]);
  const text = log.out.join('\n');
  assert.match(text, new RegExp(`Application: ${APP_ID}`));
  assert.match(text, new RegExp(`Document:    ${DOC_ID}`));
  assert.match(text, /Expires:     2026-11-01T10:02:00.000Z/);
  assert.match(text, /^https:\/\/api\.example\.invalid\/download\?signature=abc$/m);
});

test('it refuses to run without the confirmation, touches nothing, and prints nothing to the output', async () => {
  const { log, deps } = harness({ argv: [APP_ID, DOC_ID] });
  assert.equal(await run(deps), 2);
  assert.deepEqual(log.calls, [], 'no settings read, no connection, no link');
  assert.deepEqual(log.out, []);
  assert.match(log.err.join('\n'), /Refusing to run/);
  assert.match(log.err.join('\n'), /--confirm/);
});

test('the confirmation can also be given with the environment variable, but only as exactly "yes"', async () => {
  const yes = harness({ argv: [APP_ID, DOC_ID], env: { ...ENV, [CONFIRM_ENV]: 'yes' } });
  assert.equal(await run(yes.deps), 0);
  for (const value of ['', 'true', 'YES', '1', 'no']) {
    const other = harness({ argv: [APP_ID, DOC_ID], env: { ...ENV, [CONFIRM_ENV]: value } });
    assert.equal(await run(other.deps), 2, `"${value}"`);
    assert.deepEqual(other.log.calls, []);
  }
});

test('wrong use is refused: missing or extra arguments, an unknown option, ids that are not ids', async () => {
  for (const argv of [[], [APP_ID], [APP_ID, DOC_ID, 'extra', CONFIRM_FLAG], [APP_ID, DOC_ID, CONFIRM_FLAG, '--force'], ['--confirm']]) {
    const { log, deps } = harness({ argv });
    assert.equal(await run(deps), 2, JSON.stringify(argv));
    assert.deepEqual(log.calls, []);
    assert.deepEqual(log.out, []);
  }
  for (const argv of [['not-an-id', DOC_ID, CONFIRM_FLAG], [APP_ID, 'not-a-uuid', CONFIRM_FLAG], [`${APP_ID}0`, DOC_ID, CONFIRM_FLAG], [APP_ID, `${DOC_ID}x`, CONFIRM_FLAG], ['$ne', '{}', CONFIRM_FLAG]]) {
    const { log, deps } = harness({ argv });
    assert.equal(await run(deps), 2, JSON.stringify(argv));
    assert.deepEqual(log.calls, [], 'a bad id never reaches the database');
  }
});

test('missing settings are named, never shown, and nothing is connected', async () => {
  const { log, deps } = harness({ env: { MONGODB_URI: MONGO, CLOUDINARY_CLOUD_NAME: 'test-cloud' } });
  assert.equal(await run(deps), 1);
  assert.deepEqual(log.calls, [['loadEnv']]);
  const text = log.err.join('\n');
  assert.match(text, /CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET/);
  assert.equal(text.includes('test-cloud'), false);
  assert.equal(text.includes('test-only-password'), false);
});

test('it never prints a secret: a link that contains one is not printed, and no output holds a setting', async () => {
  const leaking = harness({ service: { getTemporaryLink: async () => ({ url: `https://x.invalid/?secret=${SECRET}`, expiresAt: NOW }) } });
  assert.equal(await run(leaking.deps), 1);
  assert.deepEqual(leaking.log.out, []);
  assert.match(leaking.log.err.join('\n'), /contains a secret/);

  const normal = harness();
  await run(normal.deps);
  const everything = [...normal.log.out, ...normal.log.err].join('\n');
  for (const value of [SECRET, MONGO, 'test-only-password', ENV.CLOUDINARY_API_KEY, 'test-cloud']) assert.equal(everything.includes(value), false, value);
});

test('a failure shows only its code or type, never its message', async () => {
  const withCode = harness({ service: { getTemporaryLink: async () => { throw new AppError('File not found.', 404, 'DOCUMENT_NOT_FOUND'); } } });
  assert.equal(await run(withCode.deps), 1);
  assert.match(withCode.log.err.join('\n'), /Could not make a link: DOCUMENT_NOT_FOUND/);
  assert.deepEqual(withCode.log.out, []);
  assert.ok(withCode.log.calls.some((c) => c[0] === 'disconnect'), 'it disconnects after a failure too');

  const odd = harness({ service: { getTemporaryLink: async () => { throw new Error(`could not reach ${MONGO}`); } } });
  assert.equal(await run(odd.deps), 1);
  const text = odd.log.err.join('\n');
  assert.match(text, /Could not make a link: Error/);
  assert.equal(text.includes('test-only-password'), false);
  assert.equal(text.includes('could not reach'), false);

  const connectFails = harness();
  connectFails.deps.connect = async () => { throw new Error(`bad uri ${MONGO}`); };
  assert.equal(await run(connectFails.deps), 1);
  assert.equal(connectFails.log.err.join('\n').includes('test-only-password'), false);
});

test('with the real service: the link it prints expires exactly 2 minutes after it was asked for', async () => {
  const requested = [];
  const service = new TouristVisaDocumentService({
    now: () => NOW,
    repository: {
      findDocumentContextById: async (id) => ({ _id: id, documents: [{ id: DOC_ID, slot: 'passport', publicId: 'tourist-visa/x/y.pdf', resourceType: 'raw' }] }),
    },
    storage: {
      isConfigured: () => true,
      temporaryUrl: (doc, expiresAt) => { requested.push(expiresAt); return `https://storage.invalid/download?expires=${expiresAt.getTime()}`; },
    },
  });
  const { log, deps } = harness({ service });
  assert.equal(await run(deps), 0);
  assert.equal(requested.length, 1);
  assert.equal(requested[0].getTime() - NOW.getTime(), 120 * 1000);
  assert.match(log.out.join('\n'), /Expires:     2026-11-01T10:02:00.000Z/);

  const other = harness({ service, argv: [APP_ID, '11111111-1111-1111-1111-111111111111', CONFIRM_FLAG] });
  assert.equal(await run(other.deps), 1, 'a document that is not there is a failure');
  assert.match(other.log.err.join('\n'), /DOCUMENT_NOT_FOUND/);
  assert.deepEqual(other.log.out, []);
});

test('as a command: without --confirm it refuses with exit code 2 and no output, before reading any settings', () => {
  const script = path.join(__dirname, '..', 'scripts', 'tourist-visa-doc-link.js');
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const result = spawnSync(process.execPath, [script, APP_ID, DOC_ID], { encoding: 'utf8', env });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Refusing to run/);
  const noArgs = spawnSync(process.execPath, [script], { encoding: 'utf8', env });
  assert.equal(noArgs.status, 2);
  assert.match(noArgs.stderr, /Usage:/);
});

test('requiring the script does nothing: it does not connect or read settings', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./scripts/tourist-visa-doc-link'); console.log('loaded')"], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'loaded');
});
