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

  /** Clears (url = null) the hero banner of one screen size: the older single picture and the whole list. */
  async updateHeroBanner(device, url, publicId) {
    const prefix = `hero${device.charAt(0).toUpperCase()}${device.slice(1)}`;
    const set = { [`${prefix}Url`]: url, [`${prefix}PublicId`]: publicId };
    if (url === null) set[`${prefix}Images`] = [];
    const settings = await SiteSettings.findOneAndUpdate(
      {},
      { $set: set },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    if (!settings) {
      throw new AppError("Site settings not found", 404);
    }

    return settings;
  }

  /**
   * Adds one picture to the list of a screen size. `legacy` ({ url, publicId }) is the older single picture of that size, when it is
   * the only one so far: it is moved into the list (first) and its single fields are cleared.
   */
  async addHeroImage(device, url, publicId, legacy = null) {
    const prefix = `hero${device.charAt(0).toUpperCase()}${device.slice(1)}`;
    const items = [...(legacy ? [{ url: legacy.url, publicId: legacy.publicId }] : []), { url, publicId }];
    const update = { $push: { [`${prefix}Images`]: { $each: items } } };
    if (legacy) update.$set = { [`${prefix}Url`]: null, [`${prefix}PublicId`]: null };
    const settings = await SiteSettings.findOneAndUpdate({}, update, { new: true, upsert: true, setDefaultsOnInsert: true });

    if (!settings) {
      throw new AppError("Site settings not found", 404);
    }

    return settings;
  }

  /** Removes one picture of a screen size: an item of the list by its id, or the older single picture (imageId "legacy"). */
  async removeHeroImage(device, imageId) {
    const prefix = `hero${device.charAt(0).toUpperCase()}${device.slice(1)}`;
    const update =
      imageId === "legacy"
        ? { $set: { [`${prefix}Url`]: null, [`${prefix}PublicId`]: null } }
        : { $pull: { [`${prefix}Images`]: { _id: imageId } } };
    const settings = await SiteSettings.findOneAndUpdate({}, update, { new: true, upsert: true, setDefaultsOnInsert: true });

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
