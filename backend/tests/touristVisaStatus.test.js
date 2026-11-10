'use strict';

// GET /api/tourist-visa/status: the one request under /api/tourist-visa that answers while the feature is closed. It
// reports only { open }, needs no sign-in, and is the ONLY exception: every other request, status look-alikes
// included, keeps getting the fixed closed answer before sign-in, body parsing and the database. In-process here, with
// the app wired the way backend/index.js wires it; the real index.js is booted in touristVisaStatusWiring.test.js.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
delete process.env.TOURIST_VISA_ENABLED;

const { test, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');

const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const touristVisaFeatureGate = require('../middleware/touristVisaFeatureGate');
const { errorHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const CLOSED_BODY = { success: false, code: 'FEATURE_CLOSED', message: 'The Tourist Visa application is not open.' };
const MARKER = 'MARKER-STATUS-NOT-ECHOED-5151';

const servers = [];
async function listen(app) {
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
after(async () => {
  for (const s of servers) await new Promise((resolve) => s.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

/** The order index.js uses: the gate that allows the status request, the parsers, a limiter stand-in, the status route, the router. */
function indexLikeApp() {
  const app = express();
  app.use('/api/tourist-visa', touristVisaFeatureGate.allowingStatus);
  app.use('/api/tourist-visa', touristVisaBodyParser);
  app.use(express.json());
  app.use('/api', (req, res, next) => { res.set('X-Test-Limiter', 'passed'); next(); }); // stands in for the general rate limiter
  app.get('/api/tourist-visa/status', touristVisaFeatureGate.touristVisaStatus);
  app.use('/api/tourist-visa', touristVisaRoutes);
  app.use(errorHandler);
  return app;
}

const send = async (base, method, path, { headers = {}, body } = {}) => {
  const res = await fetch(`${base}/api/tourist-visa${path}`, { method, headers, body });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
};

const CLOSED_VALUES = [undefined, '', 'false', 'FALSE', 'TRUE', 'True', '1', 'yes', 'on', ' true', 'true ', 'true\n', 'enabled', '0'];
const setSwitch = (value) => { if (value === undefined) delete process.env.TOURIST_VISA_ENABLED; else process.env.TOURIST_VISA_ENABLED = value; };

for (const value of CLOSED_VALUES) {
  test(`switch ${value === undefined ? 'unset' : JSON.stringify(value)}: the status answers 200 { open: false }, with nothing else in it`, async () => {
    setSwitch(value);
    const base = await listen(indexLikeApp());
    const res = await send(base, 'GET', '/status');
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { open: false });
    assert.equal(res.text, '{"open":false}');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=60');
    assert.equal(res.headers.get('set-cookie'), null, 'no session or cookie');
    assert.equal(res.headers.get('x-test-limiter'), 'passed', 'it went through the general rate limiter first');
  });
}

test('switch exactly "true": the status answers 200 { open: true }', async () => {
  setSwitch('true');
  const base = await listen(indexLikeApp());
  const res = await send(base, 'GET', '/status');
  assert.equal(res.status, 200);
  assert.equal(res.text, '{"open":true}');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=60');
  assert.equal(res.headers.get('x-test-limiter'), 'passed');
});

test('the answer follows the environment on every request, with no restart of the app', async () => {
  const base = await listen(indexLikeApp());
  setSwitch('true');
  assert.equal((await send(base, 'GET', '/status')).json.open, true);
  setSwitch('false');
  assert.equal((await send(base, 'GET', '/status')).json.open, false);
  setSwitch('true');
  assert.equal((await send(base, 'GET', '/status')).json.open, true);
});

test('the status needs no sign-in, ignores any token, header, query and body, and echoes nothing', async () => {
  for (const value of [undefined, 'true']) {
    setSwitch(value);
    const base = await listen(indexLikeApp());
    for (const options of [
      {},
      { headers: { Authorization: 'Bearer not-a-token' } },
      { headers: { Authorization: `Bearer ${MARKER}`, 'X-Probe': MARKER, Cookie: `x=${MARKER}` } },
    ]) {
      const res = await send(base, 'GET', `/status?probe=${MARKER}&open=true`, options);
      assert.equal(res.status, 200);
      assert.deepEqual(Object.keys(res.json), ['open']);
      assert.equal(res.text.includes(MARKER), false);
      assert.equal(typeof res.json.open, 'boolean');
    }
    assert.equal((await send(base, 'GET', '/status?open=true')).json.open, value === 'true', 'the query cannot open it');
  }
});

for (const value of [undefined, '', 'false', 'true']) {
  const label = value === undefined ? 'unset' : JSON.stringify(value);
  test(`switch ${label}: nothing else is an exception: look-alikes, other methods and every other route behave as they always did`, async () => {
    setSwitch(value);
    const open = value === 'true';
    const base = await listen(indexLikeApp());
    const lookAlikes = [
      ['POST', '/status'], ['PUT', '/status'], ['PATCH', '/status'], ['DELETE', '/status'], ['HEAD', '/status'],
      ['GET', '/status/'], ['GET', '/status/x'], ['GET', '/statusx'], ['GET', '/Status'], ['GET', '/STATUS'], ['GET', '/status/applications/me'], ['GET', '/x/status'],
      ['GET', '/'], ['GET', ''], ['GET', '/applications/me'], ['POST', '/applications'], ['GET', '/admin/applications'], ['GET', '/anything/else'],
    ];
    for (const [method, path] of lookAlikes) {
      const res = await send(base, method, path, { headers: { 'Content-Type': 'application/json' }, body: method === 'GET' || method === 'HEAD' ? undefined : '{}' });
      if (!open) {
        assert.equal(res.status, 404, `${method} ${path}`);
        if (method !== 'HEAD') assert.deepEqual(res.json, CLOSED_BODY, `${method} ${path}`);
        assert.equal(res.headers.get('cache-control'), 'no-store', `${method} ${path}`);
        // answered by the FIRST gate: before the rate limiter and the body parsers ever saw the request
        assert.equal(res.headers.get('x-test-limiter'), null, `${method} ${path}: it reached the limiter`);
      } else {
        // open: exactly what they did before the status route existed (sign-in or 404), never the status answer
        assert.ok([401, 404].includes(res.status), `${method} ${path}: ${res.status}`);
        assert.notDeepEqual(res.json, { open: true }, `${method} ${path}`);
      }
    }
  });
}

test('closed: the router on its own (the gate without the exception) is closed even for /status', async () => {
  setSwitch(undefined);
  const app = express();
  app.use('/api/tourist-visa', touristVisaRoutes);
  app.use(errorHandler);
  const base = await listen(app);
  const res = await send(base, 'GET', '/status');
  assert.equal(res.status, 404);
  assert.deepEqual(res.json, CLOSED_BODY);
  // and the strict gate function itself has no exception
  let answered = null;
  touristVisaFeatureGate({ method: 'GET', path: '/status' }, { set() {}, status(code) { answered = code; return { json() {} }; } }, () => { answered = 'next'; });
  assert.equal(answered, 404);
  let passed = null;
  touristVisaFeatureGate.allowingStatus({ method: 'GET', path: '/status' }, { set() {}, status(code) { passed = code; return { json() {} }; } }, () => { passed = 'next'; });
  assert.equal(passed, 'next', 'only the gate index.js mounts lets the status request on');
  passed = null;
  touristVisaFeatureGate.allowingStatus({ method: 'POST', path: '/status' }, { set() {}, status(code) { passed = code; return { json() {} }; } }, () => { passed = 'next'; });
  assert.equal(passed, 404, 'and only for GET');
});

test('the status touches no database and writes no log line, with no database connected at all', async () => {
  assert.equal(mongoose.connection.readyState, 0);
  const lines = [];
  const spies = ['info', 'warn', 'error', 'debug', 'log'].filter((m) => typeof logger[m] === 'function').map((m) => mock.method(logger, m, (...args) => { lines.push([m, ...args]); }));
  const consoleSpies = ['log', 'info', 'warn', 'error'].map((m) => mock.method(console, m, (...args) => { lines.push([m, ...args]); }));
  try {
    for (const value of [undefined, 'true']) {
      setSwitch(value);
      const base = await listen(indexLikeApp());
      assert.equal((await send(base, 'GET', `/status?probe=${MARKER}`, { headers: { 'X-Probe': MARKER } })).status, 200);
    }
  } finally {
    for (const s of [...spies, ...consoleSpies]) s.mock.restore();
  }
  assert.deepEqual(lines, []);
  assert.equal(mongoose.connection.readyState, 0);
});
