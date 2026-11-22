/**
 * Assessment Routes
 * Only routes - no business logic, no DB queries
 */

const express = require('express');
const router = express.Router();
const assessmentController = require('../controllers/assessmentController');
const { uploadFields } = require('../config/upload');
const { isAuthorized, isAdmin } = require('../middleware/authMiddleware');
const { uploadLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { createSubmissionSchema } = require('../validations/formSubmissionValidation');

// Submit assessment (Cloudflare R2, private bucket)
router.post(
  '/submit-assessment',
  uploadLimiter,
  uploadFields,
  validate(createSubmissionSchema),
  assessmentController.createSubmission.bind(assessmentController)
);

// Merge PDFs (administrators only: the result contains customers' documents)
router.post('/merge-pdfs', isAuthorized, isAdmin, assessmentController.mergePDFs.bind(assessmentController));

// Compress PDFs (administrators only)
router.post('/compress-pdfs', isAuthorized, isAdmin, assessmentController.compressPDFs.bind(assessmentController));

module.exports = router;
