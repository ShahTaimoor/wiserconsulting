/**
 * Document Re-upload Routes
 * Only routes - no business logic, no DB queries
 */

const express = require("express");
const router = express.Router();
const reuploadController = require("../controllers/reuploadController");
const { isAuthorized } = require("../middleware/authMiddleware");
const { uploadToLocal } = require("../config/cloudinary");

// Re-upload document
router.post(
  "/",
  isAuthorized,
  uploadToLocal.single('file'),
  reuploadController.reuploadDocument.bind(reuploadController),
);

module.exports = router;
