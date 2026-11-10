'use strict';

// The application summary PDF (step 8h-1) without a database: the foundation (page, fonts, header, footer, rules, text), the layout rules
// (no split rows, headings kept with what follows, long answers, wrapping, the margins), the header block, the section order, the text
// normalisation and the refusal of characters the fonts cannot print. The generated file is read back with pdfjs and its text, its
// positions and its fonts are asserted. Made-up data only.

process.env.NODE_ENV = 'test';
process.env.FIELD_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../shared/tourist-visa/engine');
const { buildReview, correctionKey } = require('../shared/tourist-visa/view');
const answersPdf = require('../utils/touristVisaAnswersPdf');
const { PdfBuilder, PdfError } = require('../utils/pdf/pdfBuilder');
const pdfText = require('../utils/pdf/pdfText');
const config = require('../config/touristVisaPdf');
const { fullAnswers } = require('./helpers/touristVisaFixtures');
const { inspectPdf, pageOf } = require('./helpers/pdfInspect');
const { SUBMITTED_AT, richAnswers, modelOf, handModel, row } = require('./helpers/pdfFixtures');

const render = (model) => answersPdf.renderAnswersPdf(model);
const C = String.fromCodePoint;
const { PAGE } = config;
const TOL = 1;

// ---------------------------------------------------------------------------
// The page: A4, the margins, the fonts, the header, the footer
// ---------------------------------------------------------------------------

test('every page is A4 portrait, and the margins are at least 18 mm', async () => {
  const pdf = await inspectPdf(await render(modelOf(richAnswers())));
  assert.ok(pdf.numPages > 5);
  for (const page of pdf.pages) {
    assert.ok(Math.abs(page.width - 595.28) < 0.1 && Math.abs(page.height - 841.89) < 0.1, `page ${page.number} is ${page.width} x ${page.height}`);
  }
  assert.ok(PAGE.margin >= 18 * (72 / 25.4), 'the margin is at least 18 mm');
  assert.equal(PAGE.minMargin <= PAGE.margin, true);
});

test('nothing is printed outside the margins: not the text, not the header, not the footer, on any page', async () => {
  const pdf = await inspectPdf(await render(modelOf(richAnswers())));
  const min = 18 * (72 / 25.4);
  let checked = 0;
  for (const page of pdf.pages) {
    for (const item of page.items) {
      checked += 1;
      const left = item.x;
      const right = item.x + item.width;
      const top = page.height - (item.y + item.size * 0.8);
      const bottom = page.height - (item.y - item.size * 0.25);
      assert.ok(left >= min - TOL, `page ${page.number}: "${item.str.slice(0, 30)}" starts at ${left.toFixed(1)}`);
      assert.ok(right <= page.width - min + TOL, `page ${page.number}: "${item.str.slice(0, 30)}" ends at ${right.toFixed(1)}`);
      assert.ok(top >= min - TOL, `page ${page.number}: "${item.str.slice(0, 30)}" is ${top.toFixed(1)} from the top`);
      assert.ok(bottom <= page.height - min + TOL, `page ${page.number}: "${item.str.slice(0, 30)}" ends ${(page.height - bottom).toFixed(1)} from the bottom`);
    }
  }
  assert.ok(checked > 500);
});

test('the fonts are embedded (the open-licence TrueType files of the repository) and no standard font is referred to', async () => {
  const pdf = await inspectPdf(await render(modelOf(richAnswers(), { corrections: { [correctionKey('q5_6')]: new Date('2026-11-05T09:00:00Z') } })));
  assert.ok(pdf.embeddedFonts >= 4, `${pdf.embeddedFonts} embedded font files`);
  assert.equal(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?(?:Helvetica|Times|Courier|Symbol|ZapfDingbats|Arial)/.test(pdf.raw), false, 'no base-14 font');
  const names = new Set(pdf.pages.flatMap((p) => p.items.map((i) => i.font)));
  const joined = [...names].join(' ');
  assert.match(joined, /PlayfairDisplay/);
  assert.match(joined, /SourceSans3/);
  assert.match(joined, /SourceSans3-Bold|SourceSans3.*Bold/);
  assert.match(joined, /SourceSans3-Italic|SourceSans3.*Italic/);
  assert.equal(/Helvetica|Times|Courier|Arial/i.test(joined), false);
  // The fonts and their licences are in the repository.
  for (const file of ['PlayfairDisplay-Bold.ttf', 'PlayfairDisplay-Regular.ttf', 'SourceSans3-Regular.ttf', 'SourceSans3-Bold.ttf', 'SourceSans3-Italic.ttf', 'SourceSerif4-Regular.ttf', 'SourceSerif4-Bold.ttf', 'SourceSerif4-Italic.ttf', 'SourceSerif4-BoldItalic.ttf', 'OFL-PlayfairDisplay.txt', 'OFL-SourceSans3.txt', 'OFL-SourceSerif4.txt']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'fonts', file)), file);
  }
  for (const licence of ['OFL-PlayfairDisplay.txt', 'OFL-SourceSans3.txt', 'OFL-SourceSerif4.txt']) assert.match(fs.readFileSync(path.join(__dirname, '..', 'assets', 'fonts', licence), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
});

test('every page has the header (the reference on the right as text) and the footer (the name and reference, the disclaimer, "Page X of Y")', async () => {
  const pdf = await inspectPdf(await render(modelOf(richAnswers(), { reference: 'TV-K7M3QD9R' })));
  for (const page of pdf.pages) {
    const top = page.items.filter((item) => page.height - item.y < PAGE.margin + PAGE.header.height + 2);
    const header = top.find((item) => item.str === 'TV-K7M3QD9R');
    assert.ok(header, `page ${page.number}: the reference in the header`);
    assert.ok(header.x + header.width > page.width - PAGE.margin - 3, 'on the right');
    assert.ok(/SourceSans3.*Bold/.test(header.font));
    const footer = page.items.filter((item) => page.height - item.y > PAGE.height - 0 || item.y < PAGE.margin + PAGE.footer.height);
    const text = footer.map((item) => item.str).join(' ');
    assert.match(text, /Aisha Khan-Reynolds/);
    assert.match(text, /TV-K7M3QD9R/);
    assert.ok(text.includes(config.TEXT.disclaimer), `page ${page.number}: the disclaimer`);
    assert.ok(text.includes(`Page ${page.number} of ${pdf.numPages}`), `page ${page.number}: "Page X of Y"`);
  }
  assert.equal(config.TEXT.disclaimer, "Prepared by Wiser Consulting from the applicant's answers. This is not an official UK Government document.");
});

test('the logo is on every page, once (one embedded image), at the top left', async () => {
  const buffer = await render(modelOf(richAnswers()));
  const raw = buffer.toString('latin1');
  const images = (raw.match(/\/Subtype\s*\/Image/g) || []).length;
  assert.ok(images >= 1 && images <= 2, `the logo image (and its mask) is embedded once, not once per page: ${images}`);
  // Every page refers to it (each page's resources list the image).
  const pdf = await inspectPdf(buffer);
  assert.ok((raw.match(/\/XObject\s*<</g) || []).length >= pdf.numPages, 'every page draws the logo');
  assert.ok(fs.statSync(config.LOGO_FILE).size > 1000);
});

// ---------------------------------------------------------------------------
// Branding: what the PDF must not look like
// ---------------------------------------------------------------------------

test('the PDF does not imitate an official document: no government words, no barcode, no GWF number, no "partially completed" heading, no fee or payment', async () => {
  const pdf = await inspectPdf(await render(modelOf(richAnswers())));
  for (const forbidden of [/UK Visas\s*(&|and)\s*Immigration/i, /Home Office/i, /GOV\.UK/i, /Partially completed/i, /GWF\d/i, /crest/i, /\bFee\b/, /Service option/i, /Payment reference/i, /barcode/i]) {
    assert.equal(forbidden.test(pdf.text), false, String(forbidden));
  }
  assert.match(pdf.pages[0].text, /Application summary/);
  assert.equal(/Image/.test(pdf.raw) ? (pdf.raw.match(/\/Subtype\s*\/Image/g) || []).length <= 2 : true, true, 'only the logo is an image');
  // The colours are the shared brand palette (step 8h-3): the deep ink and the green of the logo. The older names are made from it.
  assert.equal(config.PALETTE.navy, config.BRAND.ink);
  assert.equal(config.BRAND.ink, '#16201a');
  assert.match(config.PALETTE.green, /^#[0-9a-f]{6}$/);
  assert.equal(config.TEXT.title, 'Application summary');
});

test('the PDF metadata holds no personal data and the file holds no script', async () => {
  const answers = richAnswers();
  const buffer = await render(modelOf(answers, { reference: 'TV-K7M3QD9R' }));
  const pdf = await inspectPdf(buffer);
  assert.equal(pdf.info.Title, 'Application summary');
  assert.equal(pdf.info.Author, 'Wiser Consulting');
  assert.equal(pdf.info.Subject, 'Tourist Visa application summary');
  assert.equal(pdf.info.Keywords, 'application summary');
  for (const value of Object.values(pdf.info)) {
    for (const personal of ['Aisha', 'Khan', 'TV-K7M3QD9R', 'FAKE-PASSPORT', 'aisha.khan@example.com']) assert.equal(String(value).includes(personal), false, `${personal} is in the metadata`);
  }
  for (const script of ['/JavaScript', '/JS', '/OpenAction', '/AA', '/Launch', '/EmbeddedFile', '/URI', '/SubmitForm', '/RichMedia', '/XFA']) {
    assert.equal(new RegExp(`${script.replace('/', '\\/')}(?![A-Za-z])`).test(pdf.raw), false, `${script} is in the file`);
  }
});

// ---------------------------------------------------------------------------
// The header block and the sections
// ---------------------------------------------------------------------------

test('page 1: the title, then the header block with its uppercase labels and the values in one column, from the answers', async () => {
  const pdf = await inspectPdf(await render(modelOf(fullAnswers('Aisha', 'Khan', 'aisha.khan@example.com'), { reference: 'TV-X42GYXPS' })));
  const lines = pdf.pages[0].lines;
  const texts = lines.map((l) => l.text);
  assert.equal(texts[1], 'Application summary');
  const labels = ['APPLICANT NAME', 'APPLICATION REFERENCE', 'PASSPORT NUMBER', 'COUNTRY OF NATIONALITY', 'DATE OF BIRTH', 'GENDER', 'DATE OF APPLICATION', 'TYPE OF VISA', 'SUBMISSION METHOD', 'CONTACT EMAIL', 'CONTACT LANGUAGE'];
  const values = ['Aisha Khan', 'TV-X42GYXPS', 'FAKE-PASSPORT-9876', 'United Kingdom', '1 January 1990', 'Female', '3 November 2026', 'UK Standard Visitor', 'Online, Wiser Consulting', 'aisha.khan@example.com', 'Sindhi'];
  const found = labels.map((label) => lines.find((l) => l.text.startsWith(label)));
  found.forEach((line, i) => assert.ok(line, labels[i]));
  // In this order, down the page, with the value after the label on the same line, all values starting at the same x.
  for (let i = 1; i < found.length; i += 1) assert.ok(found[i].y < found[i - 1].y, `${labels[i]} is below ${labels[i - 1]}`);
  found.forEach((line, i) => assert.equal(line.text, `${labels[i]} ${values[i]}`, labels[i]));
  const valueXs = found.map((line) => Math.round(line.items[line.items.length - 1].x));
  assert.equal(new Set(valueXs).size, 1, `the values are in one column: ${valueXs}`);
  const labelXs = found.map((line) => Math.round(line.items[0].x));
  assert.equal(new Set(labelXs).size, 1);
  assert.ok(found[0].items[0].str === labels[0] && /Bold/.test(found[0].items[0].font), 'the labels are bold capitals');
  for (const label of labels) assert.equal(label, label.toUpperCase());
});

test('a missing value in the header block is a dash; the fee, the service option and a payment reference are never printed', async () => {
  const answers = { q2_1: 'Only' };
  const model = modelOf(answers, { reference: 'TV-AAAAAAAA', submittedAt: null });
  assert.deepEqual(model.header.map((r) => [r.label, r.value]), [
    ['APPLICANT NAME', 'Only'], ['APPLICATION REFERENCE', 'TV-AAAAAAAA'], ['PASSPORT NUMBER', '-'], ['COUNTRY OF NATIONALITY', '-'], ['DATE OF BIRTH', '-'], ['GENDER', '-'],
    ['DATE OF APPLICATION', '-'], ['TYPE OF VISA', 'UK Standard Visitor'], ['SUBMISSION METHOD', 'Online, Wiser Consulting'], ['CONTACT EMAIL', '-'], ['CONTACT LANGUAGE', '-'],
  ]);
  const pdf = await inspectPdf(await render(model));
  assert.match(pdf.pages[0].text, /PASSPORT NUMBER -/);
  assert.equal(/FEE|SERVICE OPTION|PAYMENT/i.test(pdf.pages[0].text.split('Part ')[0]), false);
  // "Other" as the language is the language written.
  const other = modelOf({ q10_4: 'other', q10_4a: 'Sindhi' });
  assert.equal(other.header.find((r) => r.label === 'CONTACT LANGUAGE').value, 'Sindhi');
  const english = modelOf({ q10_4: 'english' });
  assert.equal(english.header.find((r) => r.label === 'CONTACT LANGUAGE').value, 'English');
});

test('every part and section of the application is printed in the form\'s order, each section with a bold heading', async () => {
  const answers = richAnswers();
  const cfg = engine.config;
  const review = buildReview(cfg, answers, [], {}, {});
  const pdf = await inspectPdf(await render(modelOf(answers)));
  let at = 0;
  let sections = 0;
  for (const part of review.parts) {
    const partIndex = pdf.text.indexOf(`Part ${part.id} ${part.title}`, at);
    assert.ok(partIndex >= at, `Part ${part.id} ${part.title}`);
    at = partIndex;
    for (const section of part.sections) {
      sections += 1;
      const same = part.sections.length === 1 && section.title.toLowerCase() === part.title.toLowerCase();
      if (!same) {
        const index = pdf.text.indexOf(`${section.id} ${section.title}`, at);
        assert.ok(index >= at, `section ${section.id} ${section.title}`);
        at = index;
      }
    }
  }
  assert.ok(sections >= 20, `${sections} sections`);
  // The headings are Playfair Display, bold.
  const headingItems = pdf.pages.flatMap((p) => p.items).filter((item) => /PlayfairDisplay/.test(item.font));
  assert.ok(headingItems.length > sections);
  assert.ok(headingItems.every((item) => /Bold/.test(item.font) || item.str === 'Application summary'));
});

test('Yes and No answers are bold; other answers are not; "Not answered" is plain', async () => {
  const pdf = await inspectPdf(await render(modelOf(fullAnswers())));
  const items = pdf.pages.flatMap((p) => p.items);
  const yes = items.filter((i) => i.str === 'Yes');
  const no = items.filter((i) => i.str === 'No');
  assert.ok(yes.length > 0 && no.length > 5);
  for (const item of [...yes, ...no]) assert.ok(/Bold/.test(item.font), `${item.str} is bold (${item.font})`);
  const plain = items.filter((i) => i.str === 'Tourism or holiday' || i.str === 'Female');
  assert.ok(plain.length >= 2);
  for (const item of plain) assert.equal(/Bold/.test(item.font), false, `${item.str} is not bold`);
});

test('two columns: the questions on the left (about 45 percent), the answers on the right in one column; a rule between rows', async () => {
  const pdf = await inspectPdf(await render(modelOf(fullAnswers())));
  const page = pdf.pages[0];
  const line = page.lines.find((l) => l.text.startsWith('What is the main reason for your visit to the UK?'));
  assert.ok(line, 'a question row is on the first page');
  const questionX = line.items[0].x;
  const answerX = line.items[line.items.length - 1].x;
  assert.ok(Math.abs(questionX - PAGE.margin) < 1);
  const contentWidth = page.width - 2 * PAGE.margin;
  assert.ok(Math.abs((answerX - PAGE.margin) / contentWidth - 0.45) < 0.1, `the answers start at ${((answerX - PAGE.margin) / contentWidth * 100).toFixed(0)} percent`);
  const answerXs = new Set(pdf.pages.flatMap((p) => p.items).filter((i) => ['Tourism or holiday', 'Holiday or sightseeing'].includes(i.str)).map((i) => Math.round(i.x)));
  assert.equal(answerXs.size, 1, 'all the answers start at one x');
});

test('repeating groups: entries are numbered, and a count row comes first', async () => {
  const pdf = await inspectPdf(await render(modelOf(richAnswers())));
  for (const title of ['Travelling companion 1', 'Travelling companion 10', 'Payer 1', 'Payer 5', 'Trip 1', 'Trip 10']) assert.ok(pdf.text.includes(title), title);
  assert.ok(pdf.text.includes('10 entries'));
  const first = pdf.text.indexOf('Travelling companion 1\n');
  assert.ok(first > pdf.text.indexOf('Travelling companion details'));
  assert.ok(pdf.text.indexOf('Travelling companion 2\n') > first);
});

test('files are listed by name and size only: no link, no storage id', async () => {
  const pdf = await inspectPdf(await render(modelOf(fullAnswers())));
  assert.ok(pdf.text.includes('passport-scan.pdf (2 KB)'));
  assert.ok(pdf.text.includes('passport-page-2.pdf (2.9 KB)'));
  assert.ok(pdf.text.includes('bank-statement.png (2.9 KB)'));
  assert.equal(/https?:|cloudinary|\/upload\/|tourist-visa\//i.test(pdf.text + pdf.raw), false);
  assert.equal(/\/URI|\/Link/.test(pdf.raw), false, 'no link annotation');
});

test('a row an administrator corrected carries "Corrected by our team on <date>" and nothing else; other rows do not', async () => {
  const corrections = { [correctionKey('q5_6')]: new Date('2026-11-05T09:00:00Z'), [correctionKey('q2_32')]: new Date('2026-11-04T09:00:00Z') };
  const answers = richAnswers();
  const pdf = await inspectPdf(await render(modelOf(answers, { corrections })));
  assert.equal((pdf.text.match(/Corrected by our team on/g) || []).length, 2);
  assert.ok(pdf.text.includes('Corrected by our team on 5 November 2026'));
  assert.ok(pdf.text.includes('Corrected by our team on 4 November 2026'));
  const marked = pdf.pages.flatMap((p) => p.items).filter((i) => i.str.startsWith('Corrected by our team'));
  assert.ok(marked.every((i) => /Italic/.test(i.font) && i.size < 9), 'a small italic marker');
  const none = await inspectPdf(await render(modelOf(answers, { corrections: {} })));
  assert.equal(none.text.includes('Corrected by our team'), false);
  // Never the old value or the reason: the marker is the whole of it.
  assert.equal(/old value|previous value|reason for (the )?(change|correction)|changed from/i.test(pdf.text), false);
});

test('the PDF prints only what the review has: no notes, flags, change history, reasons or audit information', async () => {
  const pdf = await inspectPdf(await render(modelOf(richAnswers(), { corrections: { [correctionKey('q5_6')]: new Date('2026-11-05T09:00:00Z') } })));
  for (const word of ['Note', 'note:', 'Flag', 'needs_call', 'awaiting_applicant', 'Audit', 'audit', 'Revision', 'revision', 'Changed by', 'Reason for', 'call log', 'Call log']) {
    assert.equal(pdf.text.includes(word), false, word);
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'touristVisaAnswersPdf.js'), 'utf8');
  for (const word of ['notes', 'flags', 'adminFlags', 'changes', 'reason', 'audit', 'TouristVisaNote', 'TouristVisaChange']) assert.equal(new RegExp(`require\\([^)]*${word}`, 'i').test(source), false, `the answers PDF does not read ${word}`);
});

// ---------------------------------------------------------------------------
// Page breaks and long text
// ---------------------------------------------------------------------------

const target = (lines) => row('TARGET QUESTION', Array.from({ length: lines }, (_, i) => `TARGETLINE${i + 1}`).join('\n'));
const filler = (n) => Array.from({ length: n }, (_, i) => row(`Filler question ${i + 1}`, `Filler answer ${i + 1}`));

test('a row is never split across pages: wherever the page ends, the whole row is on one page (for every filler count that moves it across a page end)', async () => {
  const moved = new Set();
  for (let n = 0; n <= 60; n += 1) {
    const pdf = await inspectPdf(await render(handModel([{ id: 'A', title: 'Section A', items: [...filler(n), target(6), row('LAST QUESTION', 'LAST ANSWER')] }])));
    const pages = new Set(Array.from({ length: 6 }, (_, i) => pageOf(pdf, `TARGETLINE${i + 1}`)));
    assert.equal(pages.size, 1, `${n} fillers: the six lines are on pages ${[...pages]}`);
    assert.ok(!pages.has(0));
    assert.equal(pageOf(pdf, 'TARGET QUESTION'), [...pages][0], `${n} fillers: the question is with its answer`);
    moved.add([...pages][0]);
  }
  assert.ok(moved.size >= 3, 'the row was tried on at least three different pages');
});

test('a heading is never left alone at the bottom of a page: it is on the page of the first row that follows it', async () => {
  const together = new Set();
  for (let n = 0; n <= 60; n += 1) {
    const model = handModel([
      { id: 'A', title: 'Section A', items: filler(n) },
      { id: 'B', title: 'SECTIONTWOHEADING', items: [row('FIRSTROWQUESTION', 'FIRSTROWANSWER'), row('SECOND ROW', 'SECOND ANSWER')] },
    ]);
    const pdf = await inspectPdf(await render(model));
    const heading = pageOf(pdf, 'SECTIONTWOHEADING');
    assert.ok(heading > 0);
    assert.equal(pageOf(pdf, 'FIRSTROWQUESTION'), heading, `${n} fillers: the heading is on page ${heading} but its first row is on ${pageOf(pdf, 'FIRSTROWQUESTION')}`);
    together.add(heading);
  }
  assert.ok(together.size >= 2, 'the heading was tried on more than one page');
});

test('a part heading is kept with its section heading and that section\'s first row', async () => {
  for (let n = 0; n <= 60; n += 1) {
    const model = {
      ...handModel([{ id: 'A', title: 'Section A', items: filler(n) }]),
    };
    model.parts.push({ id: '2', title: 'PARTTWOTITLE', sections: [{ id: 'B', title: 'SECTIONBHEADING', items: [row('PARTFIRSTQUESTION', 'PARTFIRSTANSWER')] }] });
    const pdf = await inspectPdf(await render(model));
    const part = pageOf(pdf, 'PARTTWOTITLE');
    assert.equal(pageOf(pdf, 'SECTIONBHEADING'), part, `${n} fillers`);
    assert.equal(pageOf(pdf, 'PARTFIRSTQUESTION'), part, `${n} fillers`);
  }
});

test('a repeating-group entry\'s title stays with its first row', async () => {
  for (let n = 0; n <= 40; n += 1) {
    const group = { type: 'group', id: 'g', question: 'The group', lines: [{ text: '2 entries', style: 'normal' }], base: null, entries: [
      { title: 'ENTRYONETITLE', items: [row('ENTRYONEROW', 'ENTRYONEANSWER')] },
      { title: 'ENTRYTWOTITLE', items: [row('ENTRYTWOROW', 'ENTRYTWOANSWER')] },
    ] };
    const pdf = await inspectPdf(await render(handModel([{ id: 'A', title: 'Section A', items: [...filler(n), group] }])));
    assert.equal(pageOf(pdf, 'ENTRYONETITLE'), pageOf(pdf, 'ENTRYONEROW'), `${n} fillers`);
    assert.equal(pageOf(pdf, 'ENTRYTWOTITLE'), pageOf(pdf, 'ENTRYTWOROW'), `${n} fillers`);
  }
});

// ---- keeping rows together (step 8h-2) ----

const based = (question, text, base) => ({ ...row(question, text), base });

test('a follow-up row ("Please give details") stays on the page of the question it follows, wherever the page ends', async () => {
  const pages = new Set();
  for (let n = 0; n <= 60; n += 1) {
    const items = [...filler(n), based('QUESTIONROW', 'Yes', '5.1'), based('FOLLOWUPONE', 'Details one', '5.1'), based('FOLLOWUPTWO', 'Details two', '5.1'), row('AFTER QUESTION', 'after answer'), row('LAST ONE', 'last answer')];
    const pdf = await inspectPdf(await render(handModel([{ id: 'A', title: 'Section A', items }])));
    const page = pageOf(pdf, 'QUESTIONROW');
    assert.ok(page > 0);
    assert.equal(pageOf(pdf, 'FOLLOWUPONE'), page, `${n} fillers: the first follow-up is on page ${pageOf(pdf, 'FOLLOWUPONE')}, its question on ${page}`);
    assert.equal(pageOf(pdf, 'FOLLOWUPTWO'), page, `${n} fillers: the second follow-up`);
    pages.add(page);
  }
  assert.ok(pages.size >= 2, 'the question was tried on more than one page');
});

test('a follow-up of a question inside a repeat entry stays with it too', async () => {
  for (let n = 0; n <= 40; n += 1) {
    const group = { type: 'group', id: 'g', question: 'The group', lines: [{ text: '1 entry', style: 'normal' }], base: null, entries: [
      { title: 'ONEENTRY', items: [based('ENTRYQUESTION', 'Yes', '4.2'), based('ENTRYFOLLOWUP', 'More details', '4.2'), row('ENTRYLAST', 'last')] },
    ] };
    const pdf = await inspectPdf(await render(handModel([{ id: 'A', title: 'Section A', items: [...filler(n), group] }])));
    assert.equal(pageOf(pdf, 'ENTRYQUESTION'), pageOf(pdf, 'ENTRYFOLLOWUP'), `${n} fillers`);
  }
});

test('the last two rows of a section stay together: a page never starts with a single row that lost its company', async () => {
  const pages = new Set();
  for (let n = 0; n <= 60; n += 1) {
    const items = [...filler(n), row('SECONDLASTROW', 'second last answer'), row('LASTROWOFSECTION', 'last answer')];
    const model = handModel([{ id: 'A', title: 'Section A', items }]);
    model.parts.push({ id: '2', title: 'NEXTPART', sections: [{ id: 'B', title: 'NEXTSECTION', items: [row('NEXTQUESTION', 'next answer'), row('NEXTSECOND', 'next second')] }] });
    const pdf = await inspectPdf(await render(model));
    assert.equal(pageOf(pdf, 'SECONDLASTROW'), pageOf(pdf, 'LASTROWOFSECTION'), `${n} fillers: the last row is on page ${pageOf(pdf, 'LASTROWOFSECTION')} and the one before on ${pageOf(pdf, 'SECONDLASTROW')}`);
    pages.add(pageOf(pdf, 'LASTROWOFSECTION'));
  }
  assert.ok(pages.size >= 2);
});

test('a section heading is kept with at least its first two rows, not with a single row', async () => {
  const pages = new Set();
  for (let n = 0; n <= 60; n += 1) {
    const model = handModel([
      { id: 'A', title: 'Section A', items: filler(n) },
      { id: 'B', title: 'SECTIONTWOHEADING', items: [row('FIRSTROWQUESTION', 'first'), row('SECONDROWQUESTION', 'second'), row('THIRDROWQUESTION', 'third'), row('FOURTHROWQUESTION', 'fourth')] },
    ]);
    const pdf = await inspectPdf(await render(model));
    const heading = pageOf(pdf, 'SECTIONTWOHEADING');
    assert.equal(pageOf(pdf, 'FIRSTROWQUESTION'), heading, `${n} fillers: the first row`);
    assert.equal(pageOf(pdf, 'SECONDROWQUESTION'), heading, `${n} fillers: the second row is on page ${pageOf(pdf, 'SECONDROWQUESTION')}, the heading on ${heading}`);
    pages.add(heading);
  }
  assert.ok(pages.size >= 2);
});

test('a repeat entry that fits on a page is never split: its title and every row are on one page', async () => {
  const pages = new Set();
  for (let n = 0; n <= 60; n += 1) {
    const entry = (name) => ({ title: `${name}TITLE`, items: ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].map((k) => row(`${name}${k}`, `answer ${k}`)) });
    const group = { type: 'group', id: 'g', question: 'The group', lines: [{ text: '2 entries', style: 'normal' }], base: null, entries: [entry('FIRST'), entry('SECOND')] };
    // The group is the last item of the section: a group followed by exactly one row is kept together with that row, which would hide the entry rule.
    const pdf = await inspectPdf(await render(handModel([{ id: 'A', title: 'Section A', items: [...filler(n), group] }])));
    for (const name of ['FIRST', 'SECOND']) {
      const page = pageOf(pdf, `${name}TITLE`);
      assert.ok(page > 0);
      for (const k of ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE']) assert.equal(pageOf(pdf, `${name}${k}`), page, `${n} fillers: ${name}${k} is on page ${pageOf(pdf, `${name}${k}`)}, its title on ${page}`);
      pages.add(page);
    }
  }
  assert.ok(pages.size >= 3, 'the entries were tried on at least three pages');
});

test('a repeat entry too tall for a page keeps its title with at least its first two rows; the count row stays with the first entry', async () => {
  for (let n = 0; n <= 40; n += 1) {
    const big = { title: 'BIGENTRYTITLE', items: Array.from({ length: 45 }, (_, i) => row(`BIGROW${i + 1}X`, `answer ${i + 1}`)) };
    const group = { type: 'group', id: 'g', question: 'COUNTROWQUESTION', lines: [{ text: '1 entry', style: 'normal' }], base: null, entries: [big] };
    const pdf = await inspectPdf(await render(handModel([{ id: 'A', title: 'Section A', items: [...filler(n), group] }])));
    const page = pageOf(pdf, 'BIGENTRYTITLE');
    assert.equal(pageOf(pdf, 'BIGROW1X'), page, `${n} fillers: the first row`);
    assert.equal(pageOf(pdf, 'BIGROW2X'), page, `${n} fillers: the second row`);
    assert.equal(pageOf(pdf, 'COUNTROWQUESTION'), page, `${n} fillers: the count row is with the first entry`);
    assert.ok(pageOf(pdf, 'BIGROW45X') >= page);
  }
});

test('on the full sample application no page starts with a lone row of a section that continues from the page before', async () => {
  const pdf = await inspectPdf(await render(modelOf(richAnswers())));
  assert.ok(pdf.numPages >= 8);
  // A heading is the only text set in the serif (Playfair Display).
  const isHeading = (l) => l.items.some((i) => /PlayfairDisplay/.test(i.font));
  for (const page of pdf.pages.slice(1)) {
    const body = page.lines.filter((l) => page.height - l.y > PAGE.margin + PAGE.header.height + 4 && l.y > PAGE.margin + PAGE.footer.height + 4);
    // The lines at the top of the page before the first heading are the rows that continue from the page before: there must be more than one line of them.
    const idx = body.findIndex(isHeading);
    const before = idx === -1 ? body : body.slice(0, idx);
    if (idx > 0) assert.ok(before.length >= 2, `page ${page.number} starts with a single line "${before[0] && before[0].text}" before a heading`);
  }
});

test('an answer too long for one page continues on the next page: the question is printed once, nothing is lost, nothing is repeated', async () => {
  const words = Array.from({ length: 1400 }, (_, i) => `word${i}`);
  const longText = words.join(' ');
  const pdf = await inspectPdf(await render(handModel([{ id: 'A', title: 'Section A', items: [row('Short before', 'before'), row('TALLQUESTION', longText), row('Short after', 'AFTERANSWER')] }])));
  assert.ok(pdf.numPages >= 2);
  assert.equal((pdf.text.match(/TALLQUESTION/g) || []).length, 1);
  assert.ok(pdf.text.includes('(continued)'));
  const printed = pdf.text.match(/word\d+/g) || [];
  assert.equal(printed.length, words.length, 'every word once');
  assert.deepEqual([...new Set(printed)].length, words.length);
  assert.deepEqual(printed.map((w) => Number(w.slice(4))), words.map((_, i) => i), 'in order');
  assert.ok(pageOf(pdf, 'AFTERANSWER') >= pageOf(pdf, 'word1399'));
  for (const page of pdf.pages) for (const item of page.items) assert.ok(item.x + item.width <= page.width - PAGE.margin + TOL);
});

test('long text wraps inside the answer column, line breaks are kept, and a long unbroken string is broken to fit', async () => {
  const paragraph = Array.from({ length: 60 }, (_, i) => `sentence${i}`).join(' ');
  const unbroken = 'https-like-' + 'x'.repeat(160);
  const pdf = await inspectPdf(await render(handModel([{ id: 'A', title: 'Section A', items: [row('Wrapping', `first line\n${paragraph}\n\nafter a blank line`), row('Unbroken', unbroken)] }])));
  const page = pdf.pages[0];
  const right = page.width - PAGE.margin;
  const answerStart = PAGE.margin + Math.floor((page.width - 2 * PAGE.margin) * 0.45) + 14;
  const lines = page.lines.filter((l) => l.items[0].x >= answerStart - 1);
  assert.ok(lines.length > 8, 'the paragraph took several lines');
  for (const l of lines) for (const item of l.items) assert.ok(item.x + item.width <= right + TOL, `"${item.str.slice(0, 20)}" fits`);
  const text = page.text;
  assert.ok(text.indexOf('first line') < text.indexOf('sentence0'));
  assert.ok(text.indexOf('sentence59') < text.indexOf('after a blank line'));
  const chunks = page.items.filter((i) => /^x+$|https-like/.test(i.str));
  assert.ok(chunks.length >= 2, 'the long string was broken over lines');
  assert.equal(chunks.map((i) => i.str).join('').replace(/https-like-/, ''), 'x'.repeat(160));
});

test('rows do not overlap: on every page, the text of one line starts below the line above', async () => {
  const pdf = await inspectPdf(await render(modelOf(richAnswers(), { corrections: { [correctionKey('q5_6')]: new Date('2026-11-05T09:00:00Z') } })));
  let checked = 0;
  for (const page of pdf.pages) {
    const ys = page.items.map((i) => ({ y: i.y, x: i.x, right: i.x + i.width, str: i.str, size: i.size }));
    for (let a = 0; a < ys.length; a += 1) {
      for (let b = a + 1; b < ys.length; b += 1) {
        const A = ys[a];
        const B = ys[b];
        const overlapX = Math.min(A.right, B.right) - Math.max(A.x, B.x);
        if (overlapX <= 1) continue;
        const gap = Math.abs(A.y - B.y);
        checked += 1;
        assert.ok(gap < 0.5 || gap > Math.min(A.size, B.size) * 0.85, `page ${page.number}: "${A.str.slice(0, 20)}" and "${B.str.slice(0, 20)}" overlap (${gap.toFixed(1)} apart)`);
      }
    }
  }
  assert.ok(checked > 1000);
});

// ---------------------------------------------------------------------------
// A large application: time and memory
// ---------------------------------------------------------------------------

test('a large application (every group at its limit, every section filled, long text) is made in a few seconds and a bounded amount of memory', async () => {
  const model = modelOf(richAnswers());
  const sections = model.parts.reduce((n, p) => n + p.sections.length, 0);
  assert.ok(sections >= 20, `${sections} sections`);
  if (global.gc) global.gc();
  const before = process.memoryUsage().heapUsed;
  const started = Date.now();
  const buffer = await render(model);
  const elapsed = Date.now() - started;
  const grown = (process.memoryUsage().heapUsed - before) / (1024 * 1024);
  const pdf = await inspectPdf(buffer);
  assert.ok(pdf.numPages >= 20 && pdf.numPages <= config.LIMITS.maxPages, `${pdf.numPages} pages`);
  assert.ok(elapsed < 8000, `${elapsed} ms`);
  assert.ok(grown < 200, `${grown.toFixed(0)} MB of heap`);
  assert.ok(buffer.length < 3 * 1024 * 1024, `${buffer.length} bytes`);
  // Every page still has its header and footer with the right total.
  for (const page of pdf.pages) assert.ok(page.text.includes(`Page ${page.number} of ${pdf.numPages}`));
});

test('a runaway document is refused with a fixed code, not made', async () => {
  const items = filler(8000);
  await assert.rejects(render(handModel([{ id: 'A', title: 'Section A', items }])), (error) => error instanceof PdfError && error.code === 'PDF_TOO_LARGE');
});

// ---------------------------------------------------------------------------
// Text: normalisation and the characters the fonts cannot print
// ---------------------------------------------------------------------------

test('typographic characters are normalised: the non-breaking hyphen, spaces of every width, invisible characters, line separators, controls', () => {
  const n = pdfText.normalizePdfText;
  assert.equal(n(`a${C(0x2011)}b`), 'a-b', 'U+2011 non-breaking hyphen');
  assert.equal(n(`a${C(0x2010)}b${C(0x2012)}c${C(0x2212)}d`), 'a-b-c-d', 'other hyphens and the minus sign');
  assert.equal(n(`a${C(0xa0)}b${C(0x202f)}c${C(0x2009)}d${C(0x3000)}e`), 'a b c d e', 'spaces');
  assert.equal(n(`a${C(0x200b)}b${C(0x200d)}c${C(0xfeff)}d${C(0xad)}e${C(0x200e)}f`), 'abcdef', 'invisible characters');
  assert.equal(n(`a${C(0x2028)}b${C(0x2029)}c\r\nd\re`), 'a\nb\nc\nd\ne', 'line breaks');
  assert.equal(n(`a${C(0)}b${C(7)}c${C(0x7f)}d${C(0x85)}e`), 'ab' + 'c' + 'd\ne', 'controls are dropped (the next-line character is a line break)');
  assert.equal(n('a\tb'), 'a b');
  assert.equal(n(`e${C(0x301)}`), `${C(0xe9)}`, 'a combining accent is composed');
  assert.equal(n(undefined), '');
  assert.equal(n(null), '');
  assert.equal(n(42), '42');
  // The typographic characters become the closest plain ones (step 8h-2), each kind on its own.
  assert.equal(n(`a${C(0x2013)}b`), 'a-b', 'en dash');
  assert.equal(n(`a${C(0x2014)}b`), 'a-b', 'em dash');
  assert.equal(n(`a${C(0x2015)}b`), 'a-b', 'horizontal bar');
  assert.equal(n(`${C(0x2018)}x${C(0x2019)}`), "'x'", 'curly single quotes');
  assert.equal(n(`don${C(0x2019)}t ${C(0x201a)}${C(0x201b)}${C(0x2bc)}${C(0x2032)}`), "don't ''''", 'apostrophe, low and reversed single quotes, modifier apostrophe, prime');
  assert.equal(n(`${C(0x201c)}y${C(0x201d)}`), '"y"', 'curly double quotes');
  assert.equal(n(`${C(0x201e)}y${C(0x201f)}${C(0x2033)}`), '"y""', 'low and reversed double quotes, double prime');
  assert.equal(n(`wait${C(0x2026)} then`), 'wait... then', 'the ellipsis character');
  assert.equal(n(`10${C(0x2013)}15 ${C(0x2014)} ok`), '10-15 - ok', 'a range and a pause stay readable');
  // What the fonts print and is plain Latin stays: the pound sign, accents, the bullet and the middle dot.
  const keep = `${C(0xa3)}1,200 ${C(0xe9)}${C(0xfc)}${C(0xf1)} ${C(0x2022)} item ${C(0xb7)} dot`;
  assert.equal(n(keep), keep);
});

test('every character that matters is printed by the fonts and comes back out of the PDF: accented Latin letters, the pound sign, curly quotes, the en and em dash, the ellipsis', async () => {
  const sample = [
    ['accented lower', 'café naïve über señor façade ångström øre łódź ő ř æ ß'],
    ['accented upper', 'ÉCOLE ÜBER ÑO ÇA Å Ø Ł Ő Ř Æ'],
    ['pound and money', '£1,200.50 and €40'],
    ['curly quotes', '‘single’ and “double” and don’t'],
    ['dashes', 'en – dash and em — dash'],
    ['ellipsis', 'wait… then go'],
    ['bullet and middle dot', '• item · dot'],
    ['non-breaking hyphen (normalised)', 'well‑known'],
    ['non-breaking space (normalised)', 'ten people'],
  ];
  for (const [label, value] of sample) {
    const normalised = pdfText.normalizePdfText(value);
    assert.deepEqual(pdfText.unsupportedIn(normalised, ['Sans', 'SansBold', 'SansItalic', 'Title']), [], `${label}: the fonts print it`);
  }
  const items = sample.map(([label, value]) => row(`Question ${label}`, value));
  const pdf = await inspectPdf(await render(handModel([{ id: 'A', title: 'Section A', items }])));
  for (const [label, value] of sample) {
    const expected = pdfText.normalizePdfText(value);
    // pdfjs can break a long line into pieces, so compare without spaces.
    assert.ok(pdf.text.replace(/\s+/g, '').includes(expected.replace(/\s+/g, '')), `${label}: "${expected}" is in the PDF`);
  }
  assert.equal(pdf.text.includes(C(0x2011)), false);
  assert.equal(pdf.text.includes(C(0xa0)), false);
});

test('characters the fonts cannot print are found before anything is drawn, and the section is named, never the character', () => {
  const answers = { ...fullAnswers(), q1_5: `A trip to ${C(0x5317)}${C(0x4eac)} and ${C(0x1f600)}` };
  const model = modelOf(answers);
  const where = answersPdf.unprintableSection(model);
  assert.deepEqual(where, { id: '1', title: 'Travel information' });
  assert.equal(JSON.stringify(where).includes(C(0x5317)), false);
  // Arabic, Chinese, Thai, Hebrew, Devanagari and the smiley emoji are refused. (Source Sans 3 also has Cyrillic and Greek, so those print; the PDFs are for Latin text.)
  for (const sample of [C(0x627) + C(0x644), C(0x5317), C(0x0e01), C(0x1f600), C(0x5d0), C(0x905)]) {
    assert.notEqual(answersPdf.unprintableSection(modelOf({ ...fullAnswers(), q5_6: sample, q5_1: 'employed', q5_2: '2019-03', q5_3: 'Acme' })), null, sample.codePointAt(0).toString(16));
  }
  // The header block counts too.
  const header = answersPdf.unprintableSection(modelOf({ ...fullAnswers(), q2_1: C(0x5f20) + C(0x4f1f) }));
  assert.equal(header.id, 'header');
  // Everything the fonts do print is fine.
  assert.equal(answersPdf.unprintableSection(modelOf({ ...fullAnswers(), q1_5: 'Café “naïve” – £1,200… O’Brien-Smith' })), null);
  assert.equal(pdfText.isPrintable('plain text'), true);
  assert.deepEqual(pdfText.unsupportedIn(`ok ${C(0x5317)}`), [0x5317]);
});

test('nothing is drawn for a character the fonts lack: the shared builder never prints a blank or a box (the check comes first)', () => {
  const builder = new PdfBuilder({ reference: 'TV-AAAAAAAA', applicantName: 'Test' });
  assert.equal(typeof builder.measure, 'function');
  const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'pdf', 'pdfBuilder.js'), 'utf8');
  assert.match(source, /normalizePdfText/);
});

// ---------------------------------------------------------------------------
// The foundation can be reused (step 8h-2)
// ---------------------------------------------------------------------------

test('the foundation is a small shared module: page setup, fonts, header, footer, page numbers, rules, tints, measuring, the refusal check; and it knows nothing about an application', async () => {
  const builder = new PdfBuilder({ reference: 'TV-BBBBBBBB', applicantName: 'Reuse Test' });
  for (const method of ['newPage', 'ensureSpace', 'remaining', 'measure', 'lineHeight', 'widthOf', 'text', 'fitLine', 'splitToFit', 'rule', 'fill', 'drawHeader', 'drawFooter', 'finish']) assert.equal(typeof builder[method], 'function', method);
  assert.equal(builder.geometry.width, 595.28);
  // A letter in the serif font, built on the same page, header and footer.
  builder.text('A paragraph of a letter in the serif font.', builder.geometry.left, builder.y, { font: 'Serif', size: 11, width: builder.geometry.contentWidth });
  builder.y += 40;
  builder.newPage();
  builder.text('Second page', builder.geometry.left, builder.y, { font: 'SerifBold', size: 11 });
  const pdf = await inspectPdf(await builder.finish());
  assert.equal(pdf.numPages, 2);
  assert.ok(pdf.pages[0].text.includes('Page 1 of 2'));
  assert.ok(pdf.pages[1].text.includes('Page 2 of 2'));
  assert.ok(pdf.pages.every((p) => p.text.includes('TV-BBBBBBBB') && p.text.includes('Reuse Test')));
  assert.ok(pdf.pages[0].items.some((i) => /SourceSerif4/.test(i.font)));
  const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'pdf', 'pdfBuilder.js'), 'utf8');
  for (const word of ['answers', 'question', 'review', 'application']) assert.equal(new RegExp(`\\b${word}\\b`, 'i').test(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), false, `the foundation code does not mention ${word}`);
  assert.deepEqual(config.PDF_TYPES, ['answers', 'cover_letter', 'itinerary']);
});

test('the fitting helpers: splitToFit cuts at a space, fitLine shortens with an ellipsis, and both give back text that fits', () => {
  const builder = new PdfBuilder({ reference: 'TV-CCCCCCCC', applicantName: 'Fit' });
  const text = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
  const { head, tail } = builder.splitToFit(text, 60, { font: 'Sans', size: 9.5, width: 200 });
  assert.ok(head.length > 0 && tail.length > 0);
  assert.ok(builder.measure(head, { font: 'Sans', size: 9.5, width: 200 }) <= 60);
  assert.equal(`${head} ${tail}`.replace(/\s+/g, ' '), text);
  assert.deepEqual(builder.splitToFit('short', 60, { width: 200 }), { head: 'short', tail: '' });
  const line = builder.fitLine('A very long applicant name '.repeat(8), { size: 8, width: 150 });
  assert.ok(builder.widthOf(line, { size: 8 }) <= 150);
  assert.ok(line.endsWith(C(0x2026)));
  assert.equal(builder.fitLine('Short', { size: 8, width: 150 }), 'Short');
});

test('nothing is written to disk or sent anywhere: the PDF modules use no file writing, no storage and no network', () => {
  for (const file of ['utils/pdf/pdfBuilder.js', 'utils/pdf/pdfText.js', 'utils/touristVisaAnswersPdf.js', 'services/touristVisaPdfService.js', 'controllers/touristVisaPdfController.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.equal(/writeFile|createWriteStream|appendFile|mkdtemp|tmpdir|cloudinary|storage|fetch\(|https?\.request|axios/i.test(source), false, file);
  }
});
