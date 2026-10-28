/**
 * TouristVisaApplication Service
 * Business logic for a signed-in applicant's own Tourist Visa application
 */

const touristVisaApplicationRepository = require("../repositories/touristVisaApplicationRepository");
const { AppError } = require("../middleware/errorHandler");

/**
 * What the client is allowed to see. An allowlist, so a field added to the
 * model later is not exposed by accident (applicant id, isDeleted, storage ids).
 */
const toClient = (application) => ({
  id: String(application._id),
  visaType: application.visaType,
  status: application.status,
  currentSection: application.currentSection,
  configVersion: application.configVersion,
  sectionStatus: application.sectionStatus || {},
  // Sensitive answers will be decrypted here once they are encrypted at write time.
  answers: application.answers || {},
  documents: (application.documents || []).map((doc) => ({
    id: String(doc._id),
    kind: doc.kind,
    originalName: doc.originalName,
    mimetype: doc.mimetype,
    size: doc.size,
    uploadedAt: doc.uploadedAt,
  })),
  submittedAt: application.submittedAt || null,
  createdAt: application.createdAt,
  updatedAt: application.updatedAt,
});

class TouristVisaApplicationService {
  /**
   * Start an application, or return the one the applicant already has.
   * Returns { application, created }.
   */
  async createOrGetDraft(userId) {
    const existing = await touristVisaApplicationRepository.findLatestByApplicant(userId);
    if (existing) {
      return { application: toClient(existing), created: false };
    }

    try {
      const created = await touristVisaApplicationRepository.createDraft(userId);
      return { application: toClient(created), created: true };
    } catch (error) {
      // A concurrent request created the draft first (unique index); return that one.
      if (error && error.code === 11000) {
        const winner = await touristVisaApplicationRepository.findLatestByApplicant(userId);
        if (winner) {
          return { application: toClient(winner), created: false };
        }
      }
      throw error;
    }
  }

  /**
   * The applicant's own application
   */
  async getMine(userId) {
    const application = await touristVisaApplicationRepository.findLatestByApplicant(userId);
    if (!application) {
      throw new AppError("You have not started a Tourist Visa application yet.", 404);
    }
    return toClient(application);
  }
}

module.exports = new TouristVisaApplicationService();
