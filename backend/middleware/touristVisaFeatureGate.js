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

function touristVisaFeatureGate(req, res, next) {
  if (isTouristVisaEnabled()) return next();
  res.set('Cache-Control', 'no-store');
  return res.status(404).json(CLOSED_BODY);
}

module.exports = touristVisaFeatureGate;
module.exports.isTouristVisaEnabled = isTouristVisaEnabled;
module.exports.FEATURE_CLOSED_CODE = FEATURE_CLOSED_CODE;
