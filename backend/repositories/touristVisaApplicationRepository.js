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
  async saveSection(applicationId, applicantId, { answers, unset, sectionStatus, clearStatus = [], currentSection }) {
    const key = getFieldEncryptionKey(); // fails closed before anything is written
    const stored = this.encryptAnswers(String(applicationId), answers, key);

    const $set = { currentSection };
    for (const [id, value] of Object.entries(stored)) $set[`answers.${id}`] = value;
    for (const [sectionId, state] of Object.entries(sectionStatus)) $set[`sectionStatus.${sectionId}`] = state;

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
    return { ...application, answers: this.decryptAnswers(String(application._id), application.answers) };
  }

  aad(applicationId, field) {
    return `${applicationId}:${field}`;
  }
}

module.exports = new TouristVisaApplicationRepository();
module.exports.TouristVisaApplicationRepository = TouristVisaApplicationRepository;
