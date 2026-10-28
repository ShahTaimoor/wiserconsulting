/**
 * Log-safe error handler for the Tourist Visa routes.
 *
 * Mongoose and driver errors can carry submitted values in their message
 * (validation messages, cast errors, duplicate-key details). The central error
 * handler logs the whole error object, so this handler sits in front of it:
 * it logs only the error name, code, status and route, and passes on a new
 * error with a fixed message. Answers and passport or ID numbers never reach a
 * log line or a response.
 */

const { AppError } = require('./errorHandler');
const logger = require('../utils/logger');

const touristVisaErrorHandler = (err, req, res, next) => {
  // Errors thrown on purpose with our own messages are safe to pass on as they are.
  if (err && err.isOperational && err.statusCode) return next(err);

  let status = 500;
  let message = 'Something went wrong. Please try again.';

  if (err && err.name === 'CastError') {
    status = 404;
    message = 'Resource not found';
  } else if (err && err.name === 'ValidationError') {
    status = 400;
    message = 'The application data is not valid.';
  } else if (err && (err.code === 11000 || err.code === 11001)) {
    status = 409;
    message = 'This request conflicts with an existing application.';
  }

  logger.error('Tourist Visa request failed', {
    name: err && err.name,
    code: err && err.code,
    status,
    route: `${req.method} ${req.baseUrl}${req.route ? req.route.path : ''}`,
    userId: req.user ? String(req.user._id) : undefined,
  });

  return next(new AppError(message, status));
};

module.exports = touristVisaErrorHandler;
