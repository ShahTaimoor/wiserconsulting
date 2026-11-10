/**
 * Runs a middleware for every request except those under the given path
 * prefixes. A prefix matches itself and anything below it ("/api/x" matches
 * "/api/x" and "/api/x/y" but not "/api/xylophone").
 */

const skipPaths = (prefixes, middleware) => {
  const normalised = prefixes.map((p) => p.replace(/\/+$/, '').toLowerCase());

  return (req, res, next) => {
    const path = (req.path || '').toLowerCase();
    const skip = normalised.some((p) => path === p || path.startsWith(`${p}/`));
    return skip ? next() : middleware(req, res, next);
  };
};

module.exports = skipPaths;
