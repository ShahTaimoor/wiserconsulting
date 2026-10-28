/**
 * TouristVisaApplication Service
 * Business logic for a signed-in applicant's own Tourist Visa application
 */

const z = require("zod");
const defaultRepository = require("../repositories/touristVisaApplicationRepository");
const engine = require("../shared/tourist-visa/engine");
const { AppError } = require("../middleware/errorHandler");

/**
 * What the client is allowed to see. An allowlist, so a field added to the
 * model later is not exposed by accident (applicant id, isDeleted, storage ids).
 * Answers arrive already decrypted from the repository, and only the owner
 * ever gets them.
 */
const toClient = (application) => ({
  id: String(application._id),
  visaType: application.visaType,
  status: application.status,
  currentSection: application.currentSection,
  configVersion: application.configVersion,
  sectionStatus: application.sectionStatus || {},
  answers: application.answers || {},
  documents: (application.documents || []).map((doc) => ({
    id: String(doc._id),
    kind: doc.kind,
    originalName: doc.originalName,
    mimetype: doc.mimetype,
    size: doc.size,
    uploadedAt: doc.uploadedAt,
  })),
  submittedAt: application.submittedAt || null,
  createdAt: application.createdAt,
  updatedAt: application.updatedAt,
});

const isPlainObject = (v) => Object.prototype.toString.call(v) === "[object Object]";

class TouristVisaApplicationService {
  constructor({ repository = defaultRepository, config = engine.config } = {}) {
    this.repository = repository;
    this.config = config;
  }

  /**
   * Start an application, or return the one the applicant already has.
   * Returns { application, created }.
   */
  async createOrGetDraft(userId) {
    const existing = await this.repository.findLatestByApplicant(userId);
    if (existing) {
      return { application: toClient(existing), created: false };
    }

    try {
      const created = await this.repository.createDraft(userId);
      return { application: toClient(created), created: true };
    } catch (error) {
      // A concurrent request created the draft first (unique index); return that one.
      if (error && error.code === 11000) {
        const winner = await this.repository.findLatestByApplicant(userId);
        if (winner) {
          return { application: toClient(winner), created: false };
        }
      }
      throw error;
    }
  }

  /**
   * The applicant's own application
   */
  async getMine(userId) {
    const application = await this.repository.findLatestByApplicant(userId);
    if (!application) {
      throw new AppError("You have not started a Tourist Visa application yet.", 404);
    }
    return toClient(application);
  }

  /**
   * Save one section of the applicant's own draft ("Save and continue").
   *
   * `body` is the request body: { answers: { <questionId>: value, ... } }, the
   * complete new state of the section. The section is validated with the shared
   * engine against the merged answers of the whole application. Nothing is
   * written unless the section is valid.
   *
   * Returns { saved: true, application, needsReview, removed } or, for a
   * request that cannot be saved, { saved: false, status, message, errors? }.
   */
  async saveSection(userId, sectionId, body) {
    const cfg = this.config;

    if (!cfg.sections.some((s) => s.id === sectionId)) {
      throw new AppError("Section not found.", 404);
    }
    this.repository.assertEncryptionReady(); // refuse to save at all without the key

    const application = await this.repository.findLatestByApplicant(userId);
    if (!application) {
      throw new AppError("You have not started a Tourist Visa application yet.", 404);
    }
    if (application.status !== "draft") {
      throw new AppError("This application has been submitted and can no longer be edited.", 409);
    }

    if (!isPlainObject(body) || Object.keys(body).some((k) => k !== "answers") || !isPlainObject(body.answers)) {
      return { saved: false, status: 400, message: 'Send the answers as { "answers": { ... } }.' };
    }

    const existing = application.answers || {};
    const result = engine.validateSection(z, cfg, sectionId, body.answers, existing);
    if (result.unknownKeys.length) {
      return { saved: false, status: 400, message: "Some fields do not belong to this section." };
    }
    if (!result.success) {
      return { saved: false, status: 422, message: "Some answers need attention.", errors: result.errors };
    }

    // The whole application as it will be: other sections as stored, this one as validated,
    // then everything hidden by the new answers pruned (in any section).
    const own = new Set(this.sectionKeys(sectionId));
    const merged = { ...result.data };
    for (const [id, value] of Object.entries(existing)) if (!own.has(id)) merged[id] = value;
    const { answers: pruned, removed: prunedRemoved } = engine.pruneAnswers(cfg, merged);

    const toUnset = new Set(prunedRemoved.filter((id) => existing[id] !== undefined));
    for (const id of own) if (existing[id] !== undefined && result.data[id] === undefined) toUnset.add(id);
    for (const id of Object.keys(result.data)) toUnset.delete(id);

    const previous = application.sectionStatus || {};
    const needsReview = this.findSectionsNeedingReview(sectionId, previous, existing, pruned, prunedRemoved);

    const sectionStatus = { [sectionId]: "saved" };
    for (const id of needsReview) sectionStatus[id] = "needs_review";
    const statuses = { ...previous, ...sectionStatus };

    const updated = await this.repository.saveSection(application._id, userId, {
      answers: result.data,
      unset: [...toUnset],
      sectionStatus,
      currentSection: this.resumeSection(statuses),
    });

    if (!updated) {
      // Changed under us (submitted or removed between the read and the write).
      const current = await this.repository.findLatestByApplicant(userId);
      if (current && current.status !== "draft") {
        throw new AppError("This application has been submitted and can no longer be edited.", 409);
      }
      throw new AppError("You have not started a Tourist Visa application yet.", 404);
    }

    return { saved: true, application: toClient(updated), needsReview, removed: [...toUnset] };
  }

  /** Answer keys that belong to a section: its questions and its repeating groups. */
  sectionKeys(sectionId) {
    const cfg = this.config;
    return [
      ...cfg.questions.filter((q) => q.section === sectionId && !q.group).map((q) => q.id),
      ...(cfg.groups || []).filter((g) => g.section === sectionId).map((g) => g.id),
    ];
  }

  /**
   * Other sections already saved that this change affects: answers were removed
   * from them, the set of questions they show changed, or they no longer
   * validate against the new answers (for example a date ordering across sections).
   */
  findSectionsNeedingReview(savedSectionId, previousStatus, before, after, removedIds) {
    const cfg = this.config;
    const affected = [];

    for (const section of cfg.sections) {
      if (section.id === savedSectionId || previousStatus[section.id] !== "saved") continue;

      const keys = new Set(this.sectionKeys(section.id));
      const hadRemovals = removedIds.some((id) => keys.has(id));
      const shownBefore = engine.getVisibleQuestions(cfg, section.id, before).map((q) => q.id).join();
      const shownAfter = engine.getVisibleQuestions(cfg, section.id, after).map((q) => q.id).join();

      const stored = {};
      for (const id of keys) if (after[id] !== undefined) stored[id] = after[id];
      const stillValid = engine.validateSection(z, cfg, section.id, stored, after).success;

      if (hadRemovals || shownBefore !== shownAfter || !stillValid) affected.push(section.id);
    }
    return affected;
  }

  /** Where the applicant resumes: the first section not saved, or the last one when all are. */
  resumeSection(statuses) {
    const sections = this.config.sections;
    const next = sections.find((s) => statuses[s.id] !== "saved");
    return (next || sections[sections.length - 1]).id;
  }
}

module.exports = new TouristVisaApplicationService();
module.exports.TouristVisaApplicationService = TouristVisaApplicationService;
