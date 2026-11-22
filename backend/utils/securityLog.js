/**
 * Security log: one JSON line per security-relevant event, written to the process output (PM2 / systemd keep it), in production too
 * (logger.info/warn are silent outside development).
 *
 * What a line holds: time, event, ip, userId, method, route (the route PATTERN such as /api/form-submissions/:submissionId/status, never
 * the real address), status, and a few short reasons. What it never holds: passwords, tokens, cookies, request bodies, file contents,
 * file names, or a whole e-mail address (only a masked one such as j***@example.com, for failed sign-ins). Set SECURITY_LOG=off to silence it.
 */

const FORBIDDEN_KEY = /pass|token|secret|cookie|authorization|body|content|name$|file/i;

function maskEmail(value) {
  if (typeof value !== 'string') return undefined;
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1 || email.length > 254) return undefined;
  return `${email[0]}***${email.slice(at)}`;
}

// Only short plain values, and never a key that sounds like a secret or content.
function cleanExtra(extra) {
  const out = {};
  for (const [key, value] of Object.entries(extra || {})) {
    if (FORBIDDEN_KEY.test(key)) continue;
    if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string') out[key] = value.slice(0, 80).replace(/[\r\n]/g, ' ');
  }
  return out;
}

// The matched route pattern. If no route matched (a 404, a refusal before routing), the path with ids and e-mails masked.
function routeOf(req) {
  if (req.route && req.route.path !== undefined) return `${req.baseUrl || ''}${req.route.path}`;
  const path = String(req.originalUrl || req.url || '').split('?')[0].slice(0, 120);
  return path.replace(/[^/]*@[^/]*/g, ':email').replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/:id').replace(/\/\d+(?=\/|$)/g, '/:id');
}

function record(event, req, extra = {}) {
  if (process.env.SECURITY_LOG === 'off') return;
  const line = {
    time: new Date().toISOString(),
    type: 'security',
    event,
    ip: req?.ip,
    userId: req?.user?._id ? String(req.user._id) : undefined,
    method: req?.method,
    route: req ? routeOf(req) : undefined,
    ...cleanExtra(extra),
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Express middleware, mounted first: when a response is finished it records
 *   401 / 403            -> unauthorized / forbidden
 *   429                  -> rate_limited
 *   a failed sign-in     -> login_failed (masked e-mail)
 *   a change by an admin -> admin_action (any POST/PUT/PATCH/DELETE answered by a signed-in administrator, with the status)
 */
function securityAudit(req, res, next) {
  res.on('finish', () => {
    try {
      const status = res.statusCode;
      if (status === 429) return record('rate_limited', req, { status });
      if (req.method === 'POST' && /\/login$/.test(routeOf(req)) && status >= 400) {
        return record('login_failed', req, { status, email: maskEmail(req.body?.email) });
      }
      if (status === 401) return record('unauthorized', req, { status });
      if (status === 403) return record('forbidden', req, { status });
      if (WRITE_METHODS.has(req.method) && req.user?.role === 1) return record('admin_action', req, { status });
    } catch {
      // logging must never break a request
    }
  });
  next();
}

module.exports = { record, securityAudit, maskEmail, routeOf };
