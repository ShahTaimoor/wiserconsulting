const mongoose = require('mongoose');
const appendOnly = require('./appendOnly');

/**
 * The Tourist Visa audit log: who looked at or changed which application, and when.
 *
 * Append only. Rows are added and read, never changed or deleted: the schema fields are immutable, every
 * update and delete operation of the model is refused, and the repository (touristVisaAuditRepository) offers
 * no such operation. (This is the application's own guarantee. Someone with direct access to the database can
 * still change it, so the retention and the database permissions of this collection are for the security review.)
 *
 * A row holds only ids, a fixed action name, a time and, for a status change, the old and the new status, and for a
 * flag change the old and the new list of flag names (fixed words, not sensitive).
 * NEVER an answer, a note, a reason, a file name, a link or an IP address.
 */

const ACTIONS = [
    'list_view', 'overview_view', 'document_link', 'status_change',
    // Step 8f: the admin edit, the notes and the flags
    'edit_open', 'changes_preview', 'changes_apply', 'changes_view', 'notes_view', 'notes_add', 'flags_change',
    // Step 8g: the cover letter (ids, the version, the source and the model's name; never any text)
    'cover_letter_generate', 'cover_letter_view', 'cover_letter_edit', 'cover_letter_approve',
];
const LETTER_SOURCES = ['ai', 'template', 'admin'];
// Fixed words an admin can put on an application. Never shown to the applicant.
const FLAGS = ['needs_call', 'called', 'awaiting_applicant', 'verified', 'concern'];

const auditSchema = new mongoose.Schema(
    {
        adminId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
        applicationId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
        action: { type: String, enum: ACTIONS, required: true, immutable: true },
        at: { type: Date, required: true, default: Date.now, immutable: true },
        // status_change only
        fromStatus: { type: String, immutable: true },
        toStatus: { type: String, immutable: true },
        // document_link only: the id of the document (not its name, and never the link)
        documentId: { type: String, immutable: true },
        // flags_change only: the flag names before and after
        fromFlags: { type: [{ type: String, enum: FLAGS }], default: undefined, immutable: true },
        toFlags: { type: [{ type: String, enum: FLAGS }], default: undefined, immutable: true },
        // cover_letter_* only: which version, how it was made, and the model's name (a name from the settings, never text)
        letterVersion: { type: Number, min: 1, immutable: true },
        letterSource: { type: String, enum: LETTER_SOURCES, immutable: true },
        model: { type: String, maxlength: 100, match: /^[\w./:-]+$/, immutable: true },
        // cover_letter_generate only: the version of the prompt that was sent (a number; rows without it stay valid)
        promptVersion: { type: Number, min: 1, immutable: true },
    },
    { collection: 'touristvisaaudit', versionKey: false, minimize: false }
);

auditSchema.index({ applicationId: 1, at: -1 });
auditSchema.index({ adminId: 1, at: -1 });

const REFUSED = 'The Tourist Visa audit log is append-only.';
auditSchema.plugin(appendOnly, REFUSED);

module.exports = mongoose.model('TouristVisaAudit', auditSchema);
module.exports.ACTIONS = ACTIONS;
module.exports.FLAGS = FLAGS;
module.exports.REFUSED = REFUSED;
