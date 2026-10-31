/**
 * Tourist Visa Routes (mounted at /api/tourist-visa)
 * Only routes - no business logic, no DB queries
 * Every route needs a signed-in user and only ever touches that user's application.
 */

const express = require('express');
const router = express.Router();
const touristVisaApplicationController = require('../controllers/touristVisaApplicationController');
const touristVisaDocumentController = require('../controllers/touristVisaDocumentController');
const { isAuthorized } = require('../middleware/authMiddleware');
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
router.use(isAuthorized);

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
  touristVisaApplicationController.submitApplication.bind(touristVisaApplicationController)
);

// Must stay last: keeps database error details (which can include answers) out of logs
router.use(touristVisaErrorHandler);

module.exports = router;
