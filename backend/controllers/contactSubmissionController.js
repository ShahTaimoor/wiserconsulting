const contactSubmissionService = require("../services/contactSubmissionService");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const logger = require("../utils/logger");

// Create a new contact submission
exports.createContactSubmission = asyncHandler(async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validation
    if (!name || !email || !phone || !subject || !message) {
      return ApiResponse.error(res, "All fields are required", 400);
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return ApiResponse.error(res, "Invalid email format", 400);
    }

    const submission = await contactSubmissionService.createContactSubmission({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      subject: subject.trim(),
      message: message.trim(),
    });

    return ApiResponse.success(
      res,
      submission,
      "Contact submission received successfully",
      201,
    );
  } catch (error) {
    logger.error(`Error in createContactSubmission: ${error.message}`);
    return ApiResponse.error(res, "Error creating contact submission", 500);
  }
});

// Get all contact submissions (Admin only)
exports.getAllSubmissions = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;

    let result;
    if (search) {
      result = await contactSubmissionService.searchSubmissions(
        search,
        parseInt(page),
        parseInt(limit),
      );
    } else {
      const filters = status ? { status } : {};
      result = await contactSubmissionService.getAllSubmissions(
        parseInt(page),
        parseInt(limit),
        filters,
      );
    }

    return ApiResponse.paginated(
      res,
      result.submissions,
      result.pagination,
      "Contact submissions retrieved successfully",
      200,
    );
  } catch (error) {
    logger.error(`Error in getAllSubmissions: ${error.message}`);
    return ApiResponse.error(res, "Error fetching contact submissions", 500);
  }
});

// Get submission by ID (Admin only)
exports.getSubmissionById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const submission = await contactSubmissionService.getSubmissionById(id);

    return ApiResponse.success(
      res,
      submission,
      "Contact submission retrieved successfully",
      200,
    );
  } catch (error) {
    logger.error(`Error in getSubmissionById: ${error.message}`);
    if (error.message === "Contact submission not found") {
      return ApiResponse.error(res, "Contact submission not found", 404);
    }
    return ApiResponse.error(res, "Error fetching contact submission", 500);
  }
});

// Update submission status (Admin only)
exports.updateSubmissionStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return ApiResponse.error(res, "Status is required", 400);
    }

    const submission = await contactSubmissionService.updateSubmissionStatus(
      id,
      status,
    );

    return ApiResponse.success(
      res,
      submission,
      "Submission status updated successfully",
      200,
    );
  } catch (error) {
    logger.error(`Error in updateSubmissionStatus: ${error.message}`);
    return ApiResponse.error(res, "Error updating submission status", 500);
  }
});

// Add admin reply (Admin only)
exports.addAdminReply = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message) {
      return ApiResponse.error(res, "Reply message is required", 400);
    }

    const userId = req.user._id;
    const submission = await contactSubmissionService.addAdminReply(
      id,
      message,
      userId,
    );

    return ApiResponse.success(
      res,
      submission,
      "Admin reply added successfully",
      200,
    );
  } catch (error) {
    logger.error(`Error in addAdminReply: ${error.message}`);
    return ApiResponse.error(res, "Error adding admin reply", 500);
  }
});

// Delete submission (Admin only)
exports.deleteSubmission = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    await contactSubmissionService.deleteSubmission(id);

    return ApiResponse.success(
      res,
      null,
      "Contact submission deleted successfully",
      200,
    );
  } catch (error) {
    logger.error(`Error in deleteSubmission: ${error.message}`);
    return ApiResponse.error(res, "Error deleting contact submission", 500);
  }
});

// Get statistics (Admin only)
exports.getStatistics = asyncHandler(async (req, res) => {
  try {
    const stats = await contactSubmissionService.getStatistics();

    return ApiResponse.success(
      res,
      stats,
      "Contact submission statistics retrieved successfully",
      200,
    );
  } catch (error) {
    logger.error(`Error in getStatistics: ${error.message}`);
    return ApiResponse.error(res, "Error fetching statistics", 500);
  }
});
