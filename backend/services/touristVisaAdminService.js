/**
 * Tourist Visa admin service: the administrator's read-only view of submitted applications, plus the status.
 *
 * What it never does: show a draft, change an answer, return a link, a storage id or an encrypted value
 * except through the one document-link call, or write anything but ids, fixed action names and times to the
 * audit log. Every view is written to the audit log BEFORE its data is returned: if the row cannot be written,
 * nothing is shown. The caller (the route) has already checked that the user is an administrator.
 *
 * The Overview is built with the shared review builder from the decrypted answers and the config the application
 * was submitted under (its snapshot), never from today's config.
 */

const mongoose = require("mongoose");
const defaultRepository = require("../repositories/touristVisaApplicationRepository");
const defaultAudit = require("../repositories/touristVisaAuditRepository");
const defaultApplications = require("./touristVisaApplicationService");
const defaultDocuments = require("./touristVisaDocumentService");
const engine = require("../shared/tourist-visa/engine");
const { buildReview } = require("../shared/tourist-visa/view");
const { summaryOf, telHref } = require("../utils/touristVisaSummary");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");

const STATUS_VALUES = ["submitted", "in_review", "completed"];
/** The only moves between statuses. Anything else is refused. */
const STATUS_MOVES = Object.freeze({
  submitted: ["in_review"],
  in_review: ["completed"],
  completed: ["in_review"],
});
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;
const MAX_SUMMARIES_PER_REQUEST = 50;
const ACTIVITY_LIMIT = 100;

const isPlainObject = (v) => Object.prototype.toString.call(v) === "[object Object]";
const fail = (status, code, message) => new AppError(message, status, code);

/** A whole number from a query string, or the fallback when it is missing; null when it is present but not a whole number. */
function wholeNumber(value, fallback) {
  if (value === undefined || value === "") return fallback;
  if (typeof value !== "string" || !/^\d{1,6}$/.test(value)) return null;
  return Number(value);
}

class TouristVisaAdminService {
  constructor({ repository = defaultRepository, audit = defaultAudit, applications = defaultApplications, documents = defaultDocuments, now = () => new Date() } = {}) {
    this.repository = repository;
    this.audit = audit;
    this.applications = applications;
    this.documents = documents;
    this.now = now;
  }

  /** The moves open from a status. */
  allowedMoves(status) {
    return STATUS_MOVES[status] ? [...STATUS_MOVES[status]] : [];
  }

  /**
   * The list: submitted and later applications only, newest first. Query: status, q (a reference, or part of a name
   * or an email), page, pageSize. Each application shown is written to the audit log as seen in the list.
   */
  async list(adminId, query = {}) {
    const q = query.q === undefined ? "" : query.q;
    if (typeof q !== "string" || q.length > MAX_SEARCH_LENGTH) throw fail(400, "INVALID_QUERY", "The search text is not valid.");
    const status = query.status === undefined || query.status === "" ? undefined : query.status;
    if (status !== undefined && !STATUS_VALUES.includes(status)) throw fail(400, "INVALID_QUERY", "The status filter is not valid.");
    const page = wholeNumber(query.page, 1);
    const pageSize = wholeNumber(query.pageSize, DEFAULT_PAGE_SIZE);
    if (page === null || page < 1 || pageSize === null || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw fail(400, "INVALID_QUERY", "The page or the page size is not valid.");
    }

    await this.fillMissingSummaries();
    const { rows, total } = await this.repository.listForAdmin({ status, q, page, pageSize });

    const at = this.now();
    await this.audit.append(rows.map((row) => ({ adminId, applicationId: row._id, action: "list_view", at })));

    return {
      applications: rows.map((row) => ({
        id: String(row._id),
        reference: row.reference || null,
        name: (row.summary && row.summary.name) || "",
        email: (row.summary && row.summary.email) || "",
        phone: (row.summary && row.summary.phone) || "",
        submittedAt: row.submittedAt || null,
        status: row.status,
        documentCount: row.documentCount,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** The Overview of one application. One audit row per view. */
  async overview(adminId, id) {
    const application = await this.load(id);
    await this.ensureSummary(application);
    await this.audit.append([{ adminId, applicationId: application._id, action: "overview_view", at: this.now() }]);

    const cfg = await this.applications.configOf(application);
    const files = (application.documents || []).map((doc) => ({ id: doc.id, slot: doc.slot, name: doc.name || doc.originalName, size: doc.bytes, type: doc.mime }));
    const review = buildReview(cfg, application.answers || {}, files.map((f) => ({ slot: f.slot, name: f.name, size: f.size })), application.declarations || {});

    const fileSlots = {};
    for (const question of engine.getFileQuestions(cfg)) fileSlots[question.id] = question.slot;

    return {
      application: {
        id: String(application._id),
        reference: application.reference || null,
        status: application.status,
        submittedAt: application.submittedAt || null,
        configVersion: application.configVersion,
        allowedMoves: this.allowedMoves(application.status),
      },
      call: this.callBlock(application, review),
      review,
      documents: files,
      fileSlots,
    };
  }

  /**
   * The call block: who to ring, on what number, in which language, and how they said they can be reached.
   * Taken from the stored answers and from the review's own words for the choices.
   */
  callBlock(application, review) {
    const answers = application.answers || {};
    const summary = summaryOf(answers);
    const rows = new Map();
    for (const part of review.parts) for (const section of part.sections) for (const row of section.rows) rows.set(row.id, row);
    const value = (id) => (rows.has(id) && !rows.get(id).empty ? rows.get(id).value : "");
    const pick = (ids) => ids.filter((id) => rows.has(id) && !rows.get(id).empty).map((id) => ({ id, label: rows.get(id).label, value: rows.get(id).value }));

    const language = value("q10_4") === "Other" && value("q10_4a") ? value("q10_4a") : value("q10_4");
    return {
      name: summary.name,
      phone: { display: summary.phone, tel: telHref(summary.phone) },
      email: summary.email,
      preferredLanguage: language,
      contact: pick(["q2_33", "q2_34", "q2_35", "q2_9"]),
      reference: application.reference || null,
      submittedAt: application.submittedAt || null,
      status: application.status,
    };
  }

  /** A signed link to one of the application's files, valid for 2 minutes. The only place a link ever leaves the server. */
  async documentLink(adminId, id, docId) {
    const application = await this.load(id);
    if (typeof docId !== "string" || !(application.documents || []).some((doc) => doc.id === docId)) {
      throw fail(404, "DOCUMENT_NOT_FOUND", "File not found.");
    }
    // The request is recorded first (the document id only: never its name and never the link).
    await this.audit.append([{ adminId, applicationId: application._id, action: "document_link", documentId: docId, at: this.now() }]);
    return this.documents.getTemporaryLink(application._id, docId);
  }

  /** submitted -> in_review, in_review -> completed, completed -> in_review. Recorded with the old and the new status. */
  async updateStatus(adminId, id, body) {
    if (!isPlainObject(body) || Object.keys(body).some((key) => key !== "status") || typeof body.status !== "string") {
      throw fail(400, "INVALID_REQUEST", 'Send the request as { "status": "in_review" }.');
    }
    if (!STATUS_VALUES.includes(body.status)) throw fail(400, "INVALID_STATUS", "That is not a status an application can be moved to.");

    const application = await this.load(id);
    const from = application.status;
    const to = body.status;
    if (!STATUS_MOVES[from] || !STATUS_MOVES[from].includes(to)) {
      throw fail(409, "INVALID_STATUS_MOVE", "The application cannot be moved from that status to the one asked for.");
    }
    const changed = await this.repository.changeStatus(application._id, from, to);
    if (!changed) throw fail(409, "STATUS_CHANGED", "The status changed while you were looking. Reload the application and try again.");

    try {
      await this.audit.append([{ adminId, applicationId: application._id, action: "status_change", fromStatus: from, toStatus: to, at: this.now() }]);
    } catch (error) {
      // A change that cannot be recorded is undone, so there is never a change without its row.
      await this.repository.changeStatus(application._id, to, from).catch(() => {});
      logger.error("Tourist Visa status change could not be recorded and was undone", { applicationId: String(application._id) });
      throw error;
    }
    return { status: to, allowedMoves: this.allowedMoves(to) };
  }

  /** The audit rows of one application, newest first: who, what, when. Read only. */
  async activity(id) {
    const application = await this.load(id);
    return { activity: await this.audit.findByApplication(application._id, ACTIVITY_LIMIT) };
  }

  // -------------------------------------------------------------------------

  /** A submitted or later application, decrypted. A draft, a made-up id or a missing one is the same 404. */
  async load(id) {
    if (typeof id !== "string" || !/^[0-9a-f]{24}$/i.test(id) || !mongoose.Types.ObjectId.isValid(id)) throw fail(404, "APPLICATION_NOT_FOUND", "Application not found.");
    this.repository.assertEncryptionReady();
    const application = await this.repository.findForAdmin(id);
    if (!application) throw fail(404, "APPLICATION_NOT_FOUND", "Application not found.");
    return application;
  }

  /** Fills the summary of an older submitted application, once. */
  async ensureSummary(application) {
    if (application.summary) return;
    await this.repository.setSummaryOnce(application._id, summaryOf(application.answers));
  }

  /** The same for every older submitted application that has none, a bounded number at a time. */
  async fillMissingSummaries() {
    const ids = await this.repository.findIdsWithoutSummary(MAX_SUMMARIES_PER_REQUEST);
    for (const id of ids) {
      const application = await this.repository.findForAdmin(String(id));
      if (application) await this.ensureSummary(application);
    }
  }
}

module.exports = new TouristVisaAdminService();
module.exports.TouristVisaAdminService = TouristVisaAdminService;
module.exports.STATUS_MOVES = STATUS_MOVES;
