/**
 * TouristVisaAdmin Controller
 * HTTP for the administrator's view of submitted applications. The administrator always comes from req.user (the
 * route has checked the role); nothing about who is asking is read from the request body or the query.
 */

const touristVisaAdminService = require('../services/touristVisaAdminService');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');

class TouristVisaAdminController {
  list = asyncHandler(async (req, res) => {
    const result = await touristVisaAdminService.list(req.user._id, req.query);

    return ApiResponse.success(res, result, 'Applications retrieved successfully');
  })

  overview = asyncHandler(async (req, res) => {
    const result = await touristVisaAdminService.overview(req.user._id, req.params.id);

    return ApiResponse.success(res, result, 'Application retrieved successfully');
  })

  documentLink = asyncHandler(async (req, res) => {
    const { url, expiresAt } = await touristVisaAdminService.documentLink(req.user._id, req.params.id, req.params.docId);

    return ApiResponse.success(res, { url, expiresAt }, 'Link created');
  })

  updateStatus = asyncHandler(async (req, res) => {
    const result = await touristVisaAdminService.updateStatus(req.user._id, req.params.id, req.body);

    return ApiResponse.success(res, result, 'Status updated');
  })

  activity = asyncHandler(async (req, res) => {
    const result = await touristVisaAdminService.activity(req.params.id);

    return ApiResponse.success(res, result, 'Activity retrieved successfully');
  })
}

module.exports = new TouristVisaAdminController();
