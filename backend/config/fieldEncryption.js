/**
 * Field encryption key handling (FIELD_ENCRYPTION_KEY).
 *
 * Reads and validates the key used to encrypt sensitive Tourist Visa answers
 * at rest. The encryption helper itself is added with the save-section step;
 * this module only answers "is the key usable" and hands the key over.
 *
 * The key is 32 bytes, given as base64 (44 characters) or hex (64 characters).
 * Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Nothing in here ever puts the key, or part of it, in a message or a log.
 */

const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const KEY_BYTES = 32;

/** Returns { key: Buffer } when usable, otherwise { problem: 'missing' | 'invalid' }. */
function readFieldEncryptionKey() {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (typeof raw !== 'string' || raw.trim() === '') return { problem: 'missing' };

  const value = raw.trim();
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(value)) key = Buffer.from(value, 'hex');
  else if (/^[A-Za-z0-9+/]+={0,2}$/.test(value)) key = Buffer.from(value, 'base64');

  if (!key || key.length !== KEY_BYTES) return { problem: 'invalid' };
  return { key };
}

function isFieldEncryptionConfigured() {
  return readFieldEncryptionKey().key !== undefined;
}

/**
 * The key, for the encryption helper. Fails closed: callers must not store
 * sensitive answers when this throws.
 */
function getFieldEncryptionKey() {
  const { key, problem } = readFieldEncryptionKey();
  if (!key) {
    throw new AppError(
      problem === 'missing'
        ? 'Secure storage is not configured (FIELD_ENCRYPTION_KEY is missing).'
        : 'Secure storage is not configured (FIELD_ENCRYPTION_KEY is not a 32-byte base64 or hex value).',
      503
    );
  }
  return key;
}

/** Logs once at startup so a missing or malformed key is noticed before the first save fails. */
function warnIfFieldEncryptionNotConfigured() {
  const { problem } = readFieldEncryptionKey();
  if (problem === 'missing') {
    logger.error('FIELD_ENCRYPTION_KEY is not set. Tourist Visa answers cannot be saved until it is.');
  } else if (problem === 'invalid') {
    logger.error('FIELD_ENCRYPTION_KEY is not a 32-byte base64 or hex value. Tourist Visa answers cannot be saved until it is fixed.');
  }
}

module.exports = {
  isFieldEncryptionConfigured,
  getFieldEncryptionKey,
  warnIfFieldEncryptionNotConfigured,
  KEY_BYTES,
};
