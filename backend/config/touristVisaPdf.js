/**
 * Everything the Tourist Visa PDFs are made of that is not a fact about an application: the page, the palette, the words that are always
 * the same, the limits. One place, so the answers PDF (step 8h-1) and the cover letter and itinerary PDFs (step 8h-2) look alike.
 *
 * BRANDING. The PDF follows the LAYOUT of an official printout (a header with a reference, a block of labels and values, sections of
 * question and answer rows, a footer with page numbers) but must NOT look like an official document: no crest, no government name, no
 * barcode, no GWF-style number, no "partially completed application" heading. It carries the Wiser Consulting logo, the site's own navy
 * and green, the title "Application summary", the reference as plain text, and on every page a line saying it is not an official
 * document. A test checks that none of the forbidden words is in the file.
 */

const path = require('node:path');

const ASSETS = path.join(__dirname, '..', 'assets');

// A4 portrait, in points (1 pt = 1/72 inch; 54 pt is 19 mm, above the 18 mm minimum margin). Everything that is printed, the header and the
// footer included, is inside the margins.
const MM = 72 / 25.4;
const PAGE = Object.freeze({
  size: [595.28, 841.89],
  margin: 54,
  minMargin: 18 * MM,
  header: Object.freeze({ logoHeight: 44, height: 50, gapBelow: 12 }),
  footer: Object.freeze({ height: 46, gapAbove: 10 }),
});

// The site's own colours: the navy of the theme (tailwind gray-900, the "primary" of the site) and the green of the logo. Light tints only,
// so the file prints well and reads in black and white.
const PALETTE = Object.freeze({
  navy: '#101828',
  green: '#4c644c',
  greenDark: '#34483a',
  tint: '#eef2ee',
  ink: '#101828',
  question: '#3a4252',
  muted: '#5f6877',
  rule: '#a9b6a9',
  hairline: '#dde3dd',
});

const FONT_FILES = Object.freeze({
  Title: path.join(ASSETS, 'fonts', 'PlayfairDisplay-Bold.ttf'),
  TitleRegular: path.join(ASSETS, 'fonts', 'PlayfairDisplay-Regular.ttf'),
  Sans: path.join(ASSETS, 'fonts', 'SourceSans3-Regular.ttf'),
  SansBold: path.join(ASSETS, 'fonts', 'SourceSans3-Bold.ttf'),
  SansItalic: path.join(ASSETS, 'fonts', 'SourceSans3-Italic.ttf'),
  Serif: path.join(ASSETS, 'fonts', 'SourceSerif4-Regular.ttf'),
  SerifBold: path.join(ASSETS, 'fonts', 'SourceSerif4-Bold.ttf'),
  SerifItalic: path.join(ASSETS, 'fonts', 'SourceSerif4-Italic.ttf'),
  SerifBoldItalic: path.join(ASSETS, 'fonts', 'SourceSerif4-BoldItalic.ttf'),
});

const LOGO_FILE = path.join(ASSETS, 'pdf', 'wiser-logo.png');

const TEXT = Object.freeze({
  title: 'Application summary',
  disclaimer: "Prepared by Wiser Consulting from the applicant's answers. This is not an official UK Government document.",
  visaType: 'UK Standard Visitor',
  submissionMethod: 'Online, Wiser Consulting',
  missing: '–',
  // The PDF metadata. No personal data, ever: nothing from an application goes in it.
  info: Object.freeze({
    Title: 'Application summary',
    Author: 'Wiser Consulting',
    Subject: 'Tourist Visa application summary',
    Keywords: 'application summary',
    Creator: 'Wiser Consulting',
    Producer: 'Wiser Consulting',
  }),
});

/** The document types a PDF can be (the audit row records one of these). 8h-2 adds the other two. */
const PDF_TYPES = Object.freeze(['answers', 'cover_letter', 'itinerary']);

/** The file name of each type, after the reference. The name of a person is never part of a file name. */
const FILE_SUFFIX = Object.freeze({ answers: 'application-summary', cover_letter: 'cover-letter', itinerary: 'itinerary' });

const LIMITS = Object.freeze({
  // More pages than any real application makes: a guard against a runaway document, not a design limit.
  maxPages: 150,
  // PDFs per signed-in user in a window (an administrator and an applicant alike).
  rate: Object.freeze({ windowMs: 10 * 60 * 1000, max: 20 }),
});

module.exports = { PAGE, MM, PALETTE, FONT_FILES, LOGO_FILE, TEXT, PDF_TYPES, FILE_SUFFIX, LIMITS };
