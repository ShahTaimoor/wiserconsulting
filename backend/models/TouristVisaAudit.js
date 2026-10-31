const mongoose = require('mongoose');

/**
 * The Tourist Visa audit log: who looked at or changed which application, and when.
 *
 * Append only. Rows are added and read, never changed or deleted: the schema fields are immutable, every
 * update and delete operation of the model is refused, and the repository (touristVisaAuditRepository) offers
 * no such operation. (This is the application's own guarantee. Someone with direct access to the database can
 * still change it, so the retention and the database permissions of this collection are for the security review.)
 *
 * A row holds only ids, a fixed action name, a time and, for a status change, the old and the new status.
 * NEVER an answer, a file name, a link or an IP address.
 */

const ACTIONS = ['list_view', 'overview_view', 'document_link', 'status_change'];

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
    },
    { collection: 'touristvisaaudit', versionKey: false, minimize: false }
);

auditSchema.index({ applicationId: 1, at: -1 });
auditSchema.index({ adminId: 1, at: -1 });

const REFUSED = 'The Tourist Visa audit log is append-only.';
const refuse = function refuse() {
    throw new Error(REFUSED);
};

// Every way the model has of changing or removing rows is refused.
auditSchema.pre(
    ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
    { document: true, query: true },
    refuse
);
auditSchema.pre('save', function onSave() {
    if (!this.isNew) throw new Error(REFUSED);
});
auditSchema.pre('bulkWrite', function onBulkWrite(next, ops) {
    if (Array.isArray(ops) && ops.some((op) => !op || !op.insertOne)) throw new Error(REFUSED);
    next();
});

module.exports = mongoose.model('TouristVisaAudit', auditSchema);
module.exports.ACTIONS = ACTIONS;
module.exports.REFUSED = REFUSED;
