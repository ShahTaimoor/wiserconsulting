/**
 * Site Settings Routes
 * Public GET and authenticated update endpoints.
 */

const express = require("express");
const router = express.Router();
const siteSettingsController = require("../controllers/siteSettingsController");
const { isAuthorized, isAdmin } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const {
  updateSettingsSchema,
} = require("../validations/siteSettingsValidation");
const { uploadToLocal } = require("../config/upload");

router.get(
  "/",
  siteSettingsController.getSettings.bind(siteSettingsController),
);

router.put(
  "/",
  isAuthorized,
  isAdmin,
  validate(updateSettingsSchema),
  siteSettingsController.updateSettings.bind(siteSettingsController),
);

router.post(
  "/",
  isAuthorized,
  isAdmin,
  validate(updateSettingsSchema),
  siteSettingsController.updateSettings.bind(siteSettingsController),
);

router.post(
  "/logo",
  isAuthorized,
  isAdmin,
  uploadToLocal.single("logo"),
  siteSettingsController.uploadLogo.bind(siteSettingsController),
);

module.exports = router;
