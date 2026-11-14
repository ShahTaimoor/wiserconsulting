/**
 * Site Settings Repository
 * Handles persistence and ensures a single settings record exists.
 */

const SiteSettings = require("../models/SiteSettings");
const { AppError } = require("../middleware/errorHandler");

class SiteSettingsRepository {
  async getSettings() {
    return await SiteSettings.findOneAndUpdate(
      {},
      {},
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );
  }

  async updateSettings(data) {
    const settings = await SiteSettings.findOneAndUpdate(
      {},
      { $set: data },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    if (!settings) {
      throw new AppError(
        "Site settings not found or could not be created",
        500,
      );
    }

    return settings;
  }

  /** Sets or clears (url = null) the hero banner picture of one screen size: "mobile", "tablet" or "desktop". */
  async updateHeroBanner(device, url, publicId) {
    const prefix = `hero${device.charAt(0).toUpperCase()}${device.slice(1)}`;
    const settings = await SiteSettings.findOneAndUpdate(
      {},
      { $set: { [`${prefix}Url`]: url, [`${prefix}PublicId`]: publicId } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    if (!settings) {
      throw new AppError("Site settings not found", 404);
    }

    return settings;
  }

  async updateLogo(logoUrl, logoPublicId) {
    const settings = await SiteSettings.findOneAndUpdate(
      {},
      {
        $set: {
          logoUrl,
          logoPublicId,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    if (!settings) {
      throw new AppError("Site settings not found", 404);
    }

    return settings;
  }
}

module.exports = new SiteSettingsRepository();
