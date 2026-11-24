/**
 * The friendly file names of an application's uploaded documents, for everything a staff member sees or downloads:
 * "Roohullah-Shah-Passport.pdf". Worked out when it is needed (never stored) from the applicant's name, the slot each file was uploaded into
 * and the file's type, so it follows a later change of the name and also covers files uploaded before this existed.
 *
 * NOTHING HERE READS, SCANS OR SENDS A FILE'S CONTENT, and the stored object keeps its own random key: this is only what a person is shown and
 * what a download is called. The rules are in shared/tourist-visa/documentNames.js (shared with the applicant's page so both make the same
 * name); the name part reuses the rules of the downloaded PDFs' names (utils/pdfFileName.js).
 */

const { documentFileNames } = require('../shared/tourist-visa/documentNames');
const { fullName } = require('../shared/tourist-visa/view');

/**
 * @param {object} application  with decrypted `answers` (the given and family names are q2_1 and q2_2), `reference` and `documents`
 * @returns {Record<string, string>} { [documentId]: friendly name }
 */
function friendlyDocumentNames(application) {
  const answers = (application && application.answers) || {};
  return documentFileNames({
    documents: application && application.documents,
    name: fullName(answers.q2_1, answers.q2_2), // the family name is optional
    reference: application && application.reference,
  });
}

module.exports = { friendlyDocumentNames };
