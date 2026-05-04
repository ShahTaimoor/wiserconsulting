/**
 * Admin Settings Controller
 * Handles HTTP requests and responses
 * Only validates request, calls service, returns response
 */

const adminSettingsService = require("../services/adminSettingsService");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");

class AdminSettingsController {
  /**
   * Get admin settings
   */
  getSettings = asyncHandler(async (req, res) => {
    const settings = await adminSettingsService.getSettings();
    return ApiResponse.success(
      res,
      settings,
      "Admin settings retrieved successfully",
    );
  });

  /**
   * Get public settings (for frontend)
   */
  getPublicSettings = asyncHandler(async (req, res) => {
    const settings = await adminSettingsService.getPublicSettings();
    return ApiResponse.success(
      res,
      settings,
      "Public settings retrieved successfully",
    );
  });

  /**
   * Update admin settings
   */
  updateSettings = asyncHandler(async (req, res) => {
    const updatedSettings = await adminSettingsService.updateSettings(req.body);
    return ApiResponse.success(
      res,
      updatedSettings,
      "Admin settings updated successfully",
      200,
    );
  });

  /**
   * Update logo
   */
  updateLogo = asyncHandler(async (req, res) => {
    if (!req.file) {
      return ApiResponse.error(res, "No file provided", 400);
    }

    const currentSettings = await adminSettingsService.getSettings();
    const updatedSettings = await adminSettingsService.updateLogo(
      req.file,
      currentSettings,
    );

    return ApiResponse.success(
      res,
      updatedSettings,
      "Logo updated successfully",
      200,
    );
  });

  /**
   * Delete logo
   */
  deleteLogo = asyncHandler(async (req, res) => {
    const currentSettings = await adminSettingsService.getSettings();
    const updatedSettings =
      await adminSettingsService.deleteLogo(currentSettings);

    return ApiResponse.success(
      res,
      updatedSettings,
      "Logo deleted successfully",
      200,
    );
  });
}

module.exports = new AdminSettingsController();
