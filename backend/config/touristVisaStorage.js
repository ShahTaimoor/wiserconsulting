/**
 * Private file storage for Tourist Visa documents (Cloudflare R2, private bucket).
 *
 * Uses the R2 settings (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PRIVATE_BUCKET). The private bucket
 * has no public access and no custom domain: a file is reachable only through a signed, expiring download link
 * made here, never through a plain URL. Files are stored exactly as sent (a PDF is never processed).
 *
 * The service talks to this through three methods (upload, remove, temporaryUrl), so tests inject a fake with
 * the same shape and never reach the network. Nothing here puts a file name, a storage key or a credential in an
 * error message or a log line.
 */

const crypto = require('crypto');
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const r2 = require('./r2');
const { STORAGE } = require('./touristVisaDocuments');
const logger = require('../utils/logger');

const VARIABLES = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PRIVATE_BUCKET'];

const MIME_BY_EXTENSION = Object.freeze({ pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' });

/** Names (never values) of the variables that are missing or empty. */
function missingStorageVariables(env = process.env) {
  return VARIABLES.filter((name) => typeof env[name] !== 'string' || env[name].trim() === '');
}

class R2DocumentStorage {
  constructor({ client = null, signer = getSignedUrl, env = process.env } = {}) {
    this.client = client;
    this.signer = signer;
    this.env = env;
  }

  isConfigured() {
    return missingStorageVariables(this.env).length === 0;
  }

  getClient() {
    return this.client || r2.getClient(this.env);
  }

  /**
   * Stores a file. `extension` comes from the detected content, never from the original name.
   * Returns { publicId, resourceType, bytes } (publicId is the object key in the private bucket).
   */
  async upload(buffer, { applicationId, extension }) {
    // Random, and carrying no part of the original name.
    const key = `${STORAGE.rootFolder}/${applicationId}/${crypto.randomBytes(16).toString('hex')}.${extension}`;
    try {
      await this.getClient().send(
        new PutObjectCommand({
          Bucket: this.env.R2_PRIVATE_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: MIME_BY_EXTENSION[extension] || 'application/octet-stream',
        }),
      );
    } catch {
      throw new Error('storage upload failed');
    }
    return { publicId: key, resourceType: STORAGE.resourceType, bytes: buffer.length };
  }

  /** Deletes a file. A file that is already gone counts as deleted (S3 delete is idempotent). */
  async remove(publicId) {
    try {
      await this.getClient().send(new DeleteObjectCommand({ Bucket: this.env.R2_PRIVATE_BUCKET, Key: publicId }));
    } catch {
      throw new Error('storage delete failed');
    }
  }

  /**
   * A signed download link that stops working at `expiresAt` (a Date). The signature covers the expiry,
   * so changing it in the link makes the link invalid. Returns a promise of the URL.
   */
  async temporaryUrl({ publicId }, expiresAt) {
    const seconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    return this.signer(
      this.getClient(),
      new GetObjectCommand({ Bucket: this.env.R2_PRIVATE_BUCKET, Key: publicId }),
      { expiresIn: seconds },
    );
  }
}

/** Logs once at startup, with the names of what is missing (never a value), so a gap is noticed before the first upload fails. */
function warnIfDocumentStorageNotConfigured(env = process.env) {
  const missing = missingStorageVariables(env);
  if (missing.length) logger.error(`File storage is not configured (${missing.join(', ')} missing). Tourist Visa documents cannot be uploaded until it is.`);
}

module.exports = new R2DocumentStorage();
module.exports.R2DocumentStorage = R2DocumentStorage;
module.exports.missingStorageVariables = missingStorageVariables;
module.exports.warnIfDocumentStorageNotConfigured = warnIfDocumentStorageNotConfigured;
