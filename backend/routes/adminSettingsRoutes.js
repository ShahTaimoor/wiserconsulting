/**
 * Admin Settings Routes
 * Only routes - no business logic, no DB queries
 */

const express = require("express");
const router = express.Router();
const adminSettingsController = require("../controllers/adminSettingsController");
const { isAuthorized, isAdmin } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const {
  updateSettingsSchema,
} = require("../validations/adminSettingsValidation");
const { uploadToLocal } = require("../config/cloudinary");

// Get public settings (no auth required - for frontend)
router.get(
  "/public",
  adminSettingsController.getPublicSettings.bind(adminSettingsController),
);

// Get admin settings (Admin only)
router.get(
  "/",
  isAuthorized,
  isAdmin,
  adminSettingsController.getSettings.bind(adminSettingsController),
);

// Update admin settings (Admin only)
router.put(
  "/",
  isAuthorized,
  isAdmin,
  validate(updateSettingsSchema),
  adminSettingsController.updateSettings.bind(adminSettingsController),
);

// Update logo (Admin only)
router.post(
  "/logo/upload",
  isAuthorized,
  isAdmin,
  uploadToLocal.single("logo"),
  adminSettingsController.updateLogo.bind(adminSettingsController),
);

// Delete logo (Admin only)
router.delete(
  "/logo",
  isAuthorized,
  isAdmin,
  adminSettingsController.deleteLogo.bind(adminSettingsController),
);

module.exports = router;
