/**
 * TouristVisaNote Repository
 * Admin notes and call-log entries of an application (step 8f): add one, and read the ones of one application.
 * There is deliberately no update and no delete here (see models/TouristVisaNote.js). The text is encrypted with the
 * field cipher, bound to the note's own id.
 */

const mongoose = require("mongoose");
const TouristVisaNote = require("../models/TouristVisaNote");
const User = require("../models/User");
const { getFieldEncryptionKey } = require("../config/fieldEncryption");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");
const fieldCipher = require("./fieldCipher");

const aad = (noteId) => `touristvisanotes:${noteId}:text`;

class TouristVisaNoteRepository {
  /** Adds a note or a call: { applicationId, adminId, at, kind, text, outcome? }. Returns { id }. */
  async append({ applicationId, adminId, at, kind, text, outcome }) {
    const key = getFieldEncryptionKey(); // fails closed before anything is written
    const _id = new mongoose.Types.ObjectId();
    await TouristVisaNote.create({
      _id,
      applicationId,
      adminId,
      at,
      kind,
      text: fieldCipher.encrypt(key, text, aad(_id)),
      ...(outcome ? { outcome } : {}),
    });
    return { id: String(_id) };
  }

  /** The notes of one application, newest first, decrypted, with the admin's name. For admins only. */
  async findByApplication(applicationId, limit = 200) {
    const rows = await TouristVisaNote.find({ applicationId }).sort({ at: -1, _id: -1 }).limit(limit).lean();
    if (rows.length === 0) return [];
    const key = getFieldEncryptionKey();
    const adminIds = [...new Set(rows.map((row) => String(row.adminId)))];
    const admins = await User.find({ _id: { $in: adminIds } }).select("name").lean();
    const names = new Map(admins.map((admin) => [String(admin._id), admin.name]));
    return rows.map((row) => {
      let text;
      try {
        text = fieldCipher.decrypt(key, row.text, aad(row._id));
      } catch (error) {
        if (error instanceof AppError) throw error;
        logger.error("Tourist Visa note could not be decrypted", { applicationId: String(applicationId), noteId: String(row._id) });
        throw new AppError("The notes could not be read. Please contact support.", 500, "NOTES_UNREADABLE");
      }
      return {
        id: String(row._id),
        at: row.at,
        kind: row.kind,
        text,
        ...(row.outcome ? { outcome: row.outcome } : {}),
        admin: { id: String(row.adminId), name: names.get(String(row.adminId)) || "An administrator" },
      };
    });
  }
}

module.exports = new TouristVisaNoteRepository();
module.exports.TouristVisaNoteRepository = TouristVisaNoteRepository;
