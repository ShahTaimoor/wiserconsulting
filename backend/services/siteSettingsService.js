/**
 * Site Settings Service
 * Business logic for site settings operations.
 */

const siteSettingsRepository = require("../repositories/siteSettingsRepository");
const { uploadLocalToR2 } = require("../config/upload");
const { deleteFromR2 } = require("../middleware/fileStorage");
const { AppError } = require("../middleware/errorHandler");

const HERO_DEVICES = ["mobile", "tablet", "desktop"];
const HERO_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png"];
const HERO_MAX_DIMENSION = 2560;

const removeTempFile = (file) => {
  try {
    if (file?.path) require("fs").unlinkSync(file.path);
  } catch {
    // already gone
  }
};

class SiteSettingsService {
  async getSettings() {
    return await siteSettingsRepository.getSettings();
  }

  async updateSettings(data) {
    return await siteSettingsRepository.updateSettings(data);
  }

  /**
   * Hero banner picture for one screen size ("mobile", "tablet" or "desktop"): JPG or PNG, stored in the public R2
   * bucket, fitted inside 2560 px. The previous picture of that size is removed.
   */
  async uploadHeroBanner(device, file, currentSettings) {
    if (!HERO_DEVICES.includes(device)) {
      removeTempFile(file);
      throw new AppError("Unknown banner size. Use mobile, tablet or desktop.", 400);
    }
    if (!file) {
      throw new AppError("No image provided", 400);
    }
    if (!HERO_MIME_TYPES.includes(file.mimetype)) {
      removeTempFile(file);
      throw new AppError("Banner must be a JPG or PNG image", 400);
    }

    const prefix = `hero${device.charAt(0).toUpperCase()}${device.slice(1)}`;
    try {
      const result = await uploadLocalToR2(file.path, "hero-banners", {
        visibility: "public",
        maxDimension: HERO_MAX_DIMENSION,
      });

      const updated = await siteSettingsRepository.updateHeroBanner(
        device,
        result.secure_url,
        result.public_id,
      );

      const previousKey = currentSettings?.[`${prefix}PublicId`];
      if (previousKey) {
        try {
          await deleteFromR2(previousKey);
        } catch (destroyError) {
          console.error("Failed to remove previous hero banner from R2", destroyError);
        }
      }

      return updated;
    } catch (error) {
      removeTempFile(file);
      throw new AppError(`Banner upload failed: ${error.message}`, 500);
    }
  }

  async removeHeroBanner(device, currentSettings) {
    if (!HERO_DEVICES.includes(device)) {
      throw new AppError("Unknown banner size. Use mobile, tablet or desktop.", 400);
    }
    const prefix = `hero${device.charAt(0).toUpperCase()}${device.slice(1)}`;
    const previousKey = currentSettings?.[`${prefix}PublicId`];
    if (previousKey) {
      try {
        await deleteFromR2(previousKey);
      } catch (error) {
        console.error("Failed to remove hero banner from R2", error);
      }
    }
    return await siteSettingsRepository.updateHeroBanner(device, null, null);
  }

  async uploadLogo(file, currentSettings) {
    if (!file) {
      throw new AppError("No logo file provided", 400);
    }

    try {
      if (currentSettings?.logoPublicId) {
        try {
          await deleteFromR2(currentSettings.logoPublicId);
        } catch (destroyError) {
          console.error(
            "Failed to remove previous logo from R2",
            destroyError,
          );
        }
      }

      const result = await uploadLocalToR2(file.path, "site-settings");

      return await siteSettingsRepository.updateLogo(
        result.secure_url,
        result.public_id,
      );
    } catch (error) {
      throw new AppError(`Logo upload failed: ${error.message}`, 500);
    }
  }
}

module.exports = new SiteSettingsService();
