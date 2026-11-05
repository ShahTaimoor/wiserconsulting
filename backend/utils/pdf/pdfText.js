/**
 * Text for the PDFs: normalising typographic characters the fonts lack or that print badly, and checking that every character can be
 * printed by the fonts that will print it (pure functions apart from reading the font files once).
 *
 * The PDFs are Latin text only. A character the fonts cannot print is never drawn as a blank or a box: the check finds it first, and the
 * caller refuses the whole PDF with a clear message that names the section (never the character: it is the applicant's answer).
 *
 * The characters below are written as numbers (code points), so that no invisible character has to be typed into this file.
 */

const fontkit = require('fontkit');
const { FONT_FILES } = require('../../config/touristVisaPdf');

/** A regular expression that matches any one of the code points or ranges ([from, to]) given. */
function anyOf(items) {
  const cls = items.map((item) => (Array.isArray(item) ? `${String.fromCodePoint(item[0])}-${String.fromCodePoint(item[1])}` : String.fromCodePoint(item))).join('');
  return new RegExp(`[${cls}]`, 'g');
}

// What is changed before anything is measured or printed, in this order.
const REPLACEMENTS = Object.freeze([
  [/\r\n?/g, '\n'],
  // Line and paragraph separators and the next-line character are line breaks.
  [anyOf([0x2028, 0x2029, 0x85]), '\n'],
  // Hyphens of every kind (the non-breaking hyphen, U+2011, prints as a box in many fonts) and the minus sign become a normal hyphen.
  [anyOf([0x2010, 0x2011, 0x2012, 0x2043, 0x2212, 0xfe63, 0xff0d]), '-'],
  // The en dash, the em dash and the horizontal bar become a plain hyphen (the closest plain character; a range or a pause still reads).
  [anyOf([0x2013, 0x2014, 0x2015]), '-'],
  // Curly and low single quotes, the modifier apostrophe and the prime become a straight apostrophe; curly, low and reversed double
  // quotes and the double prime become a straight double quote.
  [anyOf([0x2018, 0x2019, 0x201a, 0x201b, 0x2032, 0x2bc]), "'"],
  [anyOf([0x201c, 0x201d, 0x201e, 0x201f, 0x2033]), '"'],
  // The ellipsis character becomes three full stops.
  [anyOf([0x2026]), '...'],
  // Spaces of every width, and tabs, become one ordinary space.
  [anyOf([0x09, 0xa0, 0x1680, [0x2000, 0x200a], 0x202f, 0x205f, 0x3000]), ' '],
  // Invisible characters (zero-width spaces and joiners, direction marks, the byte-order mark, the soft hyphen) are dropped.
  [anyOf([[0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], 0xfeff, 0xad, 0x180e]), ''],
  // Control characters (a line break is kept).
  [anyOf([[0x00, 0x08], 0x0b, 0x0c, [0x0e, 0x1f], [0x7f, 0x9f]]), ''],
]);

/** The text as it will be printed: composed accents, one kind of hyphen and space, no invisible or control characters. */
function normalizePdfText(value) {
  let text = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
  text = text.normalize('NFC');
  for (const [pattern, replacement] of REPLACEMENTS) text = text.replace(pattern, replacement);
  return text;
}

const loaded = new Map();
/** A font file as fontkit reads it (once). */
function fontFor(name) {
  if (!loaded.has(name)) {
    const file = FONT_FILES[name];
    if (!file) throw new Error(`no font named ${name}`);
    loaded.set(name, fontkit.openSync(file));
  }
  return loaded.get(name);
}

/** The code points of the (already normalised) text that none of the named fonts can print, each once. A line break is not printed. */
function unsupportedIn(text, fontNames = ['Sans', 'SansBold', 'SansItalic']) {
  const fonts = fontNames.map(fontFor);
  const bad = new Set();
  for (const char of String(text)) {
    if (char === '\n') continue;
    const code = char.codePointAt(0);
    if (!fonts.every((font) => font.hasGlyphForCodePoint(code))) bad.add(code);
  }
  return [...bad];
}

/** Whether the whole text can be printed by the named fonts. */
const isPrintable = (text, fontNames) => unsupportedIn(text, fontNames).length === 0;

/**
 * The first entry whose text cannot be printed, or null: entries are { where, text }, and `where` is handed back untouched (the section
 * the text is in). The text itself is never returned, because it is an answer.
 */
function findUnprintable(entries, fontNames) {
  for (const entry of entries) if (!isPrintable(entry.text, fontNames)) return entry.where;
  return null;
}

module.exports = { normalizePdfText, unsupportedIn, isPrintable, findUnprintable, fontFor, REPLACEMENTS };
