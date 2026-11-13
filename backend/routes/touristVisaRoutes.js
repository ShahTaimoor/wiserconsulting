/**
 * Tourist Visa Routes (mounted at /api/tourist-visa)
 * Only routes - no business logic, no DB queries
 * Every route needs a signed-in user and only ever touches that user's application.
 */

const express = require('express');
const router = express.Router();
const touristVisaApplicationController = require('../controllers/touristVisaApplicationController');
const touristVisaDocumentController = require('../controllers/touristVisaDocumentController');
const touristVisaPdfController = require('../controllers/touristVisaPdfController');
const { pdfLimiter } = require('../middleware/touristVisaPdfLimit');
const { isAuthorized, isAdmin } = require('../middleware/authMiddleware');
const touristVisaNoStore = require('../middleware/touristVisaNoStore');
const touristVisaOriginGuard = require('../middleware/touristVisaOriginGuard');
const { submitLimiter } = require('../middleware/touristVisaLimits');
const touristVisaAdminRoutes = require('./touristVisaAdminRoutes');
const touristVisaRatesController = require('../controllers/touristVisaRatesController');
const touristVisaErrorHandler = require('../middleware/touristVisaErrorHandler');
const touristVisaFeatureGate = require('../middleware/touristVisaFeatureGate');
const { isTouristVisaEnabled } = touristVisaFeatureGate;
const { warnIfFieldEncryptionNotConfigured } = require('../config/fieldEncryption');
const { receiveUpload, createUploadLimiter } = require('../middleware/touristVisaUpload');
const { warnIfDocumentStorageNotConfigured } = require('../config/touristVisaStorage');

// A closed deployment is inert, so a missing key is only worth a startup warning when the feature is on.
if (isTouristVisaEnabled()) {
  warnIfFieldEncryptionNotConfigured();
  warnIfDocumentStorageNotConfigured();
}

// Closed unless TOURIST_VISA_ENABLED is "true". index.js already mounts the same gate first; it is
// repeated here so the router can never be reached through another mount while the switch is off.
router.use(touristVisaFeatureGate);
// Every answer from here (a refusal to sign in and every error included) is marked not to be kept in a cache (step 8j-3, B6).
router.use(touristVisaNoStore);
// A state-changing request from a foreign origin, or with no origin and no Authorization header, is a 403 (step 8j-3, B3).
router.use(touristVisaOriginGuard);
router.use(isAuthorized);

// The administrator's side: read only, plus the status. Anonymous is 401 (above), a signed-in user who is not an
// administrator is 403 (the role is read from the database on every request).
router.use('/admin', isAdmin, touristVisaAdminRoutes);

// Exchange rates for the currency helper: any signed-in user, behind the feature gate and the general rate limiter.
// It takes no input and sends nothing about the user to any provider (services/touristVisaRatesService.js).
router.get('/rates', touristVisaRatesController.get);

// Create a draft application (or return the existing one)
router.post(
  '/applications',
  touristVisaApplicationController.createApplication.bind(touristVisaApplicationController)
);

// Get my application
router.get(
  '/applications/me',
  touristVisaApplicationController.getMyApplication.bind(touristVisaApplicationController)
);

// Save one section of my draft application
router.put(
  '/applications/me/sections/:sectionId',
  touristVisaApplicationController.saveSection.bind(touristVisaApplicationController)
);

// Uploaded files (passport and funds). One file per request, multipart. The limiter runs first, per signed-in
// user, so a flood is turned away before any body is read. touristVisaBodyParser lets exactly this route's
// multipart body through; everything else under /api/tourist-visa is still JSON only.
router.post(
  '/applications/me/documents',
  createUploadLimiter(),
  receiveUpload,
  touristVisaDocumentController.upload
);

// My files: metadata and limits only, never a link or a storage id
router.get(
  '/applications/me/documents',
  touristVisaDocumentController.list
);

// Delete one of my files (only while the application is a draft)
router.delete(
  '/applications/me/documents/:docId',
  touristVisaDocumentController.remove
);

// My application as a readable review: for a draft the live config, for a submitted one the config it was submitted under
router.get(
  '/applications/me/review',
  touristVisaApplicationController.getMyReview.bind(touristVisaApplicationController)
);

// Submit my draft application: re-checked in full, then one conditional write (body: { declarationAccepted: true })
router.post(
  '/applications/me/submit',
  submitLimiter,
  touristVisaApplicationController.submitApplication.bind(touristVisaApplicationController)
);

// A copy of my own submitted application as a PDF: made in memory, never stored, rate limited, audited as pdf_export
router.get('/applications/me/pdf/answers', pdfLimiter, touristVisaPdfController.myAnswers);

// Must stay last: keeps database error details (which can include answers) out of logs
router.use(touristVisaErrorHandler);

module.exports = router;
