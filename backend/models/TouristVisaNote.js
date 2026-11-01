const mongoose = require('mongoose');
const appendOnly = require('./appendOnly');

/**
 * Admin notes and the call log of one application (step 8f). Admin only: never part of any applicant response.
 *
 * Append only, like the audit log (see models/appendOnly.js): a note is never edited or removed. The text is
 * ENCRYPTED with the field cipher, bound to the note's own id. A call also records how it went.
 */

const KINDS = ['note', 'call'];
const OUTCOMES = ['reached', 'no_answer', 'wrong_number', 'call_back'];
const MAX_TEXT = 2000;

const noteSchema = new mongoose.Schema(
    {
        applicationId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
        adminId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
        at: { type: Date, required: true, default: Date.now, immutable: true },
        kind: { type: String, enum: KINDS, required: true, immutable: true },
        // Encrypted.
        text: { type: String, required: true, immutable: true },
        // kind "call" only
        outcome: { type: String, enum: OUTCOMES, immutable: true },
    },
    { collection: 'touristvisanotes', versionKey: false, minimize: false }
);

noteSchema.index({ applicationId: 1, at: -1 });

const REFUSED = 'The Tourist Visa notes are append-only.';
noteSchema.plugin(appendOnly, REFUSED);

module.exports = mongoose.model('TouristVisaNote', noteSchema);
module.exports.KINDS = KINDS;
module.exports.OUTCOMES = OUTCOMES;
module.exports.MAX_TEXT = MAX_TEXT;
module.exports.REFUSED = REFUSED;
