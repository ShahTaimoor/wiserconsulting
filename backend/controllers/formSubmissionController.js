/**
 * FormSubmission Controller
 * Handles HTTP requests and responses
 * Only validates request, calls service, returns response
 */

const formSubmissionService = require('../services/formSubmissionService');
const { getPaginationParams, getPaginationMeta } = require('../utils/pagination');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');

class FormSubmissionController {
  /**
   * Create new form submission
   */
  createSubmission = asyncHandler(async (req, res) => {
    const { processFiles } = require('../config/cloudinary');
    const uploadType = req.route.path.includes('local') ? 'local' : 'cloudinary';
    
    const submissionData = {
      ...req.body,
      documents: req.files ? processFiles(req.files, uploadType) : [],
      status: 'pending'
    };

    const submission = await formSubmissionService.createSubmission(submissionData);

    return ApiResponse.success(
      res,
      { submissionId: submission._id },
      'Assessment submitted successfully! We will contact you within 24 hours.',
      201
    );
  })

  /**
   * Get all form submissions (with pagination)
   */
  getAllSubmissions = asyncHandler(async (req, res) => {
    const { skip, limit, page } = getPaginationParams(req);
    const { submissions, total } = await formSubmissionService.getAllSubmissions(skip, limit);
    const meta = getPaginationMeta(page, limit, total);

    return ApiResponse.paginated(res, { submissions }, meta, 'Submissions retrieved successfully');
  })

  /**
   * Get submission by ID
   */
  getSubmissionById = asyncHandler(async (req, res) => {
    const { submissionId } = req.params;
    const submission = await formSubmissionService.getSubmissionById(submissionId);

    // Add file URLs to documents (business logic moved to service)
    const submissionWithUrls = await formSubmissionService.addFileUrls(submission);

    return ApiResponse.success(res, { submission: submissionWithUrls }, 'Submission retrieved successfully');
  })

  /**
   * Get submission by email
   */
  getSubmissionByEmail = asyncHandler(async (req, res) => {
    const { email } = req.params;
    const submission = await formSubmissionService.getSubmissionByEmail(email);

    return ApiResponse.success(res, { submission }, 'Submission retrieved successfully');
  })

  /**
   * Update submission status
   */
  updateStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const submission = await formSubmissionService.updateStatus(id, status);

    return ApiResponse.success(res, { submission }, 'Status updated successfully');
  })

  /**
   * Add admin comment to document
   */
  addAdminComment = asyncHandler(async (req, res) => {
    const { submissionId, documentId } = req.params;
    const { comment } = req.body;
    const result = await formSubmissionService.addAdminComment(submissionId, documentId, comment);

    return ApiResponse.success(res, result, 'Comment saved and email sent successfully');
  })

  /**
   * Add customer comment
   */
  addCustomerComment = asyncHandler(async (req, res) => {
    const { submissionId } = req.params;
    const { message } = req.body;
    const result = await formSubmissionService.addCustomerComment(submissionId, message);

    return ApiResponse.success(res, result, 'Comment added successfully');
  })

  /**
   * Delete submission (soft delete)
   */
  deleteSubmission = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await formSubmissionService.deleteSubmission(id);

    return ApiResponse.success(res, result, 'Submission deleted successfully');
  })

  /**
   * Get file URL
   */
  getFileUrl = asyncHandler(async (req, res) => {
    const { submissionId, documentId } = req.params;
    const result = await formSubmissionService.getFileUrl(submissionId, documentId);

    return ApiResponse.success(res, result, 'File URL retrieved successfully');
  })
}

module.exports = new FormSubmissionController();

