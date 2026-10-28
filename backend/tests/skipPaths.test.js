'use strict';

// The sanitizer must leave the Tourist Visa routes alone but still clean everything else.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const sanitize = require('../middleware/sanitize');
const skipPaths = require('../middleware/skipPaths');

let server;
let baseUrl;

before(async () => {
  // Same composition as backend/index.js
  const app = express();
  app.use(express.json());
  app.use(skipPaths(['/api/tourist-visa'], sanitize));
  app.use((req, res) => res.json({ body: req.body, query: req.query }));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const post = async (path, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
};

const TEXT = 'I will visit <b>Test</b> City if 2 < 3 and 5 > 4';

test('free text under /api/tourist-visa is left as typed', async () => {
  for (const path of ['/api/tourist-visa', '/api/tourist-visa/applications/me/sections/1', '/API/Tourist-Visa/applications']) {
    const { body } = await post(path, { q1_5: TEXT, nested: { list: [TEXT] } });
    assert.equal(body.q1_5, TEXT, path);
    assert.equal(body.nested.list[0], TEXT, path);
  }
});

test('query strings under /api/tourist-visa are also left alone', async () => {
  const res = await fetch(`${baseUrl}/api/tourist-visa/applications/me?x=${encodeURIComponent('<a>')}`);
  assert.equal((await res.json()).query.x, '<a>');
});

test('everything else is still sanitized', async () => {
  for (const path of ['/api/contacts', '/api/tourist-visa-other', '/api/tourist-visas/x', '/api', '/']) {
    const { body } = await post(path, { note: TEXT });
    assert.equal(body.note, 'I will visit bTest/b City if 2  3 and 5  4', path);
  }
});

test('skipPaths ignores a trailing slash in the prefix and passes the request on', async () => {
  let ran = 0;
  const mw = skipPaths(['/a/b/'], (req, res, next) => { ran += 1; next(); });
  await new Promise((resolve) => mw({ path: '/a/b/c' }, {}, resolve));
  assert.equal(ran, 0);
  await new Promise((resolve) => mw({ path: '/a/bc' }, {}, resolve));
  assert.equal(ran, 1);
});
