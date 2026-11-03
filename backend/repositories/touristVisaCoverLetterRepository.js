/**
 * TouristVisaCoverLetter Repository
 * The versions of an application's cover letter (step 8g): add one, read them, count the AI requests, and approve a
 * draft once. There is deliberately no update and no delete here (see models/TouristVisaCoverLetter.js). The text is
 * encrypted with the field cipher, bound to the application and the version.
 */

const TouristVisaCoverLetter = require("../models/TouristVisaCoverLetter");
const User = require("../models/User");
const { getFieldEncryptionKey } = require("../config/fieldEncryption");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");
const fieldCipher = require("./fieldCipher");

const aad = (applicationId, version) => `touristvisacoverletters:${applicationId}:${version}:text`;
const MAX_VERSIONS = 100;

class TouristVisaCoverLetterRepository {
  /**
   * Adds a version: { applicationId, version, text, source, model?, fallbackReason?, aiAttempted, factsHash,
   * basedOnRevision, createdBy, createdAt }. A second writer using the same version number gets 409 LETTER_CHANGED.
   */
  async append(row) {
    const key = getFieldEncryptionKey(); // fails closed before anything is written
    try {
      await TouristVisaCoverLetter.create({
        applicationId: row.applicationId,
        version: row.version,
        text: fieldCipher.encrypt(key, row.text, aad(row.applicationId, row.version)),
        source: row.source,
        ...(row.model ? { model: row.model } : {}),
        ...(row.fallbackReason ? { fallbackReason: row.fallbackReason } : {}),
        aiAttempted: Boolean(row.aiAttempted),
        factsHash: row.factsHash,
        basedOnRevision: row.basedOnRevision,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        status: "draft",
      });
    } catch (error) {
      if (error && error.code === 11000) throw new AppError("The cover letter was changed by someone else. Reload it and try again.", 409, "LETTER_CHANGED");
      throw error;
    }
  }

  /** The newest version without its text: { version, status, factsHash } or null. */
  async latest(applicationId) {
    const row = await TouristVisaCoverLetter.findOne({ applicationId }).sort({ version: -1 }).select("version status factsHash").lean();
    return row ? { version: row.version, status: row.status, factsHash: row.factsHash } : null;
  }

  /** Every version, newest first, decrypted, with the name of who made it. For admins only. */
  async findVersions(applicationId) {
    const rows = await TouristVisaCoverLetter.find({ applicationId }).sort({ version: -1 }).limit(MAX_VERSIONS).lean();
    if (rows.length === 0) return [];
    const key = getFieldEncryptionKey();
    const ids = [...new Set(rows.flatMap((row) => [row.createdBy, row.approvedBy].filter(Boolean).map(String)))];
    const admins = await User.find({ _id: { $in: ids } }).select("name").lean();
    const names = new Map(admins.map((admin) => [String(admin._id), admin.name]));
    const who = (id) => ({ id: String(id), name: names.get(String(id)) || "An administrator" });
    return rows.map((row) => {
      let text;
      try {
        text = fieldCipher.decrypt(key, row.text, aad(applicationId, row.version));
      } catch (error) {
        if (error instanceof AppError) throw error;
        logger.error("Tourist Visa cover letter could not be decrypted", { applicationId: String(applicationId), version: row.version });
        throw new AppError("The cover letter could not be read. Please contact support.", 500, "LETTER_UNREADABLE");
      }
      return {
        version: row.version,
        text,
        source: row.source,
        ...(row.model ? { model: row.model } : {}),
        ...(row.fallbackReason ? { fallbackReason: row.fallbackReason } : {}),
        factsHash: row.factsHash,
        basedOnRevision: row.basedOnRevision,
        createdAt: row.createdAt,
        createdBy: who(row.createdBy),
        status: row.status,
        ...(row.approvedAt ? { approvedAt: row.approvedAt, approvedBy: who(row.approvedBy) } : {}),
      };
    });
  }

  /** How many requests were made to the AI since a time, in total or by one administrator. */
  async countAiRequests({ since, adminId }) {
    return TouristVisaCoverLetter.countDocuments({ aiAttempted: true, createdAt: { $gte: since }, ...(adminId ? { createdBy: adminId } : {}) });
  }

  /**
   * Approves one draft version, once. The only change ever made to a row: status, approvedBy and approvedAt, and only
   * while the row is still a draft (this uses the driver on purpose; the model refuses every update). Returns whether
   * this call approved it.
   */
  async approve({ applicationId, version, adminId, at }) {
    const result = await TouristVisaCoverLetter.collection.updateOne(
      { applicationId, version, status: "draft" },
      { $set: { status: "approved", approvedBy: adminId, approvedAt: at } }
    );
    return result.modifiedCount === 1;
  }
}

module.exports = new TouristVisaCoverLetterRepository();
module.exports.TouristVisaCoverLetterRepository = TouristVisaCoverLetterRepository;
