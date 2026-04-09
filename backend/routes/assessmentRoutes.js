/**
 * Assessment Routes
 * Only routes - no business logic, no DB queries
 */

const express = require('express');
const router = express.Router();
const assessmentController = require('../controllers/assessmentController');
const { uploadFields, uploadFieldsLocal } = require('../config/cloudinary');
const validate = require('../middleware/validate');
const { createSubmissionSchema } = require('../validations/formSubmissionValidation');

// Test route to verify PDF upload
router.post('/test-pdf-upload', uploadFields, async (req, res, next) => {
  try {
    if (!req.files) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const documents = require('../config/cloudinary').processFiles(req.files, 'cloudinary');

    res.json({
      success: true,
      message: 'PDF upload test successful',
      documents: documents,
      fileCount: documents.length
    });
  } catch (error) {
    next(error);
  }
});

// Submit assessment (Cloudinary)
router.post(
  '/submit-assessment',
  uploadFields,
  validate(createSubmissionSchema),
  assessmentController.createSubmission.bind(assessmentController)
);

// Submit assessment (Local)
router.post(
  '/submit-assessment-local',
  uploadFieldsLocal,
  validate(createSubmissionSchema),
  assessmentController.createSubmission.bind(assessmentController)
);

// Merge PDFs
router.post('/merge-pdfs', assessmentController.mergePDFs.bind(assessmentController));

// Compress PDFs
router.post('/compress-pdfs', assessmentController.compressPDFs.bind(assessmentController));

module.exports = router;
