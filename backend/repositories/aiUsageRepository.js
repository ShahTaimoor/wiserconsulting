/**
 * How many requests have been made to the AI provider, across everything that uses it (the cover letter and the itinerary).
 *
 * The daily and per-administrator limits are shared: a request made for an itinerary uses the same allowance as one made for a cover
 * letter. Each version row records whether the provider was asked (`aiAttempted`) and how many times (`aiAttempts`; a row without it
 * counts as one). This counts them in every collection that holds such rows.
 */

const mongoose = require("mongoose");
const TouristVisaCoverLetter = require("../models/TouristVisaCoverLetter");
const TouristVisaItinerary = require("../models/TouristVisaItinerary");

const MODELS = [TouristVisaCoverLetter, TouristVisaItinerary];

/** Requests since a time, in total or by one administrator. */
async function countAiRequests({ since, adminId }) {
  const by = adminId ? { createdBy: mongoose.Types.ObjectId.isValid(String(adminId)) ? new mongoose.Types.ObjectId(String(adminId)) : adminId } : {};
  const counts = await Promise.all(
    MODELS.map((model) =>
      model.aggregate([
        { $match: { aiAttempted: true, createdAt: { $gte: since }, ...by } },
        { $group: { _id: null, requests: { $sum: { $ifNull: ["$aiAttempts", 1] } } } },
      ])
    )
  );
  return counts.reduce((sum, rows) => sum + (rows.length > 0 ? rows[0].requests : 0), 0);
}

module.exports = { countAiRequests, MODELS };
