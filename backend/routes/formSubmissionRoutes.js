/**
 * FormSubmission Routes
 * Only routes - no business logic, no DB queries
 */

const express = require('express');
const router = express.Router();
const formSubmissionController = require('../controllers/formSubmissionController');
const { isAuthorized, isAdmin } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const {
  updateStatusSchema,
  addAdminCommentSchema,
  addCustomerCommentSchema,
  getSubmissionByEmailSchema,
  deleteSubmissionSchema,
  getFileUrlSchema
} = require('../validations/formSubmissionValidation');

// Get all form submissions (with pagination)
router.get(
  '/form-submissions',
  isAuthorized,
  isAdmin,
  formSubmissionController.getAllSubmissions.bind(formSubmissionController)
);

// Update submission status
router.put(
  '/form-submissions/:id/status',
  isAuthorized,
  isAdmin,
  validate(updateStatusSchema),
  formSubmissionController.updateStatus.bind(formSubmissionController)
);

// Add admin comment to a specific document and send email
router.put(
  '/:submissionId/documents/:documentId/comment',
  isAuthorized,
  isAdmin,
  validate(addAdminCommentSchema),
  formSubmissionController.addAdminComment.bind(formSubmissionController)
);

// Add customer comment
router.post(
  '/:submissionId/customer-comment',
  validate(addCustomerCommentSchema),
  formSubmissionController.addCustomerComment.bind(formSubmissionController)
);

// Get customer submission
router.get(
  '/customer-submission/:email',
  validate(getSubmissionByEmailSchema),
  formSubmissionController.getSubmissionByEmail.bind(formSubmissionController)
);

// Delete submission and all associated files
router.delete(
  '/form-submissions/:id',
  isAuthorized,
  isAdmin,
  validate(deleteSubmissionSchema),
  formSubmissionController.deleteSubmission.bind(formSubmissionController)
);

// Get file URL (works for both local and cloudinary files)
router.get(
  '/file/:submissionId/:documentId',
  validate(getFileUrlSchema),
  formSubmissionController.getFileUrl.bind(formSubmissionController)
);

module.exports = router;
