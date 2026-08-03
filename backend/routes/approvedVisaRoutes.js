/**
 * Approved Visa Routes
 * Public GET (active only) + admin-only CRUD, mirroring the
 * ContactSubmission/SiteSettings public/admin split.
 */

const express = require("express");
const router = express.Router();
const approvedVisaController = require("../controllers/approvedVisaController");
const { isAuthorized, isAdmin } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const {
  createApprovedVisaSchema,
  updateApprovedVisaSchema,
} = require("../validations/approvedVisaValidation");
const { uploadToLocal } = require("../config/cloudinary");

const uploadVisaImages = uploadToLocal.fields([
  { name: "clientPhoto", maxCount: 1 },
  { name: "countryFlag", maxCount: 1 },
]);

// Public route — active records only, for the public-facing section
router.get(
  "/",
  approvedVisaController.getPublicList.bind(approvedVisaController),
);

// Admin: list ALL records (active + inactive) for the admin table.
// Not in the original route list — added because the public "/" above
// only returns isActive:true, and the admin UI needs to see and toggle
// inactive records too. Placed before "/:id" so it isn't swallowed by it.
router.get(
  "/all",
  isAuthorized,
  isAdmin,
  approvedVisaController.getAllForAdmin.bind(approvedVisaController),
);

router.post(
  "/",
  isAuthorized,
  isAdmin,
  uploadVisaImages,
  validate(createApprovedVisaSchema),
  approvedVisaController.create.bind(approvedVisaController),
);

router.get(
  "/:id",
  isAuthorized,
  isAdmin,
  approvedVisaController.getById.bind(approvedVisaController),
);

router.put(
  "/:id",
  isAuthorized,
  isAdmin,
  uploadVisaImages,
  validate(updateApprovedVisaSchema),
  approvedVisaController.update.bind(approvedVisaController),
);

router.delete(
  "/:id",
  isAuthorized,
  isAdmin,
  approvedVisaController.remove.bind(approvedVisaController),
);

module.exports = router;
