/**
 * Site Settings Controller
 * Routes and validation boundary for site settings.
 */

const siteSettingsService = require("../services/siteSettingsService");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");

class SiteSettingsController {
  getSettings = asyncHandler(async (req, res) => {
    const settings = await siteSettingsService.getSettings();
    return ApiResponse.success(
      res,
      settings,
      "Site settings retrieved successfully",
    );
  });

  updateSettings = asyncHandler(async (req, res) => {
    const updatedSettings = await siteSettingsService.updateSettings(req.body);
    return ApiResponse.success(
      res,
      updatedSettings,
      "Site settings saved successfully",
      200,
    );
  });

  uploadHeroBanner = asyncHandler(async (req, res) => {
    const currentSettings = await siteSettingsService.getSettings();
    const updatedSettings = await siteSettingsService.uploadHeroBanner(
      req.params.device,
      req.file,
      currentSettings,
    );
    return ApiResponse.success(res, updatedSettings, "Banner uploaded successfully", 200);
  });

  removeHeroBanner = asyncHandler(async (req, res) => {
    const currentSettings = await siteSettingsService.getSettings();
    const updatedSettings = await siteSettingsService.removeHeroBanner(
      req.params.device,
      currentSettings,
    );
    return ApiResponse.success(res, updatedSettings, "Banner removed successfully", 200);
  });

  uploadLogo = asyncHandler(async (req, res) => {
    if (!req.file) {
      return ApiResponse.error(res, "No logo file provided", 400);
    }

    const currentSettings = await siteSettingsService.getSettings();
    const updatedSettings = await siteSettingsService.uploadLogo(
      req.file,
      currentSettings,
    );

    return ApiResponse.success(
      res,
      updatedSettings,
      "Logo uploaded successfully",
      200,
    );
  });
}

module.exports = new SiteSettingsController();
