/**
 * Tourist Visa admin routes (mounted at /api/tourist-visa/admin by touristVisaRoutes)
 * Only routes - no business logic, no DB queries.
 *
 * Read only, plus the status of an application. There is deliberately no route that changes an answer, a note
 * or the audit log: no PUT, no DELETE, and PATCH only for the status.
 * The feature gate, sign-in (401) and the administrator check (403) are applied by the parent router, and every
 * answer from here carries Cache-Control: no-store.
 */

const express = require('express');
const router = express.Router();
const touristVisaAdminController = require('../controllers/touristVisaAdminController');

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

module.exports = router;
