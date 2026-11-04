const mongoose = require('mongoose');
const appendOnly = require('./appendOnly');

/**
 * The versions of the cover letter of one application (step 8g). Admin only: never part of any applicant response.
 *
 * Append only, like the audit log (see models/appendOnly.js): a version is never edited or removed, and a new text is
 * always a NEW version. The text is ENCRYPTED with the field cipher, bound to the application and the version.
 *
 * The one thing that ever changes on a row is its approval: `status` goes from "draft" to "approved" once, together
 * with `approvedBy` and `approvedAt`. The model refuses every update; the repository makes that single conditional
 * change with the database driver (touristVisaCoverLetterRepository.approve) and nothing else.
 */

const SOURCES = ['ai', 'template', 'admin'];
const STATUSES = ['draft', 'approved'];
const MAX_TEXT = 8000;

// Why a template letter was written when the AI was wanted. Fixed codes only: never any text of a prompt or an answer.
const FALLBACK_REASONS = [
    'AI_DISABLED', 'AI_NOT_CONFIGURED', 'AI_TERMS_NOT_CONFIRMED', 'AI_CIRCUIT_OPEN', 'AI_DAILY_LIMIT', 'AI_ADMIN_LIMIT',
    'AI_RATE_LIMITED', 'AI_TIMEOUT', 'AI_NETWORK', 'AI_PROVIDER_REJECTED', 'AI_PROVIDER_ERROR', 'AI_BAD_RESPONSE', 'AI_TRUNCATED',
    'AI_BANNED_PHRASE',
    'LETTER_EMPTY', 'LETTER_LENGTH', 'LETTER_LINK', 'LETTER_UNKNOWN_TOKEN', 'LETTER_MISSING_TOKEN',
    'LETTER_NUMBER_NOT_IN_FACTS', 'LETTER_DATE_NOT_IN_FACTS',
];

const letterSchema = new mongoose.Schema(
    {
        applicationId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
        version: { type: Number, required: true, min: 1, immutable: true },
        // Encrypted.
        text: { type: String, required: true, immutable: true },
        source: { type: String, enum: SOURCES, required: true, immutable: true },
        // The model's name, when source is "ai".
        model: { type: String, maxlength: 100, immutable: true },
        // Why a template was written instead of an AI letter.
        fallbackReason: { type: String, enum: FALLBACK_REASONS, immutable: true },
        // True when the provider was actually asked (counts towards the daily and per-admin limits).
        aiAttempted: { type: Boolean, default: false, immutable: true },
        // How many requests were made to the provider for this version: 1, or 2 when the first letter used banned wording and
        // the AI was asked once more. Both count towards the daily and per-administrator limits. A row without it counts as 1.
        aiAttempts: { type: Number, min: 1, max: 2, immutable: true },
        // The version of the prompt that was sent (config/touristVisaCoverLetterPrompt.js). Rows written before it existed have none.
        promptVersion: { type: Number, min: 1, immutable: true },
        // A keyed hash of the facts the letter was made from, to tell when the answers have changed since.
        factsHash: { type: String, required: true, immutable: true },
        basedOnRevision: { type: Number, required: true, immutable: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
        createdAt: { type: Date, required: true, default: Date.now, immutable: true },
        status: { type: String, enum: STATUSES, default: 'draft' },
        approvedBy: { type: mongoose.Schema.Types.ObjectId },
        approvedAt: { type: Date },
    },
    { collection: 'touristvisacoverletters', versionKey: false, minimize: false }
);

letterSchema.index({ applicationId: 1, version: -1 }, { unique: true });
letterSchema.index({ aiAttempted: 1, createdAt: -1 });

const REFUSED = 'The Tourist Visa cover letters are append-only.';
letterSchema.plugin(appendOnly, REFUSED);

module.exports = mongoose.model('TouristVisaCoverLetter', letterSchema);
module.exports.SOURCES = SOURCES;
module.exports.STATUSES = STATUSES;
module.exports.MAX_TEXT = MAX_TEXT;
module.exports.FALLBACK_REASONS = FALLBACK_REASONS;
module.exports.REFUSED = REFUSED;
