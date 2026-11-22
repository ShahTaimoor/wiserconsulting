/**
 * FormSubmission Routes
 * Only routes - no business logic, no DB queries
 */

const express = require('express');
const router = express.Router();
const formSubmissionController = require('../controllers/formSubmissionController');
const { isAuthorized, isAdmin } = require('../middleware/authMiddleware');
const { requireOwnerByEmailParam, requireOwnerBySubmissionId } = require('../middleware/submissionAccess');
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
  '/form-submissions/:submissionId/documents/:documentId/comment',
  isAuthorized,
  isAdmin,
  validate(addAdminCommentSchema),
  formSubmissionController.addAdminComment.bind(formSubmissionController)
);

// Add customer comment (signed in, and the submission must be the user's own; an administrator may too)
router.post(
  '/form-submissions/:submissionId/customer-comment',
  isAuthorized,
  requireOwnerBySubmissionId,
  validate(addCustomerCommentSchema),
  formSubmissionController.addCustomerComment.bind(formSubmissionController)
);

// Get customer submission (signed in, and the e-mail must be the user's own; an administrator may read any)
router.get(
  '/form-submissions/customer-submission/:email',
  isAuthorized,
  requireOwnerByEmailParam,
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

// Rename a specific document in a submission
router.put(
  '/form-submissions/:submissionId/documents/:documentId/rename',
  isAuthorized,
  isAdmin,
  formSubmissionController.renameDocument.bind(formSubmissionController)
);

// Delete specific document from submission
router.delete(
  '/form-submissions/:submissionId/documents/:documentId',
  isAuthorized,
  isAdmin,
  formSubmissionController.deleteDocument.bind(formSubmissionController)
);

// Get file URL (signed in, and the submission must be the user's own; an administrator may read any)
router.get(
  '/form-submissions/file/:submissionId/:documentId',
  isAuthorized,
  requireOwnerBySubmissionId,
  validate(getFileUrlSchema),
  formSubmissionController.getFileUrl.bind(formSubmissionController)
);

module.exports = router;
