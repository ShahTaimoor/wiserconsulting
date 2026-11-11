/**
 * TouristVisaCoverLetter Controller
 * HTTP for the administrator's cover letter (step 8g). The administrator always comes from req.user (the route has
 * checked the role); nothing about who is asking is read from the body or the query.
 */

const touristVisaCoverLetterService = require('../services/touristVisaCoverLetterService');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');

class TouristVisaCoverLetterController {
  get = asyncHandler(async (req, res) => {
    const result = await touristVisaCoverLetterService.view(req.user._id, req.params.id);

    return ApiResponse.success(res, result, 'Cover letter retrieved successfully');
  })

  generate = asyncHandler(async (req, res) => {
    const result = await touristVisaCoverLetterService.generate(req.user._id, req.params.id);

    return ApiResponse.success(res, result, 'Cover letter created', 201);
  })

  save = asyncHandler(async (req, res) => {
    const result = await touristVisaCoverLetterService.save(req.user._id, req.params.id, req.body);

    return ApiResponse.success(res, result, 'Cover letter saved as a new version', 201);
  })

  approve = asyncHandler(async (req, res) => {
    const result = await touristVisaCoverLetterService.approve(req.user._id, req.params.id, req.body);

    return ApiResponse.success(res, result, 'Cover letter approved');
  })
}

module.exports = new TouristVisaCoverLetterController();
