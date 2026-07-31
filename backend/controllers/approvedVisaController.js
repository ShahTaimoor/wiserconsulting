/**
 * Approved Visa Controller
 * Routes and validation boundary for approved visa records.
 */

const approvedVisaService = require("../services/approvedVisaService");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");

class ApprovedVisaController {
  getPublicList = asyncHandler(async (req, res) => {
    const visas = await approvedVisaService.getPublicList();
    return ApiResponse.success(
      res,
      visas,
      "Approved visas retrieved successfully",
    );
  });

  getAllForAdmin = asyncHandler(async (req, res) => {
    const visas = await approvedVisaService.getAllForAdmin();
    return ApiResponse.success(
      res,
      visas,
      "Approved visas retrieved successfully",
    );
  });

  getById = asyncHandler(async (req, res) => {
    const visa = await approvedVisaService.getById(req.params.id);
    return ApiResponse.success(
      res,
      visa,
      "Approved visa retrieved successfully",
    );
  });

  create = asyncHandler(async (req, res) => {
    const visa = await approvedVisaService.create(req.body, req.files);
    return ApiResponse.success(
      res,
      visa,
      "Approved visa created successfully",
      201,
    );
  });

  update = asyncHandler(async (req, res) => {
    const visa = await approvedVisaService.update(
      req.params.id,
      req.body,
      req.files,
    );
    return ApiResponse.success(
      res,
      visa,
      "Approved visa updated successfully",
      200,
    );
  });

  remove = asyncHandler(async (req, res) => {
    await approvedVisaService.remove(req.params.id);
    return ApiResponse.success(
      res,
      null,
      "Approved visa deleted successfully",
      200,
    );
  });
}

module.exports = new ApprovedVisaController();
