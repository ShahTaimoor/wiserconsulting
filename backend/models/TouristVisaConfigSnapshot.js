const mongoose = require('mongoose');

/**
 * The exact questions.json a Tourist Visa application was submitted under.
 *
 * One document per distinct config, keyed by the SHA-256 of its text (so the id says what it holds), written once and
 * never changed: every application submitted under the same config points at the same document through its
 * `configSha256`. A later view (the admin Overview, the PDF) reads this to show a submitted application with
 * the questions, option labels and wording it was submitted under, even after the live config has moved on.
 * It holds the form's questions only, never an answer or anything about an applicant.
 */
const configSnapshotSchema = new mongoose.Schema(
    {
        // SHA-256 (hex) of `json`.
        _id: { type: String, required: true },
        version: { type: String, required: true },
        // The config as text, so no key of it is ever read as a database path.
        json: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
    },
    { versionKey: false }
);

module.exports = mongoose.model('TouristVisaConfigSnapshot', configSnapshotSchema);
