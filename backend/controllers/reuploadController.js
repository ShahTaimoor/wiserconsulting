/**
 * Document Re-upload Controller
 * Business logic for document re-upload operations
 */

const reuploadService = require("../services/reuploadService");
const { ApiResponse } = require("../middleware/errorHandler");
const asyncHandler = require("../utils/asyncHandler");

class ReuploadController {
  /**
   * Re-upload a document
   */
  reuploadDocument = asyncHandler(async (req, res) => {
    const { documentId } = req.body;
    const file = req.file;
    const userEmail = req.user.email;

    if (!documentId) {
      return ApiResponse.badRequest(res, "Document ID is required");
    }

    if (!file) {
      return ApiResponse.badRequest(res, "File is required");
    }

    const result = await reuploadService.reuploadDocument(documentId, file, userEmail);
    
    return ApiResponse.success(
      res,
      result,
      "Document re-uploaded successfully",
    );
  });
}

module.exports = new ReuploadController();
