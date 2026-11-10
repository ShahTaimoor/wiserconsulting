'use strict';

// FIELD_ENCRYPTION_KEY handling. The keys below are throwaway test values.

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  isFieldEncryptionConfigured,
  getFieldEncryptionKey,
  KEY_BYTES,
} = require('../config/fieldEncryption');

const original = process.env.FIELD_ENCRYPTION_KEY;
beforeEach(() => { delete process.env.FIELD_ENCRYPTION_KEY; });
afterEach(() => {
  if (original === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
  else process.env.FIELD_ENCRYPTION_KEY = original;
});

const random = crypto.randomBytes(KEY_BYTES);

test('missing key: not configured, and getFieldEncryptionKey fails closed with a 503', () => {
  assert.equal(isFieldEncryptionConfigured(), false);
  assert.throws(() => getFieldEncryptionKey(), (e) => e.statusCode === 503 && /missing/.test(e.message));
  process.env.FIELD_ENCRYPTION_KEY = '   ';
  assert.equal(isFieldEncryptionConfigured(), false);
});

test('a 32-byte base64 key and a 64-character hex key are both accepted', () => {
  process.env.FIELD_ENCRYPTION_KEY = random.toString('base64');
  assert.equal(isFieldEncryptionConfigured(), true);
  assert.ok(getFieldEncryptionKey().equals(random));

  process.env.FIELD_ENCRYPTION_KEY = `  ${random.toString('hex')}  `;
  assert.ok(getFieldEncryptionKey().equals(random));
});

test('keys of the wrong length or format are rejected', () => {
  const bad = [
    crypto.randomBytes(16).toString('base64'),
    crypto.randomBytes(31).toString('hex'),
    crypto.randomBytes(48).toString('base64'),
    'short',
    'not base64 at all !!!',
  ];
  for (const value of bad) {
    process.env.FIELD_ENCRYPTION_KEY = value;
    assert.equal(isFieldEncryptionConfigured(), false, value);
    assert.throws(() => getFieldEncryptionKey(), (e) => e.statusCode === 503);
  }
});

test('error messages never contain any part of the key', () => {
  const value = crypto.randomBytes(16).toString('base64'); // wrong length on purpose
  process.env.FIELD_ENCRYPTION_KEY = value;
  try {
    getFieldEncryptionKey();
    assert.fail('should have thrown');
  } catch (e) {
    assert.equal(e.message.includes(value), false);
    assert.equal(e.message.includes(value.slice(0, 6)), false);
  }
});
