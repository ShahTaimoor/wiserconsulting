/**
 * Admin Settings Service
 * Business logic for admin settings operations
 */

const adminSettingsRepository = require("../repositories/adminSettingsRepository");
const { uploadLocalToR2 } = require("../config/upload");
const { deleteFromR2 } = require("../middleware/fileStorage");
const { AppError } = require("../middleware/errorHandler");

class AdminSettingsService {
  /**
   * Get admin settings
   */
  async getSettings() {
    return await adminSettingsRepository.getSettings();
  }

  /**
   * Get public settings (frontend)
   */
  async getPublicSettings() {
    return await adminSettingsRepository.getPublicSettings();
  }

  /**
   * Update admin settings with text fields
   */
  async updateSettings(data) {
    const { websiteTitle, email, phone, address, socialLinks } = data;

    const updateData = {};

    if (websiteTitle !== undefined) updateData.websiteTitle = websiteTitle;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (socialLinks !== undefined) updateData.socialLinks = socialLinks;

    return await adminSettingsRepository.updateSettings(updateData);
  }

  /**
   * Update logo with R2
   */
  async updateLogo(file, currentSettings) {
    if (!file) {
      throw new AppError("No file provided", 400);
    }

    try {
      // Delete old logo from R2 if it exists
      if (currentSettings.logoPublicId) {
        try {
          await deleteFromR2(currentSettings.logoPublicId);
        } catch (error) {
          console.error("Error deleting old logo from R2:", error);
        }
      }

      const result = await uploadLocalToR2(file.path, "admin-settings");

      return await adminSettingsRepository.updateLogo(
        result.secure_url,
        result.public_id,
      );
    } catch (error) {
      throw new AppError(`Error uploading logo: ${error.message}`, 500);
    }
  }

  /**
   * Delete logo
   */
  async deleteLogo(currentSettings) {
    if (currentSettings.logoPublicId) {
      try {
        await deleteFromR2(currentSettings.logoPublicId);
      } catch (error) {
        console.error("Error deleting logo from R2:", error);
      }
    }

    return await adminSettingsRepository.updateLogo(null, null);
  }
}

module.exports = new AdminSettingsService();
