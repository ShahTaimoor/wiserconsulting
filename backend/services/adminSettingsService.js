/**
 * Admin Settings Service
 * Business logic for admin settings operations
 */

const adminSettingsRepository = require("../repositories/adminSettingsRepository");
const cloudinary = require("cloudinary").v2;
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
   * Update logo with Cloudinary
   */
  async updateLogo(file, currentSettings) {
    if (!file) {
      throw new AppError("No file provided", 400);
    }

    try {
      // Delete old logo from Cloudinary if it exists
      if (currentSettings.logoPublicId) {
        try {
          await cloudinary.uploader.destroy(currentSettings.logoPublicId);
        } catch (error) {
          console.error("Error deleting old logo from Cloudinary:", error);
        }
      }

      // Upload new logo to Cloudinary
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "admin-settings",
            resource_type: "auto",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          },
        );

        uploadStream.end(file.buffer);
      });

      // Update settings with new logo
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
        await cloudinary.uploader.destroy(currentSettings.logoPublicId);
      } catch (error) {
        console.error("Error deleting logo from Cloudinary:", error);
      }
    }

    return await adminSettingsRepository.updateLogo(null, null);
  }
}

module.exports = new AdminSettingsService();
