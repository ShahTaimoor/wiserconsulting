/**
 * Server-side feature switch for the Tourist Visa API (TOURIST_VISA_ENABLED).
 *
 * The API is open only when the variable is exactly the text "true". Unset, empty, "false",
 * "TRUE", " true", "1" and anything else leave it closed. That is the default, so a deployment
 * that forgot to set it is inert.
 *
 * While it is closed, every request under /api/tourist-visa gets the same fixed answer. This
 * middleware must be mounted before authentication, body parsing and anything that reads the
 * database, and it deliberately does nothing but answer: it reads no header, body or token,
 * touches no database, and writes nothing to the log, so a closed deployment keeps no trace of
 * requests to it.
 *
 * The answer is a 404 with the code FEATURE_CLOSED. The code is how clients tell it apart from
 * the API's own 404 "you have not started an application yet", which has no code.
 *
 * ONE exception, and only in the gate that index.js mounts (`allowingStatus`): GET /api/tourist-visa/status. It is how
 * the client learns whether the feature is open, so it must answer while the feature is closed. It needs no sign-in,
 * reveals only `open` true or false, and is mounted by index.js AFTER the general rate limiter. The router's own
 * gate (the default export) has no exception: it stays strictly closed for every path, this one included.
 */

const FEATURE_CLOSED_CODE = 'FEATURE_CLOSED';

// One object, never built from the request, so nothing the caller sent can come back.
const CLOSED_BODY = Object.freeze({
  success: false,
  code: FEATURE_CLOSED_CODE,
  message: 'The Tourist Visa application is not open.',
});

/** Read on every request, so the answer always matches the current environment. */
function isTouristVisaEnabled(env = process.env) {
  return env.TOURIST_VISA_ENABLED === 'true';
}

/** The one URL that answers while the feature is closed, and how long a browser or a CDN may keep the answer. */
const STATUS_URL = '/api/tourist-visa/status';
const STATUS_MAX_AGE_SECONDS = 60;

/** Exactly GET <mount>/status: not another method, not /status/, not /status/anything. `req.path` is relative to the mount. */
function isStatusRequest(req) {
  return req.method === 'GET' && req.path === '/status';
}

function createGate({ allowStatus }) {
  return function touristVisaFeatureGate(req, res, next) {
    if (isTouristVisaEnabled()) return next();
    if (allowStatus && isStatusRequest(req)) return next();
    res.set('Cache-Control', 'no-store');
    return res.status(404).json(CLOSED_BODY);
  };
}

/**
 * GET /api/tourist-visa/status: { open: true } only when TOURIST_VISA_ENABLED is exactly "true", otherwise
 * { open: false }. Nothing else is read or sent, nothing is logged, and the database is not touched.
 * Mounted by index.js at STATUS_URL after the general rate limiter; any other request that reaches it moves on.
 */
function touristVisaStatus(req, res, next) {
  if (req.method !== 'GET' || req.path !== STATUS_URL) return next();
  res.set('Cache-Control', `public, max-age=${STATUS_MAX_AGE_SECONDS}`);
  return res.status(200).json({ open: isTouristVisaEnabled() });
}

// The strict gate: closed for every path. The router uses this one.
const touristVisaFeatureGate = createGate({ allowStatus: false });

module.exports = touristVisaFeatureGate;
/** The gate index.js mounts first: strict, except for the one status request. */
module.exports.allowingStatus = createGate({ allowStatus: true });
module.exports.touristVisaStatus = touristVisaStatus;
module.exports.isStatusRequest = isStatusRequest;
module.exports.isTouristVisaEnabled = isTouristVisaEnabled;
module.exports.FEATURE_CLOSED_CODE = FEATURE_CLOSED_CODE;
module.exports.STATUS_URL = STATUS_URL;
module.exports.STATUS_MAX_AGE_SECONDS = STATUS_MAX_AGE_SECONDS;
