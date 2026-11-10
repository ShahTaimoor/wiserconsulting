'use strict';

// A malformed request body must not put answer text into the response or into any log line.

process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const { errorHandler } = require('../middleware/errorHandler');
const captureOutput = require('./helpers/captureOutput');

const SECRET = 'SECRET-ANSWER-TEXT-4242';
let guarded; // mounted the way backend/index.js does it
let unguarded; // only the global parser, as before this step
let guardedUrl;
let unguardedUrl;

const listen = (app) => new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});

before(async () => {
  const echo = (req, res) => res.json({ body: req.body === undefined ? null : req.body });

  const a = express();
  a.use('/api/tourist-visa', touristVisaBodyParser);
  a.use(express.json());
  a.use(express.urlencoded({ extended: true }));
  a.all('/api/tourist-visa/echo', echo);
  a.use(errorHandler);
  guarded = await listen(a);
  guardedUrl = `http://127.0.0.1:${guarded.address().port}/api/tourist-visa/echo`;

  const b = express();
  b.use(express.json());
  b.all('/api/tourist-visa/echo', echo);
  b.use(errorHandler);
  unguarded = await listen(b);
  unguardedUrl = `http://127.0.0.1:${unguarded.address().port}/api/tourist-visa/echo`;
});

after(async () => {
  await Promise.all([guarded, unguarded].map((s) => new Promise((resolve) => s.close(resolve))));
});

async function send(url, { method = 'PUT', headers = { 'Content-Type': 'application/json' }, body } = {}) {
  const output = captureOutput();
  try {
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    return { status: res.status, text, logs: output.text() };
  } finally {
    output.restore();
  }
}

const MALFORMED = [
  `{"answers":{"q1_5":"${SECRET}", "q1_6": }}`,
  `{"answers":{"q1_5":"${SECRET}"`,
  `{answers: "${SECRET}"}`,
  `"${SECRET}"`,
  `${SECRET}`,
  `{"answers":{"q1_5":'${SECRET}'}}`,
];

test('control: with only the global parser, a malformed body does leak its text into the logs', async () => {
  const leaks = [];
  for (const body of MALFORMED) {
    const r = await send(unguardedUrl, { body });
    assert.equal(r.status, 400);
    if (r.logs.includes(SECRET) || r.text.includes(SECRET)) leaks.push(body);
  }
  assert.ok(leaks.length > 0, 'this test would not catch the leak if no malformed body leaked here');
});

test('with the Tourist Visa parser, a malformed body leaks nothing to the response or the logs', async () => {
  for (const body of MALFORMED) {
    const r = await send(guardedUrl, { body });
    assert.equal(r.status, 400, body);
    assert.equal(JSON.parse(r.text).message, 'The request body is not valid JSON.', body);
    assert.equal(r.text.includes(SECRET), false, `response for ${body}`);
    assert.equal(r.logs.includes(SECRET), false, `logs for ${body}:\n${r.logs}`);
    assert.match(r.logs, /Tourist Visa request body rejected/);
    assert.match(r.logs, /entity\.parse\.failed/);
  }
});

test('the log line carries only the type, status and route', async () => {
  const r = await send(`${guardedUrl}?x=1`, { body: `{"a": "${SECRET}", ` });
  assert.match(r.logs, /route: 'PUT \/api\/tourist-visa\/echo'/);
  assert.equal(r.logs.includes('x=1'), false, 'the query string is not logged');
  assert.equal(r.logs.includes('SyntaxError'), false);
});

test('oversized bodies get a fixed 413 and no content in logs', async () => {
  const r = await send(guardedUrl, { body: JSON.stringify({ answers: { q1_5: `${SECRET}${'x'.repeat(300 * 1024)}` } }) });
  assert.equal(r.status, 413);
  assert.equal(r.text.includes(SECRET), false);
  assert.equal(r.logs.includes(SECRET), false);
});

test('bodies that are not JSON are refused, so the global parsers never see them', async () => {
  for (const headers of [{ 'Content-Type': 'application/x-www-form-urlencoded' }, { 'Content-Type': 'text/plain' }, {}]) {
    const r = await send(guardedUrl, { headers, body: `q1_5=${SECRET}` });
    assert.equal(r.status, 415, JSON.stringify(headers));
    assert.equal(r.text.includes(SECRET), false);
    assert.equal(r.logs.includes(SECRET), false);
  }
  const charset = await send(guardedUrl, { headers: { 'Content-Type': 'application/json; charset=iso-8859-1' }, body: `{"a":"${SECRET}"}` });
  assert.equal(charset.status, 415);
  assert.equal(charset.logs.includes(SECRET), false);
});

test('valid JSON and requests without a body pass through unchanged', async () => {
  const ok = await send(guardedUrl, { body: JSON.stringify({ answers: { q1_5: 'Text with <b> and 2 < 3' } }) });
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(ok.text).body, { answers: { q1_5: 'Text with <b> and 2 < 3' } });

  for (const method of ['GET', 'POST', 'PUT']) {
    const r = await send(guardedUrl, { method, headers: {} });
    assert.equal(r.status, 200, method);
    assert.equal(JSON.parse(r.text).body, null, method);
  }
});

test('paths outside /api/tourist-visa keep the existing behaviour', async () => {
  const other = `http://127.0.0.1:${guarded.address().port}/elsewhere`;
  const r = await send(other, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
  assert.equal(r.status, 404); // reaches the router (no such route), not refused with 415
});
