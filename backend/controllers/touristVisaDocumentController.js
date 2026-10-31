/**
 * TouristVisaDocument Controller
 * Handles HTTP requests and responses for the applicant's uploaded files.
 * The owner always comes from req.user. Nothing here ever returns a link or a storage id.
 */

const touristVisaDocumentService = require('../services/touristVisaDocumentService');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');

class TouristVisaDocumentController {
  /**
   * Upload one file (multipart: slot, file) to my draft application
   */
  upload = asyncHandler(async (req, res) => {
    const document = await touristVisaDocumentService.upload(req.user._id, {
      slot: req.body ? req.body.slot : undefined,
      file: req.file,
    });

    return ApiResponse.success(res, { document }, 'File uploaded', 201);
  })

  /**
   * My files (metadata only) and the limits
   */
  list = asyncHandler(async (req, res) => {
    const result = await touristVisaDocumentService.list(req.user._id);

    return ApiResponse.success(res, result, 'Files retrieved successfully');
  })

  /**
   * Delete one of my files
   */
  remove = asyncHandler(async (req, res) => {
    await touristVisaDocumentService.remove(req.user._id, req.params.docId);

    return ApiResponse.success(res, null, 'File deleted');
  })
}

module.exports = new TouristVisaDocumentController();
