/**
 * The numbers of the Contact chat, in one place. (The reply hours are in config/contactChatHours.js.)
 *
 * Why these values:
 *  - A message is at most 2000 characters (a long paragraph or two); staff replies get 4000.
 *  - A conversation stops at 2000 messages: far beyond real use, and it keeps one conversation from growing without limit.
 *  - Sending: 8 a minute stops a burst, 60 an hour and 300 a day stop a script that is slow on purpose. Normal typing never meets them.
 *  - Polling every 15 to 30 seconds is 30 to 60 requests in 15 minutes per open tab, so the poll limit of 600 leaves room for several tabs
 *    and for the faster rate after sending, and still stops a loop.
 *  - Email: at most one per conversation per 3 hours in each direction. Staff see the badge and the inbox and a client sees the bubble, so
 *    a long gap is enough; a chatty conversation must not become a stream of emails. A global cap of 30 staff emails an hour (per
 *    process) stops a flood of new accounts from filling the mailbox.
 *  - A conversation with no message for 30 days is Closed (status only; nothing is deleted).
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const CHAT = Object.freeze({
  MAX_CLIENT_MESSAGE: 2000,
  MAX_STAFF_MESSAGE: 4000,
  MAX_RAW_MESSAGE: 20000, // what the request schema lets through before the text is cleaned and counted
  MAX_SUBJECT: 80,
  MAX_PHONE: 25,
  MAX_MESSAGES_PER_CONVERSATION: 2000,
  PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,
  INBOX_PAGE_SIZE: 20,
  MAX_INBOX_PAGE_SIZE: 50,
  PREVIEW_LENGTH: 80,
  SEARCH_MAX: 100,
  SEARCH_USER_LIMIT: 200,
  DUPLICATE_WINDOW_MS: MINUTE, // the same text sent again inside this time is the first message, not a new one
  AUTO_CLOSE_AFTER_MS: 30 * DAY,
  AUTO_CLOSE_SWEEP_EVERY_MS: 5 * MINUTE, // how often a request may sweep all conversations for stale ones
  EMAIL_THROTTLE_MS: 3 * HOUR,
  ADMIN_EMAIL_CAP_PER_HOUR: 30,
  EMAIL_TIMEOUT_MS: 4000,
});

const LIMITS = Object.freeze({
  ip: Object.freeze({ windowMs: 15 * MINUTE, max: 1500, code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please wait a moment and try again.' }),
  status: Object.freeze({ windowMs: 10 * MINUTE, max: 120, code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please wait a moment and try again.' }),
  poll: Object.freeze({ windowMs: 15 * MINUTE, max: 600, code: 'TOO_MANY_REQUESTS', message: 'Too many checks for new messages. Please wait a moment.' }),
  write: Object.freeze({ windowMs: 10 * MINUTE, max: 120, code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please wait a moment and try again.' }),
  sendMinute: Object.freeze({ windowMs: MINUTE, max: 8, code: 'TOO_MANY_MESSAGES', message: 'You are sending messages very quickly. Please wait a minute.' }),
  sendHour: Object.freeze({ windowMs: HOUR, max: 60, code: 'TOO_MANY_MESSAGES', message: 'You have sent a lot of messages this hour. Please try again later.' }),
  sendDay: Object.freeze({ windowMs: DAY, max: 300, code: 'TOO_MANY_MESSAGES', message: 'You have reached the daily limit of messages. Please try again tomorrow.' }),
  adminPoll: Object.freeze({ windowMs: 15 * MINUTE, max: 900, code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please wait a moment.' }),
  adminWrite: Object.freeze({ windowMs: 10 * MINUTE, max: 120, code: 'TOO_MANY_REQUESTS', message: 'Too many changes in a short time. Please wait a moment.' }),
});

const STATUSES = Object.freeze(['open', 'answered', 'closed']);

module.exports = { CHAT, LIMITS, STATUSES, MINUTE, HOUR, DAY };
