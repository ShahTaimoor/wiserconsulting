/**
 * TouristVisaApplication Repository
 * All database operations for the TouristVisaApplication model.
 * Returns plain objects (maps flattened) so callers never hold Mongoose documents.
 */

const TouristVisaApplication = require("../models/TouristVisaApplication");

class TouristVisaApplicationRepository {
  /**
   * Most recent application of an applicant (excluding deleted)
   */
  async findLatestByApplicant(applicantId) {
    return await TouristVisaApplication.findOne({
      applicant: applicantId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .lean({ flattenMaps: true });
  }

  /**
   * Create an empty draft for an applicant. Only the owner is set; every other
   * field takes its model default, so nothing from a request can be stored here.
   */
  async createDraft(applicantId) {
    const created = await TouristVisaApplication.create({ applicant: applicantId });
    return created.toObject({ flattenMaps: true });
  }
}

module.exports = new TouristVisaApplicationRepository();
