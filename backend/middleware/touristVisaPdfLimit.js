/**
 * The rate limit of the Tourist Visa PDF routes (administrator and applicant): per signed-in user, one shared budget for every PDF, so a loop
 * of downloads is turned away before any answer is decrypted or any file is drawn. The route sits behind sign-in, so req.user is there.
 */

const rateLimit = require('express-rate-limit');
const { AppError } = require('./errorHandler');
const { LIMITS } = require('../config/touristVisaPdf');

/** Pass other numbers in tests. */
function createPdfLimiter({ windowMs, max } = LIMITS.rate) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user ? String(req.user._id) : 'signed-out'),
    handler: (req, res, next) => next(new AppError('Too many PDF downloads. Please wait a few minutes and try again.', 429, 'TOO_MANY_PDFS')),
  });
}

/** The one limiter both routes share. */
const pdfLimiter = createPdfLimiter();

module.exports = { createPdfLimiter, pdfLimiter };
