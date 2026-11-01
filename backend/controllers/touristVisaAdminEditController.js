/**
 * TouristVisaAdminEdit Controller
 * HTTP for the administrator's corrections, notes, call log and flags (step 8f). The administrator always comes
 * from req.user (the route has checked the role); nothing about who is asking is read from the body or the query.
 */

const touristVisaAdminEditService = require('../services/touristVisaAdminEditService');
const touristVisaAdminNotesService = require('../services/touristVisaAdminNotesService');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');

class TouristVisaAdminEditController {
  editForm = asyncHandler(async (req, res) => {
    const result = await touristVisaAdminEditService.editForm(req.user._id, req.params.id);

    return ApiResponse.success(res, result, 'Edit form retrieved successfully');
  })

  change = asyncHandler(async (req, res) => {
    const result = await touristVisaAdminEditService.change(req.user._id, req.params.id, req.body);

    return ApiResponse.success(res, result, result.dryRun ? 'Preview created' : 'Changes applied');
  })

  history = asyncHandler(async (req, res) => {
    const result = await touristVisaAdminEditService.history(req.user._id, req.params.id);

    return ApiResponse.success(res, result, 'Changes retrieved successfully');
  })

  listNotes = asyncHandler(async (req, res) => {
    const result = await touristVisaAdminNotesService.list(req.user._id, req.params.id);

    return ApiResponse.success(res, result, 'Notes retrieved successfully');
  })

  addNote = asyncHandler(async (req, res) => {
    const result = await touristVisaAdminNotesService.add(req.user._id, req.user.name, req.params.id, req.body);

    return ApiResponse.success(res, result, 'Note added', 201);
  })

  setFlags = asyncHandler(async (req, res) => {
    const result = await touristVisaAdminNotesService.setFlags(req.user._id, req.params.id, req.body);

    return ApiResponse.success(res, result, 'Flags updated');
  })
}

module.exports = new TouristVisaAdminEditController();
