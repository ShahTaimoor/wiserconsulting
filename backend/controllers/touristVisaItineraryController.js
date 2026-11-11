/**
 * TouristVisaItinerary Controller
 * HTTP for the administrator's itinerary. The administrator always comes from req.user (the route has checked the role);
 * nothing about who is asking is read from the body or the query.
 */

const touristVisaItineraryService = require('../services/touristVisaItineraryService');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');

class TouristVisaItineraryController {
  get = asyncHandler(async (req, res) => {
    const result = await touristVisaItineraryService.view(req.user._id, req.params.id);

    return ApiResponse.success(res, result, 'Itinerary retrieved successfully');
  })

  generate = asyncHandler(async (req, res) => {
    const result = await touristVisaItineraryService.generate(req.user._id, req.params.id);

    return ApiResponse.success(res, result, 'Itinerary created', 201);
  })

  save = asyncHandler(async (req, res) => {
    const result = await touristVisaItineraryService.save(req.user._id, req.params.id, req.body);

    return ApiResponse.success(res, result, 'Itinerary saved as a new version', 201);
  })

  approve = asyncHandler(async (req, res) => {
    const result = await touristVisaItineraryService.approve(req.user._id, req.params.id, req.body);

    return ApiResponse.success(res, result, 'Itinerary approved');
  })
}

module.exports = new TouristVisaItineraryController();
