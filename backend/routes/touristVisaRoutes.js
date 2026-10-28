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
const { warnIfFieldEncryptionNotConfigured } = require('../config/fieldEncryption');

warnIfFieldEncryptionNotConfigured();

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

// Must stay last: keeps database error details (which can include answers) out of logs
router.use(touristVisaErrorHandler);

module.exports = router;
