/**
 * TouristVisaApplication Controller
 * Handles HTTP requests and responses
 * The owner always comes from req.user; the request body is never read.
 */

const touristVisaApplicationService = require('../services/touristVisaApplicationService');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');

class TouristVisaApplicationController {
  /**
   * Create a draft application, or return the existing one
   */
  createApplication = asyncHandler(async (req, res) => {
    const { application, created } = await touristVisaApplicationService.createOrGetDraft(req.user._id);

    return ApiResponse.success(
      res,
      { application },
      created ? 'Application started' : 'Existing application returned',
      created ? 201 : 200
    );
  })

  /**
   * Save one section of my draft application
   */
  saveSection = asyncHandler(async (req, res) => {
    const result = await touristVisaApplicationService.saveSection(
      req.user._id,
      req.params.sectionId,
      req.body
    );

    if (!result.saved) {
      return ApiResponse.error(res, result.message, result.status, result.errors);
    }

    return ApiResponse.success(
      res,
      { application: result.application, needsReview: result.needsReview, removed: result.removed },
      'Section saved'
    );
  })

  /**
   * Get my application
   */
  getMyApplication = asyncHandler(async (req, res) => {
    const application = await touristVisaApplicationService.getMine(req.user._id);

    return ApiResponse.success(res, { application }, 'Application retrieved successfully');
  })
}

module.exports = new TouristVisaApplicationController();
