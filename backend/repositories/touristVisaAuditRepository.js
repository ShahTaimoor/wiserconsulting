/**
 * TouristVisaAudit Repository
 * The only ways in or out of the audit log: add rows, and read the rows of one application.
 * There is deliberately no update and no delete here (see models/TouristVisaAudit.js).
 */

const TouristVisaAudit = require("../models/TouristVisaAudit");
const User = require("../models/User");

class TouristVisaAuditRepository {
  /**
   * Adds rows ({ adminId, applicationId, action, at, fromStatus, toStatus, documentId, fromFlags, toFlags }). Nothing else is stored:
   * a field that is not part of a row is dropped by the model, so no answer, name, link or address can slip in.
   */
  async append(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    return TouristVisaAudit.insertMany(rows, { ordered: true });
  }

  /** The rows of one application, newest first, with the name of the admin: [{ id, action, at, admin: { id, name }, ... }]. */
  async findByApplication(applicationId, limit = 100) {
    const rows = await TouristVisaAudit.find({ applicationId }).sort({ at: -1, _id: -1 }).limit(limit).lean();
    const adminIds = [...new Set(rows.map((row) => String(row.adminId)))];
    const admins = adminIds.length ? await User.find({ _id: { $in: adminIds } }).select("name").lean() : [];
    const names = new Map(admins.map((admin) => [String(admin._id), admin.name]));
    return rows.map((row) => ({
      id: String(row._id),
      action: row.action,
      at: row.at,
      admin: { id: String(row.adminId), name: names.get(String(row.adminId)) || "An administrator" },
      ...(row.fromStatus ? { fromStatus: row.fromStatus } : {}),
      ...(row.toStatus ? { toStatus: row.toStatus } : {}),
      ...(row.fromFlags ? { fromFlags: row.fromFlags } : {}),
      ...(row.toFlags ? { toFlags: row.toFlags } : {}),
      ...(row.letterVersion ? { letterVersion: row.letterVersion } : {}),
      ...(row.letterSource ? { letterSource: row.letterSource } : {}),
      ...(row.model ? { model: row.model } : {}),
    }));
  }
}

module.exports = new TouristVisaAuditRepository();
module.exports.TouristVisaAuditRepository = TouristVisaAuditRepository;
