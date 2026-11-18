'use strict';

// The file names of the downloaded PDFs: "Roohullah-Shah-Cover-Letter.pdf". The helper without a database (every kind of awkward name, the
// header, the fallback to the reference), and the real PDF service with fakes to show that the name goes into the file name and nowhere else:
// not the PDF's metadata, not the audit row, not a log line. Made-up names only.

process.env.NODE_ENV = 'test';
process.env.FIELD_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');

const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

const { safeNamePart, pdfFileName, contentDispositionFor, MAX_NAME_LENGTH } = require('../utils/pdfFileName');
const { TouristVisaPdfService, fileNameFor } = require('../services/touristVisaPdfService');
const { fullName } = require('../shared/tourist-visa/view');
const { inspectPdf } = require('./helpers/pdfInspect');

const REFERENCE = 'TV-K7M3QD9R';
const SAFE = /^[A-Za-z0-9-]*$/;

// ---------------------------------------------------------------------------
// The name as a part of a file name
// ---------------------------------------------------------------------------

test('a normal name, one name only, and mixed case kept', () => {
  assert.equal(safeNamePart('Roohullah Shah'), 'Roohullah-Shah');
  assert.equal(safeNamePart('Roohullah'), 'Roohullah');
  assert.equal(safeNamePart('McDonald vAN der Berg'), 'McDonald-vAN-der-Berg', 'the case is kept as typed');
  assert.equal(safeNamePart('Khan-Reynolds Aisha'), 'Khan-Reynolds-Aisha', 'a hyphen in a name stays');
  assert.equal(safeNamePart('Ali 2nd'), 'Ali-2nd', 'digits stay');
  assert.equal(safeNamePart(fullName('Roohullah', 'Shah')), 'Roohullah-Shah', 'it takes the shared full name');
  assert.equal(safeNamePart(fullName('Roohullah', '')), 'Roohullah', 'a missing family name leaves no stray hyphen');
});

test('accents become plain letters, and letters with no accent to strip are spelled out', () => {
  assert.equal(safeNamePart('José Müller'), 'Jose-Muller');
  assert.equal(safeNamePart('Ångström Çelik Šimić'), 'Angstrom-Celik-Simic');
  assert.equal(safeNamePart('Zoë Núñez-Pérez'), 'Zoe-Nunez-Perez');
  assert.equal(safeNamePart('Łukasz Ørsted Straße'), 'Lukasz-Orsted-Strasse');
  assert.equal(safeNamePart('Æthelred Œuvre Đorđe'), 'AEthelred-OEuvre-Dorde');
  assert.equal(safeNamePart('e\u0301mile'), 'emile', 'a letter followed by a separate accent mark');
});

test('spaces and runs of them become single hyphens, with none at the ends', () => {
  assert.equal(safeNamePart('  Roohullah    Shah  '), 'Roohullah-Shah');
  assert.equal(safeNamePart('Roohullah\tShah\u00a0Khan'), 'Roohullah-Shah-Khan', 'tabs and no-break spaces too');
  assert.equal(safeNamePart('- Roohullah - Shah -'), 'Roohullah-Shah');
  assert.equal(safeNamePart('Roohullah--Shah'), 'Roohullah-Shah');
});

test('quotes, slashes, dots, semicolons, line breaks, control characters and emoji are removed; nothing but A-Z a-z 0-9 and hyphens can come out', () => {
  assert.equal(safeNamePart('O\'Brien'), 'OBrien', 'an apostrophe is removed, not turned into a space');
  assert.equal(safeNamePart('Ali"; filename=evil.exe\r\nX-Header: 1'), 'Ali-filenameevilexe-X-Header-1');
  assert.equal(safeNamePart('../../etc/passwd'), 'etcpasswd');
  assert.equal(safeNamePart('C:\\Windows\\System32'), 'CWindowsSystem32');
  assert.equal(safeNamePart('Ali\u0000\u0007\u001b[31mRed'), 'Ali31mRed');
  assert.equal(safeNamePart('Ali \u{1F600} Khan'), 'Ali-Khan', 'an emoji between names leaves one hyphen');
  assert.equal(safeNamePart('Ali\u200bKhan\u202e'), 'AliKhan', 'zero-width and direction marks vanish');
  assert.equal(safeNamePart('Ali.pdf'), 'Alipdf', 'a dot never survives, so the name cannot end in ".pdf" or hide an extension');
  for (const nasty of ['a"b', 'a;b', 'a/b', 'a\\b', 'a\nb', 'a\rb', 'a\tb', 'a%0d%0ab', 'a b%00', '<script>x</script>', '${x}', '`x`']) {
    const part = safeNamePart(nasty);
    assert.match(part, SAFE, JSON.stringify(nasty));
    assert.doesNotMatch(part, /[;"'\\/.\r\n%<>$`]/, JSON.stringify(nasty));
  }
});

test('a very long name is cut to a sensible length, never ending in a hyphen', () => {
  assert.equal(MAX_NAME_LENGTH, 60);
  const long = safeNamePart('A'.repeat(200));
  assert.equal(long.length, 60);
  const words = safeNamePart(Array.from({ length: 40 }, (_, i) => `Name${i}`).join(' '));
  assert.ok(words.length <= 60 && !words.endsWith('-') && !words.startsWith('-'), words);
  assert.equal(safeNamePart(`${'a'.repeat(59)} b`), 'a'.repeat(59), 'the cut falls on the hyphen, which is dropped');
  assert.equal(safeNamePart(`${'a'.repeat(58)} bc`), `${'a'.repeat(58)}-b`);
});

test('an empty name, whitespace only, only symbols, only emoji, only another script, or not text gives nothing', () => {
  for (const value of ['', '   ', '\t\n\r', '?!@#$%^&*()', '\u{1F600}\u{1F680}', '...', '---', '- - -', 'أحمد', '李明', null, undefined, 42, {}, ['a']]) {
    assert.equal(safeNamePart(value), '', JSON.stringify(value));
  }
  assert.equal(safeNamePart('Ali أحمد'), 'Ali', 'letters of another script are dropped, the rest stays');
});

// ---------------------------------------------------------------------------
// The whole file name, and the fallback
// ---------------------------------------------------------------------------

test('the three file names: the full name, then the document', () => {
  const name = 'Roohullah Shah';
  assert.equal(pdfFileName({ name, reference: REFERENCE, type: 'answers' }), 'Roohullah-Shah-Application-Summary.pdf');
  assert.equal(pdfFileName({ name, reference: REFERENCE, type: 'cover_letter' }), 'Roohullah-Shah-Cover-Letter.pdf');
  assert.equal(pdfFileName({ name, reference: REFERENCE, type: 'itinerary' }), 'Roohullah-Shah-Itinerary.pdf');
  assert.equal(pdfFileName({ name: 'Roohullah', reference: REFERENCE, type: 'answers' }), 'Roohullah-Application-Summary.pdf', 'one name only');
  assert.equal(pdfFileName({ name, type: 'cover_letter', draft: true }), 'Roohullah-Shah-Cover-Letter-Draft.pdf', 'a draft says so');
  assert.equal(pdfFileName({ name, type: 'itinerary', draft: true }), 'Roohullah-Shah-Itinerary-Draft.pdf');
  assert.throws(() => pdfFileName({ name, type: 'passport' }), /unknown PDF type/);
});

test('with no usable name the file name is the reference form, exactly as before; with no usable reference either it is still never blank', () => {
  for (const name of [undefined, null, '', '   ', '???', '\u{1F600}', 'أحمد']) {
    assert.equal(pdfFileName({ name, reference: REFERENCE, type: 'answers' }), 'TV-K7M3QD9R-application-summary.pdf', JSON.stringify(name));
    assert.equal(pdfFileName({ name, reference: REFERENCE, type: 'cover_letter' }), 'TV-K7M3QD9R-cover-letter.pdf');
    assert.equal(pdfFileName({ name, reference: REFERENCE, type: 'itinerary', draft: true }), 'TV-K7M3QD9R-itinerary-draft.pdf');
  }
  assert.equal(pdfFileName({ name: '', type: 'cover_letter' }), 'cover-letter.pdf');
  for (const reference of ['', 'tv-lower', 'TV-X"; evil', 'TV-X\r\nY', 'A', null, 42]) {
    assert.equal(pdfFileName({ name: '', reference, type: 'answers' }), 'application-summary.pdf', `a reference that is not safe is not used: ${JSON.stringify(reference)}`);
  }
});

// ---------------------------------------------------------------------------
// The header
// ---------------------------------------------------------------------------

test('the Content-Disposition header: an attachment with a plain ASCII name in quotes, whatever the name', () => {
  assert.equal(contentDispositionFor('Roohullah-Shah-Cover-Letter.pdf'), 'attachment; filename="Roohullah-Shah-Cover-Letter.pdf"');
  assert.equal(contentDispositionFor('TV-K7M3QD9R-cover-letter-draft.pdf'), 'attachment; filename="TV-K7M3QD9R-cover-letter-draft.pdf"');
  // A value that did not come from pdfFileName never reaches a header.
  for (const bad of ['a"b.pdf', 'a;b.pdf', 'a\r\nSet-Cookie: x=1.pdf', 'a\nb.pdf', '../x.pdf', 'a/b.pdf', 'a b.pdf', 'é.pdf', 'x.exe', '.pdf', '', null, undefined, 42, 'a.pdf; filename*=UTF-8\'\'evil.exe']) {
    assert.equal(contentDispositionFor(bad), 'attachment; filename="document.pdf"', JSON.stringify(bad));
  }
});

test('whatever is typed as a name, the header is one clean line with the fixed shape (a fuzz of 2000 names)', () => {
  const pieces = ['Roohullah', 'Shah', ' ', '  ', '-', '"', ';', '\r', '\n', '\t', '/', '\\', '.', ':', '=', '%', '\u0000', 'é', 'ß', '\u{1F600}', 'أحمد', '\u200b', "'", '<', '>', '&', '$', '`', '0', 'x'];
  let seed = 12345;
  const next = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
  for (let i = 0; i < 2000; i += 1) {
    const name = Array.from({ length: 1 + (next() % 14) }, () => pieces[next() % pieces.length]).join('');
    for (const type of ['answers', 'cover_letter', 'itinerary']) {
      const header = contentDispositionFor(pdfFileName({ name, reference: REFERENCE, type, draft: next() % 2 === 0 }));
      assert.match(header, /^attachment; filename="[A-Za-z0-9][A-Za-z0-9-]*\.pdf"$/, JSON.stringify(name));
      assert.equal(header.split('\n').length, 1);
      assert.equal(header.includes('\r'), false);
      assert.ok(header.length < 140, header.length);
    }
  }
});

// ---------------------------------------------------------------------------
// The name is for the file name only
// ---------------------------------------------------------------------------

test('the service names the file after the applicant and puts the name nowhere else: not in the PDF metadata, the audit row or the log', async () => {
  const NAME_GIVEN = 'Zubaida';
  const NAME_FAMILY = 'Quraishi';
  const audit = [];
  const logged = [];
  for (const method of ['log', 'info', 'warn', 'error']) mock.method(console, method, (...args) => logged.push(args.join(' ')));
  try {
    const service = new TouristVisaPdfService({
      admin: { load: async () => ({ _id: 'app1', reference: REFERENCE, status: 'submitted', answers: { q2_1: NAME_GIVEN, q2_2: NAME_FAMILY } }) },
      letters: { findLatestWithText: async () => ({ version: 2, status: 'approved', text: 'Dear Sir,\n\nA made-up letter.\n\nYours faithfully,\nA Person' }) },
      letterService: { isStale: async () => false },
      audit: { append: async (rows) => audit.push(...rows) },
      now: () => new Date('2026-11-18T09:30:00Z'),
    });
    const { buffer, filename } = await service.coverLetterForAdmin('admin1', 'app1');
    assert.equal(filename, 'Zubaida-Quraishi-Cover-Letter.pdf');

    const pdf = await inspectPdf(buffer);
    // The metadata is fixed words; the name is not in any field of it, nor anywhere in the file's metadata streams.
    for (const value of Object.values(pdf.info || {}).filter((v) => typeof v === 'string')) {
      assert.equal(/Zubaida|Quraishi/i.test(value), false, `the name is in the metadata: ${value}`);
    }
    assert.equal(/\/(Title|Author|Subject|Keywords)\s*\([^)]*(Zubaida|Quraishi)/i.test(pdf.raw), false, 'no name in the document information');
    // The audit row: ids and fixed facts only.
    assert.equal(audit.length, 1);
    assert.equal(/Zubaida|Quraishi|Cover-Letter/.test(JSON.stringify(audit)), false, 'no name or file name in the audit row');
    assert.equal(/pdfName|fileName|filename/i.test(Object.keys(audit[0]).join(' ')), false);
    // Nothing was logged with it.
    assert.equal(/Zubaida|Quraishi/.test(logged.join('\n')), false, 'no name in a log line');
  } finally {
    mock.restoreAll();
  }
});

test('the exported fileNameFor reads the name from the answers and falls back to the reference', () => {
  assert.equal(fileNameFor({ reference: REFERENCE, answers: { q2_1: 'Roohullah', q2_2: 'Shah' } }, 'answers'), 'Roohullah-Shah-Application-Summary.pdf');
  assert.equal(fileNameFor({ reference: REFERENCE, answers: { q2_1: 'Roohullah' } }, 'answers'), 'Roohullah-Application-Summary.pdf');
  assert.equal(fileNameFor({ reference: REFERENCE, answers: { q2_1: '   ', q2_2: '' } }, 'cover_letter'), 'TV-K7M3QD9R-cover-letter.pdf');
  assert.equal(fileNameFor({ reference: REFERENCE }, 'itinerary'), 'TV-K7M3QD9R-itinerary.pdf');
  assert.equal(fileNameFor(null, 'itinerary'), 'itinerary.pdf');
});
