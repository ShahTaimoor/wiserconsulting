/**
 * TouristVisaItinerary Repository
 * The versions of an application's itinerary: add one, read them, count the AI requests, and approve a draft once. There is
 * deliberately no update and no delete here (see models/TouristVisaItinerary.js). The text is encrypted with the field cipher, bound to
 * the application and the version. The mirror of touristVisaCoverLetterRepository, for its own collection.
 */

const TouristVisaItinerary = require("../models/TouristVisaItinerary");
const User = require("../models/User");
const { getFieldEncryptionKey } = require("../config/fieldEncryption");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");
const fieldCipher = require("./fieldCipher");
const aiUsage = require("./aiUsageRepository");

const aad = (applicationId, version) => `touristvisaitineraries:${applicationId}:${version}:text`;
const MAX_VERSIONS = 100;

class TouristVisaItineraryRepository {
  /**
   * Adds a version: { applicationId, version, text, source, model?, fallbackReason?, aiAttempted, aiAttempts?, promptVersion?,
   * factsHash, basedOnRevision, createdBy, createdAt }. A second writer using the same version number gets 409 ITINERARY_CHANGED.
   */
  async append(row) {
    const key = getFieldEncryptionKey(); // fails closed before anything is written
    try {
      await TouristVisaItinerary.create({
        applicationId: row.applicationId,
        version: row.version,
        text: fieldCipher.encrypt(key, row.text, aad(row.applicationId, row.version)),
        source: row.source,
        ...(row.model ? { model: row.model } : {}),
        ...(row.fallbackReason ? { fallbackReason: row.fallbackReason } : {}),
        aiAttempted: Boolean(row.aiAttempted),
        ...(row.aiAttempts ? { aiAttempts: row.aiAttempts } : {}),
        ...(row.promptVersion ? { promptVersion: row.promptVersion } : {}),
        factsHash: row.factsHash,
        basedOnRevision: row.basedOnRevision,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        status: "draft",
      });
    } catch (error) {
      if (error && error.code === 11000) throw new AppError("The itinerary was changed by someone else. Reload it and try again.", 409, "ITINERARY_CHANGED");
      throw error;
    }
  }

  /** The newest version without its text: { version, status, factsHash } or null. */
  async latest(applicationId) {
    const row = await TouristVisaItinerary.findOne({ applicationId }).sort({ version: -1 }).select("version status factsHash").lean();
    return row ? { version: row.version, status: row.status, factsHash: row.factsHash } : null;
  }

  /** Every version, newest first, decrypted, with the name of who made it. For admins only. */
  async findVersions(applicationId) {
    const rows = await TouristVisaItinerary.find({ applicationId }).sort({ version: -1 }).limit(MAX_VERSIONS).lean();
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
        logger.error("Tourist Visa itinerary could not be decrypted", { applicationId: String(applicationId), version: row.version });
        throw new AppError("The itinerary could not be read. Please contact support.", 500, "ITINERARY_UNREADABLE");
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

  /**
   * How many requests were made to the AI since a time, in total or by one administrator. The allowance is SHARED with the cover
   * letter, so this counts the rows of both (repositories/aiUsageRepository.js).
   */
  async countAiRequests({ since, adminId }) {
    return aiUsage.countAiRequests({ since, adminId });
  }

  /**
   * Approves one draft version, once. The only change ever made to a row: status, approvedBy and approvedAt, and only while the row
   * is still a draft (the driver is used on purpose; the model refuses every update). Returns whether this call approved it.
   */
  async approve({ applicationId, version, adminId, at }) {
    const result = await TouristVisaItinerary.collection.updateOne(
      { applicationId, version, status: "draft" },
      { $set: { status: "approved", approvedBy: adminId, approvedAt: at } }
    );
    return result.modifiedCount === 1;
  }
}

module.exports = new TouristVisaItineraryRepository();
module.exports.TouristVisaItineraryRepository = TouristVisaItineraryRepository;
