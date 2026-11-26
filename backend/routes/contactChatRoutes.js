/**
 * Contact chat routes (mounted at /api/chat). Only routes: no business logic, no database queries.
 *
 * The feature switch (CHAT_ENABLED) is mounted by index.js in front of everything; while it is off every route but GET /status is a 404.
 * These routes are exempt from the general rate limiter (index.js) and use the limiters of middleware/chatLimits.js instead.
 *
 * Client routes take NO conversation id: they work on the signed-in user's own conversation. Staff routes (/admin/...) are admin-only
 * (isAuthorized + isAdmin: the role is read from the database on every request, so a demoted admin loses access at once).
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/contactChatController');
const validate = require('../middleware/validate');
const noStore = require('../middleware/noStore');
const chatFeatureGate = require('../middleware/chatFeatureGate');
const chatErrorHandler = require('../middleware/chatErrorHandler');
const { isAuthorized, isAdmin } = require('../middleware/authMiddleware');
const { ipLimiter, statusLimiter, pollLimiter, writeLimiter, sendLimiters, adminPollLimiter, adminWriteLimiter } = require('../middleware/chatLimits');
const logger = require('../utils/logger');
const { isChatEnabled } = chatFeatureGate;
const chatService = require('../services/contactChatService');
const { sendClientMessageSchema, sendStaffMessageSchema, readSchema, statusChangeSchema } = require('../validations/contactChatValidation');

// A switched-on chat that cannot encrypt would answer every request with a 503: say so once at start (names only).
if (isChatEnabled() && !chatService.isEncryptionReady()) {
  logger.error('CHAT_ENABLED is on but FIELD_ENCRYPTION_KEY is missing or malformed, so chat is unavailable (it answers 503).');
}

// The same gate as index.js (so the router is closed when it is mounted without index.js, as in tests), then the per-address limit.
router.use(chatFeatureGate);
router.use(ipLimiter);

// Public: is chat on, and the reply hours. The only route that answers while the chat is off.
router.get('/status', statusLimiter, controller.status);

// Everything below is private and never cached.
router.use(noStore);
router.use(isAuthorized);

// ------------------------------------------------------------------ the signed-in client (always their own conversation)
router.get('/conversation', pollLimiter, controller.conversation);
router.get('/unread', pollLimiter, controller.unread);
router.post('/messages', ...sendLimiters, validate(sendClientMessageSchema), controller.send);
router.post('/read', writeLimiter, validate(readSchema), controller.read);

// ------------------------------------------------------------------ staff only
const admin = express.Router();
admin.use(isAdmin);
admin.get('/unread', adminPollLimiter, controller.adminUnread);
admin.get('/conversations', adminPollLimiter, controller.adminList);
admin.get('/conversations/:id', adminPollLimiter, controller.adminConversation);
admin.post('/conversations/:id/messages', adminWriteLimiter, validate(sendStaffMessageSchema), controller.adminReply);
admin.post('/conversations/:id/read', adminWriteLimiter, validate(readSchema), controller.adminRead);
admin.patch('/conversations/:id', adminWriteLimiter, validate(statusChangeSchema), controller.adminStatus);
admin.delete('/conversations/:id', adminWriteLimiter, controller.adminDelete);
router.use('/admin', admin);

router.use(chatErrorHandler);

module.exports = router;
