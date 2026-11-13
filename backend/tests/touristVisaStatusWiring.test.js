'use strict';

// Boots the REAL backend/index.js once for each value of TOURIST_VISA_ENABLED and checks GET /api/tourist-visa/status:
// { open: true } only for exactly "true", { open: false } for unset, empty, false, TRUE, 1 and everything else; that it
// goes through the general rate limiter (its headers are there), needs no sign-in and logs nothing; and that it is the
// only exception: with the switch off every other request under the prefix, status look-alikes included, still gets the
// fixed 404 FEATURE_CLOSED, and with it on they behave as before. The children run in a scratch working directory, so the
// developer's real .env is not loaded.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { MongoMemoryServer } = require('mongodb-memory-server');

const ORIGIN = 'http://localhost:3000';
const MARKER = 'MARKER-STATUS-WIRING-NOT-LOGGED-7373';
const CLOSED_BODY = { success: false, code: 'FEATURE_CLOSED', message: 'The Tourist Visa application is not open.' };

let mongod;
before(async () => { mongod = await MongoMemoryServer.create(); }, { timeout: 120000 });
after(async () => { if (mongod) await mongod.stop(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.once('error', reject);
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
});

/** Starts the real backend with TOURIST_VISA_ENABLED set to `value` (not set at all for undefined). */
async function startBackend(value) {
  const port = await freePort();
  const env = { ...process.env };
  delete env.TOURIST_VISA_ENABLED;
  delete env.FIELD_ENCRYPTION_KEY;
  if (value !== undefined) env.TOURIST_VISA_ENABLED = value;
  if (value === 'true') env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  const state = { output: '', exit: null };
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    cwd: os.tmpdir(),
    env: { ...env, MONGODB_URI: mongod.getUri(), PORT: String(port), JWT_SECRET: 'test-only-jwt-secret', FRONTEND_URL: ORIGIN, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { state.output += d; });
  child.stderr.on('data', (d) => { state.output += d; });
  child.on('exit', (code) => { state.exit = code; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i += 1) {
    if (state.exit !== null) throw new Error(`backend exited early (${state.exit}):\n${state.output}`);
    try { if ((await fetch(`${base}/`)).ok) break; } catch { /* not listening yet */ }
    await sleep(200);
  }
  await sleep(200);
  const stop = async () => {
    if (state.exit === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await Promise.race([exited, sleep(5000)]);
    }
  };
  return { base, state, stop, startedWith: state.output };
}

const call = async (base, method, p, { headers = {}, body } = {}) => {
  const res = await fetch(`${base}/api/tourist-visa${p}`, { method, headers: { Origin: ORIGIN, ...headers }, body });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
};

const CASES = [
  [undefined, false], ['', false], ['false', false], ['FALSE', false], ['TRUE', false], ['True', false], ['1', false], ['yes', false], ['on', false],
  [' true', false], ['true ', false], ['enabled', false], ['0', false], ['true', true],
];

for (const [value, expectedOpen] of CASES) {
  const label = value === undefined ? 'unset' : JSON.stringify(value);
  test(`real index.js, switch ${label}: the status is { open: ${expectedOpen} }, behind the rate limiter, and nothing else under the prefix changed`, async () => {
    const backend = await startBackend(value);
    try {
      const before = backend.state.output;
      const status = await call(backend.base, 'GET', `/status?probe=${MARKER}`, { headers: { 'X-Probe': MARKER, Authorization: `Bearer ${MARKER}` } });
      assert.equal(status.status, 200);
      assert.equal(status.text, JSON.stringify({ open: expectedOpen }));
      assert.equal(status.headers.get('cache-control'), 'public, max-age=60');
      assert.equal(status.headers.get('access-control-allow-origin'), ORIGIN, 'a browser on the allowed origin can read it');
      assert.ok(status.headers.get('ratelimit-limit') || status.headers.get('x-ratelimit-limit'), 'the general rate limiter ran before it');
      assert.ok(status.headers.get('x-content-type-options'), 'and so did the security headers');
      assert.equal(status.headers.get('set-cookie'), null, 'no session is started');

      // the CORS preflight for the status call works too
      const preflight = await fetch(`${backend.base}/api/tourist-visa/status`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET' } });
      assert.ok(preflight.status === 204 || preflight.status === 200);

      // nothing else is an exception
      const others = [
        ['POST', '/status'], ['PUT', '/status'], ['DELETE', '/status'], ['GET', '/status/'], ['GET', '/status/x'], ['GET', '/statusx'], ['GET', '/Status'],
        ['GET', '/applications/me'], ['POST', '/applications'], ['GET', '/admin/applications'], ['GET', ''], ['GET', '/other'],
      ];
      for (const [method, p] of others) {
        const res = await call(backend.base, method, p, { headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
        if (!expectedOpen) {
          assert.equal(res.status, 404, `${method} ${p}`);
          assert.deepEqual(res.json, CLOSED_BODY, `${method} ${p}`);
          // answered by the first gate: before the security headers, the rate limiter and the parsers
          assert.equal(res.headers.get('ratelimit-limit') || res.headers.get('x-ratelimit-limit'), null, `${method} ${p}: it reached the rate limiter`);
          assert.equal(res.headers.get('x-content-type-options'), null, `${method} ${p}: it reached the security headers`);
        } else {
          assert.notDeepEqual(res.json, { open: true }, `${method} ${p}`);
          assert.ok([401, 404].includes(res.status), `${method} ${p}: ${res.status}`);
        }
      }
      if (expectedOpen) {
        assert.equal((await call(backend.base, 'GET', '/applications/me')).status, 401, 'an open API still wants a sign-in');
      }

      // the status request, and the requests above, left nothing in the log
      const log = backend.state.output.slice(before.length);
      assert.equal(log.includes(MARKER), false, 'no probe reached the log');
      assert.equal(/status/i.test(log), false, `the log says nothing about the status request: ${log.slice(0, 300)}`);
    } finally {
      await backend.stop();
    }
  });
}
