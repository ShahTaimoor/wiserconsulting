const mongoose = require("mongoose");

const text = { type: String, trim: true, default: "" };
const score = { type: Number, min: 0, default: null };

/**
 * A university the admin team keeps in their own list. The University Finder matches a student's marks against it.
 * A requirement left empty (null / 0) means "no such requirement".
 */
const universitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    city: text,
    website: text,
    applyUrl: text,
    fields: { type: [String], default: [] }, // e.g. ["Engineering", "Business"]; empty = all fields

    // Entry requirements for a student with FSc
    minFscPercent: score,
    minIelts: score,
    minToefl: score,
    minPte: score,
    minDuolingo: score,
    minOxford: score,

    // Money
    tuitionPerYear: text, // free text, e.g. "GBP 18,000"

    // Scholarship (optional)
    scholarshipAvailable: { type: Boolean, default: false },
    scholarshipName: text,
    scholarshipPercent: score,
    scholarshipMinFscPercent: score,
    scholarshipMinIelts: score,
    scholarshipDetails: text,
    scholarshipUrl: text,

    // How to apply
    applyDeadline: text,
    applyDocuments: { type: [String], default: [] },
    applySteps: { type: [String], default: [] },
    notes: text,

    // true for universities that came from the world list (name + website only): no requirements are known
    requirementsUnknown: { type: Boolean, default: false },

    // true for the starter list until an admin has checked it on the official site
    needsVerification: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

universitySchema.index({ country: 1, name: 1 });
universitySchema.index({ isActive: 1 });
universitySchema.index({ requirementsUnknown: 1, country: 1 });

module.exports = mongoose.model("University", universitySchema);
