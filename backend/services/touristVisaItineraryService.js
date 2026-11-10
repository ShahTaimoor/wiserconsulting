/**
 * Tourist Visa itinerary: a proposed, day-by-day plan for the visit. Admin only: nothing here ever reaches an applicant response, a
 * log or an audit row as text.
 *
 * It follows the cover letter (services/touristVisaCoverLetterService.js) rule for rule, with its own facts, prompt and checks:
 *
 *  - Written ON DEMAND by an administrator (never at submit, never from the browser) from the itinerary's own small allowlist of
 *    answers (shared/tourist-visa/itineraryFacts.js). The AI sees tokens for names and the like, never the real values.
 *  - The SERVER writes the skeleton (a heading for each day, or each week of a long stay, with the right dates and weekdays). The AI
 *    returns JSON with exactly one short description for each heading, checked strictly (utils/touristVisaItineraryChecks.js).
 *  - Fallback layers: AI off, failing, rate limited or over its limits -> the template itinerary; an AI answer that fails the checks ->
 *    ONE more request (if the limits have room), then the template, with a fixed code recorded. It can always be edited by hand.
 *  - Missing or impossible arrival/departure dates are refused with a fixed code and the numbers of the questions to fix.
 *  - Versions are appended and never changed; only the latest can be approved; when the answers it uses have changed since the latest
 *    version, the view says so (stale). Nothing is regenerated automatically.
 *  - The daily and per-administrator limits are SHARED with the cover letter (repositories/aiUsageRepository.js).
 *  - Reading, generating, editing and approving are written to the audit log BEFORE the data is returned or written.
 *
 * The PDF step will use the APPROVED version of the text, not the latest draft.
 */

const crypto = require("crypto");
const defaultItineraries = require("../repositories/touristVisaItineraryRepository");
const defaultAudit = require("../repositories/touristVisaAuditRepository");
const defaultApplications = require("./touristVisaApplicationService");
const defaultAdmin = require("./touristVisaAdminService");
const defaultAi = require("./aiService");
const { AiError } = defaultAi;
const { getFieldEncryptionKey } = require("../config/fieldEncryption");
const { buildItineraryFacts } = require("../shared/tourist-visa/itineraryFacts");
const { placesIn } = require("../shared/tourist-visa/places");
const { ITINERARY_PROMPT_VERSION, SYSTEM_PROMPT, buildUserPrompt } = require("../config/touristVisaItineraryPrompt");
const { buildSkeleton } = require("../utils/touristVisaItinerarySkeleton");
const { buildTemplateDescriptions } = require("../utils/touristVisaItineraryTemplate");
const { parseDescriptions, validateDescriptions, assembleItinerary, britishSpelling } = require("../utils/touristVisaItineraryChecks");
const { MAX_TEXT, FALLBACK_REASONS } = require("../models/TouristVisaItinerary");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");

const ITINERARY_STATUSES = ["submitted", "in_review"];
const HOUR = 60 * 60 * 1000;
const SAFE_MODEL = /^[\w./:-]{1,100}$/;

const isPlainObject = (v) => Object.prototype.toString.call(v) === "[object Object]";
const fail = (status, code, message, details) => new AppError(message, status, code, details);
const startOfUtcDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const BLOCKER_MESSAGES = {
  ITINERARY_DATES_MISSING: "The itinerary needs the arrival and departure dates. Fix the answers to the questions listed, then try again.",
  ITINERARY_DATES_INVALID: "The arrival and departure dates cannot make an itinerary (the departure must not be before the arrival, and the visit can be at most six months). Fix the answers to the questions listed, then try again.",
};

class TouristVisaItineraryService {
  constructor({ itineraries = defaultItineraries, audit = defaultAudit, applications = defaultApplications, admin = defaultAdmin, ai = defaultAi, now = () => new Date() } = {}) {
    this.itineraries = itineraries;
    this.audit = audit;
    this.applications = applications;
    this.admin = admin;
    this.ai = ai;
    this.now = now;
  }

  /** The itinerary and its history. Audited as `itinerary_view`. */
  async view(adminId, id) {
    const { application, factsHash, skeleton } = await this.prepare(id);
    await this.audit.append([{ adminId, applicationId: application._id, action: "itinerary_view", at: this.now() }]);
    return this.present(await this.itineraries.findVersions(application._id), factsHash, skeleton);
  }

  /** Writes a new version, by the AI or by the template. Audited as `itinerary_generate` (with the source, the model and the prompt version). */
  async generate(adminId, id) {
    const { application, facts, factsHash, skeleton } = await this.prepare(id);
    if (!skeleton.ok) throw this.refusal(skeleton);
    const latest = await this.itineraries.latest(application._id);
    const version = (latest ? latest.version : 0) + 1;
    const made = await this.compose(adminId, facts, skeleton);
    const at = this.now();
    const model = made.model && SAFE_MODEL.test(made.model) ? made.model : undefined;

    await this.audit.append([{ adminId, applicationId: application._id, action: "itinerary_generate", at, version, source: made.source, ...(model ? { model } : {}), ...(made.promptVersion ? { promptVersion: made.promptVersion } : {}) }]);
    await this.itineraries.append({
      applicationId: application._id,
      version,
      text: made.text,
      source: made.source,
      model,
      fallbackReason: made.fallbackReason,
      aiAttempted: made.aiAttempted,
      aiAttempts: made.aiAttempts,
      promptVersion: made.promptVersion,
      factsHash,
      basedOnRevision: application.revision || 0,
      createdBy: adminId,
      createdAt: at,
    });
    return {
      ...this.present(await this.itineraries.findVersions(application._id), factsHash, skeleton),
      created: { version, source: made.source, ...(model ? { model } : {}), ...(made.fallbackReason ? { fallbackReason: made.fallbackReason } : {}) },
    };
  }

  /** Saves an administrator's text as a NEW version. Body { text, basedOnVersion }. Audited as `itinerary_edit`. */
  async save(adminId, id, body) {
    if (!isPlainObject(body) || Object.keys(body).some((key) => !["text", "basedOnVersion"].includes(key)) || !("text" in body) || !("basedOnVersion" in body)) {
      throw fail(400, "INVALID_REQUEST", 'Send the request as { "text": "...", "basedOnVersion": 1 }.');
    }
    if (typeof body.text !== "string") throw fail(400, "INVALID_TEXT", "The itinerary must be words.");
    const text = body.text.replace(/\r\n/g, "\n").trim();
    if (text.length === 0) throw fail(400, "INVALID_TEXT", "Write the itinerary first.");
    if (text.length > MAX_TEXT) throw fail(400, "INVALID_TEXT", `The itinerary can be at most ${MAX_TEXT} characters.`);
    if (text.includes("\u0000")) throw fail(400, "INVALID_TEXT", "The itinerary contains a character that is not allowed.");
    if (!Number.isInteger(body.basedOnVersion) || body.basedOnVersion < 0) throw fail(400, "INVALID_REQUEST", "Say which version you started from.");

    const { application, factsHash, skeleton } = await this.prepare(id);
    const latest = await this.itineraries.latest(application._id);
    const current = latest ? latest.version : 0;
    if (body.basedOnVersion !== current) throw fail(409, "ITINERARY_CHANGED", "The itinerary was changed by someone else. Reload it and try again.");

    const at = this.now();
    await this.audit.append([{ adminId, applicationId: application._id, action: "itinerary_edit", at, version: current + 1, source: "admin" }]);
    await this.itineraries.append({
      applicationId: application._id,
      version: current + 1,
      text,
      source: "admin",
      aiAttempted: false,
      factsHash,
      basedOnRevision: application.revision || 0,
      createdBy: adminId,
      createdAt: at,
    });
    return this.present(await this.itineraries.findVersions(application._id), factsHash, skeleton);
  }

  /** Approves the latest version (and only the latest). Body { version }. Audited as `itinerary_approve`. */
  async approve(adminId, id, body) {
    if (!isPlainObject(body) || Object.keys(body).some((key) => key !== "version") || !Number.isInteger(body.version) || body.version < 1) {
      throw fail(400, "INVALID_REQUEST", 'Send the request as { "version": 1 }.');
    }
    const { application, factsHash, skeleton } = await this.prepare(id);
    const versions = await this.itineraries.findVersions(application._id);
    const latest = versions[0];
    if (!latest) throw fail(404, "ITINERARY_NOT_FOUND", "There is no itinerary to approve yet.");
    if (body.version !== latest.version) throw fail(409, "ITINERARY_NOT_LATEST", "Only the newest version can be approved. Reload the itinerary.");
    if (latest.status === "approved") throw fail(409, "ALREADY_APPROVED", "This version is already approved.");
    if (latest.factsHash !== factsHash) throw fail(409, "ITINERARY_STALE", "The answers used by the itinerary have changed. Create a new version before approving.");

    const at = this.now();
    await this.audit.append([{ adminId, applicationId: application._id, action: "itinerary_approve", at, version: latest.version, source: latest.source }]);
    const approved = await this.itineraries.approve({ applicationId: application._id, version: latest.version, adminId, at });
    if (!approved) throw fail(409, "ALREADY_APPROVED", "This version is already approved.");
    return this.present(await this.itineraries.findVersions(application._id), factsHash, skeleton);
  }

  // -------------------------------------------------------------------------

  /** The application (submitted or in review), its facts, the skeleton of its itinerary and the keyed hash of the facts. */
  async prepare(id) {
    const application = await this.admin.load(id);
    if (!ITINERARY_STATUSES.includes(application.status)) {
      throw fail(409, "ITINERARY_NOT_AVAILABLE", "An itinerary can only be written for a submitted application that is not completed.");
    }
    const cfg = await this.applications.configOf(application);
    let facts;
    try {
      facts = buildItineraryFacts(cfg, application.answers || {}, { submittedAt: application.submittedAt });
    } catch (error) {
      // The allowlist refused to run: log the reason as ids only, never an answer.
      logger.error("Tourist Visa itinerary facts could not be built", { applicationId: String(application._id), code: error && error.code, problems: error && error.problems });
      throw fail(500, "ITINERARY_UNAVAILABLE", "The itinerary is not available right now. Please contact support.");
    }
    const skeleton = buildSkeleton(facts.raw.arrival, facts.raw.departure);
    return { application, facts, factsHash: this.hash(facts), skeleton };
  }

  /** The refusal for dates that cannot make an itinerary: a fixed code and the numbers of the questions to fix. */
  refusal(skeleton) {
    return fail(422, skeleton.code, BLOCKER_MESSAGES[skeleton.code], { questions: skeleton.questions });
  }

  /** A keyed hash (HMAC) of the facts, so a stored hash cannot be used to guess an answer. */
  hash(facts) {
    return crypto.createHmac("sha256", getFieldEncryptionKey()).update(`touristvisaitinerary:facts:v2:${facts.canonical}`).digest("hex");
  }

  /** Reads and checks what the AI answered: { ok: true, text } or { ok: false, code } (a fixed code, never any text). */
  evaluate(answerText, facts, skeleton) {
    const parsed = parseDescriptions(answerText, skeleton.blocks.length);
    if (!parsed.ok) return parsed;
    const values = facts.values || {};
    const stay = [...new Set([...[].concat(values.accommodationArea || []), ...placesIn([].concat(values.accommodationTowns || []).join(" "))])];
    // Common American spellings are made British first (the checks and the stored text both see the British form).
    const checked = validateDescriptions(parsed.descriptions.map(britishSpelling), { mode: skeleton.mode, named: facts.places, stay, lastDay: true, distinct: true });
    if (!checked.ok) return checked;
    const text = assembleItinerary(skeleton.blocks, checked.descriptions);
    if (text.length > MAX_TEXT) return { ok: false, code: "ITINERARY_BAD_ENTRY", rule: "too-long" };
    return { ok: true, text };
  }

  /** The itinerary text and how it was made: { text, source, model?, fallbackReason?, aiAttempted, ... }. Never throws for an AI failure. */
  async compose(adminId, facts, skeleton) {
    // `requests` is how many times the provider was asked (it counts towards the limits); the prompt version is kept when it was.
    const fallback = (reason, requests) => ({
      text: assembleItinerary(skeleton.blocks, buildTemplateDescriptions(facts, skeleton).map(britishSpelling)),
      source: "template",
      fallbackReason: FALLBACK_REASONS.includes(reason) ? reason : "AI_PROVIDER_ERROR",
      aiAttempted: requests > 0,
      ...(requests > 0 ? { aiAttempts: requests, promptVersion: ITINERARY_PROMPT_VERSION } : {}),
    });

    const unavailable = this.ai.unavailable();
    if (unavailable) return fallback(unavailable, 0);

    const settings = this.ai.settings();
    const now = this.now();
    const usedToday = await this.itineraries.countAiRequests({ since: startOfUtcDay(now) });
    if (usedToday >= settings.dailyLimit) return fallback("AI_DAILY_LIMIT", 0);
    const usedByAdmin = await this.itineraries.countAiRequests({ since: new Date(now.getTime() - HOUR), adminId });
    if (usedByAdmin >= settings.adminHourlyLimit) return fallback("AI_ADMIN_LIMIT", 0);

    const ask = (retry) => this.ai.generate({ system: SYSTEM_PROMPT, user: buildUserPrompt(facts.text, skeleton, { retry }) });
    let answer;
    try {
      answer = await ask(false);
    } catch (error) {
      return error instanceof AiError ? fallback(error.code, error.attempted ? 1 : 0) : fallback("AI_PROVIDER_ERROR", 1);
    }
    let checked = this.evaluate(answer.text, facts, skeleton);
    let requests = 1;

    // An answer that fails the checks: ask ONCE more, if the limits have room for the extra request (the first one is not stored yet).
    if (!checked.ok) {
      logger.warn("Tourist Visa itinerary from the AI was rejected and is asked for again", { code: checked.code, entry: checked.entry, rule: checked.rule });
      if (usedToday + 1 >= settings.dailyLimit || usedByAdmin + 1 >= settings.adminHourlyLimit) return fallback(checked.code, requests);
      try {
        answer = await ask(true);
      } catch (error) {
        // The first answer was not usable and the second could not be had: the template, with the reason the first one failed.
        return fallback(checked.code, requests + (error instanceof AiError ? (error.attempted ? 1 : 0) : 1));
      }
      requests += 1;
      checked = this.evaluate(answer.text, facts, skeleton);
    }
    if (!checked.ok) {
      logger.warn("Tourist Visa itinerary from the AI was rejected", { code: checked.code, entry: checked.entry, rule: checked.rule });
      return fallback(checked.code, requests);
    }
    return { text: checked.text, source: "ai", model: answer.model, aiAttempted: true, aiAttempts: requests, promptVersion: ITINERARY_PROMPT_VERSION };
  }

  present(versions, factsHash, skeleton) {
    const latest = versions[0];
    const unavailable = this.ai.unavailable();
    return {
      versions: versions.map(({ factsHash: _hash, basedOnRevision: _revision, ...rest }) => rest),
      latest: latest ? latest.version : null,
      stale: Boolean(latest && latest.factsHash !== factsHash),
      ai: { available: unavailable === null, ...(unavailable ? { code: unavailable } : {}) },
      maxLength: MAX_TEXT,
      // Why an itinerary cannot be made yet (the dates), as a fixed code and the numbers of the questions to fix; or null.
      blocker: skeleton && !skeleton.ok ? { code: skeleton.code, questions: skeleton.questions } : null,
    };
  }
}

module.exports = new TouristVisaItineraryService();
module.exports.TouristVisaItineraryService = TouristVisaItineraryService;
