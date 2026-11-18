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

const MAX_NAME_LENGTH = 60;

/** What each document is called in the file name. */
const TITLES = Object.freeze({ answers: 'Application-Summary', cover_letter: 'Cover-Letter', itinerary: 'Itinerary' });

/** The old reference-based names, used when there is no usable name: "TV-X42GYXPS-cover-letter.pdf". */
const REFERENCE_SUFFIX = Object.freeze({ answers: 'application-summary', cover_letter: 'cover-letter', itinerary: 'itinerary' });
const SAFE_REFERENCE = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

// Letters that have no accent to strip but are not plain ASCII.
const SPECIAL_LETTERS = Object.freeze({ 'ß': 'ss', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE', 'ø': 'o', 'Ø': 'O', 'đ': 'd', 'Đ': 'D', 'ł': 'l', 'Ł': 'L', 'þ': 'th', 'Þ': 'Th', 'ð': 'd', 'Ð': 'D', 'ı': 'i' });

/**
 * A person's name as a part of a file name: accents become plain letters (é to e), spaces (and runs of them) become one hyphen, a hyphen in
 * the name stays, and everything else is removed (quotes, dots, slashes, semicolons, control characters, emoji, letters of other scripts).
 * The case is kept. At most 60 characters. An empty string when no letter or digit is left.
 */
function safeNamePart(fullName) {
  if (typeof fullName !== 'string') return '';
  const plain = fullName
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[ßæÆœŒøØđĐłŁþÞðÐı]/g, (letter) => SPECIAL_LETTERS[letter])
    .replace(/\s+/g, ' ')
    .replace(/[^A-Za-z0-9 -]/g, '')
    .replace(/[ -]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cut = plain.slice(0, MAX_NAME_LENGTH).replace(/-+$/, '');
  return /[A-Za-z0-9]/.test(cut) ? cut : '';
}

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
 * The Content-Disposition header for a file name made by pdfFileName: an attachment with a plain ASCII name in quotes. The name holds only
 * letters, digits, hyphens and one dot, so no quoting tricks, no line break and no filename* form are needed. A name that is not of that shape
 * (it cannot come from pdfFileName) is replaced by "document.pdf" rather than put in a header.
 */
function contentDispositionFor(fileName) {
  const safe = typeof fileName === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]*\.pdf$/.test(fileName) ? fileName : 'document.pdf';
  return `attachment; filename="${safe}"`;
}

module.exports = { safeNamePart, pdfFileName, contentDispositionFor, MAX_NAME_LENGTH, TITLES };
