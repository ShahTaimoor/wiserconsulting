/**
 * Errors of the document routes: an AppError with a fixed message and a code (see DOCUMENT_ERRORS).
 * The text never includes anything the caller sent, so it is safe in a response and in a log line.
 */

const { AppError } = require('../middleware/errorHandler');
const { DOCUMENT_ERRORS } = require('../config/touristVisaDocuments');

function documentError(code) {
  const [status, message] = DOCUMENT_ERRORS[code];
  return new AppError(message, status, code);
}

module.exports = documentError;
