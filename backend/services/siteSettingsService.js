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
const HERO_MAX_IMAGES = 10; // per screen size

const heroPrefix = (device) => `hero${device.charAt(0).toUpperCase()}${device.slice(1)}`;

/** The pictures of one screen size: its list, or (while it has no list) the older single picture as one item with the id "legacy". */
const heroImagesOf = (settings, device) => {
  const prefix = heroPrefix(device);
  const list = settings?.[`${prefix}Images`];
  if (Array.isArray(list) && list.length > 0) return list;
  const url = settings?.[`${prefix}Url`];
  return url ? [{ _id: "legacy", url, publicId: settings?.[`${prefix}PublicId`] || null }] : [];
};

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
   * Adds a banner picture to one screen size ("mobile", "tablet" or "desktop"): JPG or PNG, stored in the public R2 bucket, fitted
   * inside 2560 px. A size can hold up to 10 pictures (a slideshow on the homepage).
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
    const existing = heroImagesOf(currentSettings, device);
    if (existing.length >= HERO_MAX_IMAGES) {
      removeTempFile(file);
      throw new AppError(`A banner size can hold up to ${HERO_MAX_IMAGES} pictures. Remove one first.`, 400);
    }

    try {
      const result = await uploadLocalToR2(file.path, "hero-banners", {
        visibility: "public",
        maxDimension: HERO_MAX_DIMENSION,
      });

      // The older single picture (no list yet) becomes the first item of the list.
      const legacy = existing.length === 1 && existing[0]._id === "legacy" ? existing[0] : null;
      return await siteSettingsRepository.addHeroImage(device, result.secure_url, result.public_id, legacy);
    } catch (error) {
      removeTempFile(file);
      throw new AppError(`Banner upload failed: ${error.message}`, 500);
    }
  }

  /** Removes one picture of a screen size (its id from the list, or "legacy" for the older single picture) and its file. */
  async removeHeroImage(device, imageId, currentSettings) {
    if (!HERO_DEVICES.includes(device)) {
      throw new AppError("Unknown banner size. Use mobile, tablet or desktop.", 400);
    }
    const item = heroImagesOf(currentSettings, device).find((image) => String(image._id) === String(imageId));
    if (!item) {
      throw new AppError("Banner picture not found", 404);
    }
    if (item.publicId) {
      try {
        await deleteFromR2(item.publicId);
      } catch (error) {
        console.error("Failed to remove hero banner from R2", error);
      }
    }
    return await siteSettingsRepository.removeHeroImage(device, imageId);
  }

  /** Removes every picture of one screen size, and their files. */
  async removeHeroBanner(device, currentSettings) {
    if (!HERO_DEVICES.includes(device)) {
      throw new AppError("Unknown banner size. Use mobile, tablet or desktop.", 400);
    }
    for (const item of heroImagesOf(currentSettings, device)) {
      if (!item.publicId) continue;
      try {
        await deleteFromR2(item.publicId);
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
    // The logo is also the browser-tab icon: a picture only (a PDF or Word file would leave a broken logo everywhere).
    if (!HERO_MIME_TYPES.includes(file.mimetype)) {
      removeTempFile(file);
      throw new AppError("Logo must be a JPG or PNG image", 400);
    }

    let result;
    try {
      result = await uploadLocalToR2(file.path, "site-settings", { visibility: "public" });
    } catch (error) {
      removeTempFile(file);
      throw new AppError(`Logo upload failed: ${error.message}`, 500);
    }

    const updated = await siteSettingsRepository.updateLogo(result.secure_url, result.public_id);

    // The old picture is removed only after the new one is saved, so a failed upload never leaves the site without a logo.
    if (currentSettings?.logoPublicId && currentSettings.logoPublicId !== result.public_id) {
      try {
        await deleteFromR2(currentSettings.logoPublicId);
      } catch (destroyError) {
        console.error("Failed to remove previous logo from R2", destroyError);
      }
    }
    return updated;
  }
}

module.exports = new SiteSettingsService();
