/**
 * Tourist Visa Routes (mounted at /api/tourist-visa)
 * Only routes - no business logic, no DB queries
 * Every route needs a signed-in user and only ever touches that user's application.
 */

const express = require('express');
const router = express.Router();
const touristVisaApplicationController = require('../controllers/touristVisaApplicationController');
const { isAuthorized } = require('../middleware/authMiddleware');
const touristVisaErrorHandler = require('../middleware/touristVisaErrorHandler');
const touristVisaFeatureGate = require('../middleware/touristVisaFeatureGate');
const { isTouristVisaEnabled } = touristVisaFeatureGate;
const { warnIfFieldEncryptionNotConfigured } = require('../config/fieldEncryption');

// A closed deployment is inert, so a missing key is only worth a startup warning when the feature is on.
if (isTouristVisaEnabled()) warnIfFieldEncryptionNotConfigured();

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

// Must stay last: keeps database error details (which can include answers) out of logs
router.use(touristVisaErrorHandler);

module.exports = router;
