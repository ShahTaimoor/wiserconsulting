/**
 * Private file storage for Tourist Visa documents (Cloudinary).
 *
 * Reads the same three variables as the rest of the backend (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
 * CLOUDINARY_API_SECRET) and passes them with every call, so it neither depends on nor changes the global
 * Cloudinary setup that the public assessment uploads use.
 *
 * Files are uploaded as type "authenticated" (never reachable by a plain URL) and as resource type "raw":
 * a raw file is stored exactly as sent and is never processed, and Cloudinary's account setting that blocks
 * delivery of PDFs as images does not apply to it. Delivery is a signed, expiring download link
 * (private_download_url with expires_at), not a delivery URL.
 *
 * The service talks to this through three methods (upload, remove, temporaryUrl), so tests inject a fake with
 * the same shape and never reach the network. Nothing here puts a file name, a public id or a credential in an
 * error message or a log line.
 */

const crypto = require('crypto');
const cloudinaryLib = require('cloudinary').v2;
const { STORAGE } = require('./touristVisaDocuments');
const logger = require('../utils/logger');

const VARIABLES = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

/** Names (never values) of the variables that are missing or empty. */
function missingStorageVariables(env = process.env) {
  return VARIABLES.filter((name) => typeof env[name] !== 'string' || env[name].trim() === '');
}

class CloudinaryDocumentStorage {
  constructor({ cloudinary = cloudinaryLib, env = process.env } = {}) {
    this.cloudinary = cloudinary;
    this.env = env;
  }

  isConfigured() {
    return missingStorageVariables(this.env).length === 0;
  }

  credentials() {
    return {
      cloud_name: this.env.CLOUDINARY_CLOUD_NAME,
      api_key: this.env.CLOUDINARY_API_KEY,
      api_secret: this.env.CLOUDINARY_API_SECRET,
    };
  }

  /**
   * Stores a file. `extension` comes from the detected content, never from the original name.
   * Returns { publicId, resourceType, bytes }.
   */
  upload(buffer, { applicationId, extension }) {
    const options = {
      ...this.credentials(),
      resource_type: STORAGE.resourceType,
      type: STORAGE.deliveryType,
      folder: `${STORAGE.rootFolder}/${applicationId}`,
      // Random, and carrying no part of the original name. A raw file keeps its extension in the id.
      public_id: `${crypto.randomBytes(16).toString('hex')}.${extension}`,
      use_filename: false,
      unique_filename: false,
      overwrite: false,
    };
    return new Promise((resolve, reject) => {
      const stream = this.cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error || !result || !result.public_id) return reject(new Error('storage upload failed'));
        return resolve({ publicId: result.public_id, resourceType: result.resource_type || STORAGE.resourceType, bytes: result.bytes });
      });
      stream.on('error', () => reject(new Error('storage upload failed')));
      stream.end(buffer);
    });
  }

  /** Deletes a file. A file that is already gone counts as deleted. */
  async remove(publicId, resourceType = STORAGE.resourceType) {
    const result = await this.cloudinary.uploader.destroy(publicId, {
      ...this.credentials(),
      resource_type: resourceType,
      type: STORAGE.deliveryType,
      invalidate: true,
    });
    if (!result || (result.result !== 'ok' && result.result !== 'not found')) throw new Error('storage delete failed');
  }

  /**
   * A signed download link that stops working at `expiresAt` (a Date). The signature covers the expiry,
   * so changing it in the link makes the link invalid.
   */
  temporaryUrl({ publicId, resourceType = STORAGE.resourceType }, expiresAt) {
    return this.cloudinary.utils.private_download_url(publicId, '', {
      ...this.credentials(),
      resource_type: resourceType,
      type: STORAGE.deliveryType,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    });
  }
}

/** Logs once at startup, with the names of what is missing (never a value), so a gap is noticed before the first upload fails. */
function warnIfDocumentStorageNotConfigured(env = process.env) {
  const missing = missingStorageVariables(env);
  if (missing.length) logger.error(`File storage is not configured (${missing.join(', ')} missing). Tourist Visa documents cannot be uploaded until it is.`);
}

module.exports = new CloudinaryDocumentStorage();
module.exports.CloudinaryDocumentStorage = CloudinaryDocumentStorage;
module.exports.missingStorageVariables = missingStorageVariables;
module.exports.warnIfDocumentStorageNotConfigured = warnIfDocumentStorageNotConfigured;
