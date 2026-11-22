const universityService = require("../services/universityService");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");

class UniversityController {
  getAll = asyncHandler(async (req, res) =>
    ApiResponse.success(res, await universityService.getAll({ world: req.query.world === "true", country: req.query.country || "", q: req.query.q || "", page: req.query.page, pageSize: req.query.pageSize }), "Universities retrieved successfully"));
  countries = asyncHandler(async (req, res) => ApiResponse.success(res, await universityService.countries(), "Countries retrieved successfully"));
  loadWorld = asyncHandler(async (req, res) => ApiResponse.success(res, await universityService.loadWorld(req.body || {}), "World list loaded"));
  create = asyncHandler(async (req, res) => ApiResponse.success(res, await universityService.create(req.body), "University added successfully", 201));
  update = asyncHandler(async (req, res) => ApiResponse.success(res, await universityService.update(req.params.id, req.body), "University updated successfully"));
  remove = asyncHandler(async (req, res) => {
    await universityService.remove(req.params.id);
    return ApiResponse.success(res, null, "University deleted successfully");
  });
  importRows = asyncHandler(async (req, res) => ApiResponse.success(res, await universityService.importRows(req.body.rows), "Import finished"));
  loadStarter = asyncHandler(async (req, res) => ApiResponse.success(res, await universityService.loadStarter(req.body || {}), "Starter universities loaded"));
  match = asyncHandler(async (req, res) => ApiResponse.success(res, await universityService.match(req.body), "Matching universities"));
}

module.exports = new UniversityController();
