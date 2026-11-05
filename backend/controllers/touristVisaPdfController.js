/**
 * TouristVisaPdf Controller
 * HTTP for the PDFs (step 8h-1). The user always comes from req.user (the route has checked who they are); nothing about who is asking is
 * read from the body or the query. The file is sent from memory as an attachment: never cached, never stored, a file name built only from
 * the reference.
 */

const touristVisaPdfService = require('../services/touristVisaPdfService');
const asyncHandler = require('../utils/asyncHandler');

/** Marks the answer (an error too) as not to be kept in any cache, before anything else runs. */
function sensitive(res) {
  res.set('Cache-Control', 'no-store');
}

function sendPdf(res, { buffer, filename }) {
  res.status(200);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': String(buffer.length),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(buffer);
}

class TouristVisaPdfController {
  adminAnswers = asyncHandler(async (req, res) => {
    sensitive(res);
    sendPdf(res, await touristVisaPdfService.answersForAdmin(req.user._id, req.params.id));
  })

  adminCoverLetter = asyncHandler(async (req, res) => {
    sensitive(res);
    sendPdf(res, await touristVisaPdfService.coverLetterForAdmin(req.user._id, req.params.id));
  })

  adminItinerary = asyncHandler(async (req, res) => {
    sensitive(res);
    sendPdf(res, await touristVisaPdfService.itineraryForAdmin(req.user._id, req.params.id));
  })

  myAnswers = asyncHandler(async (req, res) => {
    sensitive(res);
    sendPdf(res, await touristVisaPdfService.answersForApplicant(req.user._id));
  })
}

module.exports = new TouristVisaPdfController();
