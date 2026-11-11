/**
 * Cross-site request forgery guard for the Tourist Visa API (step 8j-3, finding B3).
 *
 * The sign-in cookie (httpOnly, SameSite=None in production) is accepted by the API next to the Authorization header, so a hostile page could
 * make an administrator's browser send a request, such as "generate a cover letter", with the cookie attached. The rule for every
 * STATE-CHANGING request (POST, PUT, PATCH, DELETE) under /api/tourist-visa:
 *
 *   1. An Origin header is present  -> it must be exactly one of the site's allowed origins (config/allowedOrigins.js). Otherwise 403.
 *      (Browsers always send Origin on a cross-site POST, PUT, PATCH or DELETE, and a page cannot change it.) The string "null", which a
 *      sandboxed page sends, is not on the list, so it is refused too.
 *   2. No Origin header             -> allowed ONLY with an Authorization header ("Bearer ..."). A request with no Origin and no Authorization
 *      header that carries a Cookie header (a cookie-only request) is a 403. A hostile page cannot add an Authorization header without the
 *      browser asking the server's permission first (CORS), so a request that carries one is not a forged one. Tools and scripts that send a
 *      Bearer token keep working. A request with no Origin, no Authorization and no cookie at all cannot sign in whatever it does, so it is
 *      passed on and gets the usual 401 from the sign-in check (the guard adds no new answer for a plain anonymous caller).
 *
 * Why this rule: the client sends "Authorization: Bearer <token>" on every Tourist Visa call and never relies on the cookie, and browsers add
 * Origin to every one of these requests, so both parts keep the client working with no change to it. GET (reads) and OPTIONS (the browser's
 * permission check, answered by CORS) are never touched. The answer names nothing the caller sent: not the origin, not a header.
 *
 * Mounted in index.js (before CORS, only while the feature is open) and again in the router, like the feature gate.
 */

const { AppError } = require('./errorHandler');
const { getAllowedOrigins } = require('../config/allowedOrigins');

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const REFUSED_CODE = 'ORIGIN_NOT_ALLOWED';
const REFUSED_MESSAGE = 'This request was not accepted.';

const hasBearerToken = (req) => typeof req.headers.authorization === 'string' && /^Bearer\s+\S+/.test(req.headers.authorization);

/** `getOrigins` is a function so a test (or a changed FRONTEND_URL) is read when the request arrives. */
function createOriginGuard({ getOrigins = getAllowedOrigins } = {}) {
  return function touristVisaOriginGuard(req, res, next) {
    if (!STATE_CHANGING.has(req.method)) return next();
    const origin = req.headers.origin;
    const refuse = () => next(new AppError(REFUSED_MESSAGE, 403, REFUSED_CODE));
    if (origin !== undefined) return typeof origin === 'string' && getOrigins().includes(origin) ? next() : refuse();
    if (hasBearerToken(req)) return next();
    // Nothing sent along that could sign the caller in: leave it to the sign-in check (401).
    return typeof req.headers.cookie === 'string' && req.headers.cookie.trim() !== '' ? refuse() : next();
  };
}

const touristVisaOriginGuard = createOriginGuard();

module.exports = touristVisaOriginGuard;
module.exports.createOriginGuard = createOriginGuard;
module.exports.STATE_CHANGING = STATE_CHANGING;
module.exports.REFUSED_CODE = REFUSED_CODE;
module.exports.REFUSED_MESSAGE = REFUSED_MESSAGE;
