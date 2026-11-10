/**
 * TouristVisaApplication Service
 * Business logic for a signed-in applicant's own Tourist Visa application
 */

const crypto = require("crypto");
const z = require("zod");
const defaultRepository = require("../repositories/touristVisaApplicationRepository");
const defaultChanges = require("../repositories/touristVisaChangeRepository");
const engine = require("../shared/tourist-visa/engine");
const { AppError } = require("../middleware/errorHandler");
const { toDocumentView } = require("../utils/touristVisaDocumentView");
const { buildReview } = require("../shared/tourist-visa/view");
const { summaryOf } = require("../utils/touristVisaSummary");
const { correctionsOf } = require("../utils/touristVisaChanges");
const logger = require("../utils/logger");

// A reference is "TV-" and eight characters from an alphabet without look-alikes (no 0, O, 1, I or L), so it can be
// read out over the phone. 31 characters, eight places: about 850 billion references.
const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const REFERENCE_LENGTH = 8;
const REFERENCE_ATTEMPTS = 5; // tries before giving up when a reference is already taken
const SUBMIT_ATTEMPTS = 3; // times the application is read and checked again when it changes while being submitted

/** A new reference such as TV-K7M2QX9P. `pick(n)` returns a whole number from 0 to n - 1 (crypto.randomInt by default). */
function generateReference(pick = (n) => crypto.randomInt(n)) {
  let text = "";
  for (let i = 0; i < REFERENCE_LENGTH; i += 1) text += REFERENCE_ALPHABET[pick(REFERENCE_ALPHABET.length)];
  return `TV-${text}`;
}

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
  // Metadata only (id, slot, name, size, type, time): no link and no storage id. The names arrive decrypted.
  documents: (application.documents || []).map(toDocumentView),
  submittedAt: application.submittedAt || null,
  // Given when the application is submitted; null before.
  reference: application.reference || null,
  createdAt: application.createdAt,
  updatedAt: application.updatedAt,
});

const isPlainObject = (v) => Object.prototype.toString.call(v) === "[object Object]";

class TouristVisaApplicationService {
  constructor({ repository = defaultRepository, changes = defaultChanges, config = engine.config, now = () => new Date(), newReference = generateReference } = {}) {
    this.repository = repository;
    this.changes = changes;
    this.config = config;
    this.now = now;
    this.newReference = newReference;
    this.snapshots = new Map(); // sha256 -> parsed config of a submitted application, so each is read once
  }

  /**
   * Start an application, or return the one the applicant already has.
   * Returns { application, created }.
   */
  async createOrGetDraft(userId) {
    const existing = await this.repository.findLatestByApplicant(userId);
    if (existing) {
      return { application: this.present(existing), created: false };
    }

    try {
      const created = await this.repository.createDraft(userId);
      return { application: this.present(created), created: true };
    } catch (error) {
      // A concurrent request created the draft first (unique index); return that one.
      if (error && error.code === 11000) {
        const winner = await this.repository.findLatestByApplicant(userId);
        if (winner) {
          return { application: this.present(winner), created: false };
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
    const view = this.present(application);
    // Which answers the team corrected, and when (a date only: never the old value and never the reason).
    if (application.status !== "draft") view.corrections = await this.correctionMarks(application, await this.configOf(application));
    return view;
  }

  /**
   * When the team corrected each answer of a submitted application, by correction key: { "q2_32": Date, "q4_8b[0]": Date }.
   * Read from the change records without their values. Empty for a draft and for an application nobody corrected.
   */
  async correctionMarks(application, cfg) {
    if (application.status === "draft") return {};
    return correctionsOf(cfg, await this.changes.findCorrectionMarks(application._id));
  }

  /**
   * What the applicant is shown. The stored state with two things worked out from the
   * current config and answers, so an application saved under an older version of the
   * config is never shown as more complete than it is:
   *  - a section stored as saved that no longer validates (a question was added, a rule
   *    changed) is shown as needs_review;
   *  - sections that do not apply (none of their questions is visible) carry no status,
   *    and the resume point skips them.
   * Nothing is written; the stored values are corrected the next time a section is saved.
   */
  present(application) {
    const view = toClient(application);
    // A declaration tick whose wording has changed since it was given (or that has no record) is shown
    // unticked, so the applicant ticks the words they are now shown. Stored answers are not touched.
    // Only a draft is checked: a submitted application keeps the ticks it was submitted with, whatever the wording says now.
    const stale = application.status === "draft" ? this.staleDeclarations(application) : [];
    if (stale.length) {
      view.answers = { ...view.answers };
      for (const id of stale) delete view.answers[id];
    }
    const statuses = {};
    for (const section of engine.getVisibleSections(this.config, view.answers)) {
      const state = view.sectionStatus[section.id];
      if (state === "saved" && !this.sectionStillValid(section.id, view.answers)) statuses[section.id] = "needs_review";
      else if (state) statuses[section.id] = state;
    }
    // A section made only of file questions (10D) has no stored status: it follows the uploaded files.
    // Not started with no files, in progress with some, saved once every slot has one. Saving a draft never needs
    // them; `documentsComplete` is what the submit step (8d) must check.
    for (const section of engine.getVisibleSections(this.config, view.answers)) {
      if (!engine.isFilesOnlySection(this.config, section.id)) continue;
      const { state } = engine.documentsStatus(this.config, view.documents, section.id);
      if (state === "complete") statuses[section.id] = "saved";
      else if (state === "in_progress") statuses[section.id] = "in_progress";
      else delete statuses[section.id];
    }
    view.documentsComplete = engine.documentsComplete(this.config, view.documents);
    view.sectionStatus = statuses;
    view.currentSection = this.resumeSection(statuses, view.answers);
    return view;
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

    // (checked after the lock, so a submitted application answers the locked error for every section)
    if (engine.isFilesOnlySection(cfg, sectionId)) {
      // 10D has no answers: its files are saved as they are uploaded, and its status follows them.
      return { saved: false, status: 400, message: "This section has no answers to save. Files are saved as soon as they are uploaded." };
    }

    if (!isPlainObject(body) || Object.keys(body).some((k) => k !== "answers") || !isPlainObject(body.answers)) {
      return { saved: false, status: 400, message: 'Send the answers as { "answers": { ... } }.' };
    }

    const existing = application.answers || {};
    if (!engine.isSectionVisible(cfg, sectionId, existing)) {
      return { saved: false, status: 400, message: "This section does not apply to your application." };
    }
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

    // A section that no longer applies (for example 4A once 2.13 stops indicating a partner)
    // has no status at all, neither saved nor needing review. If it applies again it starts fresh.
    const visibleIds = new Set(engine.getVisibleSections(cfg, pruned).map((s) => s.id));
    const clearStatus = cfg.sections.map((s) => s.id).filter((id) => !visibleIds.has(id) && previous[id] !== undefined);
    for (const id of clearStatus) delete statuses[id];

    const updated = await this.repository.saveSection(application._id, userId, {
      answers: result.data,
      unset: [...toUnset],
      sectionStatus,
      clearStatus,
      currentSection: this.resumeSection(statuses, pruned),
      declarations: this.declarationRecords(sectionId, result.data, application.declarations, userId),
    });

    if (!updated) {
      // Changed under us (submitted or removed between the read and the write).
      const current = await this.repository.findLatestByApplicant(userId);
      if (current && current.status !== "draft") {
        throw new AppError("This application has been submitted and can no longer be edited.", 409);
      }
      throw new AppError("You have not started a Tourist Visa application yet.", 404);
    }

    return { saved: true, application: this.present(updated), needsReview, removed: [...toUnset] };
  }

  // -------------------------------------------------------------------------
  // Submitting
  // -------------------------------------------------------------------------

  /** The config as text and its SHA-256: what a submitted application is stored with. Worked out once. */
  configSnapshot() {
    if (!this.snapshot) {
      const json = JSON.stringify(this.config);
      this.snapshot = { json, sha256: crypto.createHash("sha256").update(json, "utf8").digest("hex") };
    }
    return this.snapshot;
  }

  /**
   * What stops this draft from being submitted: for each section that applies, how many problems it has
   * ({ id, problems }, in form order). Only ids and counts, never an answer. A section counts when it has not been
   * saved or needs another look, when its stored answers do not pass the current rules, when a Part 9 tick no
   * longer matches the current wording, or (the documents section) when a file question has no file yet.
   */
  submitProblems(application) {
    const cfg = this.config;
    const view = this.present(application); // for a draft: stale ticks already removed, statuses already worked out
    const found = [];
    for (const section of engine.getVisibleSections(cfg, view.answers)) {
      let problems = 0;
      if (engine.isFilesOnlySection(cfg, section.id)) {
        problems = engine.documentsStatus(cfg, view.documents, section.id).slots.filter((slot) => slot.count === 0).length;
      } else {
        const stored = {};
        for (const id of this.sectionKeys(section.id)) if (view.answers[id] !== undefined) stored[id] = view.answers[id];
        const result = engine.validateSection(z, cfg, section.id, stored, view.answers);
        problems = Object.keys(result.errors).length + result.unknownKeys.length;
        if (view.sectionStatus[section.id] !== "saved") problems = Math.max(problems, 1);
      }
      if (problems > 0) found.push({ id: section.id, problems });
    }
    return found;
  }

  /**
   * Submit the applicant's own draft: draft -> submitted.
   *
   * Everything is checked again against the current config first (every section, the documents, every Part 9 tick and
   * the final declaration). Nothing is submitted unless all of it passes, and the answer to a failure names sections and counts only.
   * The change itself is one conditional write that matches only if the application is still a draft AND has not
   * changed since it was checked, so of two submits at the same moment exactly one wins and the other is told it is
   * already submitted. The config it is submitted under is kept (once per distinct config), a reference is given, and
   * the final declaration is recorded like the Part 9 ticks: hash of the exact wording, time, user, config version, no IP.
   * Returns { application, reference }.
   */
  async submit(userId, body) {
    if (!isPlainObject(body) || Object.keys(body).some((key) => key !== "declarationAccepted")) {
      throw new AppError('Send the request as { "declarationAccepted": true }.', 400, "INVALID_REQUEST");
    }
    this.repository.assertEncryptionReady(); // the answers cannot be read back without the key

    for (let attempt = 0; attempt < SUBMIT_ATTEMPTS; attempt += 1) {
      const application = await this.repository.findLatestByApplicant(userId);
      if (!application) throw new AppError("You have not started a Tourist Visa application yet.", 404, "APPLICATION_NOT_FOUND");
      if (application.status !== "draft") throw new AppError("This application has already been submitted.", 409, "ALREADY_SUBMITTED");

      const sections = this.submitProblems(application);
      const declarationMissing = body.declarationAccepted !== true;
      if (sections.length > 0 || declarationMissing) {
        throw new AppError("Your application is not ready to submit yet.", 422, "NOT_READY", { sections, declarationMissing });
      }

      const { sha256, json } = this.configSnapshot();
      await this.repository.saveConfigSnapshot({ sha256, version: this.config.version, json });

      const submittedAt = this.now();
      const declarationRecord = {
        wordingSha256: this.wordingHash("declarations.submit"),
        configVersion: this.config.version,
        acceptedAt: submittedAt,
        acceptedBy: userId,
      };
      const submitted = await this.writeSubmission(application, userId, { sha256, submittedAt, declarationRecord });
      if (submitted) {
        logger.info("Tourist Visa application submitted", { applicationId: String(submitted._id) }); // ids only
        return { application: this.present(submitted), reference: submitted.reference };
      }

      // It did not match: someone else submitted it, or it changed while it was being checked.
      const current = await this.repository.findLatestByApplicant(userId);
      if (current && current.status !== "draft") throw new AppError("This application has already been submitted.", 409, "ALREADY_SUBMITTED");
    }
    throw new AppError("Your application changed while it was being submitted. Please check it and try again.", 409, "APPLICATION_CHANGED");
  }

  /** The conditional write, with another reference when one is already taken. Returns the application, or null if it did not match. */
  async writeSubmission(application, userId, { sha256, submittedAt, declarationRecord }) {
    for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
      try {
        return await this.repository.submitApplication(application._id, userId, {
          expectedUpdatedAt: application.updatedAt,
          reference: this.newReference(),
          configSha256: sha256,
          configVersion: this.config.version,
          declarationRecord,
          submittedAt,
          summary: summaryOf(application.answers), // for the admin list, made once, from answers stored as plain text anyway
        });
      } catch (error) {
        if (!this.repository.isReferenceCollision(error)) throw error;
      }
    }
    logger.error("Tourist Visa reference could not be made unique", { attempts: REFERENCE_ATTEMPTS });
    throw new AppError("Your application could not be submitted just now. Please try again.", 503, "REFERENCE_UNAVAILABLE");
  }

  /** The config a submitted application was submitted under (the live one for a draft). */
  async configOf(application) {
    if (application.status === "draft" || !application.configSha256) return this.config;
    const known = this.snapshots.get(application.configSha256);
    if (known) return known;
    const snapshot = await this.repository.findConfigSnapshot(application.configSha256);
    let parsed;
    try {
      parsed = JSON.parse(snapshot.json);
    } catch {
      parsed = null;
    }
    if (!parsed) {
      logger.error("Tourist Visa config snapshot is missing or unreadable", { applicationId: String(application._id) });
      throw new AppError("Your application could not be shown. Please contact support.", 500, "SNAPSHOT_UNAVAILABLE");
    }
    this.snapshots.set(application.configSha256, parsed);
    return parsed;
  }

  /**
   * The applicant's own application as a readable review: the shared view builder over the decrypted answers, the
   * files (names and sizes only) and the declaration records, using the config the application was submitted under.
   * Only the owner gets it. No link and no storage id is in it.
   */
  async getReview(userId) {
    const application = await this.repository.findLatestByApplicant(userId);
    if (!application) throw new AppError("You have not started a Tourist Visa application yet.", 404, "APPLICATION_NOT_FOUND");
    const view = this.present(application);
    const cfg = await this.configOf(application);
    const documents = view.documents.map((doc) => ({ slot: doc.slot, name: doc.name, size: doc.size }));
    const record = application.declarations && application.declarations.submit;
    const corrections = await this.correctionMarks(application, cfg);
    return {
      review: buildReview(cfg, view.answers, documents, application.declarations || {}, corrections),
      status: application.status,
      reference: application.reference || null,
      submittedAt: application.submittedAt || null,
      configVersion: application.configVersion,
      documentsComplete: view.documentsComplete,
      declaration: { text: cfg.declarations.submit.text, acceptedAt: record ? record.acceptedAt : null },
    };
  }

  /** SHA-256 of the exact words of a declaration question (its tick text and guidance). */
  wordingHash(questionId) {
    return crypto.createHash("sha256").update(engine.wordingOf(this.config, questionId), "utf8").digest("hex");
  }

  /**
   * Records for the declaration ticks of a section that were just given: one per ACK question answered
   * true whose stored record is missing or was made for other wording. A tick that is already recorded
   * for the same wording keeps its original time and user. No IP address or browser data is kept.
   */
  declarationRecords(sectionId, savedAnswers, stored, userId) {
    const records = {};
    for (const q of this.config.questions) {
      if (q.section !== sectionId || q.type !== "ACK" || savedAnswers[q.id] !== true) continue;
      const wordingSha256 = this.wordingHash(q.id);
      const current = stored && stored[q.id];
      if (current && current.wordingSha256 === wordingSha256) continue;
      records[q.id] = { wordingSha256, configVersion: this.config.version, acceptedAt: new Date(), acceptedBy: userId };
    }
    return records;
  }

  /** Declaration ticks answered true whose record does not match the wording now in the config. */
  staleDeclarations(application) {
    const answers = application.answers || {};
    const stored = application.declarations || {};
    return this.config.questions
      .filter((q) => q.type === "ACK" && answers[q.id] === true)
      .filter((q) => !stored[q.id] || stored[q.id].wordingSha256 !== this.wordingHash(q.id))
      .map((q) => q.id);
  }

  /** Answer keys that belong to a section: its questions and its repeating groups. */
  sectionKeys(sectionId) {
    const cfg = this.config;
    return [
      ...cfg.questions.filter((q) => q.section === sectionId && !q.group && q.type !== "FILE").map((q) => q.id),
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
      if (!engine.isSectionVisible(cfg, section.id, after)) continue; // it no longer applies; its status is cleared instead

      const keys = new Set(this.sectionKeys(section.id));
      const hadRemovals = removedIds.some((id) => keys.has(id));
      const shownBefore = engine.getVisibleQuestions(cfg, section.id, before).map((q) => q.id).join();
      const shownAfter = engine.getVisibleQuestions(cfg, section.id, after).map((q) => q.id).join();

      const stillValid = this.sectionStillValid(section.id, after);

      if (hadRemovals || shownBefore !== shownAfter || !stillValid) affected.push(section.id);
    }
    return affected;
  }

  /** Does the section's stored answers still pass validation against the given application answers? */
  sectionStillValid(sectionId, answers) {
    const stored = {};
    for (const id of this.sectionKeys(sectionId)) if (answers[id] !== undefined) stored[id] = answers[id];
    return engine.validateSection(z, this.config, sectionId, stored, answers).success;
  }

  /**
   * Where the applicant resumes: the first section that applies and is not saved, or the
   * last one that applies when all are. Sections that do not apply are skipped.
   */
  resumeSection(statuses, answers) {
    const sections = engine.getVisibleSections(this.config, answers || {});
    const next = sections.find((s) => statuses[s.id] !== "saved");
    return (next || sections[sections.length - 1] || this.config.sections[0]).id;
  }
}

module.exports = new TouristVisaApplicationService();
module.exports.generateReference = generateReference;
module.exports.REFERENCE_ALPHABET = REFERENCE_ALPHABET;
module.exports.TouristVisaApplicationService = TouristVisaApplicationService;
