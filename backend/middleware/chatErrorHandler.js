/**
 * Log-safe error handler of the Contact chat routes. Errors thrown on purpose (AppError with a code) pass on as they are. Anything else is
 * turned into a fixed answer: a validation problem (the request had the wrong shape or an unknown key), a bad id, a duplicate, or a plain
 * "something went wrong". Only the error name, code, status and route are logged, never a message: a database or driver message can hold
 * a submitted value, and a chat message is personal.
 */

const { AppError } = require('./errorHandler');
const logger = require('../utils/logger');

const chatErrorHandler = (err, req, res, next) => {
  if (err && err.isOperational && err.statusCode) return next(err);

  let status = 500;
  let message = 'Something went wrong. Please try again.';
  let code;

  if (err && err.name === 'ZodError') {
    status = 400;
    code = 'INVALID_REQUEST';
    message = 'Please check what you sent and try again.';
    // The schemas name the chat's own code in an issue message (for example MESSAGE_TOO_LONG); only such a code is passed on, never a value.
    const named = (err.issues || []).map((issue) => issue.message).find((text) => typeof text === 'string' && /^[A-Z][A-Z_]{3,40}$/.test(text));
    if (named) code = named;
  } else if (err && err.name === 'CastError') {
    status = 404;
    code = 'CONVERSATION_NOT_FOUND';
    message = 'Conversation not found.';
  } else if (err && (err.code === 11000 || err.code === 11001)) {
    status = 409;
    code = 'CONFLICT';
    message = 'This request conflicts with an earlier one. Please try again.';
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_REQUEST';
    message = 'Please check what you sent and try again.';
  }

  if (status === 500 || status === 409) {
    logger.error('Chat request failed', {
      name: err && err.name,
      code: err && err.code,
      status,
      route: `${req.method} ${req.baseUrl}${req.route ? req.route.path : ''}`,
      userId: req.user ? String(req.user._id) : undefined,
    });
  }
  return next(new AppError(message, status, code));
};

module.exports = chatErrorHandler;
