/**
 * Who may open a customer's submission (and so their documents): an administrator, or the signed-in user whose
 * e-mail is the one on the submission. Always used AFTER isAuthorized (it needs req.user).
 */

const formSubmissionRepository = require('../repositories/formSubmissionRepository');

const sameEmail = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a.trim() !== '' && a.trim().toLowerCase() === b.trim().toLowerCase();

const isAdminUser = (user) => Boolean(user) && user.role === 1;

const refuse = (res) => res.status(403).json({ success: false, message: 'Access denied.' });

/** For routes with an :email parameter. */
const requireOwnerByEmailParam = (req, res, next) => {
  if (isAdminUser(req.user) || sameEmail(req.user && req.user.email, req.params.email)) return next();
  return refuse(res);
};

/** For routes with a :submissionId parameter: loads the submission and compares its e-mail with the signed-in user. */
const requireOwnerBySubmissionId = async (req, res, next) => {
  try {
    if (isAdminUser(req.user)) return next();
    const submission = await formSubmissionRepository.findById(req.params.submissionId);
    // The same answer for "not yours" and "does not exist", so a stranger cannot test which ids exist.
    if (!submission || submission.isDeleted || !sameEmail(req.user && req.user.email, submission.email)) return refuse(res);
    return next();
  } catch {
    return refuse(res); // for example an id that is not an id
  }
};

module.exports = { requireOwnerByEmailParam, requireOwnerBySubmissionId, sameEmail, isAdminUser };
