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

// The cover letter's page (step 8h-2): the same A4, with generous margins of 25 mm (a letter is read and signed, not scanned for data), no logo
// in the header (the letter is the applicant's), a small continuation header from the second page on, and a quiet footer.
const LETTER_PAGE = Object.freeze({
  size: PAGE.size,
  margin: 25 * MM,
  minMargin: 18 * MM,
  header: Object.freeze({ logoHeight: 0, height: 22, gapBelow: 18 }),
  footer: Object.freeze({ height: 26, gapAbove: 14 }),
  // The small banner at the top of every page of a draft, and the space it takes.
  banner: Object.freeze({ height: 16, gapBelow: 8 }),
});

// The itinerary's page (step 8h-3): A4 with 20 mm margins (a timetable wants more room than a letter), a compact continuation header, the
// same quiet footer and the same draft banner as the letter.
const ITINERARY_PAGE = Object.freeze({
  size: PAGE.size,
  margin: 20 * MM,
  minMargin: 18 * MM,
  header: Object.freeze({ logoHeight: 0, height: 22, gapBelow: 12 }),
  footer: Object.freeze({ height: 26, gapAbove: 14 }),
  banner: Object.freeze({ height: 16, gapBelow: 8 }),
});

/**
 * THE BRAND PALETTE, defined once for every PDF. The green is the green of the Wiser logo (sampled from it); the ink is a deep green-black
 * for text; the accent is one warm terracotta. White on the green is 6.6:1 and on the terracotta 5.6:1, ink on either tint is above 14:1,
 * and the muted grey on white is 6.5:1, so everything prints with good contrast. The two tints are both about 94 percent light in grey
 * (241 of 255), so they stay quiet on a greyscale printer; the two band colours are both deep greys there (89 and 102), and the day label,
 * not the colour, carries the meaning. Light tints only, never a full-page fill: the files cost little ink.
 */
const BRAND = Object.freeze({
  green: '#4a634a',
  greenDeep: '#2f4733',
  ink: '#16201a',
  accent: '#9a5632',
  accentDeep: '#7a4224',
  muted: '#566056',
  greenTint: '#eef3ee',
  accentTint: '#f8efe8',
  hairline: '#d6ddd6',
  rule: '#a9b6a9',
  ruleOnTint: '#cbd5cb',
  white: '#ffffff',
});

// What the PDFs use by these older names (the application summary uses them): all from the one brand palette above.
const PALETTE = Object.freeze({
  navy: BRAND.ink,
  green: BRAND.green,
  greenDark: BRAND.greenDeep,
  tint: BRAND.greenTint,
  ink: BRAND.ink,
  question: '#3a4252',
  muted: BRAND.muted,
  rule: BRAND.rule,
  hairline: BRAND.hairline,
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
  // The display face of the letter and the itinerary (step 8h-3): Cormorant Garamond SemiBold, and its italic for the titles of the days.
  Display: path.join(ASSETS, 'fonts', 'CormorantGaramond-SemiBold.ttf'),
  DisplayItalic: path.join(ASSETS, 'fonts', 'CormorantGaramond-SemiBoldItalic.ttf'),
});

const LOGO_FILE = path.join(ASSETS, 'pdf', 'wiser-logo.png');

const TEXT = Object.freeze({
  title: 'Application summary',
  disclaimer: "Prepared by Wiser Consulting from the applicant's answers. This is not an official UK Government document.",
  visaType: 'UK Standard Visitor',
  submissionMethod: 'Online, Wiser Consulting',
  missing: '-',
  // The cover letter (step 8h-2): the quiet footer, the mark of a draft (on every page, as a watermark and in a banner) and the metadata.
  letterFooter: 'Prepared by Wiser Consulting',
  draftMark: 'DRAFT - NOT APPROVED',
  // The banner of a version that WAS approved but whose answers have changed since (step 8j-3, A12). The watermark stays the draft mark.
  staleMark: 'DRAFT - ANSWERS CHANGED SINCE APPROVAL',
  letterInfo: Object.freeze({
    Title: 'Cover letter',
    Author: 'Wiser Consulting',
    Subject: 'Tourist Visa cover letter',
    Keywords: 'cover letter',
    Creator: 'Wiser Consulting',
    Producer: 'Wiser Consulting',
  }),
  // The itinerary (step 8h-3): its title, and the metadata (fixed words, no personal data).
  itineraryTitle: 'Travel itinerary',
  itineraryInfo: Object.freeze({
    Title: 'Travel itinerary',
    Author: 'Wiser Consulting',
    Subject: 'Tourist Visa travel itinerary',
    Keywords: 'travel itinerary',
    Creator: 'Wiser Consulting',
    Producer: 'Wiser Consulting',
  }),
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

module.exports = { PAGE, LETTER_PAGE, ITINERARY_PAGE, MM, BRAND, PALETTE, FONT_FILES, LOGO_FILE, TEXT, PDF_TYPES, FILE_SUFFIX, LIMITS };
