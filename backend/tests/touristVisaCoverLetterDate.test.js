'use strict';

// The cover letter has no application reference and carries the date of the day it is exported (UK long form, UTC). Without a database: the
// real PDF service with fakes (so the clock is fixed), the letter text, the PDF read back with pdfjs (every page, draft and stale included),
// the one-page fit with the date line, and the facts and the prompt the AI sees. The reference stays in the file name. Made-up data only.

process.env.NODE_ENV = 'test';
process.env.FIELD_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../shared/tourist-visa/engine');
const { buildFacts, TOKEN_SOURCES } = require('../shared/tourist-visa/coverLetterFacts');
const { TouristVisaPdfService } = require('../services/touristVisaPdfService');
const letter = require('../utils/touristVisaCoverLetterPdf');
const { LetterBuilder } = require('../utils/pdf/letterBuilder');
const { buildTemplate } = require('../utils/touristVisaCoverLetterTemplate');
const { substitute } = require('../utils/touristVisaCoverLetterChecks');
const { SYSTEM_PROMPT, RETRY_REMINDER, buildUserPrompt } = require('../config/touristVisaCoverLetterPrompt');
const { LETTER_PAGE } = require('../config/touristVisaPdf');
const { fullAnswers } = require('./helpers/touristVisaFixtures');
const { inspectPdf } = require('./helpers/pdfInspect');

const REFERENCE = 'TV-K7M3QD9R';
const ANY_REFERENCE = /TV-[A-Z0-9]{8}/;
const NOW = new Date('2026-11-18T09:30:00Z');
const SUBMITTED = new Date('2026-11-03T10:00:00Z');
const MARGIN = LETTER_PAGE.margin;

const answers = () => fullAnswers('Testfirst', 'Testlast', 'test.applicant@example.com');
const stored = (a = answers()) => {
  const facts = buildFacts(engine.config, a, { submittedAt: SUBMITTED });
  return substitute(buildTemplate(facts), facts.tokens, facts.redactions);
};

/** The real service with its database parts faked, and a clock that stands still. */
function serviceWith({ text, status = 'approved', stale = false, now = NOW, application = {} } = {}) {
  const audit = [];
  const service = new TouristVisaPdfService({
    admin: { load: async () => ({ _id: 'app1', reference: REFERENCE, status: 'submitted', answers: answers(), ...application }) },
    letters: { findLatestWithText: async () => ({ version: 1, status, text: text || stored() }) },
    letterService: { isStale: async () => stale },
    audit: { append: async (rows) => audit.push(...rows) },
    now: () => now,
  });
  return { service, audit };
}
const linesOf = (pdf) => pdf.pages.flatMap((page) => page.lines.map((line) => line.text));
const allText = (pdf) => linesOf(pdf).join('\n');
/** Everything that could carry a reference: the text of every page, the raw file (metadata included) and the text of the stored letter. */
const assertNoReference = (pdf, where) => {
  assert.doesNotMatch(allText(pdf), ANY_REFERENCE, `${where}: a reference in the text of the pages`);
  assert.equal(pdf.text.includes(REFERENCE), false, `${where}: the reference in the text`);
  assert.equal(pdf.raw.includes(REFERENCE), false, `${where}: the reference in the file`);
  assert.doesNotMatch(allText(pdf), /\bREFERENCE\b/, `${where}: the REFERENCE label`);
};

// ---------------------------------------------------------------------------
// (a) no reference in the letter text or the PDF
// ---------------------------------------------------------------------------

test('the stored letter text (the template) holds no reference, and the letter structure is read without one', () => {
  const text = stored();
  assert.doesNotMatch(text, ANY_REFERENCE);
  assert.equal(text.includes(REFERENCE), false);
  assert.doesNotMatch(text, /\breference\b/i, 'not even the word: the template never mentions one');
});

test('the exported cover letter PDF has no reference on any page, in the footer, in the continuation header or in the metadata; the file name keeps it', async () => {
  const { service } = serviceWith();
  const { buffer, filename } = await service.coverLetterForAdmin('admin1', 'app1');
  const pdf = await inspectPdf(buffer);
  assert.equal(pdf.numPages, 1);
  assertNoReference(pdf, 'one page');
  assert.equal(filename, `${REFERENCE}-cover-letter.pdf`, 'the file name is unchanged: the reference stays in it');
  const footer = pdf.pages[0].items.filter((i) => i.y < MARGIN + LETTER_PAGE.footer.height).map((i) => i.str).join(' ');
  assert.match(footer, /^Prepared by Wiser Consulting\s+Page 1 of 1$/);
});

test('a long letter (two pages), a draft and a stale approval: no reference on any of their pages', async () => {
  const long = [...Array.from({ length: 12 }, () => `${Array.from({ length: 62 }, (_, i) => `visit${i % 7}`).join(' ')}.`), 'Yours faithfully,\nTestfirst Testlast'].join('\n\n');
  for (const [label, options] of [['long', { text: long }], ['draft', { status: 'draft' }], ['stale', { stale: true }], ['long draft', { text: long, status: 'draft' }]]) {
    const { service } = serviceWith(options);
    const { buffer } = await service.coverLetterForAdmin('admin1', 'app1');
    const pdf = await inspectPdf(buffer);
    if (label.startsWith('long')) assert.ok(pdf.numPages >= 2, `${label}: more than one page`);
    assertNoReference(pdf, label);
    // The continuation header carries the sender's name, and every footer says who prepared it, with no reference.
    pdf.pages.forEach((page) => {
      const footer = page.items.filter((i) => i.y < MARGIN + LETTER_PAGE.footer.height).map((i) => i.str).join(' ');
      assert.match(footer, new RegExp(`^Prepared by Wiser Consulting\\s+Page ${page.number} of ${pdf.numPages}$`), `${label}: page ${page.number}`);
    });
  }
});

test('a LetterBuilder never prints a reference, even if a caller passes one; the name is not replaced by one in the continuation header either', async () => {
  const builder = new LetterBuilder({ reference: REFERENCE, applicantName: '', draft: false });
  assert.equal(builder.reference, '');
  builder.abort();
  const model = letter.buildLetterModel({ text: `Dear Sir,\n\nHello.\n\nYours faithfully,\nX`, sender: { name: '', addressLines: [], email: '', phone: '' }, date: NOW, draft: false });
  assert.equal('reference' in model, false, 'the model has no reference');
  assertNoReference(await inspectPdf(await letter.renderCoverLetterPdf(model)), 'no sender name');
});

// ---------------------------------------------------------------------------
// (b) the date line
// ---------------------------------------------------------------------------

test('the date line is the export date (a fixed clock), in UK long form, on its own line under the letterhead at the left margin', async () => {
  const { service } = serviceWith({ now: new Date('2026-11-18T09:30:00Z') });
  const pdf = await inspectPdf((await service.coverLetterForAdmin('admin1', 'app1')).buffer);
  const page = pdf.pages[0];
  const date = page.items.find((i) => i.str === '18 November 2026');
  assert.ok(date, `the date is printed: ${linesOf(pdf).slice(0, 6).join(' | ')}`);
  assert.ok(Math.abs(date.x - MARGIN) < 1.5, 'at the left margin, like the body');
  const salutation = page.items.find((i) => i.str === 'Dear Entry Clearance Officer,');
  assert.ok(salutation && date.y > salutation.y, 'above the salutation');
  const contact = page.items.find((i) => i.str.includes('@'));
  assert.ok(!contact || date.y < contact.y, 'under the letterhead');
  assert.equal(page.lines.filter((l) => Math.abs(l.y - date.y) < 1).length, 1);
  assert.equal(page.lines.find((l) => Math.abs(l.y - date.y) < 1).text, '18 November 2026', 'nothing else on the date line');
});

test('the date follows the clock, not the stored version: another day prints another date, in London time', async () => {
  for (const [moment, printed] of [
    ['2026-12-01T00:00:00Z', '1 December 2026'],
    ['2026-11-30T23:59:00Z', '30 November 2026'],
    ['2027-03-09T08:00:00Z', '9 March 2027'],
  ]) {
    const { service } = serviceWith({ now: new Date(moment) });
    const pdf = await inspectPdf((await service.coverLetterForAdmin('admin1', 'app1')).buffer);
    assert.ok(linesOf(pdf).includes(printed), `${moment} prints ${printed}`);
  }
});

test('exporting does not change the stored letter or the audit rule: the row still says pdf_export, version and approval', async () => {
  const { service, audit } = serviceWith();
  await service.coverLetterForAdmin('admin1', 'app1');
  assert.equal(audit.length, 1);
  assert.deepEqual([audit[0].action, audit[0].pdfType, audit[0].version, audit[0].pdfApproved], ['pdf_export', 'cover_letter', 1, true]);
});

// ---------------------------------------------------------------------------
// (c) the one-page fit still works with the date line
// ---------------------------------------------------------------------------

const para = (lines) => `${Array.from({ length: lines * 11 - 1 }, (_, i) => `visit${i % 7}`).join(' ')}.`;
const letterOf = (extra) => [para(4), para(4), para(4), para(3), ...(extra ? [para(extra)] : []), 'Yours faithfully,\nAisha Khan-Reynolds'].join('\n\n');
const SENDER = { name: 'Aisha Khan-Reynolds', addressLines: ['12 Sample Road', 'Karachi', 'Pakistan'], email: 'aisha@example.com', phone: '+44 7700 900123' };
const modelOf = (text, over = {}) => letter.buildLetterModel({ text, sender: SENDER, date: NOW, draft: false, ...over });

test('a letter that fits on one page with the date line still does, at the nominal setting; one that needed tightening still fits after it', async () => {
  let e = 1;
  while (letter.fitOf(modelOf(letterOf(e + 1))).index === 0) e += 1; // the most extra lines that fit untouched
  const exact = await inspectPdf(await letter.renderCoverLetterPdf(modelOf(letterOf(e))));
  assert.equal(exact.numPages, 1, 'the longest letter that fits at the nominal setting');
  assert.ok(linesOf(exact).includes('18 November 2026'));

  const tightened = modelOf(letterOf(e + 1));
  const fit = letter.fitOf(tightened);
  assert.ok(fit && fit.index >= 1, 'one more line needs a tightening step');
  const one = await inspectPdf(await letter.renderCoverLetterPdf(tightened));
  assert.equal(one.numPages, 1, 'tightened onto one page');
  assert.ok(linesOf(one).includes('18 November 2026'));
  assertNoReference(one, 'tightened');

  const tooLong = await inspectPdf(await letter.renderCoverLetterPdf(modelOf(letterOf(e + 14))));
  assert.ok(tooLong.numPages >= 2, 'a letter that cannot fit even tightened flows to two pages');
});

test('the layout above the body is fixed: the date, the addressee two lines under it, the salutation two lines further down', async () => {
  // Measured (same sender, same text), from the bottom of the page: the date at y 657.72 (where it was before the reference was removed); the
  // addressee block starts 40.5 pt under it (the old salutation spot, less its paragraph gap); two lines of 18 pt; then the usual 12 pt
  // paragraph gap and the salutation at 569.2 (the old salutation moved down by exactly the two lines of the addressee block).
  // If these move, a letter that fits on one page could spill onto a second.
  const pdf = await inspectPdf(await letter.renderCoverLetterPdf(modelOf(letterOf(0))));
  const page = pdf.pages[0];
  const find = (str) => page.items.find((i) => i.str === str);
  const [date, first, second, salutation] = ['18 November 2026', 'The Entry Clearance Officer', 'UK Visas and Immigration', 'Dear Entry Clearance Officer,'].map(find);
  assert.ok(date && first && second && salutation, 'all four lines are printed');
  assert.ok(Math.abs(date.y - 657.72) < 0.1, `the date line: ${date.y}`);
  assert.ok(Math.abs(first.y - 617.2) < 0.1, `the first addressee line: ${first.y}`);
  assert.ok(Math.abs(second.y - 599.2) < 0.1, `the second addressee line: ${second.y}`);
  assert.ok(Math.abs(salutation.y - 569.2) < 0.1, `the salutation: ${salutation.y}`);
  for (const item of [first, second, salutation]) assert.ok(Math.abs(item.x - MARGIN) < 1.5, 'left-aligned with the body');
});

// ---------------------------------------------------------------------------
// The salutation and the addressee block, printed by the PDF
// ---------------------------------------------------------------------------

const textOfPdf = async (text, over = {}) => allText(await inspectPdf(await letter.renderCoverLetterPdf(modelOf(text, over))));

test('the PDF prints the addressee block, then "Dear Entry Clearance Officer,", then the stored text; the closing is still "Yours faithfully,"', async () => {
  const lines = linesOf(await inspectPdf(await letter.renderCoverLetterPdf(modelOf(letterOf(0)))));
  const at = (text) => lines.indexOf(text);
  assert.ok(at('18 November 2026') >= 0);
  assert.deepEqual(lines.slice(at('18 November 2026') + 1, at('18 November 2026') + 4), ['The Entry Clearance Officer', 'UK Visas and Immigration', 'Dear Entry Clearance Officer,'], 'date, addressee, salutation, in that order');
  assert.ok(lines[at('Dear Entry Clearance Officer,') + 1].startsWith('visit'), 'the stored text follows the salutation');
  assert.equal(lines[lines.indexOf('Yours faithfully,') + 1], 'Aisha Khan-Reynolds');
  assert.equal(lines.filter((l) => /^Dear\b/.test(l)).length, 1, 'one salutation');
  assert.equal(lines.filter((l) => l === 'Dear Sir or Madam,').length, 0);
});

test('a letter saved earlier that begins with its own greeting keeps it: no second salutation is printed, the addressee block is', async () => {
  const old = `Dear Sir or Madam,\n\n${letterOf(0)}`;
  const model = modelOf(old);
  assert.equal(model.ownGreeting, true);
  assert.equal(model.salutation, 'Dear Sir or Madam,');
  const lines = linesOf(await inspectPdf(await letter.renderCoverLetterPdf(model)));
  assert.equal(lines.filter((l) => /^Dear\b/.test(l)).length, 1, 'exactly one Dear line');
  assert.deepEqual(lines.slice(lines.indexOf('The Entry Clearance Officer'), lines.indexOf('The Entry Clearance Officer') + 3), ['The Entry Clearance Officer', 'UK Visas and Immigration', 'Dear Sir or Madam,'], 'the old greeting under the new addressee block');
  assert.equal(lines.includes('Dear Entry Clearance Officer,'), false);
  // A new letter is not an "old" one.
  const fresh = modelOf(letterOf(0));
  assert.equal(fresh.ownGreeting, false);
  assert.equal(fresh.salutation, 'Dear Entry Clearance Officer,');
  assert.deepEqual(fresh.blocks[0], ['Dear Entry Clearance Officer,']);
  assert.deepEqual(fresh.addressee, ['The Entry Clearance Officer', 'UK Visas and Immigration']);
});

test('the draft banner, the stale banner and a long letter keep the new block: salutation once, addressee once, on page one only', async () => {
  const long = [...Array.from({ length: 12 }, () => para(5)), 'Yours faithfully,\nAisha Khan-Reynolds'].join('\n\n');
  for (const [label, over] of [['draft', { draft: true }], ['stale', { draft: true, stale: true }]]) {
    const text = await textOfPdf(letterOf(0), over);
    assert.equal((text.match(/Dear Entry Clearance Officer,/g) || []).length, 1, label);
    assert.equal((text.match(/The Entry Clearance Officer/g) || []).length, 1, label);
    assert.match(text, label === 'stale' ? /ANSWERS CHANGED SINCE APPROVAL/ : /NOT APPROVED/);
  }
  const pdf = await inspectPdf(await letter.renderCoverLetterPdf(modelOf(long)));
  assert.ok(pdf.numPages >= 2);
  assert.equal(pdf.pages.slice(1).some((p) => p.lines.some((l) => /Entry Clearance Officer|UK Visas/.test(l.text))), false, 'not repeated on later pages');
});

test('the Latin-only rule still stops text the fonts cannot print, in the letter text; the fixed addressee and salutation are always printable', () => {
  const arabic = String.fromCodePoint(0x645, 0x631, 0x62d, 0x628, 0x627);
  assert.equal(letter.unprintableIn(modelOf(`${arabic} text.\n\nYours faithfully,\nX`)), 'letter');
  assert.equal(letter.unprintableIn(modelOf(letterOf(0))), null);
});

// ---------------------------------------------------------------------------
// The date is the day in London (BST in summer)
// ---------------------------------------------------------------------------

test('the date is the London day: 23:30 UTC in summer (BST) is the NEXT day, in winter (GMT) the same day', async () => {
  for (const [moment, printed] of [
    ['2026-07-15T23:30:00Z', '16 July 2026'],
    ['2026-07-15T22:59:00Z', '15 July 2026'],
    ['2026-11-18T23:30:00Z', '18 November 2026'],
    ['2026-12-31T23:30:00Z', '31 December 2026'],
    ['2026-06-30T23:30:00Z', '1 July 2026'],
  ]) {
    const { service } = serviceWith({ now: new Date(moment) });
    const pdf = await inspectPdf((await service.coverLetterForAdmin('admin1', 'app1')).buffer);
    assert.ok(linesOf(pdf).includes(printed), `${moment} prints ${printed}`);
    assert.equal(linesOf(pdf).filter((l) => /^\d{1,2} [A-Z][a-z]+ \d{4}$/.test(l)).length, 1, 'one date line');
  }
});

// ---------------------------------------------------------------------------
// (d) the AI never sees or is asked for a reference
// ---------------------------------------------------------------------------

test('the facts and the prompt the AI sees contain no reference: no TV- number, and no placeholder or source for one', () => {
  const a = answers();
  const facts = buildFacts(engine.config, a, { submittedAt: SUBMITTED });
  const prompt = buildUserPrompt(facts.text, { retry: false });
  const retry = buildUserPrompt(facts.text, { retry: true });
  for (const [label, text] of [['facts', facts.text], ['user prompt', prompt], ['retry prompt', retry], ['system prompt', SYSTEM_PROMPT], ['retry reminder', RETRY_REMINDER]]) {
    assert.doesNotMatch(text, ANY_REFERENCE, label);
    assert.equal(text.includes(REFERENCE), false, label);
  }
  assert.doesNotMatch(facts.text, /\breference\b/i, 'the facts never mention a reference (the instructions only tell the AI not to add one)');
  assert.ok(/Do not add a date, an address or a reference number/.test(SYSTEM_PROMPT), 'and the AI is told not to write a date or a reference');
  assert.deepEqual(Object.keys(TOKEN_SOURCES).sort(), ['EMPLOYER', 'NAME', 'SCHOOL'], 'no placeholder for a reference');
  assert.deepEqual(Object.keys(facts.tokens).filter((k) => /ref/i.test(k)), []);
});

test('even an application that has a reference passes it nowhere into the facts: the facts are built from the answers alone', () => {
  const withReference = { ...answers(), reference: REFERENCE, q5_8: 'My application number is not part of this.' };
  const facts = buildFacts(engine.config, withReference, { submittedAt: SUBMITTED });
  assert.equal(JSON.stringify(facts).includes(REFERENCE), false);
});
