const express = require("express");
const router = express.Router();
const contactSubmissionController = require("../controllers/contactSubmissionController");
const { isAuthorized, isAdmin } = require("../middleware/authMiddleware");

// Public routes
// Create new contact submission
router.post("/", contactSubmissionController.createContactSubmission);

// Admin routes (require authentication and admin role)
// Get submission statistics (must be before /:id route)
router.get(
  "/stats",
  isAuthorized,
  isAdmin,
  contactSubmissionController.getStatistics,
);

// Get all submissions
router.get(
  "/",
  isAuthorized,
  isAdmin,
  contactSubmissionController.getAllSubmissions,
);

// Get submission by ID
router.get(
  "/:id",
  isAuthorized,
  isAdmin,
  contactSubmissionController.getSubmissionById,
);

// Update submission status
router.patch(
  "/:id/status",
  isAuthorized,
  isAdmin,
  contactSubmissionController.updateSubmissionStatus,
);

// Add admin reply
router.post(
  "/:id/reply",
  isAuthorized,
  isAdmin,
  contactSubmissionController.addAdminReply,
);

// Delete submission
router.delete(
  "/:id",
  isAuthorized,
  isAdmin,
  contactSubmissionController.deleteSubmission,
);

module.exports = router;
