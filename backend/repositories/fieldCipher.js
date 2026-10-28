/**
 * Field cipher: AES-256-GCM for individual answers.
 *
 * A value is JSON-encoded, encrypted with a fresh random 12-byte IV, and stored
 * as one string: "enc:v1:<iv>.<tag>.<ciphertext>" (each part base64). The
 * additional authenticated data (AAD) names the application and the question,
 * so a ciphertext copied to another field or another application fails to
 * decrypt instead of being accepted.
 *
 * Pure functions: the key comes from the caller (config/fieldEncryption.js).
 * Errors never include the value, the ciphertext or the key.
 */

const crypto = require('crypto');

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

class FieldCipherError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FieldCipherError';
  }
}

function isEncrypted(stored) {
  return typeof stored === 'string' && stored.startsWith(PREFIX);
}

function encrypt(key, value, aad) {
  if (value === undefined) throw new FieldCipherError('Cannot encrypt an undefined value');
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ciphertext].map((b) => b.toString('base64')).join('.');
}

function decrypt(key, stored, aad) {
  if (!isEncrypted(stored)) throw new FieldCipherError('Stored value is not encrypted');
  const parts = stored.slice(PREFIX.length).split('.');
  if (parts.length !== 3) throw new FieldCipherError('Stored value is malformed');
  try {
    const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'));
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('bad lengths');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch {
    // Deliberately generic: the underlying message must not reach logs.
    throw new FieldCipherError('Stored value could not be decrypted');
  }
}

module.exports = { encrypt, decrypt, isEncrypted, FieldCipherError, PREFIX };
