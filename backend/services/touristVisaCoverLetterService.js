/**
 * Tourist Visa cover letter (step 8g). Admin only: nothing here ever reaches an applicant response, a log or an
 * audit row as text.
 *
 *  - A letter is written ON DEMAND by an administrator (never at submit, never from the browser) from the facts in
 *    shared/tourist-visa/coverLetterFacts.js: an allowlist of answers, with names held back as placeholders. The AI
 *    sees the placeholders only; the real values are put in afterwards by the server.
 *  - Layers of fallback: AI off, failing, rate limited or over its daily/per-admin limit -> the template letter; an AI
 *    letter that fails the checks (a number, amount or date that is not in the facts, an unknown placeholder, a bad
 *    length) -> the template letter, with a fixed code recorded. A letter can always be written or edited by hand.
 *  - Versions are appended and never changed: generating, or saving an edited text, makes a NEW version. The only change
 *    to a row is its one-time approval, and only the latest version can be approved.
 *  - When the answers the letter uses have changed since its latest version, the view says so (stale). Nothing is ever
 *    regenerated automatically.
 *  - Reading, generating, editing and approving are written to the audit log BEFORE the data is returned or written.
 */

const crypto = require("crypto");
const defaultLetters = require("../repositories/touristVisaCoverLetterRepository");
const defaultAudit = require("../repositories/touristVisaAuditRepository");
const defaultApplications = require("./touristVisaApplicationService");
const defaultAdmin = require("./touristVisaAdminService");
const defaultAi = require("./aiService");
const { AiError } = defaultAi;
const { getFieldEncryptionKey } = require("../config/fieldEncryption");
const { buildFacts } = require("../shared/tourist-visa/coverLetterFacts");
const { PROMPT_VERSION, SYSTEM_PROMPT, buildUserPrompt } = require("../config/touristVisaCoverLetterPrompt");
const { buildTemplate } = require("../utils/touristVisaCoverLetterTemplate");
const { checkLetter, substitute, normalizeClosing, tidy, NAME_GAP } = require("../utils/touristVisaCoverLetterChecks");
const { MAX_TEXT, FALLBACK_REASONS } = require("../models/TouristVisaCoverLetter");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");

const LETTER_STATUSES = ["submitted", "in_review"];
const HOUR = 60 * 60 * 1000;
const PLACEHOLDER = /\[not provided:[^\]]*\]/;
const SAFE_MODEL = /^[\w./:-]{1,100}$/;

const isPlainObject = (v) => Object.prototype.toString.call(v) === "[object Object]";
const fail = (status, code, message) => new AppError(message, status, code);
const startOfUtcDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

class TouristVisaCoverLetterService {
  constructor({ letters = defaultLetters, audit = defaultAudit, applications = defaultApplications, admin = defaultAdmin, ai = defaultAi, now = () => new Date() } = {}) {
    this.letters = letters;
    this.audit = audit;
    this.applications = applications;
    this.admin = admin;
    this.ai = ai;
    this.now = now;
  }

  /** The letter and its history. Audited as `cover_letter_view`. */
  async view(adminId, id) {
    const { application, factsHash } = await this.prepare(id);
    await this.audit.append([{ adminId, applicationId: application._id, action: "cover_letter_view", at: this.now() }]);
    return this.present(await this.letters.findVersions(application._id), factsHash);
  }

  /** Writes a new version, by the AI or by the template. Audited as `cover_letter_generate` (with the source and the model). */
  async generate(adminId, id) {
    const { application, facts, factsHash } = await this.prepare(id);
    const latest = await this.letters.latest(application._id);
    const version = (latest ? latest.version : 0) + 1;
    const made = await this.compose(adminId, facts);
    const at = this.now();
    const model = made.model && SAFE_MODEL.test(made.model) ? made.model : undefined;

    await this.audit.append([{ adminId, applicationId: application._id, action: "cover_letter_generate", at, letterVersion: version, letterSource: made.source, ...(model ? { model } : {}), ...(made.promptVersion ? { promptVersion: made.promptVersion } : {}) }]);
    await this.letters.append({
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
      ...this.present(await this.letters.findVersions(application._id), factsHash),
      created: { version, source: made.source, ...(model ? { model } : {}), ...(made.fallbackReason ? { fallbackReason: made.fallbackReason } : {}) },
    };
  }

  /** Saves an administrator's text as a NEW version. Body { text, basedOnVersion }. Audited as `cover_letter_edit`. */
  async save(adminId, id, body) {
    if (!isPlainObject(body) || Object.keys(body).some((key) => !["text", "basedOnVersion"].includes(key)) || !("text" in body) || !("basedOnVersion" in body)) {
      throw fail(400, "INVALID_REQUEST", 'Send the request as { "text": "...", "basedOnVersion": 1 }.');
    }
    if (typeof body.text !== "string") throw fail(400, "INVALID_TEXT", "The letter must be words.");
    const text = body.text.replace(/\r\n/g, "\n").trim();
    if (text.length === 0) throw fail(400, "INVALID_TEXT", "Write the letter first.");
    if (text.length > MAX_TEXT) throw fail(400, "INVALID_TEXT", `The letter can be at most ${MAX_TEXT} characters.`);
    if (text.includes("\u0000")) throw fail(400, "INVALID_TEXT", "The letter contains a character that is not allowed.");
    if (!Number.isInteger(body.basedOnVersion) || body.basedOnVersion < 0) throw fail(400, "INVALID_REQUEST", "Say which version you started from.");

    const { application, factsHash } = await this.prepare(id);
    const latest = await this.letters.latest(application._id);
    const current = latest ? latest.version : 0;
    if (body.basedOnVersion !== current) throw fail(409, "LETTER_CHANGED", "The cover letter was changed by someone else. Reload it and try again.");

    const at = this.now();
    await this.audit.append([{ adminId, applicationId: application._id, action: "cover_letter_edit", at, letterVersion: current + 1, letterSource: "admin" }]);
    await this.letters.append({
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
    return this.present(await this.letters.findVersions(application._id), factsHash);
  }

  /** Approves the latest version (and only the latest). Body { version }. Audited as `cover_letter_approve`. */
  async approve(adminId, id, body) {
    if (!isPlainObject(body) || Object.keys(body).some((key) => key !== "version") || !Number.isInteger(body.version) || body.version < 1) {
      throw fail(400, "INVALID_REQUEST", 'Send the request as { "version": 1 }.');
    }
    const { application, factsHash } = await this.prepare(id);
    const versions = await this.letters.findVersions(application._id);
    const latest = versions[0];
    if (!latest) throw fail(404, "LETTER_NOT_FOUND", "There is no cover letter to approve yet.");
    if (body.version !== latest.version) throw fail(409, "LETTER_NOT_LATEST", "Only the newest version can be approved. Reload the letter.");
    if (latest.status === "approved") throw fail(409, "ALREADY_APPROVED", "This version is already approved.");
    if (latest.factsHash !== factsHash) throw fail(409, "LETTER_STALE", "The answers used by the letter have changed. Create a new version before approving.");
    if (PLACEHOLDER.test(latest.text)) throw fail(409, "LETTER_HAS_PLACEHOLDERS", "The letter still has [not provided: ...] gaps. Fill them in and save a new version first.");

    const at = this.now();
    await this.audit.append([{ adminId, applicationId: application._id, action: "cover_letter_approve", at, letterVersion: latest.version, letterSource: latest.source }]);
    const approved = await this.letters.approve({ applicationId: application._id, version: latest.version, adminId, at });
    if (!approved) throw fail(409, "ALREADY_APPROVED", "This version is already approved.");
    return this.present(await this.letters.findVersions(application._id), factsHash);
  }

  // -------------------------------------------------------------------------

  /** The application (submitted or in review), its facts and the keyed hash of the facts. */
  async prepare(id) {
    const application = await this.admin.load(id);
    if (!LETTER_STATUSES.includes(application.status)) {
      throw fail(409, "LETTER_NOT_AVAILABLE", "A cover letter can only be written for a submitted application that is not completed.");
    }
    const cfg = await this.applications.configOf(application);
    let facts;
    try {
      facts = buildFacts(cfg, application.answers || {}, { submittedAt: application.submittedAt });
    } catch (error) {
      // The allowlist refused to run: log the reason as ids only, never an answer.
      logger.error("Tourist Visa cover letter facts could not be built", { applicationId: String(application._id), code: error && error.code, problems: error && error.problems });
      throw fail(500, "COVER_LETTER_UNAVAILABLE", "The cover letter is not available right now. Please contact support.");
    }
    return { application, facts, factsHash: this.hash(facts) };
  }

  /** A keyed hash (HMAC) of the facts, so a stored hash cannot be used to guess an answer. */
  hash(facts) {
    return crypto.createHmac("sha256", getFieldEncryptionKey()).update(`touristvisacoverletter:facts:v2:${facts.canonical}`).digest("hex");
  }

  /** The letter text and how it was made: { text, source, model?, fallbackReason?, aiAttempted }. Never throws for an AI failure. */
  async compose(adminId, facts) {
    // `requests` is how many times the provider was asked (it counts towards the limits); the prompt version is kept when it was.
    const fallback = (reason, requests) => ({
      text: substitute(buildTemplate(facts), facts.tokens, facts.redactions),
      source: "template",
      fallbackReason: FALLBACK_REASONS.includes(reason) ? reason : "AI_PROVIDER_ERROR",
      aiAttempted: requests > 0,
      ...(requests > 0 ? { aiAttempts: requests, promptVersion: PROMPT_VERSION } : {}),
    });

    const unavailable = this.ai.unavailable();
    if (unavailable) return fallback(unavailable, 0);

    const settings = this.ai.settings();
    const now = this.now();
    const usedToday = await this.letters.countAiRequests({ since: startOfUtcDay(now) });
    if (usedToday >= settings.dailyLimit) return fallback("AI_DAILY_LIMIT", 0);
    const usedByAdmin = await this.letters.countAiRequests({ since: new Date(now.getTime() - HOUR), adminId });
    if (usedByAdmin >= settings.adminHourlyLimit) return fallback("AI_ADMIN_LIMIT", 0);

    // The end of every letter is made the same before it is checked: the last paragraph, then "Yours faithfully," and the name on their own lines.
    const tidied = (text) => normalizeClosing(tidy(text), { name: facts.tokens.NAME ? "token" : "none" });
    const ask = (retry) => this.ai.generate({ system: SYSTEM_PROMPT, user: buildUserPrompt(facts.text, { retry }) });
    let answer;
    try {
      answer = await ask(false);
    } catch (error) {
      return error instanceof AiError ? fallback(error.code, error.attempted ? 1 : 0) : fallback("AI_PROVIDER_ERROR", 1);
    }
    let checked = checkLetter(tidied(answer.text), facts);
    let requests = 1;

    // Wording that is not allowed: ask ONCE more, if the limits have room for the extra request (the first one is not stored yet).
    if (!checked.ok && checked.code === "AI_BANNED_PHRASE") {
      logger.warn("Tourist Visa cover letter from the AI was rejected and is asked for again", { code: checked.code });
      if (usedToday + 1 >= settings.dailyLimit || usedByAdmin + 1 >= settings.adminHourlyLimit) return fallback("AI_BANNED_PHRASE", requests);
      try {
        answer = await ask(true);
      } catch (error) {
        return error instanceof AiError ? fallback(error.code, requests + (error.attempted ? 1 : 0)) : fallback("AI_PROVIDER_ERROR", requests + 1);
      }
      requests += 1;
      checked = checkLetter(tidied(answer.text), facts);
    }
    if (!checked.ok) {
      logger.warn("Tourist Visa cover letter from the AI was rejected", { code: checked.code });
      return fallback(checked.code, requests);
    }
    // The tokens are replaced in one pass: the name and employer, and the applicant's own words exactly as they typed them.
    const finished = substitute(checked.text, facts.tokens, facts.redactions);
    return { text: facts.tokens.NAME ? finished : `${finished}\n${NAME_GAP}`, source: "ai", model: answer.model, aiAttempted: true, aiAttempts: requests, promptVersion: PROMPT_VERSION };
  }

  present(versions, factsHash) {
    const latest = versions[0];
    const unavailable = this.ai.unavailable();
    return {
      versions: versions.map(({ factsHash: _hash, basedOnRevision: _revision, ...rest }) => rest),
      latest: latest ? latest.version : null,
      stale: Boolean(latest && latest.factsHash !== factsHash),
      ai: { available: unavailable === null, ...(unavailable ? { code: unavailable } : {}) },
      maxLength: MAX_TEXT,
    };
  }
}

module.exports = new TouristVisaCoverLetterService();
module.exports.TouristVisaCoverLetterService = TouristVisaCoverLetterService;
