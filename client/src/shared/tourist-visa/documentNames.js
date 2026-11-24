'use strict';

// Canonical source: shared/tourist-visa/. Run `node scripts/sync-shared.js` after changing this file.
//
// The friendly name of an uploaded document: "Roohullah-Shah-Passport.pdf". It is worked out from three things only: the SLOT the file was
// uploaded into, the applicant's NAME (or the application's reference), and the file's type. NOTHING READS, SCANS OR SENDS THE FILE'S
// CONTENT: the name is the same whatever the file holds. It is computed whenever a name is shown or downloaded and is never stored, so it
// follows a later change of the applicant's name and works for files uploaded before it existed. The stored file keeps its own unique key.
//
//   safeNamePart(fullName)             a person's name as a part of a file name (Latin letters, digits and hyphens only)
//   slotFileLabel(slot)                the short label of a slot for a file name ("Bank-Statement")
//   documentFileNames({...})           { [documentId]: friendly name } for all the files of one application
//
// Only the characters A-Z a-z 0-9 and hyphens, one dot and a short known extension can come out, so nothing a person types (a quote, a
// semicolon, a slash, a line break, an emoji) can reach a header, a path or a screen reader.

const MAX_NAME_LENGTH = 60;

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
 * What each slot is called in a file name: short, plain English, words joined by hyphens. ONE list, written out here because the form's own
 * labels are long sentences ("Hotel reservations (one per city or hotel, for example London and Scotland)"). A test checks that every slot
 * of the form has an entry here, and that no two slots share one (two slots with one label would be numbered together).
 * Never rename a slot id (files already stored keep it); a label may be changed, and every name follows.
 */
const SLOT_FILE_LABELS = Object.freeze({
  passport: 'Passport',
  oldpassports: 'Old-Passport',
  nic: 'National-ID-Card',
  funds: 'Bank-Statement',
  businessbank: 'Business-Bank-Statement',
  hotels: 'Hotel-Booking',
  flight: 'Flight-Booking',
  marriage: 'Marriage-Certificate',
  familyspouse: 'Family-Certificate-Spouse-Children',
  familyparents: 'Family-Certificate-Parents',
  formb: 'Form-B-Children',
  school: 'Children-School-Certificate',
  businessreg: 'Business-Registration',
  chambercard: 'Chamber-Membership-Card',
  appointment: 'Appointment-Letter',
  confirmation: 'Job-Confirmation-Letter',
  noc: 'NOC-Letter',
  salary: 'Salary-Slip',
  taxpayer: 'Taxpayer-Certificate',
  property: 'Property-Documents',
  sponsorship: 'Sponsorship-Letter',
  other: 'Other-Document',
});

/** The label of a file whose slot is not in the list (a file kept from an older form). Such files are numbered together. */
const FALLBACK_LABEL = 'Document';

/** The label of a slot for a file name. An unknown slot, or one that is not text, gets the plain "Document". */
function slotFileLabel(slot) {
  return typeof slot === 'string' && Object.prototype.hasOwnProperty.call(SLOT_FILE_LABELS, slot) ? SLOT_FILE_LABELS[slot] : FALLBACK_LABEL;
}

/** The extensions a document name may end in. A file is a PDF, a JPG or a PNG (the server decides by the file's first bytes); the rest are only for old records. */
const DOCUMENT_EXTENSIONS = Object.freeze(['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'tif', 'tiff', 'doc', 'docx']);

const EXTENSION_OF_MIME = Object.freeze({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' });

const SAFE_REFERENCE = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

/** A lower-case extension from a value, only when it is one of the known ones. */
function knownExtension(value) {
  const ext = typeof value === 'string' ? value.trim().replace(/^\./, '').toLowerCase() : '';
  return DOCUMENT_EXTENSIONS.includes(ext) ? ext : '';
}

/**
 * The extension of a file: the stored type (`format`, decided from the file's first bytes) first, then its mime type, and only for an
 * old record with neither, the extension of the name it was uploaded under. "" when none is known.
 */
function extensionOf(doc) {
  const fromFormat = knownExtension(doc && doc.format);
  if (fromFormat) return fromFormat;
  const mime = doc && (doc.mime || doc.type);
  const fromMime = typeof mime === 'string' ? EXTENSION_OF_MIME[mime.toLowerCase()] || '' : '';
  if (fromMime) return fromMime;
  const original = doc && (doc.originalName || doc.name);
  const found = typeof original === 'string' ? /\.([A-Za-z0-9]{1,5})$/.exec(original.trim()) : null;
  return found ? knownExtension(found[1]) : '';
}

const timeOf = (doc) => {
  const t = doc && doc.uploadedAt ? new Date(doc.uploadedAt).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};

/**
 * The friendly names of all the files of one application, by document id:
 *   <Given names>-<Family name>-<Slot label>[-<number>].<extension>      "Roohullah-Shah-Passport.pdf"
 * With no usable name the application's reference takes its place ("TV-K7M3QD9R-Passport.pdf"), and with no usable reference the name is
 * just the label, so a name is never empty. Files with the same label (several in one slot, or old files with no slot on the list) are
 * numbered 1, 2, ... in upload order; a label with one file has no number.
 *
 * @param {object} input
 * @param {Array<{id:string, slot:string, format?:string, mime?:string, type?:string, uploadedAt?:any, originalName?:string, name?:string}>} input.documents
 * @param {string} [input.name]       the applicant's full name (the shared fullName of the given and family names)
 * @param {string} [input.reference]  the application's reference (the fallback)
 * @returns {Record<string, string>}
 */
function documentFileNames({ documents, name, reference } = {}) {
  const list = Array.isArray(documents) ? documents.filter((d) => d && typeof d.id === 'string') : [];
  const person = safeNamePart(name) || (typeof reference === 'string' && SAFE_REFERENCE.test(reference) ? reference : '');
  const groups = new Map();
  list.forEach((doc, index) => {
    const label = slotFileLabel(doc.slot);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push({ doc, index });
  });
  const names = {};
  for (const [label, members] of groups) {
    members.sort((a, b) => timeOf(a.doc) - timeOf(b.doc) || a.index - b.index);
    members.forEach(({ doc }, position) => {
      const number = members.length > 1 ? `-${position + 1}` : '';
      const ext = extensionOf(doc);
      names[doc.id] = `${person ? `${person}-` : ''}${label}${number}${ext ? `.${ext}` : ''}`;
    });
  }
  return names;
}

module.exports = { MAX_NAME_LENGTH, SLOT_FILE_LABELS, FALLBACK_LABEL, DOCUMENT_EXTENSIONS, safeNamePart, slotFileLabel, extensionOf, documentFileNames };
