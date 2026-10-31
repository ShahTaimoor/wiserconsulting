/**
 * TouristVisaApplication Repository
 * All database operations for the TouristVisaApplication model.
 *
 * Also the only place that encrypts and decrypts answers: questions flagged
 * `sensitive` in the shared config are written as ciphertext and decrypted
 * only when an application is read back for its owner. Everything returned is
 * a plain object (maps flattened) with decrypted answers.
 */

const TouristVisaApplication = require("../models/TouristVisaApplication");
const TouristVisaConfigSnapshot = require("../models/TouristVisaConfigSnapshot");
const { config: defaultConfig } = require("../shared/tourist-visa/engine");
const { getFieldEncryptionKey } = require("../config/fieldEncryption");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");
const fieldCipher = require("./fieldCipher");

class TouristVisaApplicationRepository {
  constructor({ config = defaultConfig } = {}) {
    this.sensitiveIds = new Set(config.questions.filter((q) => q.sensitive).map((q) => q.id));
    this.groups = new Map((config.groups || []).map((g) => [g.id, g]));
  }

  /**
   * Throws (503) unless FIELD_ENCRYPTION_KEY is set and well formed.
   * Called before any answers are accepted for saving.
   */
  assertEncryptionReady() {
    getFieldEncryptionKey();
  }

  /**
   * Most recent application of an applicant (excluding deleted), answers decrypted
   */
  async findLatestByApplicant(applicantId) {
    const application = await TouristVisaApplication.findOne({
      applicant: applicantId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .lean({ flattenMaps: true });
    return this.withDecryptedAnswers(application);
  }

  /**
   * Create an empty draft for an applicant. Only the owner is set; every other
   * field takes its model default, so nothing from a request can be stored here.
   */
  async createDraft(applicantId) {
    const created = await TouristVisaApplication.create({ applicant: applicantId });
    return created.toObject({ flattenMaps: true });
  }

  /**
   * Write one section. Each answer is set on its own path (answers.<id>), so
   * saving one section never overwrites another, and answers that became hidden
   * are unset, and the status of sections that no longer apply (clearStatus) is removed. Only a draft belonging to the applicant matches, so a submitted
   * application cannot be changed even if a caller forgets to check.
   *
   * `answers` holds plaintext values; sensitive ones are encrypted here.
   * Returns the updated application (decrypted), or null if no editable
   * application matched.
   */
  async saveSection(applicationId, applicantId, { answers, unset, sectionStatus, clearStatus = [], currentSection, declarations = {} }) {
    const key = getFieldEncryptionKey(); // fails closed before anything is written
    const stored = this.encryptAnswers(String(applicationId), answers, key);

    const $set = { currentSection };
    for (const [id, value] of Object.entries(stored)) $set[`answers.${id}`] = value;
    for (const [sectionId, state] of Object.entries(sectionStatus)) $set[`sectionStatus.${sectionId}`] = state;
    // Declaration records are written with the answers they belong to, in the same update.
    for (const [questionId, record] of Object.entries(declarations)) $set[`declarations.${questionId}`] = record;

    const update = { $set };
    const $unset = {};
    for (const id of unset) $unset[`answers.${id}`] = "";
    for (const id of clearStatus) $unset[`sectionStatus.${id}`] = "";
    if (Object.keys($unset).length) update.$unset = $unset;

    const application = await TouristVisaApplication.findOneAndUpdate(
      { _id: applicationId, applicant: applicantId, status: "draft", isDeleted: false },
      update,
      { new: true, runValidators: true }
    ).lean({ flattenMaps: true });
    return this.withDecryptedAnswers(application);
  }

  // -------------------------------------------------------------------------
  // Submitting
  // -------------------------------------------------------------------------

  /**
   * Keeps the config an application is submitted under, once per distinct config. The id is the SHA-256 of its text, so
   * submitting a second application under the same config adds nothing, and two submits at the same moment cannot
   * make two. A snapshot is never changed after it is written.
   */
  async saveConfigSnapshot({ sha256, version, json }) {
    try {
      await TouristVisaConfigSnapshot.updateOne({ _id: sha256 }, { $setOnInsert: { version, json, createdAt: new Date() } }, { upsert: true });
    } catch (error) {
      if (!(error && error.code === 11000)) throw error; // another submit wrote the same snapshot first: it is there
    }
  }

  async findConfigSnapshot(sha256) {
    return TouristVisaConfigSnapshot.findOne({ _id: sha256 }).lean();
  }

  /**
   * draft -> submitted, in one conditional write. It matches only if the application is still the applicant's draft
   * AND has not changed since it was read for checking (`expectedUpdatedAt`), so what was checked is what is
   * submitted, and of two submits at the same moment exactly one matches. Returns the submitted application
   * (decrypted), or null when it did not match. A reference that is already taken throws a duplicate-key error
   * naming the reference (see isReferenceCollision), so the caller can try another.
   */
  async submitApplication(applicationId, applicantId, { expectedUpdatedAt, reference, configSha256, configVersion, declarationRecord, submittedAt }) {
    const application = await TouristVisaApplication.findOneAndUpdate(
      { _id: applicationId, applicant: applicantId, status: "draft", isDeleted: false, updatedAt: expectedUpdatedAt },
      {
        $set: {
          status: "submitted",
          submittedAt,
          reference,
          configSha256,
          configVersion,
          "declarations.submit": declarationRecord,
        },
      },
      { new: true }
    ).lean({ flattenMaps: true });
    return this.withDecryptedAnswers(application);
  }

  /** Did this duplicate-key error come from the reference index? */
  isReferenceCollision(error) {
    return Boolean(error && (error.code === 11000 || error.code === 11001) && (error.keyPattern ? "reference" in error.keyPattern : /reference/.test(String(error.message))));
  }

  // -------------------------------------------------------------------------
  // Documents (the uploaded files; the file itself lives in private storage)
  // -------------------------------------------------------------------------

  /** The applicant's latest application with only what the document routes need: status and document references. */
  async findDocumentContext(applicantId) {
    return TouristVisaApplication.findOne({ applicant: applicantId, isDeleted: false })
      .sort({ createdAt: -1 })
      .select("status documents")
      .lean();
  }

  /** One application's status and document references, by id (not limited to an owner: for internal callers). */
  async findDocumentContextById(applicationId) {
    return TouristVisaApplication.findOne({ _id: applicationId, isDeleted: false }).select("status documents").lean();
  }

  /**
   * Adds one document reference, but only if the application is still a draft, the slot is below its file
   * limit and the total stays within the size limit. The three checks and the write are one database
   * operation, so two uploads running at the same moment cannot both pass a check that only one of them
   * should. Returns true when added, false when the guard (or the owner or status) did not match.
   */
  async addDocument(applicationId, applicantId, document, { slotMax, totalMax }) {
    const added = await TouristVisaApplication.findOneAndUpdate(
      {
        _id: applicationId,
        applicant: applicantId,
        status: "draft",
        isDeleted: false,
        $expr: {
          $and: [
            {
              $lt: [
                { $size: { $filter: { input: { $ifNull: ["$documents", []] }, as: "d", cond: { $eq: ["$$d.slot", document.slot] } } } },
                slotMax,
              ],
            },
            { $lte: [{ $add: [{ $sum: "$documents.bytes" }, document.bytes] }, totalMax] },
          ],
        },
      },
      { $push: { documents: document } },
      { new: true, runValidators: true, projection: { _id: 1 } }
    ).lean();
    return Boolean(added);
  }

  /**
   * Removes one document reference of a draft the applicant owns. Returns the removed reference (so its
   * stored file can be deleted), or null when there is no such document or the application is not a draft.
   */
  async removeDocument(applicationId, applicantId, docId) {
    const before = await TouristVisaApplication.findOneAndUpdate(
      { _id: applicationId, applicant: applicantId, status: "draft", isDeleted: false, "documents.id": docId },
      { $pull: { documents: { id: docId } } },
      { new: false, projection: { documents: 1 } }
    ).lean();
    if (!before) return null;
    return (before.documents || []).find((d) => d.id === docId) || null;
  }

  encryptDocumentName(applicationId, docId, name) {
    return fieldCipher.encrypt(getFieldEncryptionKey(), name, this.aad(String(applicationId), this.documentField(docId)));
  }

  /** Document references with the original name decrypted (other fields as stored). */
  decryptDocuments(applicationId, documents) {
    let key = null;
    return (documents || []).map((doc) => {
      try {
        key = key || getFieldEncryptionKey();
        return { ...doc, originalName: fieldCipher.decrypt(key, doc.originalName, this.aad(String(applicationId), this.documentField(doc.id))) };
      } catch (error) {
        if (error instanceof AppError) throw error; // key missing or malformed
        logger.error("Tourist Visa file name could not be decrypted", { applicationId: String(applicationId), documentId: doc.id });
        throw new AppError("Your uploaded files could not be read. Please contact support.", 500);
      }
    });
  }

  documentField(docId) {
    return `documents.${docId}.originalName`;
  }

  // -------------------------------------------------------------------------
  // Encryption of answers
  // -------------------------------------------------------------------------

  encryptAnswers(applicationId, answers, key) {
    const out = {};
    for (const [id, value] of Object.entries(answers)) {
      const group = this.groups.get(id);
      if (group && Array.isArray(value)) {
        out[id] = value.map((entry, index) => {
          const encrypted = { ...entry };
          for (const memberId of group.questions) {
            if (this.sensitiveIds.has(memberId) && entry[memberId] !== undefined) {
              encrypted[memberId] = fieldCipher.encrypt(key, entry[memberId], this.aad(applicationId, `${id}[${index}].${memberId}`));
            }
          }
          return encrypted;
        });
      } else if (this.sensitiveIds.has(id)) {
        out[id] = fieldCipher.encrypt(key, value, this.aad(applicationId, id));
      } else {
        out[id] = value;
      }
    }
    return out;
  }

  decryptAnswers(applicationId, answers) {
    let key = null;
    const getKey = () => key || (key = getFieldEncryptionKey());
    const open = (stored, field) => {
      try {
        return fieldCipher.decrypt(getKey(), stored, this.aad(applicationId, field));
      } catch (error) {
        if (error instanceof AppError) throw error; // key missing or malformed
        // Log which field failed, never its content.
        logger.error("Tourist Visa answer could not be decrypted", { applicationId, field });
        throw new AppError("Your saved answers could not be read. Please contact support.", 500);
      }
    };

    const out = {};
    for (const [id, value] of Object.entries(answers || {})) {
      const group = this.groups.get(id);
      if (group && Array.isArray(value)) {
        out[id] = value.map((entry, index) => {
          const plain = { ...entry };
          for (const memberId of group.questions) {
            if (this.sensitiveIds.has(memberId) && plain[memberId] !== undefined) {
              plain[memberId] = open(plain[memberId], `${id}[${index}].${memberId}`);
            }
          }
          return plain;
        });
      } else if (this.sensitiveIds.has(id)) {
        out[id] = open(value, id);
      } else {
        out[id] = value;
      }
    }
    return out;
  }

  withDecryptedAnswers(application) {
    if (!application) return application;
    return {
      ...application,
      answers: this.decryptAnswers(String(application._id), application.answers),
      documents: this.decryptDocuments(application._id, application.documents),
    };
  }

  aad(applicationId, field) {
    return `${applicationId}:${field}`;
  }
}

module.exports = new TouristVisaApplicationRepository();
module.exports.TouristVisaApplicationRepository = TouristVisaApplicationRepository;
