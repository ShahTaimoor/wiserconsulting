/**
 * TouristVisaFunds Controller
 *  - settings: what the form needs for the bank activity section (any signed-in user): the percentages and the floor behind the explanations
 *    of unusual months and the amount above which a single transaction is asked about. Never the indicator's thresholds.
 *  - adminCheck: the administrator's staff-only "Funds check" panel. The administrator comes from req.user (the route checked the role).
 */

const touristVisaFundsService = require('../services/touristVisaFundsService');
const { publicSettings } = require('../config/touristVisaFunds');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');

class TouristVisaFundsController {
  settings = asyncHandler(async (req, res) => {
    return ApiResponse.success(res, publicSettings(), 'Settings retrieved successfully');
  })

  adminCheck = asyncHandler(async (req, res) => {
    const result = await touristVisaFundsService.view(req.user._id, req.params.id);
    return ApiResponse.success(res, result, 'Funds check retrieved successfully');
  })
}

module.exports = new TouristVisaFundsController();
