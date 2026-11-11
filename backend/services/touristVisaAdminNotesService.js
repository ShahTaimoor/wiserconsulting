/**
 * Tourist Visa admin notes, call log and flags (step 8f). Admin only: nothing here ever reaches an applicant
 * response, the review data or a log.
 *
 *  - Notes and calls are appended to their own collection (touristvisanotes), the text encrypted; they are never
 *    edited or removed. A call also records how it went (reached, no answer, wrong number, call back).
 *  - Flags are a few fixed words on the application (needs a call, called, ...). Changing them is recorded in the audit
 *    log with the old and the new list (the words are not sensitive).
 *  - Reading the notes and adding one are written to the audit log (ids only) BEFORE the data is returned or written.
 */

const defaultRepository = require("../repositories/touristVisaApplicationRepository");
const defaultNotes = require("../repositories/touristVisaNoteRepository");
const defaultAudit = require("../repositories/touristVisaAuditRepository");
const defaultAdmin = require("./touristVisaAdminService");
const { KINDS, OUTCOMES, MAX_TEXT } = require("../models/TouristVisaNote");
const { FLAGS } = require("../models/TouristVisaAudit");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");

const isPlainObject = (v) => Object.prototype.toString.call(v) === "[object Object]";
const fail = (status, code, message) => new AppError(message, status, code);

class TouristVisaAdminNotesService {
  constructor({ repository = defaultRepository, notes = defaultNotes, audit = defaultAudit, admin = defaultAdmin, now = () => new Date() } = {}) {
    this.repository = repository;
    this.notes = notes;
    this.audit = audit;
    this.admin = admin;
    this.now = now;
  }

  /** The notes and calls of one application, newest first. Audited as `notes_view`. */
  async list(adminId, id) {
    const application = await this.admin.load(id);
    await this.audit.append([{ adminId, applicationId: application._id, action: "notes_view", at: this.now() }]);
    return { notes: await this.notes.findByApplication(application._id) };
  }

  /**
   * Adds a note ({ kind: "note", text }) or a call ({ kind: "call", outcome, text? }). Audited as `notes_add` first.
   * Returns the new entry. `adminName` is only used to show who wrote it.
   */
  async add(adminId, adminName, id, body) {
    if (!isPlainObject(body) || Object.keys(body).some((key) => !["kind", "text", "outcome"].includes(key))) {
      throw fail(400, "INVALID_REQUEST", 'Send the request as { "kind": "note", "text": "..." } or { "kind": "call", "outcome": "reached" }.');
    }
    if (!KINDS.includes(body.kind)) throw fail(400, "INVALID_KIND", "Choose note or call.");
    if (body.text !== undefined && typeof body.text !== "string") throw fail(400, "INVALID_TEXT", "The text must be words.");
    const text = (body.text || "").trim();
    if (text.length > MAX_TEXT) throw fail(400, "INVALID_TEXT", `The text can be at most ${MAX_TEXT} characters.`);

    let outcome;
    if (body.kind === "note") {
      if (text.length === 0) throw fail(400, "INVALID_TEXT", "Write the note first.");
      if (body.outcome !== undefined) throw fail(400, "INVALID_OUTCOME", "Only a call has an outcome.");
    } else {
      if (!OUTCOMES.includes(body.outcome)) throw fail(400, "INVALID_OUTCOME", "Say how the call went.");
      outcome = body.outcome;
    }

    const application = await this.admin.load(id);
    const at = this.now();
    await this.audit.append([{ adminId, applicationId: application._id, action: "notes_add", at }]);
    const { id: noteId } = await this.notes.append({ applicationId: application._id, adminId, at, kind: body.kind, text, outcome });
    return { note: { id: noteId, at, kind: body.kind, text, ...(outcome ? { outcome } : {}), admin: { id: String(adminId), name: adminName || "An administrator" } } };
  }

  /**
   * Replaces the flags. Body { flags: [...] } with words from the fixed list. The old and the new list go to the audit
   * log; if that row cannot be written the change is undone.
   */
  async setFlags(adminId, id, body) {
    if (!isPlainObject(body) || Object.keys(body).some((key) => key !== "flags") || !Array.isArray(body.flags)) {
      throw fail(400, "INVALID_REQUEST", 'Send the request as { "flags": ["needs_call"] }.');
    }
    if (body.flags.length > FLAGS.length || body.flags.some((flag) => typeof flag !== "string" || !FLAGS.includes(flag)) || new Set(body.flags).size !== body.flags.length) {
      throw fail(400, "INVALID_FLAGS", "Use each of the fixed flags at most once.");
    }
    const next = FLAGS.filter((flag) => body.flags.includes(flag)); // always stored in the same order

    const application = await this.admin.load(id);
    const current = FLAGS.filter((flag) => (application.adminFlags || []).includes(flag));
    if (current.join() === next.join()) return { flags: next };

    const before = await this.repository.setAdminFlags(application._id, next);
    if (before === null) throw fail(404, "APPLICATION_NOT_FOUND", "Application not found.");
    try {
      await this.audit.append([{ adminId, applicationId: application._id, action: "flags_change", fromFlags: FLAGS.filter((f) => before.includes(f)), toFlags: next, at: this.now() }]);
    } catch (error) {
      await this.repository.setAdminFlags(application._id, before).catch(() => {});
      logger.error("Tourist Visa flag change could not be recorded and was undone", { applicationId: String(application._id) });
      throw error;
    }
    return { flags: next };
  }
}

module.exports = new TouristVisaAdminNotesService();
module.exports.TouristVisaAdminNotesService = TouristVisaAdminNotesService;
