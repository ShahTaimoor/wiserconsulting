/**
 * Async Handler Wrapper
 * Removes need for try/catch blocks in controllers
 * Automatically forwards errors to error handler
 */

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = asyncHandler;

