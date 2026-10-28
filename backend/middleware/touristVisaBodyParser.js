/**
 * JSON body parser for /api/tourist-visa.
 *
 * Mounted before the global express.json() in index.js. A malformed body makes
 * body-parser throw a SyntaxError whose message quotes part of the body, and the
 * central error handler logs the whole error. Here the failure is turned into
 * a fixed message, and the log line carries only the error type, status and
 * route: no body content reaches the response or the logs.
 *
 * Once this parser has consumed the request, the global body parsers see a
 * finished stream and skip it. Bodies that are not JSON are refused, so the
 * global urlencoded parser never handles a Tourist Visa request.
 */

const express = require('express');
const { AppError } = require('./errorHandler');
const logger = require('../utils/logger');

const MAX_BODY = '256kb';
const jsonParser = express.json({ limit: MAX_BODY });

const FAILURES = {
  'entity.too.large': [413, 'The request is too large.'],
  'charset.unsupported': [415, 'Send the request as UTF-8 JSON.'],
  'encoding.unsupported': [415, 'Send the request without content encoding.'],
  'entity.parse.failed': [400, 'The request body is not valid JSON.'],
};
const FALLBACK = [400, 'The request body could not be read.'];

// A body is present if there is chunked encoding or a non-zero length. An empty
// POST (Content-Length: 0, as sent by the "start application" call) has none.
const hasBody = (req) =>
  req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length']) > 0;

const touristVisaBodyParser = (req, res, next) => {
  if (hasBody(req) && !req.is('application/json')) {
    return next(new AppError('Send the request as application/json.', 415));
  }

  return jsonParser(req, res, (err) => {
    if (!err) return next();

    logger.error('Tourist Visa request body rejected', {
      type: err.type,
      status: err.status,
      route: `${req.method} ${req.originalUrl.split('?')[0]}`,
    });
    const [status, message] = FAILURES[err.type] || FALLBACK;
    return next(new AppError(message, status));
  });
};

module.exports = touristVisaBodyParser;
