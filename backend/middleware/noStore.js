/**
 * Tells browsers and proxies not to keep a copy of the answer. Used for the admin side, whose answers carry
 * other people's answers: they must not sit in a cache. Set before anything else runs, so it is on error answers too.
 */
function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

module.exports = noStore;
