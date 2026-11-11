const mongoose = require('mongoose');
const appendOnly = require('./appendOnly');

/**
 * The record of one admin correction of a submitted application (step 8f): who, when, why, and for each answer
 * what it was and what it became.
 *
 * Append only, like the audit log (see models/appendOnly.js). Every value in it is ENCRYPTED with the field cipher,
 * bound to this record and the item: the reason, and the old and the new value of every item, whether or not the
 * question itself is a sensitive one. The ids, the section, the kind and the times are plain.
 *
 *   kind "edited"     the admin set (or cleared) this answer
 *   kind "pruned"     the answer was removed because the change hid it
 *   kind "structure"  a repeating group got more or fewer entries (old and new are the entry counts)
 */

const KINDS = ['edited', 'pruned', 'structure'];

const itemSchema = new mongoose.Schema(
    {
        sectionId: { type: String, required: true },
        // A question id, or a repeating group's id for a "structure" item.
        questionId: { type: String, required: true },
        // The entry of a repeating group (0-based) when the answer is inside one.
        index: { type: Number },
        kind: { type: String, enum: KINDS, required: true },
        // Encrypted. Absent when there was no answer before (old) or none after (new).
        old: { type: String },
        new: { type: String },
    },
    { _id: false }
);

const changeSchema = new mongoose.Schema(
    {
        applicationId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true, index: true },
        adminId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
        at: { type: Date, required: true, default: Date.now, immutable: true },
        revisionBefore: { type: Number, required: true, immutable: true },
        revisionAfter: { type: Number, required: true, immutable: true },
        // Encrypted.
        reason: { type: String, required: true, immutable: true },
        changes: { type: [itemSchema], immutable: true },
    },
    { collection: 'touristvisachanges', versionKey: false, minimize: false }
);

changeSchema.index({ applicationId: 1, at: -1 });

const REFUSED = 'The Tourist Visa change history is append-only.';
changeSchema.plugin(appendOnly, REFUSED);

module.exports = mongoose.model('TouristVisaChange', changeSchema);
module.exports.KINDS = KINDS;
module.exports.REFUSED = REFUSED;
