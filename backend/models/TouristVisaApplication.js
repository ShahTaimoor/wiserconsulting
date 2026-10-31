const mongoose = require('mongoose');
const { config: formConfig } = require('../shared/tourist-visa/engine');
const { SLOTS } = require('../config/touristVisaDocuments');

const APPLICATION_STATUSES = ['draft', 'submitted', 'in_review', 'completed'];
const SECTION_STATES = ['saved', 'needs_review'];
const DOCUMENT_SLOTS = Object.keys(SLOTS);

// Uploaded files are private; only references are stored here. `id` is our own random id (the only
// identifier an applicant ever sees); `publicId` is the storage id and is never sent to a browser.
// `originalName` is encrypted with the field cipher (bound to the application and the document id).
const documentSchema = new mongoose.Schema({
    id: { type: String, required: true },
    slot: { type: String, enum: DOCUMENT_SLOTS, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, required: true },
    format: { type: String, required: true },
    bytes: { type: Number, required: true },
    mime: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    originalName: { type: String, required: true },
}, { _id: false });

// A small copy of who the applicant is, kept at submit time so the admin list never has to decrypt or scan answers.
// Made once and left alone (older submitted applications get it the first time they are listed or opened).
const summarySchema = new mongoose.Schema({
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
}, { _id: false });

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
        // What the applicant agreed to with each declaration tick, by question id:
        // { wordingSha256, configVersion, acceptedAt, acceptedBy }. The hash is of the exact words shown
        // (the tick text and its guidance), so a later change of wording is detectable. No IP address is kept.
        declarations: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        documents: [documentSchema],
        submittedAt: { type: Date },
        // Given at submit: "TV-" and eight characters from an alphabet without look-alikes. Unique.
        reference: { type: String },
        // SHA-256 of the config the application was submitted under; its snapshot is in TouristVisaConfigSnapshot.
        configSha256: { type: String },
        // { name, email, phone } for the admin list (not present on a draft).
        summary: { type: summarySchema, default: undefined },
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
// The admin list: submitted and later applications, newest first, by status.
touristVisaApplicationSchema.index({ status: 1, submittedAt: -1 });
// A reference belongs to one application. Applications that have none yet are not in the index.
touristVisaApplicationSchema.index({ reference: 1 }, { unique: true, partialFilterExpression: { reference: { $type: 'string' } } });
touristVisaApplicationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('TouristVisaApplication', touristVisaApplicationSchema);
module.exports.APPLICATION_STATUSES = APPLICATION_STATUSES;
module.exports.SECTION_STATES = SECTION_STATES;
module.exports.DOCUMENT_SLOTS = DOCUMENT_SLOTS;
