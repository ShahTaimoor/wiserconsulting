'use strict';

// Step 8j-2: the validation middleware replaces req.body with the CLEANED result of the schema. It used to check the request and then
// throw the result away, so the raw body (extra fields, untrimmed text) went on to the controller.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const validate = require('../middleware/validate');

/** Runs the middleware on a fake request; resolves { req, error, calledNext }. */
function run(schema, req) {
  return new Promise((resolve) => {
    let error;
    let calledNext = false;
    validate(schema)(req, {}, (e) => {
      calledNext = true;
      error = e;
      resolve({ req, error, calledNext });
    });
  });
}

const looseSchema = z.object({ body: z.object({ name: z.string().trim(), email: z.string().email().toLowerCase() }) });
const strictSchema = z.object({ body: z.strictObject({ name: z.string().trim() }) });

test('the cleaned body replaces req.body: unknown keys are gone, text is trimmed and lower-cased as the schema says', async () => {
  const { req, error } = await run(looseSchema, { body: { name: '  Ann  ', email: ' ANN@Example.COM '.trim(), role: 1, isDeleted: true }, params: {}, query: {} });
  assert.equal(error, undefined);
  assert.deepEqual(req.body, { name: 'Ann', email: 'ann@example.com' });
  assert.equal('role' in req.body, false);
});

test('a transform of the schema reaches the controller (a number read from text, a flag read from "true")', async () => {
  const schema = z.object({ body: z.object({ rating: z.coerce.number().int(), active: z.enum(['true', 'false']).transform((v) => v === 'true') }) });
  const { req } = await run(schema, { body: { rating: '4', active: 'true', extra: 'x' }, params: {}, query: {} });
  assert.deepEqual(req.body, { rating: 4, active: true });
});

test('a strict schema refuses an unknown key and leaves req.body as it was', async () => {
  const original = { name: 'Ann', role: 1 };
  const { req, error } = await run(strictSchema, { body: original, params: {}, query: {} });
  assert.equal(error.name, 'ZodError');
  assert.match(error.issues[0].message, /Unrecognized key/);
  assert.equal(req.body, original);
});

test('an invalid body is passed to next as the error and req.body is not replaced', async () => {
  const original = { name: 5, email: 'nope' };
  const { req, error } = await run(looseSchema, { body: original, params: {}, query: {} });
  assert.equal(error.name, 'ZodError');
  assert.equal(req.body, original);
});

test('a schema that describes no body (only params) leaves req.body alone', async () => {
  const schema = z.object({ params: z.object({ id: z.string().min(1) }) });
  const original = { anything: 'goes', here: 1 };
  const { req, error } = await run(schema, { body: original, params: { id: 'a' }, query: {} });
  assert.equal(error, undefined);
  assert.equal(req.body, original);
});

test('params and the query are checked but not replaced', async () => {
  const schema = z.object({ params: z.object({ id: z.string().trim() }), body: z.object({}) });
  const params = { id: '  a  ' };
  const query = { x: '1' };
  const { req } = await run(schema, { body: {}, params, query });
  assert.equal(req.params, params);
  assert.equal(req.query, query);
  assert.deepEqual(req.params, { id: '  a  ' });
});

test('a body made by multer (an object with no prototype) is cleaned into an ordinary object', async () => {
  const raw = Object.create(null);
  raw.name = ' Ann ';
  raw.role = '1';
  const { req } = await run(z.object({ body: z.object({ name: z.string().trim() }) }), { body: raw, params: {}, query: {} });
  assert.deepEqual(req.body, { name: 'Ann' });
});

test('a missing body is an error, never a crash, and never replaced with something else', async () => {
  const { req, error } = await run(looseSchema, { params: {}, query: {} });
  assert.equal(error.name, 'ZodError');
  assert.equal(req.body, undefined);
});
