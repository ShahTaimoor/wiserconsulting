const mongoose = require('mongoose');
const { config: formConfig } = require('../shared/tourist-visa/engine');

const APPLICATION_STATUSES = ['draft', 'submitted', 'in_review', 'completed'];
const SECTION_STATES = ['saved', 'needs_review'];
const DOCUMENT_KINDS = ['passport', 'funds'];

// Uploaded files are private; only references are stored here.
const documentSchema = new mongoose.Schema({
    kind: { type: String, enum: DOCUMENT_KINDS, required: true },
    originalName: { type: String, trim: true },
    mimetype: { type: String },
    size: { type: Number },
    publicId: { type: String },
    resourceType: { type: String },
    uploadedAt: { type: Date, default: Date.now },
});

const touristVisaApplicationSchema = new mongoose.Schema(
    {
        // Owner. Always taken from the authenticated user, never from a request body.
        applicant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            immutable: true,
        },
        visaType: {
            type: String,
            enum: ['tourist'],
            default: 'tourist',
            immutable: true,
        },
        status: {
            type: String,
            enum: APPLICATION_STATUSES,
            default: 'draft',
        },
        // Where the applicant resumes.
        currentSection: {
            type: String,
            default: () => formConfig.sections[0].id,
        },
        // Version of shared/tourist-visa/questions.json the answers were collected against.
        configVersion: {
            type: String,
            default: () => formConfig.version,
        },
        sectionStatus: {
            type: Map,
            of: { type: String, enum: SECTION_STATES },
            default: {},
        },
        // Answers keyed by question id (e.g. "q2_3a"); repeating groups are lists of entries.
        // Sensitive answers are encrypted before they are written (added with save-section).
        answers: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        documents: [documentSchema],
        submittedAt: { type: Date },
        isDeleted: { type: Boolean, default: false },
    },
    {
        timestamps: true,
        minimize: false,
    }
);

// One live draft per applicant. Two concurrent "start" requests cannot both create one.
touristVisaApplicationSchema.index(
    { applicant: 1 },
    { unique: true, partialFilterExpression: { status: 'draft', isDeleted: false } }
);
touristVisaApplicationSchema.index({ applicant: 1, createdAt: -1 });
touristVisaApplicationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('TouristVisaApplication', touristVisaApplicationSchema);
module.exports.APPLICATION_STATUSES = APPLICATION_STATUSES;
module.exports.SECTION_STATES = SECTION_STATES;
module.exports.DOCUMENT_KINDS = DOCUMENT_KINDS;
