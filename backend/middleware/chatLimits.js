/**
 * Rate limits of the Contact chat. The chat routes are EXEMPT from the general limiter in index.js (100 requests per 15 minutes per address:
 * one open tab polling every 20 seconds would use half of it, and a whole office behind one address all of it), so they have their own:
 *
 *   ip         every chat request, counted per network address BEFORE sign-in (a flood of anonymous requests is stopped here)
 *   status     the public status check, per address
 *   poll       the signed-in checks for new messages and unread counts, per user (sized for polling every 15 to 30 seconds)
 *   write      marking read, per user
 *   sendMinute / sendHour / sendDay   sending a message, per user: three budgets at once
 *   adminPoll / adminWrite            the inbox, per signed-in staff user
 *
 * The numbers and the reasons for them are in config/contactChat.js. An answer is a 429 with a fixed message and a code the client turns into a
 * clear sentence; nothing the caller sent is in it.
 */

const { createLimiter } = require('./touristVisaLimits');
const { LIMITS } = require('../config/contactChat');

const make = (limits) => createLimiter(limits);

module.exports = {
  ipLimiter: make(LIMITS.ip),
  statusLimiter: make(LIMITS.status),
  pollLimiter: make(LIMITS.poll),
  writeLimiter: make(LIMITS.write),
  sendLimiters: [make(LIMITS.sendMinute), make(LIMITS.sendHour), make(LIMITS.sendDay)],
  adminPollLimiter: make(LIMITS.adminPoll),
  adminWriteLimiter: make(LIMITS.adminWrite),
  /** A fresh set with their own counters (tests pass small numbers). */
  makeLimiter: make,
};
