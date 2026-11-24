/**
 * The file name of a downloaded Tourist Visa PDF: the applicant's full name and the document, for example "Roohullah-Shah-Cover-Letter.pdf".
 *
 *   safeNamePart(fullName)          the name as a file name part: Latin letters and digits only, words joined by single hyphens ("" if nothing is left)
 *   pdfFileName({ name, ... })      the whole file name; with no usable name it falls back to the reference, exactly as before
 *   contentDispositionFor(file)     the Content-Disposition header value for a file name made here
 *
 * THE NAME IS FOR THE FILE NAME ONLY. It is never put in the PDF's metadata, an audit row, a log line or an address. Only the characters
 * A-Z a-z 0-9 and hyphens can come out of a name, so nothing a person types (a quote, a semicolon, a slash, a dot, a line break, an emoji)
 * can reach the header or a path.
 */

// safeNamePart and MAX_NAME_LENGTH live in the shared file (shared/tourist-visa/documentNames.js), so that the applicant's screen and the server
// make the same name. They are re-exported here, unchanged.
const { safeNamePart, MAX_NAME_LENGTH, DOCUMENT_EXTENSIONS } = require('../shared/tourist-visa/documentNames');

/** What each document is called in the file name. */
const TITLES = Object.freeze({ answers: 'Application-Summary', cover_letter: 'Cover-Letter', itinerary: 'Itinerary' });

/** The old reference-based names, used when there is no usable name: "TV-X42GYXPS-cover-letter.pdf". */
const REFERENCE_SUFFIX = Object.freeze({ answers: 'application-summary', cover_letter: 'cover-letter', itinerary: 'itinerary' });
const SAFE_REFERENCE = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

/**
 * "Roohullah-Shah-Cover-Letter.pdf" (a cover letter or an itinerary that is not approved ends "-Draft"). With no usable name: the reference
 * form, "TV-X42GYXPS-cover-letter.pdf" ("-draft"), and with no usable reference either just "cover-letter.pdf", so a download is never
 * nameless.
 * @param {object} input
 * @param {string} [input.name]       the applicant's full name (the shared fullName of the given and family names)
 * @param {string} [input.reference]  the application's reference (the fallback)
 * @param {'answers'|'cover_letter'|'itinerary'} input.type
 * @param {boolean} [input.draft]
 */
function pdfFileName({ name, reference, type, draft = false }) {
  const title = TITLES[type];
  if (!title) throw new Error('unknown PDF type');
  const part = safeNamePart(name);
  if (part) return `${part}-${title}${draft ? '-Draft' : ''}.pdf`;
  const safeReference = typeof reference === 'string' && SAFE_REFERENCE.test(reference) ? `${reference}-` : '';
  return `${safeReference}${REFERENCE_SUFFIX[type]}${draft ? '-draft' : ''}.pdf`;
}

/**
 * The Content-Disposition header for a file name made here (by pdfFileName, or by documentFileNames for an uploaded document): an attachment
 * (or, with { inline: true }, a file shown in the browser that is named this when saved) with a plain ASCII name in quotes. The name holds
 * only letters, digits, hyphens and one dot, so no quoting tricks, no line break and no filename* form are needed. A name that is not of that
 * shape (it cannot come from the makers of names) is replaced by "document.pdf" rather than put in a header.
 *
 * `extensions` is the list of extensions the name may end in. For a PDF it is just "pdf"; for an uploaded document it is
 * DOCUMENT_EXTENSIONS and the extension is optional.
 */
function contentDispositionFor(fileName, { inline = false, extensions = null } = {}) {
  const allowed = Array.isArray(extensions) && extensions.length > 0 ? extensions.filter((e) => /^[a-z0-9]{1,5}$/.test(e)) : ['pdf'];
  const shape = new RegExp(`^[A-Za-z0-9][A-Za-z0-9-]*${extensions ? '(\\.(?:' + allowed.join('|') + '))?' : '\\.pdf'}$`);
  const safe = typeof fileName === 'string' && fileName.length <= 200 && shape.test(fileName) ? fileName : 'document.pdf';
  return `${inline ? 'inline' : 'attachment'}; filename="${safe}"`;
}

module.exports = { safeNamePart, pdfFileName, contentDispositionFor, MAX_NAME_LENGTH, TITLES, DOCUMENT_EXTENSIONS };
