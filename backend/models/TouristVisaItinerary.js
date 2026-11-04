const mongoose = require('mongoose');
const appendOnly = require('./appendOnly');

/**
 * The versions of the itinerary of one application. Admin only: never part of any applicant response.
 *
 * Exactly the model of the cover letter's versions (models/TouristVisaCoverLetter.js), in its own collection: append only, a version is
 * never edited or removed, a new text is always a NEW version, and the text is ENCRYPTED with the field cipher, bound to the application
 * and the version. The one thing that ever changes on a row is its one-time approval (the repository does it with the driver; the model
 * refuses every update).
 */

const SOURCES = ['ai', 'template', 'admin'];
const STATUSES = ['draft', 'approved'];
const MAX_TEXT = 8000;

// Why a template itinerary was written when the AI was wanted. Fixed codes only: never any text of a prompt or an answer.
const FALLBACK_REASONS = [
    'AI_DISABLED', 'AI_NOT_CONFIGURED', 'AI_TERMS_NOT_CONFIRMED', 'AI_CIRCUIT_OPEN', 'AI_DAILY_LIMIT', 'AI_ADMIN_LIMIT',
    'AI_RATE_LIMITED', 'AI_TIMEOUT', 'AI_NETWORK', 'AI_PROVIDER_REJECTED', 'AI_PROVIDER_ERROR', 'AI_BAD_RESPONSE', 'AI_TRUNCATED',
    'ITINERARY_BAD_JSON', 'ITINERARY_WRONG_COUNT', 'ITINERARY_BAD_ENTRY', 'ITINERARY_FORBIDDEN_CONTENT', 'ITINERARY_BANNED_PHRASE',
    'ITINERARY_PLACE_NOT_NAMED', 'ITINERARY_PLACE_ORDER',
];

const itinerarySchema = new mongoose.Schema(
    {
        applicationId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
        version: { type: Number, required: true, min: 1, immutable: true },
        // Encrypted.
        text: { type: String, required: true, immutable: true },
        source: { type: String, enum: SOURCES, required: true, immutable: true },
        // The model's name, when source is "ai".
        model: { type: String, maxlength: 100, immutable: true },
        // Why a template was written instead of an AI itinerary.
        fallbackReason: { type: String, enum: FALLBACK_REASONS, immutable: true },
        // True when the provider was actually asked (counts towards the daily and per-admin limits, shared with the cover letter).
        aiAttempted: { type: Boolean, default: false, immutable: true },
        // How many requests were made to the provider for this version: 1, or 2 when the first answer failed the checks.
        aiAttempts: { type: Number, min: 1, max: 2, immutable: true },
        // The version of the prompt that was sent (config/touristVisaItineraryPrompt.js).
        promptVersion: { type: Number, min: 1, immutable: true },
        // A keyed hash of the facts the itinerary was made from, to tell when the answers have changed since.
        factsHash: { type: String, required: true, immutable: true },
        basedOnRevision: { type: Number, required: true, immutable: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
        createdAt: { type: Date, required: true, default: Date.now, immutable: true },
        status: { type: String, enum: STATUSES, default: 'draft' },
        approvedBy: { type: mongoose.Schema.Types.ObjectId },
        approvedAt: { type: Date },
    },
    { collection: 'touristvisaitineraries', versionKey: false, minimize: false }
);

itinerarySchema.index({ applicationId: 1, version: -1 }, { unique: true });
itinerarySchema.index({ aiAttempted: 1, createdAt: -1 });

const REFUSED = 'The Tourist Visa itineraries are append-only.';
itinerarySchema.plugin(appendOnly, REFUSED);

module.exports = mongoose.model('TouristVisaItinerary', itinerarySchema);
module.exports.SOURCES = SOURCES;
module.exports.STATUSES = STATUSES;
module.exports.MAX_TEXT = MAX_TEXT;
module.exports.FALLBACK_REASONS = FALLBACK_REASONS;
module.exports.REFUSED = REFUSED;
