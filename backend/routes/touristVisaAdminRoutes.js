/**
 * Tourist Visa admin routes (mounted at /api/tourist-visa/admin by touristVisaRoutes)
 * Only routes - no business logic, no DB queries.
 *
 * Read, the status, and (step 8f) corrections, notes and flags. There is deliberately no route that changes or
 * removes an audit row, a change record or a note: no DELETE, and no PUT/PATCH on those collections. The only PUTs
 * are the correction of answers (which appends a change record) and the flags.
 * The feature gate, sign-in (401) and the administrator check (403) are applied by the parent router, and every
 * answer from here carries Cache-Control: no-store.
 */

const express = require('express');
const router = express.Router();
const touristVisaAdminController = require('../controllers/touristVisaAdminController');
const touristVisaAdminEditController = require('../controllers/touristVisaAdminEditController');
const touristVisaCoverLetterController = require('../controllers/touristVisaCoverLetterController');
const touristVisaItineraryController = require('../controllers/touristVisaItineraryController');
const touristVisaPdfController = require('../controllers/touristVisaPdfController');
const { pdfLimiter } = require('../middleware/touristVisaPdfLimit');

// The list of submitted and later applications (never drafts)
router.get('/applications', touristVisaAdminController.list);

// The Overview of one application
router.get('/applications/:id', touristVisaAdminController.overview);

// Its audit rows: who looked at it or changed it, and when
router.get('/applications/:id/activity', touristVisaAdminController.activity);

// A signed link (2 minutes) to one of its files: the only way a link leaves the server
router.get('/applications/:id/documents/:docId/link', touristVisaAdminController.documentLink);

// Move it along: submitted -> in_review -> completed (and back to in_review)
router.patch('/applications/:id/status', touristVisaAdminController.updateStatus);

// Correcting answers (step 8f). The form needs the config the application was submitted under and its decrypted answers.
router.get('/applications/:id/edit-form', touristVisaAdminEditController.editForm);
// Body { expectedRevision, reason, changes, dryRun? }: a dry run only previews; a real one is a single transaction.
router.put('/applications/:id/changes', touristVisaAdminEditController.change);
// What was corrected, by whom, when and why, with the old and new values
router.get('/applications/:id/changes', touristVisaAdminEditController.history);

// Notes and the call log (append only)
router.get('/applications/:id/notes', touristVisaAdminEditController.listNotes);
router.post('/applications/:id/notes', touristVisaAdminEditController.addNote);

// Admin-only flags from a fixed list
router.put('/applications/:id/flags', touristVisaAdminEditController.setFlags);

// The cover letter (step 8g): generated on demand by an administrator, versions appended and never changed.
router.get('/applications/:id/cover-letter', touristVisaCoverLetterController.get);
router.post('/applications/:id/cover-letter/generate', touristVisaCoverLetterController.generate);
router.put('/applications/:id/cover-letter', touristVisaCoverLetterController.save);
router.post('/applications/:id/cover-letter/approve', touristVisaCoverLetterController.approve);

// The itinerary: a proposed day-by-day plan, generated on demand by an administrator, versions appended and never changed.
router.get('/applications/:id/itinerary', touristVisaItineraryController.get);
router.post('/applications/:id/itinerary/generate', touristVisaItineraryController.generate);
router.put('/applications/:id/itinerary', touristVisaItineraryController.save);
router.post('/applications/:id/itinerary/approve', touristVisaItineraryController.approve);

// The application summary as a PDF: made in memory, never stored, rate limited, audited as pdf_export (the type and who, never any content).
router.get('/applications/:id/pdf/answers', pdfLimiter, touristVisaPdfController.adminAnswers);
// The newest version of the cover letter as a PDF (administrators only; a version that is not approved is watermarked as a draft). Same limiter, same rules.
router.get('/applications/:id/pdf/cover-letter', pdfLimiter, touristVisaPdfController.adminCoverLetter);
// The newest version of the itinerary as a PDF (administrators only; a version that is not approved is watermarked as a draft). Same limiter, same rules.
router.get('/applications/:id/pdf/itinerary', pdfLimiter, touristVisaPdfController.adminItinerary);

module.exports = router;
