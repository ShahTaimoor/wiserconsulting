/**
 * Testimonial Routes
 * Public GET (active only) + admin-only CRUD, mirroring the
 * ApprovedVisa/ContactSubmission/SiteSettings public/admin split.
 */

const express = require("express");
const router = express.Router();
const testimonialController = require("../controllers/testimonialController");
const { isAuthorized, isAdmin } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const {
  createTestimonialSchema,
  updateTestimonialSchema,
} = require("../validations/testimonialValidation");
const { uploadToLocal } = require("../config/cloudinary");

const uploadTestimonialPhoto = uploadToLocal.fields([
  { name: "clientPhoto", maxCount: 1 },
]);

// Public route — active records only, for the public-facing section
router.get(
  "/",
  testimonialController.getPublicList.bind(testimonialController),
);

// Admin: list ALL records (active + inactive) for the admin table.
router.get(
  "/all",
  isAuthorized,
  isAdmin,
  testimonialController.getAllForAdmin.bind(testimonialController),
);

router.post(
  "/",
  isAuthorized,
  isAdmin,
  uploadTestimonialPhoto,
  validate(createTestimonialSchema),
  testimonialController.create.bind(testimonialController),
);

router.get(
  "/:id",
  isAuthorized,
  isAdmin,
  testimonialController.getById.bind(testimonialController),
);

router.put(
  "/:id",
  isAuthorized,
  isAdmin,
  uploadTestimonialPhoto,
  validate(updateTestimonialSchema),
  testimonialController.update.bind(testimonialController),
);

router.delete(
  "/:id",
  isAuthorized,
  isAdmin,
  testimonialController.remove.bind(testimonialController),
);

module.exports = router;
