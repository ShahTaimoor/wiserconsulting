/**
 * Tourist Visa admin edit service (step 8f): an administrator corrects the answers of a submitted application.
 *
 * What it guarantees:
 *  - only while the application is submitted or in review; a draft is never visible to an admin, a completed one
 *    is refused;
 *  - the answers are checked by the shared engine against the config the application was SUBMITTED under, section
 *    by section like a normal save, with the follow-ups that become hidden removed and the ones that become
 *    required answered in the same request (otherwise 422 with section ids and counts, never a value);
 *  - the Part 9 ticks, the final declaration, the documents, the status, the reference, the date of submission and
 *    who the application belongs to cannot be changed here;
 *  - a dry run changes nothing and writes one audit row without any value; a real edit is ONE database transaction
 *    (answers, the new revision, the refreshed name/email/phone summary, the change record, the audit row);
 *  - two admins cannot overwrite each other: the request carries the revision it saw (409 REVISION_CHANGED).
 *
 * Every read of decrypted answers or of the history is written to the audit log BEFORE it is returned.
 */

const z = require("zod");
const defaultRepository = require("../repositories/touristVisaApplicationRepository");
const defaultChanges = require("../repositories/touristVisaChangeRepository");
const defaultAudit = require("../repositories/touristVisaAuditRepository");
const defaultApplications = require("./touristVisaApplicationService");
const defaultAdmin = require("./touristVisaAdminService");
const { summaryOf } = require("../utils/touristVisaSummary");
const changesLogic = require("../utils/touristVisaChanges");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");

const EDITABLE_STATUSES = ["submitted", "in_review"];
const BODY_KEYS = ["expectedRevision", "reason", "changes", "dryRun"];

const isPlainObject = (v) => Object.prototype.toString.call(v) === "[object Object]";
const fail = (status, code, message, details) => new AppError(message, status, code, details);

class TouristVisaAdminEditService {
  constructor({ repository = defaultRepository, changes = defaultChanges, audit = defaultAudit, applications = defaultApplications, admin = defaultAdmin, now = () => new Date(), today } = {}) {
    this.repository = repository;
    this.changes = changes;
    this.audit = audit;
    this.applications = applications;
    this.admin = admin;
    this.now = now;
    this.today = today; // () => "YYYY-MM-DD", only for tests; the engine uses the real date when it is not given
  }

  /**
   * What the Edit forms need: the config the application was submitted under, its decrypted answers and the revision.
   * Audited as `edit_open` before it is returned (it shows every decrypted answer).
   */
  async editForm(adminId, id) {
    const application = await this.admin.load(id);
    this.assertEditable(application);
    const cfg = await this.applications.configOf(application);
    await this.audit.append([{ adminId, applicationId: application._id, action: "edit_open", at: this.now() }]);
    return {
      application: { id: String(application._id), reference: application.reference || null, status: application.status, revision: application.revision || 0, configVersion: application.configVersion },
      config: cfg,
      answers: application.answers || {},
    };
  }

  /**
   * PUT /changes. Body { expectedRevision, reason, changes, dryRun? }.
   * dryRun: everything is checked and the preview is returned; nothing is changed.
   */
  async change(adminId, id, body) {
    const { expectedRevision, reason, changes, dryRun } = this.readBody(body);

    const application = await this.admin.load(id);
    this.assertEditable(application);
    const revision = application.revision || 0;
    if (revision !== expectedRevision) throw this.revisionChanged();

    const cfg = await this.applications.configOf(application);
    const parsed = changesLogic.parseChanges(cfg, changes);
    const result = changesLogic.evaluate({ z, cfg, existing: application.answers || {}, parsed, today: this.today ? this.today() : undefined });
    if (!result.ok) {
      // Section ids, counts and the engine's fixed messages for the fields: never an answer.
      throw fail(422, "CHANGES_INVALID", "Some answers need attention.", { sections: result.sections, errors: result.errors });
    }
    if (result.items.length === 0) throw fail(400, "NO_CHANGES", "Nothing would change.");

    if (dryRun) {
      // Recorded before the preview is shown; the row holds no value.
      await this.audit.append([{ adminId, applicationId: application._id, action: "changes_preview", at: this.now() }]);
      const preview = changesLogic.buildPreview(cfg, application.answers || {}, result.answers, result.items);
      return {
        dryRun: true,
        revision,
        sections: result.sections.map((sectionId) => ({ id: sectionId, title: (cfg.sections.find((s) => s.id === sectionId) || {}).title || "" })),
        ...preview,
      };
    }

    const reasonText = changesLogic.checkReason(reason);
    const { set, unset } = this.answerWrites(cfg, application.answers || {}, result.answers);
    const stored = this.repository.encryptAnswersForStorage(application._id, set);
    const summary = this.summaryUpdate(application, result.answers);

    const written = await this.changes.applyEdit({
      applicationId: application._id,
      adminId,
      expectedRevision: revision,
      set: stored,
      unset,
      summary,
      reason: reasonText,
      items: result.items,
      at: this.now(),
    });
    if (!written) throw this.revisionChanged();

    logger.info("Tourist Visa application corrected", { applicationId: String(application._id), revision: written.revision }); // ids only
    return { dryRun: false, revision: written.revision, applied: result.items.length };
  }

  /** The history of corrections of one application, newest first, with the reason and the old and new values. Audited as `changes_view`. */
  async history(adminId, id) {
    const application = await this.admin.load(id);
    await this.audit.append([{ adminId, applicationId: application._id, action: "changes_view", at: this.now() }]);
    const cfg = await this.applications.configOf(application);
    const records = await this.changes.findByApplication(application._id);
    return {
      revision: application.revision || 0,
      history: records.map((record) => ({
        id: record.id,
        at: record.at,
        admin: record.admin,
        revisionBefore: record.revisionBefore,
        revisionAfter: record.revisionAfter,
        reason: record.reason,
        changes: record.changes.map((item) => {
          const d = changesLogic.describeItem(cfg, item, application.answers || {}, application.answers || {}, { history: true });
          return { sectionId: d.sectionId, sectionTitle: d.sectionTitle, questionId: d.questionId, ...(d.index !== undefined ? { index: d.index } : {}), number: d.number, label: d.label, kind: d.kind, old: d.old, new: d.new };
        }),
      })),
    };
  }

  // -------------------------------------------------------------------------

  /** The request body: exactly { expectedRevision, reason, changes, dryRun? }. A reserved name gets its own code. */
  readBody(body) {
    if (!isPlainObject(body)) throw fail(400, "INVALID_REQUEST", "Send the request as { expectedRevision, reason, changes }.");
    for (const key of Object.keys(body)) {
      const refusal = changesLogic.notEditable(key);
      if (refusal) throw refusal;
    }
    if (Object.keys(body).some((key) => !BODY_KEYS.includes(key))) throw fail(400, "INVALID_REQUEST", "Send the request as { expectedRevision, reason, changes }.");
    if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) throw fail(400, "INVALID_REQUEST", "Send the revision you were looking at as expectedRevision.");
    if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") throw fail(400, "INVALID_REQUEST", "dryRun must be true or false.");
    const dryRun = body.dryRun === true;
    // The reason is asked for after the preview has been seen, so a dry run does not need one (and never keeps it).
    if (!dryRun) changesLogic.checkReason(body.reason);
    return { expectedRevision: body.expectedRevision, reason: body.reason, changes: body.changes, dryRun };
  }

  assertEditable(application) {
    if (!EDITABLE_STATUSES.includes(application.status)) {
      throw fail(409, "STATUS_NOT_EDITABLE", "A completed application cannot be edited. Reopen it for review first.");
    }
  }

  revisionChanged() {
    return fail(409, "REVISION_CHANGED", "The application was changed by someone else while you were looking. Reload the latest version and try again.");
  }

  /**
   * Which stored answers to write and which to remove, by comparing the whole old and new sets key by key: only
   * answers that really differ are written, and only answers the config knows are removed.
   */
  answerWrites(cfg, before, after) {
    const keys = new Set([...cfg.questions.filter((q) => !q.group && q.type !== "FILE").map((q) => q.id), ...(cfg.groups || []).map((g) => g.id)]);
    const set = {};
    const unset = [];
    for (const key of keys) {
      const was = before[key];
      const now = after[key];
      if (now === undefined) {
        if (was !== undefined) unset.push(key);
      } else if (changesLogic.stable(was) !== changesLogic.stable(now)) {
        set[key] = now;
      }
    }
    return { set, unset };
  }

  /** The new name/email/phone copy for the admin list, or undefined when it is already right. */
  summaryUpdate(application, answers) {
    const next = summaryOf(answers);
    const current = application.summary;
    if (current && current.name === next.name && current.email === next.email && current.phone === next.phone) return undefined;
    return next;
  }
}

module.exports = new TouristVisaAdminEditService();
module.exports.TouristVisaAdminEditService = TouristVisaAdminEditService;
module.exports.EDITABLE_STATUSES = EDITABLE_STATUSES;
