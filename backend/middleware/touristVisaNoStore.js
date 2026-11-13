/**
 * Cache-Control: no-store on every Tourist Visa API answer (step 8j-3, finding B6): the applicant's decrypted answers, drafts, the list of files,
 * the admin lists and details, the letter, the itinerary, the notes and the audit rows must never sit in a browser or proxy cache, an error
 * answer included. One middleware, used by index.js (so even a body-parser or rate-limit refusal carries it) and by both routers.
 *
 * The one exception is GET <mount>/status, the public "is the feature open" answer, which keeps its own short public caching (set by
 * touristVisaFeatureGate.touristVisaStatus). The header is set before anything else runs, so it is on error answers too.
 */

const noStore = require('./noStore');
const { isStatusRequest } = require('./touristVisaFeatureGate');

function touristVisaNoStore(req, res, next) {
  if (isStatusRequest(req)) return next();
  return noStore(req, res, next);
}

module.exports = touristVisaNoStore;
