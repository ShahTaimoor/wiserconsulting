/**
 * Tourist Visa document service: the uploaded passport and funds files of a signed-in applicant's own draft.
 *
 * The file itself goes to private storage (config/touristVisaStorage.js); the database keeps a reference.
 * The applicant never receives a link, a storage id or a public id: only id, slot, name, size, type and time.
 *
 * Order of an upload, so nothing is left behind:
 *   1. check the file (content, size, slot) and the application (draft, room left) before touching storage;
 *   2. encrypt the file name (this also proves the encryption key works);
 *   3. store the file;
 *   4. add the reference in ONE guarded database operation (draft, per-slot count, total size);
 *   5. if step 4 does not add it, or fails, delete the stored file again.
 * Messages and log lines carry ids only, never a file name or a person's detail.
 */

const crypto = require('crypto');
const defaultRepository = require('../repositories/touristVisaApplicationRepository');
const defaultStorage = require('../config/touristVisaStorage');
const detectFileType = require('../utils/detectFileType');
const documentError = require('../utils/documentError');
const logger = require('../utils/logger');
const { toDocumentView } = require('../utils/touristVisaDocumentView');
const {
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  SLOTS,
  FILE_TYPES,
  LINK_TTL_SECONDS,
  MAX_NAME_LENGTH,
  FALLBACK_NAME,
  publicLimits,
} = require('../config/touristVisaDocuments');

const DOC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Control characters, and the characters that reverse the direction of text (used to disguise file names).
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/g;

const isSlot = (slot) => typeof slot === 'string' && Object.prototype.hasOwnProperty.call(SLOTS, slot);

/** A display-only name: no folders, no control characters, bounded length. Never used to name a stored file. */
function cleanName(originalName, extension) {
  let name = typeof originalName === 'string' ? originalName : '';
  // Browsers send a quote, a carriage return and a line feed in a file name as %22, %0D and %0A.
  name = name.replace(/%22/g, '"').replace(/%0[DA]/gi, '');
  name = name.split(/[\\/]/).pop().replace(UNSAFE_NAME_CHARS, '').replace(/\s+/g, ' ').trim();
  if (name === '' || name === '.' || name === '..') return `${FALLBACK_NAME}.${extension}`;
  return Array.from(name).slice(0, MAX_NAME_LENGTH).join('');
}

class TouristVisaDocumentService {
  constructor({ repository = defaultRepository, storage = defaultStorage, now = () => new Date(), newId = () => crypto.randomUUID() } = {}) {
    this.repository = repository;
    this.storage = storage;
    this.now = now;
    this.newId = newId;
  }

  /** The applicant's files (metadata only) and the limits the screen may show. */
  async list(userId) {
    const context = await this.contextOf(userId);
    const documents = this.repository.decryptDocuments(context._id, context.documents);
    return { documents: documents.map(toDocumentView), limits: publicLimits() };
  }

  /**
   * Stores one file for the applicant's draft. `file` is { buffer, originalname }.
   * Returns the new file's metadata.
   */
  async upload(userId, { slot, file }) {
    if (!file || !Buffer.isBuffer(file.buffer)) throw documentError('FILE_REQUIRED');
    if (!isSlot(slot)) throw documentError('INVALID_SLOT');
    if (file.buffer.length === 0) throw documentError('FILE_EMPTY');
    if (file.buffer.length > MAX_FILE_BYTES) throw documentError('FILE_TOO_LARGE');
    const typeKey = detectFileType(file.buffer);
    if (!typeKey) throw documentError('WRONG_TYPE');
    const type = FILE_TYPES[typeKey];

    if (!this.storage.isConfigured()) throw documentError('STORAGE_UNAVAILABLE');
    this.repository.assertEncryptionReady();

    const context = await this.contextOf(userId);
    this.assertRoom(context, slot, file.buffer.length); // fail early, before anything is stored

    const applicationId = String(context._id);
    const id = this.newId();
    const name = cleanName(file.originalname, type.extension);
    const encryptedName = this.repository.encryptDocumentName(applicationId, id, name);

    let stored;
    try {
      stored = await this.storage.upload(file.buffer, { applicationId, extension: type.extension });
    } catch {
      logger.error('Tourist Visa file could not be stored', { applicationId });
      throw documentError('UPLOAD_FAILED');
    }

    const reference = {
      id,
      slot,
      publicId: stored.publicId,
      resourceType: stored.resourceType,
      format: type.extension,
      bytes: file.buffer.length,
      mime: type.mime,
      uploadedAt: this.now(),
      originalName: encryptedName,
    };

    let added;
    try {
      added = await this.repository.addDocument(context._id, userId, reference, { slotMax: SLOTS[slot].max, totalMax: MAX_TOTAL_BYTES });
    } catch (error) {
      await this.discard(applicationId, id, stored);
      throw error;
    }
    if (!added) {
      // Another upload took the last place, or the application was submitted, between the check and the write.
      await this.discard(applicationId, id, stored);
      this.assertRoom(await this.contextOf(userId), slot, file.buffer.length);
      throw documentError('UPLOAD_FAILED');
    }

    return toDocumentView({ ...reference, originalName: name });
  }

  /** Removes one of the applicant's files from the draft and from storage. */
  async remove(userId, docId) {
    if (typeof docId !== 'string' || !DOC_ID.test(docId)) throw documentError('DOCUMENT_NOT_FOUND');
    const context = await this.contextOf(userId);
    if (context.status !== 'draft') throw documentError('DOCUMENTS_LOCKED');

    const removed = await this.repository.removeDocument(context._id, userId, docId);
    if (!removed) {
      // Gone already, or the application was submitted a moment ago.
      const again = await this.contextOf(userId);
      throw documentError(again.status !== 'draft' ? 'DOCUMENTS_LOCKED' : 'DOCUMENT_NOT_FOUND');
    }
    await this.discard(String(context._id), docId, removed);
  }

  /**
   * A temporary link to one stored file, valid for LINK_TTL_SECONDS (2 minutes). For the admin view
   * (step 8e): it is deliberately NOT reachable from any applicant route, and the caller must have
   * decided who may ask. Returns { url, expiresAt }.
   */
  async getTemporaryLink(applicationId, docId) {
    if (typeof docId !== 'string' || !DOC_ID.test(docId)) throw documentError('DOCUMENT_NOT_FOUND');
    const context = await this.repository.findDocumentContextById(applicationId);
    if (!context) throw documentError('APPLICATION_NOT_FOUND');
    const doc = (context.documents || []).find((d) => d.id === docId);
    if (!doc) throw documentError('DOCUMENT_NOT_FOUND');
    if (!this.storage.isConfigured()) throw documentError('STORAGE_UNAVAILABLE');

    const expiresAt = new Date(this.now().getTime() + LINK_TTL_SECONDS * 1000);
    return { url: await this.storage.temporaryUrl(doc, expiresAt), expiresAt };
  }

  // -------------------------------------------------------------------------

  async contextOf(userId) {
    const context = await this.repository.findDocumentContext(userId);
    if (!context) throw documentError('APPLICATION_NOT_FOUND');
    return context;
  }

  /** Throws the right error unless the application is a draft with room for this file. */
  assertRoom(context, slot, bytes) {
    if (context.status !== 'draft') throw documentError('DOCUMENTS_LOCKED');
    const documents = context.documents || [];
    if (documents.filter((d) => d.slot === slot).length >= SLOTS[slot].max) throw documentError('TOO_MANY_FILES');
    if (documents.reduce((sum, d) => sum + d.bytes, 0) + bytes > MAX_TOTAL_BYTES) throw documentError('TOTAL_TOO_LARGE');
  }

  /** Deletes a stored file, best effort: a failure is logged with ids only, never with a file name. */
  async discard(applicationId, documentId, { publicId, resourceType }) {
    try {
      await this.storage.remove(publicId, resourceType);
    } catch {
      logger.error('Tourist Visa stored file could not be deleted', { applicationId, documentId });
    }
  }
}

module.exports = new TouristVisaDocumentService();
module.exports.TouristVisaDocumentService = TouristVisaDocumentService;
module.exports.cleanName = cleanName;
