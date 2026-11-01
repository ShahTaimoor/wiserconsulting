/**
 * TouristVisaChange Repository
 * The admin corrections of submitted applications (step 8f).
 *
 * A correction is written in ONE database transaction together with the answers it changes and its audit row: either
 * all three are written or none is. Like the audit log, the change records are append only: this repository offers
 * `applyEdit` (the only writer) and reads, and no update or delete (see models/TouristVisaChange.js).
 *
 * Every value in a record (the reason, and the old and the new value of each item) is encrypted with the field
 * cipher, bound to the record and the item, so a value copied elsewhere does not decrypt.
 */

const mongoose = require("mongoose");
const TouristVisaApplication = require("../models/TouristVisaApplication");
const TouristVisaChange = require("../models/TouristVisaChange");
const TouristVisaAudit = require("../models/TouristVisaAudit");
const User = require("../models/User");
const { getFieldEncryptionKey } = require("../config/fieldEncryption");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");
const fieldCipher = require("./fieldCipher");

const EDITABLE_STATUSES = ["submitted", "in_review"];

/** Thrown inside the transaction when the application is no longer at the revision the admin saw. */
class RevisionConflict extends Error {}

const aad = (recordId, field) => `touristvisachanges:${recordId}:${field}`;

class TouristVisaChangeRepository {
  /**
   * Writes one correction: the changed answers, the new revision (and the summary when the name, email or number
   * changed), the change record and the audit row, all in one transaction.
   *
   * `set` holds the answers to write, ALREADY ENCRYPTED where they are sensitive (by the application repository);
   * `unset` the answer ids to remove. The application matches only if it still has `expectedRevision` and is still
   * submitted or in review. Returns { revision } or null when it did not match (someone else changed it first).
   */
  async applyEdit({ applicationId, adminId, expectedRevision, set, unset, summary, reason, items, at }) {
    const key = getFieldEncryptionKey(); // fails closed before anything is written
    const recordId = new mongoose.Types.ObjectId();
    const record = {
      _id: recordId,
      applicationId,
      adminId,
      at,
      revisionBefore: expectedRevision,
      revisionAfter: expectedRevision + 1,
      reason: fieldCipher.encrypt(key, reason, aad(recordId, "reason")),
      changes: items.map((item, i) => ({
        sectionId: item.sectionId,
        questionId: item.questionId,
        ...(item.index !== undefined ? { index: item.index } : {}),
        kind: item.kind,
        ...(item.old !== undefined ? { old: fieldCipher.encrypt(key, item.old, aad(recordId, `${i}.old`)) } : {}),
        ...(item.new !== undefined ? { new: fieldCipher.encrypt(key, item.new, aad(recordId, `${i}.new`)) } : {}),
      })),
    };

    const $set = {};
    for (const [id, value] of Object.entries(set)) $set[`answers.${id}`] = value;
    if (summary) $set.summary = summary;
    const update = { $inc: { revision: 1 } };
    if (Object.keys($set).length) update.$set = $set;
    const $unset = {};
    for (const id of unset) $unset[`answers.${id}`] = "";
    if (Object.keys($unset).length) update.$unset = $unset;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const matched = await TouristVisaApplication.findOneAndUpdate(
          {
            _id: applicationId,
            isDeleted: false,
            status: { $in: EDITABLE_STATUSES },
            // An application saved before revisions existed has none: that is revision 0.
            revision: expectedRevision === 0 ? { $in: [0, null] } : expectedRevision,
          },
          update,
          { new: true, session, projection: { _id: 1 } }
        ).lean();
        if (!matched) throw new RevisionConflict();
        await TouristVisaChange.create([record], { session });
        await TouristVisaAudit.insertMany([{ adminId, applicationId, action: "changes_apply", at }], { session });
      });
      return { revision: expectedRevision + 1 };
    } catch (error) {
      if (error instanceof RevisionConflict) return null;
      // A database that is not a replica set cannot run a transaction: say so plainly instead of a bare 500.
      if (error && (error.codeName === "IllegalOperation" || /Transaction numbers are only allowed/.test(String(error.message)))) {
        logger.error("Tourist Visa edit needs a database that supports transactions", { applicationId: String(applicationId) });
        throw new AppError("Editing needs a database that supports transactions (a replica set).", 503, "TRANSACTIONS_UNAVAILABLE");
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * The history of one application, newest first, with the reason and every old and new value decrypted:
   * [{ id, at, admin: { id, name }, revisionBefore, revisionAfter, reason, changes: [{ sectionId, questionId, index?, kind, old?, new? }] }].
   * For admins only.
   */
  async findByApplication(applicationId, limit = 100) {
    const rows = await TouristVisaChange.find({ applicationId }).sort({ at: -1, _id: -1 }).limit(limit).lean();
    if (rows.length === 0) return [];
    const key = getFieldEncryptionKey();
    const open = (stored, recordId, field) => {
      try {
        return fieldCipher.decrypt(key, stored, aad(recordId, field));
      } catch (error) {
        if (error instanceof AppError) throw error;
        // Which record failed, never what it held.
        logger.error("Tourist Visa change record could not be decrypted", { applicationId: String(applicationId), recordId: String(recordId) });
        throw new AppError("The change history could not be read. Please contact support.", 500, "HISTORY_UNREADABLE");
      }
    };
    const adminIds = [...new Set(rows.map((row) => String(row.adminId)))];
    const admins = await User.find({ _id: { $in: adminIds } }).select("name").lean();
    const names = new Map(admins.map((admin) => [String(admin._id), admin.name]));
    return rows.map((row) => ({
      id: String(row._id),
      at: row.at,
      admin: { id: String(row.adminId), name: names.get(String(row.adminId)) || "An administrator" },
      revisionBefore: row.revisionBefore,
      revisionAfter: row.revisionAfter,
      reason: open(row.reason, row._id, "reason"),
      changes: (row.changes || []).map((item, i) => ({
        sectionId: item.sectionId,
        questionId: item.questionId,
        ...(item.index !== undefined && item.index !== null ? { index: item.index } : {}),
        kind: item.kind,
        ...(item.old ? { old: open(item.old, row._id, `${i}.old`) } : {}),
        ...(item.new ? { new: open(item.new, row._id, `${i}.new`) } : {}),
      })),
    }));
  }

  /**
   * What the "corrected by our team" marker needs and nothing more: for each correction its time and which answers
   * it touched ({ at, changes: [{ questionId, index?, kind }] }), oldest first. No value, no reason and no admin is
   * read, so nothing here can reach an applicant by mistake.
   */
  async findCorrectionMarks(applicationId) {
    const rows = await TouristVisaChange.find({ applicationId })
      .select({ at: 1, "changes.questionId": 1, "changes.index": 1, "changes.kind": 1 })
      .sort({ at: 1, _id: 1 })
      .lean();
    return rows.map((row) => ({
      at: row.at,
      changes: (row.changes || []).map((item) => ({ questionId: item.questionId, kind: item.kind, ...(item.index !== undefined && item.index !== null ? { index: item.index } : {}) })),
    }));
  }
}

module.exports = new TouristVisaChangeRepository();
module.exports.TouristVisaChangeRepository = TouristVisaChangeRepository;
module.exports.EDITABLE_STATUSES = EDITABLE_STATUSES;
