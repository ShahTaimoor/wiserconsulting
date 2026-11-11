/**
 * Dedicated rate limits for the Tourist Visa routes that were covered only by the general limiter (step 8j-3, finding B9). They are separate
 * from the AI limits (config/ai.js, repositories/aiUsageRepository.js), from the PDF limiter (middleware/touristVisaPdfLimit.js) and from the
 * upload limiter (middleware/touristVisaUpload.js, 40 uploads an hour per user, which already existed). Each has its OWN budget, so one kind of
 * work never uses up another's.
 *
 * Counted per signed-in user (the routes sit behind sign-in, so req.user is there); a request with no user is counted per network address.
 * The answer is a 429 with a fixed message and a code the client turns into a clear sentence. Nothing the caller sent is in it.
 *
 * Real use, so that normal work never meets a limit (the form saves a section when the person presses "Save and continue", there is no timer):
 *   submit      15 an hour. One submit is one press; a refused submit (sections still to finish) is retried a few times at most.
 *   edit        60 in 10 minutes. Opening the correction form, each preview and each applied correction, in a busy session on many applications.
 *   notes       60 in 10 minutes. Adding a note or a call log entry, or changing the flags.
 *   list       120 in 10 minutes. Every page, filter and search of the list of applications.
 * These are high enough for a person working steadily and low enough to stop a loop (each list page and each preview writes audit rows).
 */

const rateLimit = require('express-rate-limit');
const { AppError } = require('./errorHandler');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const LIMITS = Object.freeze({
  submit: Object.freeze({ windowMs: HOUR, max: 15, code: 'TOO_MANY_SUBMISSIONS', message: 'You have tried to submit several times in a short while. Please wait a few minutes and try again.' }),
  edit: Object.freeze({ windowMs: 10 * MINUTE, max: 60, code: 'TOO_MANY_EDITS', message: 'Too many corrections or previews in a short time. Please wait a few minutes and try again.' }),
  notes: Object.freeze({ windowMs: 10 * MINUTE, max: 60, code: 'TOO_MANY_NOTES', message: 'Too many notes, calls or flag changes in a short time. Please wait a few minutes and try again.' }),
  list: Object.freeze({ windowMs: 10 * MINUTE, max: 120, code: 'TOO_MANY_LIST_REQUESTS', message: 'Too many searches or page changes in a short time. Please wait a few minutes and try again.' }),
});

/** One limiter with its own counters. Pass other numbers in tests. */
function createLimiter({ windowMs, max, code, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user ? `user:${String(req.user._id)}` : `address:${req.ip}`),
    handler: (req, res, next) => next(new AppError(message, 429, code)),
  });
}

/** The ones the routes share: one instance per kind, so a kind's routes share one budget (edit-form + changes; notes + flags). */
const submitLimiter = createLimiter(LIMITS.submit);
const editLimiter = createLimiter(LIMITS.edit);
const notesLimiter = createLimiter(LIMITS.notes);
const listLimiter = createLimiter(LIMITS.list);

module.exports = { LIMITS, createLimiter, submitLimiter, editLimiter, notesLimiter, listLimiter };
