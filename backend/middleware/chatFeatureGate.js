/**
 * The server-side switch of the Contact chat (CHAT_ENABLED). The chat is on only when the variable is exactly the text "true"; unset,
 * empty, "false", "TRUE", "1" and anything else leave it off. That is the default, so a deployment that forgot to set it is inert.
 *
 * While it is off every request under /api/chat gets the same fixed 404 (code FEATURE_CLOSED), except GET /api/chat/status, which says
 * { enabled: false }: it is how the website learns whether to show the chat at all. Mounted by index.js before the body parsers and
 * before anything that reads the database, so a closed deployment keeps no trace of requests to it.
 */

const FEATURE_CLOSED_CODE = 'FEATURE_CLOSED';

// One object, never built from the request, so nothing the caller sent can come back.
const CLOSED_BODY = Object.freeze({ success: false, code: FEATURE_CLOSED_CODE, message: 'Chat is not available.' });

/** Read on every request, so the answer always matches the current environment. */
function isChatEnabled(env = process.env) {
  return env.CHAT_ENABLED === 'true';
}

/** Exactly GET <mount>/status: not another method, not /status/, not /status/anything. `req.path` is relative to the mount. */
function isStatusRequest(req) {
  return req.method === 'GET' && req.path === '/status';
}

function chatFeatureGate(req, res, next) {
  if (isChatEnabled() || isStatusRequest(req)) return next();
  res.set('Cache-Control', 'no-store');
  return res.status(404).json(CLOSED_BODY);
}

module.exports = chatFeatureGate;
module.exports.isChatEnabled = isChatEnabled;
module.exports.isStatusRequest = isStatusRequest;
module.exports.FEATURE_CLOSED_CODE = FEATURE_CLOSED_CODE;
