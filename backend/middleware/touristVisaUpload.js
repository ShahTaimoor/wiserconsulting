/**
 * Receiving one uploaded file for the Tourist Visa documents (multipart/form-data).
 *
 * The file is held in memory (never written to disk) and is checked again, by content, in the document
 * service. multer's own limits stop an oversize file as it arrives: one file, a few small fields, and
 * MAX_FILE_BYTES. A request that already declares itself too big is refused before anything is read.
 * Every failure becomes a documentError with a fixed message and a code; nothing the caller sent
 * (a file name, a field value) is put in a message or a log line.
 */

const multer = require('multer');
const rateLimit = require('express-rate-limit');
const documentError = require('../utils/documentError');
const logger = require('../utils/logger');
const { MAX_FILE_BYTES, MULTIPART_OVERHEAD_BYTES, UPLOAD_RATE, UPLOAD_FIELDS } = require('../config/touristVisaDocuments');

const parser = multer({
  storage: multer.memoryStorage(),
  // File names arrive as UTF-8, so a name with accents or another script is read as sent.
  defParamCharset: 'utf8',
  // multer counts reaching a limit as too much for the file size and the number of parts, so the file size is
  // set one byte above MAX_FILE_BYTES (a file of exactly MAX_FILE_BYTES is allowed; the service checks the exact
  // number again) and parts is 3 (the file and the slot: a third part is refused).
  limits: {
    fileSize: MAX_FILE_BYTES + 1,
    files: 1,
    fields: 2,
    fieldSize: 64,
    fieldNameSize: 32,
    parts: 3,
    headerPairs: 20,
  },
}).single(UPLOAD_FIELDS.file);

function receiveUpload(req, res, next) {
  if (!req.is('multipart/form-data')) return next(documentError('INVALID_UPLOAD'));

  // The declared length is the cheapest early refusal; multer's fileSize limit still applies to what really arrives.
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return next(documentError('FILE_TOO_LARGE'));
  }

  return parser(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(documentError('FILE_TOO_LARGE'));
    // Type and code only: the message can quote what was sent.
    logger.error('Tourist Visa upload could not be read', { name: error.name, code: error.code, userId: req.user ? String(req.user._id) : undefined });
    return next(documentError('INVALID_UPLOAD'));
  });
}

/** Uploads per signed-in user (the route sits behind authentication). Pass other numbers in tests. */
function createUploadLimiter({ windowMs, max } = UPLOAD_RATE) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user ? String(req.user._id) : 'signed-out'),
    handler: (req, res, next) => next(documentError('TOO_MANY_UPLOADS')),
  });
}

module.exports = { receiveUpload, createUploadLimiter };
