'use strict';

// The cover letter PDF (step 8h-2) without a database: how the stored text is read, the sender and the date, and the layout of the file
// (read back with pdfjs): one page for a short letter, a continuation header for a longer one, the closing never alone, an unbroken long word
// kept inside the margins, plain typography, the refusal of text the fonts cannot print, and the DRAFT watermark (and its absence on an
// approved letter). Made-up data only.

process.env.NODE_ENV = 'test';
process.env.FIELD_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const letter = require('../utils/touristVisaCoverLetterPdf');
const { LetterBuilder } = require('../utils/pdf/letterBuilder');
const config = require('../config/touristVisaPdf');
const engine = require('../shared/tourist-visa/engine');
const { buildFacts } = require('../shared/tourist-visa/coverLetterFacts');
const { buildTemplate } = require('../utils/touristVisaCoverLetterTemplate');
const { substitute } = require('../utils/touristVisaCoverLetterChecks');
const { fullAnswers } = require('./helpers/touristVisaFixtures');
const { inspectPdf, pageOf, contentStreams } = require('./helpers/pdfInspect');

const C = String.fromCodePoint;
const top = (page, item) => page.height - item.y; // from the top of the page, in points
const { LETTER_PAGE, TEXT } = config;
const MARGIN = LETTER_PAGE.margin;
const SENDER = { name: 'Aisha Khan-Reynolds', addressLines: ['12 Sample Road', 'Flat 4', 'Karachi, Sindh', '75000', 'Pakistan'], email: 'aisha.khan@example.com', phone: '+44 7700 900123' };
const ADDRESS_ROW = SENDER.addressLines.join(', ');
const DISPLAY = /CormorantGaramond/;
const DATE = new Date('2026-11-03T10:15:00Z');
const REFERENCE = 'TV-K7M3QD9R';
const CLOSING = 'Yours faithfully,\nAisha Khan-Reynolds';
const ARABIC = C(0x645, 0x631, 0x62d, 0x628, 0x627);

const model = (text, over = {}) => letter.buildLetterModel({ text, reference: REFERENCE, sender: SENDER, date: DATE, draft: false, ...over });
const render = (m) => letter.renderCoverLetterPdf(m);
const pdfOf = async (text, over) => inspectPdf(await render(model(text, over)));
const visit = (n) => Array.from({ length: n }, () => 'visit').join(' '); // a paragraph of about n words (every line of it holds the word "visit")
const para = (words) => `${visit(words)} and I will keep to my plans.`;

/** The lines of a page that belong to the body of the letter: not the letterhead, the date line, a header, the footer or the closing. */
function bodyLines(page, { withClosing = false } = {}) {
  return page.lines.filter((l) => {
    if (l.y < MARGIN + LETTER_PAGE.footer.height + 2) return false; // the footer
    if (page.number > 1 && page.height - l.y < MARGIN + LETTER_PAGE.header.height + LETTER_PAGE.header.gapBelow) return false; // the continuation header
    if (l.items.some((i) => DISPLAY.test(i.font))) return false; // the sender's name
    if (l.text.includes(SENDER.email) || l.text.startsWith('3 November 2026')) return false; // the contact row, the date and reference line
    if (!withClosing && (l.text === 'Yours faithfully,' || l.text === SENDER.name)) return false;
    return true;
  });
}

/** The template letter of the application of the other tests: the real structure of a stored letter. */
function realLetter() {
  const answers = fullAnswers('Aisha', 'Khan-Reynolds', 'a@example.com');
  const facts = buildFacts(engine.config, answers, { submittedAt: new Date('2026-11-03T10:00:00Z') });
  return substitute(buildTemplate(facts), facts.tokens, facts.redactions);
}

// ---------------------------------------------------------------------------
// The stored text, as it is
// ---------------------------------------------------------------------------

test('the real structure of a stored letter is read as it is: the salutation, the paragraphs, and the closing with the name under it', () => {
  const text = realLetter();
  const parsed = letter.parseLetter(text);
  assert.deepEqual(parsed.blocks[0], ['Dear Sir or Madam,']);
  assert.ok(parsed.blocks.length >= 6);
  assert.deepEqual(parsed.closing, ['Yours faithfully,', 'Aisha Khan-Reynolds']);
  // Nothing is lost or added: the blocks and the closing put back together are the stored text.
  const again = [...parsed.blocks.map((b) => b.join('\n')), parsed.closing.join('\n')].join('\n\n');
  assert.equal(again, text);
});

test('a closing with the name in a block of its own, "Kind regards", a missing name and a text with no closing are all read', () => {
  assert.deepEqual(letter.parseLetter('Dear Sir,\n\nOne.\n\nYours faithfully,\n\nAisha Khan').closing, ['Yours faithfully,', 'Aisha Khan']);
  assert.deepEqual(letter.parseLetter('Dear Sir,\n\nOne.\n\nKind regards,\nAisha').closing, ['Kind regards,', 'Aisha']);
  assert.deepEqual(letter.parseLetter("Dear Sir,\n\nOne.\n\nYours faithfully,\n[not provided: applicant's name]").closing, ['Yours faithfully,', "[not provided: applicant's name]"]);
  const none = letter.parseLetter('Dear Sir,\n\nOne paragraph.\n\nAnother paragraph that ends the letter.');
  assert.equal(none.closing, null);
  assert.equal(none.blocks.length, 3);
  // The line breaks inside a block are kept; the blank lines between blocks are not lines; spaces run together.
  const lines = letter.parseLetter('Line one\nLine   two\n\n\n\nNext block  here');
  assert.deepEqual(lines.blocks, [['Line one', 'Line two'], ['Next block here']]);
  // A last paragraph that merely ends with a sentence is not a closing.
  assert.equal(letter.parseLetter('Dear Sir,\n\nI send you my thanks.').closing, null);
});

// ---------------------------------------------------------------------------
// The sender and the date
// ---------------------------------------------------------------------------

test('the sender block is the name and the home address from the answers, only what they hold', () => {
  const all = letter.senderOf({ q2_1: ' Aisha ', q2_2: 'Khan-Reynolds', q2_4: ' aisha.khan@example.com ', q2_32: { countryCode: '+44', number: '7700 900123' }, q2_24: { line1: '12 Sample Road', line2: 'Flat 4', town: 'Karachi', region: 'Sindh', postcode: '75000', country: 'PK' } });
  assert.deepEqual(all, SENDER);
  assert.deepEqual(letter.senderOf({ q2_1: 'Aisha', q2_24: { line1: '1 Test Street', town: 'Testville', country: 'GB' } }), { name: 'Aisha', addressLines: ['1 Test Street', 'Testville', 'United Kingdom'], email: '', phone: '' });
  assert.deepEqual(letter.senderOf({ q2_1: 'Aisha', q2_2: 'Khan' }), { name: 'Aisha Khan', addressLines: [], email: '', phone: '' }, 'no address in the answers, none printed');
  assert.deepEqual(letter.senderOf({}), { name: '', addressLines: [], email: '', phone: '' });
  assert.deepEqual(letter.senderOf(null), { name: '', addressLines: [], email: '', phone: '' });
  assert.deepEqual(letter.senderOf({ q2_24: 'not an address', q2_32: 'not a phone' }), { name: '', addressLines: [], email: '', phone: '' });
  assert.deepEqual(letter.senderOf({ q2_1: 'Aisha', q2_4: 'a@example.com' }), { name: 'Aisha', addressLines: [], email: 'a@example.com', phone: '' }, 'only the contact details the answers hold');
});

test('the date of the letter is the date its version was written; failing that, the date it was approved; failing that, none', () => {
  const written = new Date('2026-11-03T10:00:00Z');
  const approved = new Date('2026-11-09T08:00:00Z');
  assert.deepEqual(letter.letterDate({ createdAt: written, approvedAt: approved }), { date: written, source: 'written' });
  assert.deepEqual(letter.letterDate({ approvedAt: approved }), { date: approved, source: 'approved' });
  assert.deepEqual(letter.letterDate({ createdAt: 'not a date', approvedAt: approved }), { date: approved, source: 'approved' });
  assert.equal(letter.letterDate({}), null);
  assert.equal(letter.letterDate(null), null);
  assert.equal(letter.formatLetterDate(new Date('2026-11-03T23:30:00Z')), '3 November 2026');
});

// ---------------------------------------------------------------------------
// A very short letter: one page, the furniture, the type
// ---------------------------------------------------------------------------

test('a very short letter is one A4 page with generous margins: the letterhead top left, the contact row, the date and the reference on one line, and a slim footer with Page 1 of 1', async () => {
  const pdf = await pdfOf(`Dear Sir or Madam,\n\nI am writing to apply.\n\n${CLOSING}`);
  assert.equal(pdf.numPages, 1);
  const page = pdf.pages[0];
  assert.ok(Math.abs(page.width - 595.28) < 0.5 && Math.abs(page.height - 841.89) < 0.5, 'A4');
  assert.ok(MARGIN >= 25 * (72 / 25.4) - 0.01, 'a 25 mm margin');
  // The letterhead: the name large in the display face, at the left margin, at the top.
  const name = page.items.find((i) => i.str === 'Aisha Khan-Reynolds' && DISPLAY.test(i.font));
  assert.ok(name, 'the sender name is set in the display face (Cormorant Garamond)');
  assert.ok(Math.abs(name.x - MARGIN) < 1.5, `at the left margin: ${name.x}`);
  assert.ok(page.height - name.y < MARGIN + 40, 'at the top');
  assert.ok(Math.abs(name.size - 34) < 0.5, `large: ${name.size}`);
  // The contact row under it: the address, the email and the telephone, in small type, on one row, left to right.
  const address = page.items.find((i) => i.str === ADDRESS_ROW);
  const email = page.items.find((i) => i.str === SENDER.email);
  const phone = page.items.find((i) => i.str === SENDER.phone);
  assert.ok(address && email && phone, 'address, email and telephone are printed');
  assert.ok(address.size < 10 && email.size < 10 && phone.size < 10, 'in small type');
  assert.ok(Math.abs(address.x - MARGIN) < 1.5 && address.x < email.x && email.x < phone.x, 'left to right from the margin');
  assert.ok(Math.abs(address.y - email.y) < 1 && Math.abs(email.y - phone.y) < 1, 'on one row');
  assert.ok(address.y < name.y, 'under the name');
  // The date on the left and the reference on the right, on one tidy line under the letterhead.
  const date = page.items.find((i) => i.str === '3 November 2026');
  const value = page.items.find((i) => i.str === REFERENCE);
  const label = page.items.find((i) => i.str === 'REFERENCE');
  assert.ok(date && value && label);
  assert.ok(Math.abs(date.x - MARGIN) < 1.5, 'the date is at the left margin');
  assert.ok(Math.abs(value.x + value.width - (page.width - MARGIN)) < 2, 'the reference ends at the right margin');
  assert.ok(label.x + label.width < value.x, 'with its label before it');
  assert.ok(Math.abs(date.y - value.y) < 1, 'on one line');
  assert.ok(date.y < address.y, 'under the letterhead');
  // The body is Source Serif 4 at 11 pt in a column of about 70 characters.
  const body = page.items.find((i) => i.str === 'Dear Sir or Madam,');
  assert.ok(/SourceSerif4/.test(body.font), body.font);
  assert.ok(Math.abs(body.size - 11) < 0.3);
  assert.ok(Math.abs(body.x - MARGIN) < 1.5);
  // The closing and the room for a signature between "Yours faithfully," and the name (a fixed number, not the constant under test).
  const yours = page.lines.find((l) => l.text === 'Yours faithfully,');
  const signed = page.lines.find((l) => l.text === 'Aisha Khan-Reynolds' && l.items.every((i) => /SourceSerif4/.test(i.font)));
  assert.ok(yours && signed);
  assert.ok(yours.y - signed.y >= 56, `room to sign: ${yours.y - signed.y}`);
  // A slim footer: the reference, who prepared it, and Page X of Y even for a single page; nothing like the summary's disclaimer or logo.
  const footer = page.items.filter((i) => i.y < MARGIN + LETTER_PAGE.footer.height).map((i) => i.str).join(' ');
  assert.match(footer, new RegExp(`${REFERENCE} . Prepared by Wiser Consulting`));
  assert.ok(footer.includes('Page 1 of 1'), footer);
  assert.equal(pdf.text.includes('not an official'), false);
  assert.equal((pdf.raw.match(/\/Subtype\s*\/Image/g) || []).length, 0, 'no logo or picture on the letter');
});

test('the contact row holds only what the answers hold, and wraps rather than overflowing', async () => {
  const only = async (sender) => inspectPdf(await render(letter.buildLetterModel({ text: `Dear Sir,\n\nHello.\n\n${CLOSING}`, reference: REFERENCE, sender, date: DATE, draft: false })));
  const none = await only({ name: 'Aisha Khan-Reynolds', addressLines: [], email: '', phone: '' });
  assert.equal(none.pages[0].items.some((i) => i.str.includes('@')), false, 'no email, none printed');
  assert.ok(none.pages[0].items.some((i) => i.str === 'Aisha Khan-Reynolds' && DISPLAY.test(i.font)), 'the name is still the letterhead');
  const emailOnly = await only({ name: 'Aisha Khan-Reynolds', addressLines: [], email: 'a@example.com', phone: '' });
  assert.ok(emailOnly.pages[0].items.some((i) => i.str === 'a@example.com'));
  assert.equal(emailOnly.pages[0].items.some((i) => i.str.startsWith('+')), false);
  // No name at all: no letterhead name, but the rest of the letter is intact.
  const nameless = await only({ name: '', addressLines: [], email: '', phone: '' });
  assert.equal(nameless.pages[0].items.some((i) => DISPLAY.test(i.font)), false);
  assert.ok(nameless.text.includes('Dear Sir,'));
  // A long address and a long name wrap and stay inside the margins; the contact row flows onto a second row.
  const long = await only({ name: 'Aisha Khan-Reynolds Of A Very Long Family Name That Needs Wrapping Onto A Second Line', addressLines: ['Flat 12', 'A Very Long Street Name That Goes On And On Road', 'Some Town With A Long Name', 'Some Region Of The Country', 'AB12 3CD', 'United Kingdom'], email: 'a.very.long.email.address.indeed@a-long-domain-name.example.com', phone: '+44 7700 900123' });
  for (const item of long.pages[0].items.filter((i) => i.angle === 0)) {
    assert.ok(item.x >= MARGIN - 1.5 && item.x + item.width <= long.pages[0].width - MARGIN + 1.5, `"${item.str.slice(0, 30)}" is outside the margins`);
  }
  const rows = new Set(long.pages[0].items.filter((i) => i.size < 10 && (i.str.includes('@') || i.str.includes('+44') || i.str.includes('Flat 12'))).map((i) => Math.round(i.y)));
  assert.ok(rows.size >= 2, 'the contact row flowed onto a second row');
});

test('the letter is only its own words: the body text of the file is the stored text, nothing added, nothing removed or reworded', async () => {
  const text = realLetter();
  const pdf = await pdfOf(text);
  let lines = pdf.pages.flatMap((p) => p.lines);
  // The furniture is taken away line by line: the letterhead name (the display face; the signature in the body font is the letter's own text and
  // stays), the contact row, the date and reference line, and the footer.
  const furniture = (l) => l.items.some((i) => DISPLAY.test(i.font)) || l.text.includes(SENDER.email) || l.text.startsWith('3 November 2026') || l.text.includes('Prepared by Wiser Consulting');
  const removed = lines.filter(furniture);
  assert.equal(removed.length, 4, `the letterhead name, the contact row, the date line and the footer: ${removed.map((l) => l.text)}`);
  lines = lines.filter((l) => !furniture(l));
  const printed = lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
  const stored = text.replace(/\s+/g, ' ').trim();
  assert.equal(printed, stored);
});

test('no page of a letter looks like a government document: no crest, no government name, no barcode, no reference number of an official kind', async () => {
  const pdf = await pdfOf(realLetter());
  for (const forbidden of [/UK Visas/i, /Immigration/, /Home Office/i, /HM Government/i, /GWF/, /Partially completed/i, /Crown/, /barcode/i]) assert.equal(forbidden.test(pdf.text), false, String(forbidden));
  assert.equal((pdf.raw.match(/\/Subtype\s*\/Image/g) || []).length, 0);
});

test('the fonts are embedded (Cormorant Garamond for the letterhead, Source Serif 4 for the body, Source Sans 3 for the small type) and no standard font is referred to; the metadata holds no personal data and no script', async () => {
  const pdf = await pdfOf(realLetter());
  assert.ok(pdf.embeddedFonts >= 2);
  assert.equal(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?(?:Helvetica|Times|Courier|Symbol|ZapfDingbats|Arial)/.test(pdf.raw), false);
  const fonts = [...new Set(pdf.pages.flatMap((p) => p.items.map((i) => i.font)))].join(' ');
  assert.match(fonts, /CormorantGaramond/);
  assert.match(fonts, /SourceSerif4/);
  assert.match(fonts, /SourceSans3/);
  assert.deepEqual({ ...pdf.info }.Title, TEXT.letterInfo.Title);
  for (const [key, value] of Object.entries(TEXT.letterInfo)) assert.equal(pdf.info[key.replace(/^./, (c) => c)], value, key);
  for (const value of Object.values(pdf.info).filter((v) => typeof v === 'string')) {
    for (const personal of ['Aisha', 'Khan', REFERENCE, 'Sample Road', 'Karachi', 'example.com', '7700']) assert.equal(value.includes(personal), false, `${personal} in the metadata`);
  }
  for (const script of ['/JavaScript', '/JS ', '/OpenAction', '/Launch']) assert.equal(pdf.raw.includes(script), false, script);
});

test('nothing is printed outside the 25 mm margins, on any page of a short or a long letter, a draft or an approved one', async () => {
  const long = `Dear Sir,\n\n${Array.from({ length: 12 }, (_, i) => para(70 + i)).join('\n\n')}\n\n${CLOSING}`;
  for (const [text, draft] of [[realLetter(), false], [long, false], [long, true]]) {
    const pdf = await pdfOf(text, { draft });
    for (const page of pdf.pages) {
      for (const item of page.items.filter((i) => i.angle === 0)) {
        assert.ok(item.x >= MARGIN - 1.5, `page ${page.number}: "${item.str}" starts at ${item.x}`);
        assert.ok(item.x + item.width <= page.width - MARGIN + 1.5, `page ${page.number}: "${item.str}" ends at ${item.x + item.width}`);
        assert.ok(page.height - item.y - item.size * 0.75 >= MARGIN - 2, `page ${page.number}: "${item.str}" is above the top margin`);
        assert.ok(item.y >= MARGIN - 2, `page ${page.number}: "${item.str}" is below the bottom margin`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// A longer letter: it flows, with a continuation header; the closing is never alone
// ---------------------------------------------------------------------------

test('a long letter flows to further pages with a continuation header (the sender, and Page X of Y); the first page has none', async () => {
  const long = `Dear Sir or Madam,\n\n${Array.from({ length: 10 }, (_, i) => para(80 + i)).join('\n\n')}\n\n${CLOSING}`;
  const pdf = await pdfOf(long);
  assert.ok(pdf.numPages >= 2 && pdf.numPages <= 4, `${pdf.numPages} pages`);
  pdf.pages.forEach((page) => {
    const top = page.items.filter((i) => page.height - i.y < MARGIN + LETTER_PAGE.header.height + 3);
    const header = top.find((i) => DISPLAY.test(i.font) && i.str === 'Aisha Khan-Reynolds');
    if (page.number === 1) {
      // The first page's name is the letterhead (size 34), not a continuation header (size 15).
      const letterhead = page.items.find((i) => DISPLAY.test(i.font) && i.str === 'Aisha Khan-Reynolds');
      assert.ok(letterhead && letterhead.size > 30, 'page 1 has the letterhead');
      assert.equal(top.some((i) => i.str === `Page 1 of ${pdf.numPages}`), false);
    } else {
      assert.ok(header && header.size < 20, `page ${page.number}: the continuation header`);
      // The body starts below the header and its rule, never over it.
      const below = page.lines.filter((l) => !l.items.some((i) => DISPLAY.test(i.font)) && l.y >= MARGIN + LETTER_PAGE.footer.height + 2);
      const firstBody = below.reduce((top, l) => (l.y > top.y ? l : top), below[0]);
      assert.ok(page.height - firstBody.y >= MARGIN + LETTER_PAGE.header.height + LETTER_PAGE.header.gapBelow, `page ${page.number}: the first line under the header is at ${page.height - firstBody.y}`);
    }
    const footer = page.items.filter((i) => i.y < MARGIN + LETTER_PAGE.footer.height).map((i) => i.str).join(' ');
    assert.ok(footer.includes(`Page ${page.number} of ${pdf.numPages}`), `page ${page.number}: Page X of Y`);
    assert.ok(footer.includes(`${REFERENCE}`) && footer.includes('Prepared by Wiser Consulting'));
  });
});

test('the closing (the "Yours faithfully," line, the signature space and the name) is never alone on a page: at least the last two lines of the body are on its page, for every length of letter', async () => {
  const closingPages = new Set();
  for (let words = 5; words <= 1700; words += 19) {
    const pdf = await pdfOf(`Dear Sir or Madam,\n\n${para(words)}\n\n${para(60)}\n\n${CLOSING}`);
    const yoursPage = pageOf(pdf, 'Yours faithfully,');
    assert.ok(yoursPage > 0);
    const page = pdf.pages[yoursPage - 1];
    const yours = page.lines.find((l) => l.text === 'Yours faithfully,');
    const nameLine = page.lines.find((l) => l.text === 'Aisha Khan-Reynolds' && l.y < yours.y);
    assert.ok(nameLine, `${words} words: the name is on the same page as "Yours faithfully,"`);
    const bodyAbove = bodyLines(page).filter((l) => l.y > yours.y);
    assert.ok(bodyAbove.length >= 2, `${words} words: only ${bodyAbove.length} line(s) of the body are with the closing on page ${yoursPage} of ${pdf.numPages}`);
    closingPages.add(`${yoursPage}/${pdf.numPages}`);
  }
  assert.ok(closingPages.size >= 3, `the closing was tried on several pages: ${[...closingPages]}`);
});

test('the same holds when the last paragraph is a single line, and when the letter has no closing phrase at all', async () => {
  for (let words = 5; words <= 700; words += 23) {
    const pdf = await pdfOf(`Dear Sir or Madam,\n\n${para(words)}\n\nThank you.\n\n${CLOSING}`);
    const page = pdf.pages[pageOf(pdf, 'Yours faithfully,') - 1];
    const yours = page.lines.find((l) => l.text === 'Yours faithfully,');
    const above = bodyLines(page).filter((l) => l.y > yours.y);
    assert.ok(above.length >= 2, `${words} words: ${above.length} body line(s) with the closing`);
    const bare = await pdfOf(`Dear Sir or Madam,\n\n${para(words)}\n\nThat is all I wish to say.`);
    for (const p of bare.pages) assert.ok(bodyLines(p, { withClosing: true }).length >= 2, `page ${p.number} of ${bare.numPages} has a lone line`);
  }
});

test('a paragraph that is split across pages leaves at least two of its lines on each page: never one line at the foot (an orphan) or at the head (a widow)', async () => {
  // Every line of a paragraph holds only its tag word, so the lines of each paragraph on each page can be counted.
  const tagged = (tag, words) => Array.from({ length: words }, () => tag).join(' ');
  let split = 0;
  for (let words = 40; words <= 700; words += 4) {
    const pdf = await pdfOf(`Dear Sir or Madam,\n\n${tagged('alpha', words)}\n\n${tagged('beta', 130)}\n\n${CLOSING}`);
    for (const tag of ['alpha', 'beta']) {
      const perPage = pdf.pages.map((page) => page.lines.filter((l) => l.text.split(' ').every((w) => w === tag)).length).filter((n) => n > 0);
      if (perPage.length > 1) {
        split += 1;
        for (const n of perPage) assert.ok(n >= 2, `${words} words: the ${tag} paragraph has ${perPage.join(' + ')} lines on its pages`);
      }
    }
  }
  assert.ok(split >= 20, `paragraphs were split across pages ${split} times`);
});

// ---------------------------------------------------------------------------
// Words that do not break, typography, text the fonts cannot print
// ---------------------------------------------------------------------------

test('an unbroken very long word (a string with no space) is broken to fit and stays inside the margins; nothing overlaps', async () => {
  const long = 'A'.repeat(400);
  const url = `https://example.invalid/${'path/'.repeat(60)}`;
  const pdf = await pdfOf(`Dear Sir,\n\nBefore ${long} after.\n\nAnd ${url} too.\n\n${CLOSING}`);
  const page = pdf.pages[0];
  for (const item of page.items.filter((i) => i.angle === 0)) assert.ok(item.x + item.width <= page.width - MARGIN + 1.5, `"${item.str.slice(0, 20)}" ends at ${item.x + item.width}`);
  const printed = pdf.text.replace(/\s+/g, '');
  assert.ok(printed.includes('A'.repeat(400)), 'every character of the long word is there');
  assert.ok(printed.includes(url), 'the long address is there');
  const ys = page.lines.map((l) => l.y);
  for (let i = 1; i < ys.length; i += 1) assert.ok(ys[i - 1] - ys[i] > 7, 'lines do not overlap');
});

test('typographic characters become plain ones: curly quotes, en and em dashes, the ellipsis, non-breaking hyphens and spaces, zero-width characters', async () => {
  const text = `Dear Sir,\n\nIt${C(0x2019)}s ${C(0x201c)}quoted${C(0x201d)} and ${C(0x2018)}single${C(0x2019)}; 10${C(0x2013)}15 days ${C(0x2014)} well${C(0x2011)}known${C(0x2026)} ten${C(0xa0)}people${C(0x200b)}!\n\n${CLOSING}`;
  const pdf = await pdfOf(text);
  assert.ok(pdf.text.includes('It\'s "quoted" and \'single\'; 10-15 days - well-known... ten people!'), pdf.text);
  for (const code of [0x2019, 0x201c, 0x201d, 0x2018, 0x2013, 0x2014, 0x2011, 0x2026, 0xa0, 0x200b]) assert.equal(pdf.text.includes(C(code)), false, `U+${code.toString(16)} is in the file`);
  // What is plain Latin stays: accents and the pound sign.
  const kept = await pdfOf(`Dear Sir,\n\nCaf${C(0xe9)} ${C(0xfc)}ber ${C(0xa3)}1,200.\n\n${CLOSING}`);
  assert.ok(kept.text.includes(`Caf${C(0xe9)} ${C(0xfc)}ber ${C(0xa3)}1,200.`));
});

test('text the fonts cannot print is found before anything is drawn: in the letter, in the sender block or in the date; the text is never returned', () => {
  assert.equal(letter.unprintableIn(model(`Dear Sir,\n\nA trip to ${ARABIC} soon.\n\n${CLOSING}`)), 'letter');
  assert.equal(letter.unprintableIn(model(`Dear Sir,\n\nFine.\n\nYours faithfully,\n${ARABIC}`)), 'letter');
  assert.equal(letter.unprintableIn(letter.buildLetterModel({ text: 'Dear Sir,\n\nFine.', reference: REFERENCE, sender: { name: ARABIC, addressLines: [] }, date: DATE, draft: false })), 'sender');
  assert.equal(letter.unprintableIn(letter.buildLetterModel({ text: 'Dear Sir,\n\nFine.', reference: REFERENCE, sender: { name: 'Aisha', addressLines: [`1 ${C(0x5317)}${C(0x4eac)} Road`] }, date: DATE, draft: false })), 'sender');
  for (const contact of [{ email: `${ARABIC}@example.com` }, { phone: `+44 ${ARABIC}` }]) assert.equal(letter.unprintableIn(letter.buildLetterModel({ text: 'Dear Sir,\n\nFine.', reference: REFERENCE, sender: { name: 'Aisha', addressLines: [], email: '', phone: '', ...contact }, date: DATE, draft: false })), 'sender', 'the email and the telephone are checked too');
  for (const bad of [C(0x5317), C(0xe0e), C(0x5d0), C(0x939), C(0x1f600)]) assert.equal(letter.unprintableIn(model(`Dear Sir,\n\nA ${bad} here.\n\n${CLOSING}`)), 'letter');
  // Typographic characters are made plain first, so they are never a reason to refuse; accents and the pound sign are printable.
  assert.equal(letter.unprintableIn(model(`Dear Sir,\n\n${C(0x201c)}Caf${C(0xe9)}${C(0x201d)} ${C(0x2014)} ${C(0xa3)}5${C(0x2026)} ${C(0x2011)}\n\n${CLOSING}`)), null);
  assert.equal(letter.unprintableIn(model(realLetter())), null);
});

// ---------------------------------------------------------------------------
// The draft mark
// ---------------------------------------------------------------------------

test('a DRAFT is marked on every page: a diagonal watermark behind the text and a small banner at the top, both "DRAFT - NOT APPROVED"', async () => {
  const long = `Dear Sir,\n\n${Array.from({ length: 10 }, (_, i) => para(90 + i)).join('\n\n')}\n\n${CLOSING}`;
  for (const text of [`Dear Sir or Madam,\n\nShort.\n\n${CLOSING}`, long]) {
    const pdf = await pdfOf(text, { draft: true });
    for (const page of pdf.pages) {
      const marks = page.items.filter((i) => i.str === TEXT.draftMark);
      assert.equal(marks.length, 2, `page ${page.number}: a watermark and a banner`);
      const watermark = marks.find((i) => i.angle !== 0);
      const banner = marks.find((i) => i.angle === 0);
      assert.ok(watermark && banner);
      assert.ok(Math.abs(watermark.angle) === 45, `the watermark is diagonal: ${watermark.angle}`);
      assert.ok(watermark.size >= 40, `the watermark is large: ${watermark.size}`);
      assert.ok(banner.size < 12, 'the banner is small');
      assert.ok(page.height - banner.y < MARGIN + 20, 'the banner is at the top');
      assert.ok(Math.abs(banner.x + banner.width / 2 - page.width / 2) < 3, 'the banner is centred');
    }
    assert.equal(pdf.text.split(TEXT.draftMark).length - 1, pdf.numPages * 2);
  }
});

test('the watermark is behind the text: it is the first thing drawn on each page, and it stays light', async () => {
  const buffer = await render(model(realLetter(), { draft: true }));
  const raw = buffer.toString('latin1');
  assert.match(raw, /\/ca\s+0?\.1\d*/, 'the watermark has a low opacity');
  // The mark is drawn at the start of the page (before the sender block): in the order of the text items the mark comes first.
  const pdf = await inspectPdf(buffer);
  const order = pdf.pages[0].items.map((i) => i.str);
  assert.equal(order.indexOf(TEXT.draftMark) < order.indexOf('Aisha Khan-Reynolds'), true);
});

test('an APPROVED letter has no watermark, no banner and no mention of a draft anywhere in the file', async () => {
  const long = `Dear Sir,\n\n${Array.from({ length: 10 }, (_, i) => para(90 + i)).join('\n\n')}\n\n${CLOSING}`;
  for (const text of [realLetter(), long]) {
    const pdf = await pdfOf(text, { draft: false });
    assert.equal(/DRAFT|NOT APPROVED/i.test(pdf.text), false);
    assert.equal(pdf.pages.some((p) => p.items.some((i) => i.angle !== 0)), false, 'no rotated text');
  }
});

test('the letter builder is a thin layer over the foundation: the page, the draft mark and the footer, and nothing about a letter\'s words', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'pdf', 'letterBuilder.js'), 'utf8');
  assert.equal(/answers?\b|question|cover letter text/i.test(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), false);
  const b = new LetterBuilder({ reference: REFERENCE, applicantName: 'X', draft: true });
  assert.ok(b.topFor(2) > b.topFor(1), 'later pages leave room for the continuation header');
  assert.ok(b.topFor(1) >= b.geometry.margin + LETTER_PAGE.banner.height, 'the first page of a draft starts below its banner');
  b.abort();
  const plain = new LetterBuilder({ reference: REFERENCE, applicantName: 'X' });
  assert.equal(plain.topFor(1), plain.geometry.margin);
  plain.abort();
});

test('a letter of the full size the form allows is made in a few seconds', async () => {
  const text = `Dear Sir or Madam,\n\n${Array.from({ length: 40 }, (_, i) => para(120 + i)).join('\n\n')}\n\n${CLOSING}`;
  const started = Date.now();
  const pdf = await pdfOf(text, { draft: true });
  assert.ok(Date.now() - started < 15000, `${Date.now() - started} ms`);
  assert.ok(pdf.numPages >= 8);
});

// ---------------------------------------------------------------------------
// The design (step 8h-3): what only the drawing instructions show
// ---------------------------------------------------------------------------

/** The horizontal lines of a file: [{ x1, x2, y }] with y from the top of the page (the way pdfkit writes them). */
const hLines = (buffer) => [...contentStreams(buffer).join('\n').matchAll(/([\d.]+) ([\d.]+) m\s+([\d.]+) ([\d.]+) l\s+S/g)]
  .map((m) => ({ x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]) }))
  .filter((l) => Math.abs(l.y1 - l.y2) < 0.01)
  .map((l) => ({ x1: l.x1, x2: l.x2, y: l.y1 }));
const rects = (buffer) => [...contentStreams(buffer).join('\n').matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) }));

test('the closing has a real signature line: a thin line about 176 pt long between "Yours faithfully," and the printed name', async () => {
  const buffer = await render(model(realLetter()));
  const pdf = await inspectPdf(buffer);
  const page = pdf.pages[0];
  const yours = page.items.find((i) => i.str === 'Yours faithfully,');
  const signed = page.items.filter((i) => i.str === 'Aisha Khan-Reynolds' && /SourceSerif4/.test(i.font)).pop();
  const lines = hLines(buffer).filter((l) => Math.abs(l.x2 - l.x1 - 176) < 1);
  assert.equal(lines.length, 1, 'one signature line');
  assert.ok(Math.abs(lines[0].x1 - MARGIN) < 1, 'from the left margin');
  assert.ok(lines[0].y > top(page, yours) && lines[0].y < top(page, signed), `between the closing line and the name: \${top(page, yours)} < \${lines[0].y} < \${top(page, signed)}`);
});

test('the letterhead: a short terracotta rule under the name, thin separators in the contact row, and a hairline across the text area between the contact row and the date line', async () => {
  const buffer = await render(model(realLetter()));
  const page = (await inspectPdf(buffer)).pages[0];
  const row = page.items.find((i) => i.str === SENDER.email);
  const date = page.items.find((i) => i.str === '3 November 2026');
  const rule = hLines(buffer).filter((l) => Math.abs(l.x1 - MARGIN) < 1 && Math.abs(l.x2 - (page.width - MARGIN)) < 1);
  assert.ok(rule.some((l) => l.y > top(page, row) && l.y < top(page, date) - 5), 'a full-width rule under the letterhead');
  // The short terracotta rule under the name (46 by 2.4 pt, at the left margin).
  const accentRule = rects(buffer).filter((r) => Math.abs(r.w - 46) < 0.5 && Math.abs(r.h - 2.4) < 0.2);
  assert.equal(accentRule.length, 1);
  assert.ok(Math.abs(accentRule[0].x - MARGIN) < 1 && accentRule[0].y < top(page, row), 'under the name, above the contact row');
  // Thin vertical separators between the address, the email and the telephone.
  const separators = [...contentStreams(buffer).join('\n').matchAll(/([\d.]+) ([\d.]+) m\s+([\d.]+) ([\d.]+) l\s+S/g)].map((m) => ({ x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]) })).filter((l) => Math.abs(l.x1 - l.x2) < 0.01 && l.y2 - l.y1 > 5 && l.y2 - l.y1 < 12);
  assert.equal(separators.length, 2, 'one between each pair of items');
  assert.ok(separators.every((l) => l.x1 > MARGIN && l.x1 < page.width - MARGIN && Math.abs(l.y1 - top(page, row)) < 12), 'on the contact row');
});

test('a narrow brand edge runs down every page: a thin green line with a short terracotta start, a few points wide, inside the page and outside the text', async () => {
  const long = `Dear Sir,\n\n${Array.from({ length: 12 }, (_, i) => para(70 + i)).join('\n\n')}\n\n${CLOSING}`;
  const buffer = await render(model(long));
  const pdf = await inspectPdf(buffer);
  const edge = rects(buffer).filter((r) => Math.abs(r.w - 3.2) < 0.01);
  assert.equal(edge.length, 2 * pdf.numPages, 'a green line and a terracotta start on every page');
  const tall = edge.filter((r) => r.h > 300);
  const short = edge.filter((r) => r.h < 100);
  assert.equal(tall.length, pdf.numPages);
  assert.equal(short.length, pdf.numPages);
  for (const r of edge) assert.ok(r.x >= 20 && r.x + r.w < MARGIN - 20, 'a little inside the page edge and well clear of the text: x = ' + r.x);
  assert.ok(tall[0].h > pdf.pages[0].height - 2 * MARGIN - 2, 'it runs the height of the text area');
  // Light on ink: a few points wide, nothing like a full-page fill.
  const area = edge.reduce((sum, r) => sum + r.w * r.h, 0) / pdf.numPages;
  assert.ok(area < 0.01 * 595.28 * 841.89, 'the edge covers under one percent of the page');
});

test('the body is set in a comfortable measure: no line is wider than about 410 pt (about 70 characters of ordinary text), and the lines are not narrow either', async () => {
  const pdf = await pdfOf(`Dear Sir,\n\n${para(300)}\n\n${CLOSING}`);
  const widths = pdf.pages.flatMap((p) => p.items.filter((i) => /SourceSerif4/.test(i.font) && /visit/.test(i.str)).map((i) => i.width));
  assert.ok(widths.length > 10);
  assert.ok(Math.max(...widths) <= 412, `the widest body line is ${Math.max(...widths)}`);
  assert.ok(Math.max(...widths) >= 380, 'and lines fill the measure');
});

test('the margins are at least 25 mm, a fixed figure (not read back from the config that is under test)', () => {
  assert.ok(LETTER_PAGE.margin >= 70.8 && LETTER_PAGE.margin <= 72, 'the letter has margins of 25 mm: ' + LETTER_PAGE.margin);
});

// ---------------------------------------------------------------------------
// Fit to one page (step 8h-4): a letter that overflows by a little is tightened in small steps before it flows to a second page
// ---------------------------------------------------------------------------

/** A paragraph of `n` lines (about eleven words a line at 410 pt). */
const linesOf = (n) => `${Array.from({ length: n * 11 - 1 }, (_, i) => `visit${i % 7}`).join(' ')}.`;
const letterOf = (paragraphs) => ['Dear Sir or Madam,', ...paragraphs, CLOSING].join('\n\n');
const baseParagraphs = () => [linesOf(4), linesOf(4), linesOf(4), linesOf(3)];
/** The letter of the base paragraphs and one more of `extra` lines (each extra line is one more line of overflow once the page is full). */
const withExtra = (extra) => letterOf([...baseParagraphs(), linesOf(extra)]);
/** The most extra lines that still fit the page at its nominal setting (so one more line overflows by one line). */
const nominalLimit = (draft) => {
  let e = 1;
  while (letter.fitOf(model(withExtra(e + 1), { draft })).index === 0) e += 1;
  return e;
};
const wordsIn = (pdf) => (pdf.text.match(/visit\d/g) || []).length;
/** The smallest distance between two body lines of a page: the line pitch of the body. */
const pitchOf = (page) => {
  const ys = bodyLines(page).map((l) => l.y).sort((a, b) => b - a);
  return Math.min(...ys.slice(1).map((y, i) => ys[i] - y));
};
const visits = (text) => (text.match(/visit\d/g) || []).length;

test('a letter that fits is not touched: step 0, the body at 11 pt on an 18 pt line', async () => {
  const text = letterOf([linesOf(5), linesOf(5)]);
  assert.equal(letter.fitOf(model(text)).index, 0);
  const pdf = await pdfOf(text);
  assert.equal(pdf.numPages, 1);
  assert.ok(Math.abs(pitchOf(pdf.pages[0]) - 18) < 0.05, `the line pitch is ${pitchOf(pdf.pages[0])}`);
  assert.ok(pdf.pages[0].items.filter((i) => /^visit/.test(i.str)).every((i) => Math.abs(i.size - 11) < 0.01));
});

test('a letter that overflows by 1 line, by 4 lines or by a whole paragraph is put on ONE page, with its closing and signature room, nothing lost, and no more tightening than needed', async () => {
  for (const draft of [false, true]) {
    const limit = nominalLimit(draft);
    const cases = [
      ['1 line', withExtra(limit + 1)],
      ['4 lines', withExtra(limit + 4)],
      ['a whole paragraph', letterOf([...baseParagraphs(), linesOf(limit), linesOf(5)])],
    ];
    let before = 0;
    for (const [label, text] of cases) {
      const m = model(text, { draft });
      const fit = letter.fitOf(m);
      assert.ok(fit && fit.index > 0, `${label}: overflows at the nominal setting and fits when tightened`);
      assert.ok(fit.index >= before, `${label}: more overflow, at least as much tightening`);
      before = fit.index;
      // The least tightening that works: this step fits, the one before it does not.
      assert.equal(letter.fitsAtStep(m, fit.index), true);
      assert.equal(letter.fitsAtStep(m, fit.index - 1), false, `${label}: the step before does not fit`);
      const buffer = await render(m);
      const pdf = await inspectPdf(buffer);
      assert.equal(pdf.numPages, 1, `${label}${draft ? ' (draft)' : ''}: one page`);
      assert.equal(wordsIn(pdf), visits(text), `${label}: no word is lost`);
      const page = pdf.pages[0];
      const yours = page.items.find((i) => i.str === 'Yours faithfully,');
      const signed = page.items.filter((i) => i.str === SENDER.name && /SourceSerif4/.test(i.font)).pop();
      assert.ok(yours && signed, `${label}: the closing is on the page`);
      // The room for a signature is never tightened: 46 pt of room and a line of at least 16.4 pt, as figures (not read from the module under test).
      assert.ok(yours.y - signed.y >= 62, `${label}: the room for a signature is kept (${yours.y - signed.y})`);
      assert.equal(hLines(buffer).filter((l) => Math.abs(l.x2 - l.x1 - 176) < 1).length, 1, `${label}: the signature line is there`);
      assert.ok(signed.y > MARGIN + LETTER_PAGE.footer.height, `${label}: nothing runs into the footer`);
      if (draft) assert.equal(page.items.filter((i) => i.str === TEXT.draftMark).length, 2, `${label}: a draft keeps its banner and watermark`);
    }
  }
});

test('the tightening goes in the order the design asks for: the line and paragraph spacing, then the space round the letterhead, then the size by at most half a point; and never below the minimums', () => {
  const steps = letter.FIT_STEPS;
  assert.deepEqual({ ...steps[0] }, { size: 11, pitch: 18, gap: 12, head: 1 }, 'step 0 is the nominal setting');
  for (let i = 1; i < steps.length; i += 1) {
    for (const key of ['size', 'pitch', 'gap', 'head']) assert.ok(steps[i][key] <= steps[i - 1][key], `step ${i}: ${key} never grows`);
    assert.ok(['size', 'pitch', 'gap', 'head'].some((key) => steps[i][key] < steps[i - 1][key]), `step ${i} tightens something`);
  }
  const firstHead = steps.findIndex((s) => s.head < 1);
  const firstSize = steps.findIndex((s) => s.size < 11);
  assert.ok(firstHead > 1 && firstSize > firstHead, 'spacing first, then the letterhead, then the size');
  steps.slice(0, firstSize).forEach((s) => assert.equal(s.size, 11, 'the size is not touched before the letterhead has been'));
  steps.slice(0, firstHead).forEach((s) => assert.equal(s.head, 1, 'the letterhead is not touched before the spacing has been'));
  // Before the letterhead is tightened the spacing is at its smallest; before the size is, so is the letterhead.
  assert.equal(steps[firstHead - 1].pitch, Math.min(...steps.filter((s) => s.size === 11).map((s) => s.pitch)));
  assert.equal(steps[firstHead - 1].gap, Math.min(...steps.map((s) => s.gap)));
  assert.equal(steps[firstSize - 1].head, Math.min(...steps.map((s) => s.head)));
  // The minimums, written here as figures.
  assert.ok(Math.min(...steps.map((s) => s.size)) >= 10.5 && 11 - Math.min(...steps.map((s) => s.size)) <= 0.5);
  assert.ok(steps.every((s) => s.pitch >= 1.5 * s.size), 'the line is never under 1.5 times the size');
  assert.equal(letter.MIN_BODY_SIZE, 10.5);
  assert.equal(letter.MIN_LINE_RATIO, 1.5);
});

test('the tightest letter that still fits is set at 10.5 pt or more on a line of at least 1.5 times the size, as the file shows', async () => {
  const limit = nominalLimit(false);
  let tightest = null;
  for (let e = limit + 1; e <= limit + 25; e += 1) {
    const fit = letter.fitOf(model(withExtra(e)));
    if (fit && fit.index === letter.FIT_STEPS.length - 1) tightest = e;
  }
  assert.ok(tightest, 'some letter needs the last step');
  const pdf = await pdfOf(withExtra(tightest));
  assert.equal(pdf.numPages, 1);
  const sizes = pdf.pages[0].items.filter((i) => /^visit/.test(i.str)).map((i) => i.size);
  assert.ok(Math.min(...sizes) >= 10.5 - 0.01 && Math.max(...sizes) <= 11.01, `body sizes ${Math.min(...sizes)} to ${Math.max(...sizes)}`);
  assert.ok(pitchOf(pdf.pages[0]) >= 1.5 * Math.max(...sizes) - 0.3, `the line pitch ${pitchOf(pdf.pages[0])} for ${Math.max(...sizes)} pt`);
});

test('a letter that does not fit even at the tightest step flows to two pages exactly as before: nominal setting, the closing with body lines, a compact header', async () => {
  const limit = nominalLimit(false);
  const text = withExtra(limit + 40);
  assert.equal(letter.fitOf(model(text)), null);
  const pdf = await pdfOf(text);
  assert.ok(pdf.numPages >= 2);
  assert.ok(Math.abs(pitchOf(pdf.pages[0]) - 18) < 0.05, `the first page is at the nominal 18 pt line, not ${pitchOf(pdf.pages[0])}`);
  assert.ok(pdf.pages[0].items.filter((i) => /^visit/.test(i.str)).every((i) => Math.abs(i.size - 11) < 0.01));
  const last = pdf.pages[pdf.numPages - 1];
  assert.ok(bodyLines(last).length >= 2, 'the closing is not alone: body lines go with it');
  assert.ok(last.items.some((i) => i.str === 'Yours faithfully,'));
  assert.ok(last.items.some((i) => DISPLAY.test(i.font) && i.size < 20), 'the compact continuation header');
  assert.equal(wordsIn(pdf), visits(text), 'no word is lost');
});

test('a very long letter is still made in a few seconds although each step is tried (the wrapped text is worked out once for each size)', async () => {
  const text = `Dear Sir or Madam,\n\n${Array.from({ length: 40 }, (_, i) => para(120 + i)).join('\n\n')}\n\n${CLOSING}`;
  const started = Date.now();
  await render(model(text, { draft: true }));
  assert.ok(Date.now() - started < 15000, `${Date.now() - started} ms`);
});

test('each step wraps the text for its own size: the step found with the wrapped lines shared between the steps is the one found with each size worked out afresh', () => {
  const probe = new LetterBuilder({ reference: REFERENCE, applicantName: SENDER.name });
  const vocabulary = ['visa', 'my', 'family', 'return', 'home', 'London', 'museum', 'garden', 'trip', 'plan', 'and', 'the', 'a', 'of', 'holiday', 'accommodation', 'with', 'sightseeing', 'travelling', 'Edinburgh', 'I', 'will', 'be', 'staying'];
  let seed = 12345;
  const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
  const prose = (words) => `${Array.from({ length: words }, () => vocabulary[next() % vocabulary.length]).join(' ')}.`;
  let tightened = 0;
  for (let total = 330; total <= 560; total += 8) {
    const paragraphs = [prose(Math.round(total * 0.2)), prose(Math.round(total * 0.3)), prose(Math.round(total * 0.3)), prose(Math.round(total * 0.2))];
    const m = model(letterOf(paragraphs));
    const shared = letter.fitOf(m);
    let fresh = null;
    for (let i = 0; i < letter.FIT_STEPS.length && fresh === null; i += 1) if (letter.fitsAtStep(m, i, new Map(), probe)) fresh = i;
    assert.equal(shared ? shared.index : null, fresh, `${total} words`);
    if (fresh) tightened += 1;
  }
  probe.abort();
  assert.ok(tightened >= 3, 'some of these letters needed tightening');
});
