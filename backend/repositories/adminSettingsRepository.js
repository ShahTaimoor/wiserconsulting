/**
 * Admin Settings Repository
 * Handles all database operations for admin settings
 */

const AdminSettings = require("../models/AdminSettings");
const { AppError } = require("../middleware/errorHandler");

class AdminSettingsRepository {
  /**
   * Get current admin settings
   * Returns default settings if none exist
   */
  async getSettings() {
    let settings = await AdminSettings.findOne({ isDeleted: false });

    if (!settings) {
      // Create default settings if none exist
      settings = await AdminSettings.create({
        websiteTitle: "Wiser Consulting",
      });
    }

    return settings;
  }

  /**
   * Update admin settings
   */
  async updateSettings(data) {
    const settings = await AdminSettings.findOneAndUpdate(
      { isDeleted: false },
      { $set: data },
      { new: true, runValidators: true },
    );

    if (!settings) {
      throw new AppError("Admin settings not found", 404);
    }

    return settings;
  }

  /**
   * Update logo only
   */
  async updateLogo(siteLogo, logoPublicId) {
    const settings = await AdminSettings.findOneAndUpdate(
      { isDeleted: false },
      {
        $set: {
          siteLogo,
          logoPublicId,
        },
      },
      { new: true },
    );

    if (!settings) {
      throw new AppError("Admin settings not found", 404);
    }

    return settings;
  }

  /**
   * Get only public settings (for frontend)
   */
  async getPublicSettings() {
    const settings = await AdminSettings.findOne(
      { isDeleted: false },
      "websiteTitle email phone address siteLogo socialLinks",
    );

    return (
      settings || {
        websiteTitle: "Wiser Consulting",
        email: "",
        phone: "",
        address: "",
        siteLogo: null,
        socialLinks: {},
      }
    );
  }
}

module.exports = new AdminSettingsRepository();
