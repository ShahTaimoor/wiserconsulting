/**
 * The cover letter as a PDF (steps 8h-2 and 8h-3), built on the shared foundation (utils/pdf/pdfBuilder.js, documentBuilder.js, letterBuilder.js).
 * Pure: it takes the stored text of one version and the few facts around it, and returns a model and then the file. No database, no
 * storage, no network.
 *
 *   parseLetter(text)              the stored text as it is: { blocks: [[line, ...], ...], closing: [line, ...] | null }
 *   senderOf(answers)              the applicant's name, home address, email and telephone, only what the answers hold
 *   letterDate(version)            the date printed on the letter, and which stored date it came from
 *   buildLetterModel(...)          everything the renderer prints
 *   unprintableIn(model)           where the text has a character the fonts cannot print ('sender' or 'letter'), or null
 *   renderCoverLetterPdf(model)    the file, as a Buffer
 *
 * THE TEXT OF THE LETTER IS NEVER CHANGED. No sentence is added, removed or reworded: the stored text is laid out as it is (the salutation,
 * the paragraphs, the closing lines), with only its typographic characters made plain (curly quotes, dashes and the ellipsis; see
 * pdfText.js) and runs of spaces made one. What is added is layout furniture and nothing that reads as part of the letter: the letterhead
 * (the sender's name, address, email and telephone), the date line, the reference line, a narrow brand edge, and the line and the room for a
 * signature.
 *
 * THE DESIGN (step 8h-3): a letterhead at the top left (the name large in the display face, a short terracotta rule, one quiet row of small
 * type for the address, the email and the telephone with thin separators), a hairline, a tidy line with the date on the left and the
 * reference on the right, then the body in Source Serif 4 at 11 pt in a column of about 70 characters. A drop cap was tried in thought and
 * left out: the stored text always opens with its salutation ("Dear Sir or Madam,"), which a drop cap would only break. The closing has a
 * real signature line.
 *
 * The page rules: a short letter fits on one page; a longer one flows to the next with a compact continuation header; a paragraph is not left
 * with one line at the foot or the head of a page when it can be avoided; and the closing (the "Yours faithfully," line, the signature space and
 * the name) is never alone on a page: it is kept together with at least the last two lines of the body.
 */

const engine = require('../shared/tourist-visa/engine');
const view = require('../shared/tourist-visa/view');
const { LetterBuilder } = require('./pdf/letterBuilder');
const { normalizePdfText, findUnprintable } = require('./pdf/pdfText');
const { BRAND } = require('../config/touristVisaPdf');

const norm = normalizePdfText;
const text = (value) => (typeof value === 'string' ? value.trim() : '');

// The letter's type: Source Serif 4 at 11 pt with a comfortable line (1.64), 12 pt between paragraphs, in a column of about 70 characters.
const BODY = Object.freeze({ font: 'Serif', size: 11, color: BRAND.ink });
const BODY_WIDTH = 410;
const LINE_PITCH = 18;
const PARAGRAPH_GAP = 12;
const SIGNATURE_GAP = 46; // the room for a signature between "Yours faithfully," and the name, with its line
const SIGNATURE_LINE = 176; // the length of the signature line
const CLOSING_GAP = 14; // before the closing, in place of a paragraph gap
const SENDER_NAME = Object.freeze({ font: 'Display', size: 34, color: BRAND.ink });
const CONTACT = Object.freeze({ font: 'Sans', size: 8.6, color: BRAND.muted });
const TAIL_LINES = 2; // the closing keeps at least this many lines of the body with it
// How many lines a paragraph needs before it may be split across pages (so that at least two are left on each page).
const SPLITTABLE = 4;

// ---------------------------------------------------------------------------
// The stored text, as it is
// ---------------------------------------------------------------------------

const CLOSING_WORDS = /^(yours\s+(faithfully|sincerely|truly)|(with\s+)?(kind|best|warm)\s+regards|regards|sincerely|best\s+wishes)\b/i;

/**
 * The stored text split into its blocks (paragraphs separated by a blank line; the line breaks inside a block are kept) and its closing, if
 * it has one: the last block when it begins with a closing phrase ("Yours faithfully,"), together with a name that follows it in a block
 * of its own. A text with no closing phrase has no closing (the last paragraph is just the last paragraph).
 */
function parseLetter(value) {
  const cleaned = norm(value).replace(/[ ]+/g, ' ');
  const blocks = cleaned
    .split(/\n[ ]*\n+/)
    .map((block) => block.split('\n').map((line) => line.trim()).filter((line) => line !== ''))
    .filter((lines) => lines.length > 0);
  let closing = null;
  const last = blocks[blocks.length - 1];
  if (last && CLOSING_WORDS.test(last[0]) && last.length <= 5) {
    closing = blocks.pop();
  } else if (blocks.length >= 2 && last.length === 1 && last[0].length <= 80 && !/[.!?]$/.test(last[0]) && CLOSING_WORDS.test(blocks[blocks.length - 2][0]) && blocks[blocks.length - 2].length <= 3) {
    // "Yours faithfully," and the name in blocks of their own.
    closing = [...blocks[blocks.length - 2], ...blocks[blocks.length - 1]];
    blocks.length -= 2;
  }
  return { blocks, closing };
}

// ---------------------------------------------------------------------------
// The facts around the letter
// ---------------------------------------------------------------------------

/**
 * The letterhead: the applicant's name (given names and family name, 2.1 and 2.2), home address (2.24), email (2.4) and telephone (2.32),
 * only what the answers hold. { name, addressLines, email, phone } (empty strings and an empty list when the answers hold nothing).
 */
function senderOf(answers) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const name = [text(a.q2_1), text(a.q2_2)].filter(Boolean).join(' ');
  const address = a.q2_24 && typeof a.q2_24 === 'object' ? a.q2_24 : {};
  const country = address.country ? (engine.getCountries().find((c) => c.code === address.country) || {}).name || '' : '';
  const townLine = [text(address.town), text(address.region)].filter(Boolean).join(', ');
  const addressLines = [text(address.line1), text(address.line2), townLine, text(address.postcode), country].filter(Boolean).map((line) => norm(line));
  const tel = a.q2_32 && typeof a.q2_32 === 'object' ? a.q2_32 : {};
  const phone = [text(tel.countryCode), text(tel.number)].filter(Boolean).join(' ');
  return { name: norm(name), addressLines, email: norm(text(a.q2_4)), phone: norm(phone) };
}

/**
 * The date on the letter: the date the version of the letter was written (stored with it); if it has none, the date it was approved.
 * Returns { date: Date, source: 'written' | 'approved' } or null. The stored letter text holds no date of its own.
 */
function letterDate(version) {
  const valid = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  };
  const written = valid(version && version.createdAt);
  if (written) return { date: written, source: 'written' };
  const approved = valid(version && version.approvedAt);
  return approved ? { date: approved, source: 'approved' } : null;
}

/** "3 November 2026" (the day in UTC, as the rest of the PDFs). */
const formatLetterDate = (date) => view.formatDate(date.toISOString().slice(0, 10));

/**
 * Everything the renderer prints.
 * @param {object} input
 * @param {string} input.text       the stored text of the version (decrypted)
 * @param {string} input.reference  the application's reference
 * @param {object} input.sender     senderOf(answers)
 * @param {Date}   [input.date]     the date line
 * @param {boolean} input.draft     the version is not approved
 */
function buildLetterModel({ text: letterText, reference, sender, date, draft }) {
  const { blocks, closing } = parseLetter(letterText);
  return {
    reference: norm(reference || ''),
    applicantName: sender.name,
    sender,
    dateText: date ? formatLetterDate(date) : '',
    blocks,
    closing,
    draft: Boolean(draft),
  };
}

/**
 * The first place whose text the fonts cannot print: 'sender' (the name, the address, the email, the telephone or the reference) or 'letter'
 * (the date line or the text itself), or null. The text is never returned: it is an answer.
 */
function unprintableIn(model) {
  const serif = ['Serif', 'SerifBold', 'SerifItalic'];
  const sender = model.sender;
  const entries = [
    { where: 'sender', text: sender.name, fonts: ['Display', 'Serif', 'Sans'] },
    ...sender.addressLines.map((line) => ({ where: 'sender', text: line, fonts: ['Sans'] })),
    { where: 'sender', text: sender.email || '', fonts: ['Sans'] },
    { where: 'sender', text: sender.phone || '', fonts: ['Sans'] },
    { where: 'sender', text: model.reference, fonts: ['Sans', 'SansBold', 'Serif'] },
    { where: 'letter', text: model.dateText, fonts: serif },
    ...model.blocks.flat().map((line) => ({ where: 'letter', text: line, fonts: serif })),
    ...(model.closing || []).map((line) => ({ where: 'letter', text: line, fonts: serif })),
  ];
  for (const entry of entries) {
    const found = findUnprintable([entry], entry.fonts);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The rendering
// ---------------------------------------------------------------------------

class LetterRenderer {
  constructor(model) {
    this.model = model;
    this.b = new LetterBuilder({ reference: model.reference, applicantName: model.applicantName, draft: model.draft });
    this.bodyWidth = Math.min(BODY_WIDTH, this.b.geometry.contentWidth);
  }

  /** The text cut into lines that fit the width: at spaces, and inside a word that is longer than a line. Hard line breaks are kept. */
  wrap(value, style = BODY, width = this.bodyWidth) {
    const b = this.b;
    const lines = [];
    for (const hard of norm(value).split('\n')) {
      const words = hard.split(' ').filter((word) => word !== '');
      let current = '';
      const flush = () => {
        if (current !== '') lines.push(current);
        current = '';
      };
      for (const word of words) {
        let rest = word;
        // A word longer than a line is broken into pieces that fit (a very long unbroken string stays inside the margins).
        while (b.widthOf(rest, style) > width) {
          flush();
          let cut = rest.length - 1;
          while (cut > 1 && b.widthOf(rest.slice(0, cut), style) > width) cut -= 1;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        const candidate = current === '' ? rest : `${current} ${rest}`;
        if (current !== '' && b.widthOf(candidate, style) > width) {
          flush();
          current = rest;
        } else {
          current = candidate;
        }
      }
      flush();
    }
    return lines;
  }

  drawLine(value, style = BODY) {
    const b = this.b;
    b.text(value, b.geometry.left, b.y, { ...style, plain: true, lineGap: 0, lineBreak: false });
    b.y += LINE_PITCH;
  }

  /**
   * The letterhead, top left: the name large in the display face (wrapped if it is long), a short terracotta rule, and one quiet row of small
   * type (the address, the email, the telephone) with thin separators, flowing onto a second row when it is wider than the page.
   */
  letterhead() {
    const b = this.b;
    const g = b.geometry;
    const { name, addressLines, email, phone } = this.model.sender;
    if (name) {
      const lineHeight = b.lineHeight({ ...SENDER_NAME, lineGap: 0 });
      for (const line of this.wrap(name, SENDER_NAME, g.contentWidth)) {
        b.text(line, g.left, b.y, { ...SENDER_NAME, plain: true, lineGap: 0, lineBreak: false });
        b.y += lineHeight * 0.96;
      }
      b.y += 7;
      b.fill(g.left, b.y, 46, 2.4, BRAND.accent);
      b.y += 2.4 + 13;
    }
    const items = [addressLines.join(', '), email, phone].filter(Boolean);
    if (items.length) {
      const rowHeight = 12.5;
      let x = g.left;
      let first = true;
      for (const item of items) {
        const width = b.widthOf(item, CONTACT);
        if (width > g.contentWidth) {
          // An item wider than the page (a long address) takes its own wrapped rows.
          if (!first) { b.y += rowHeight; x = g.left; }
          for (const line of this.wrap(item, CONTACT, g.contentWidth)) {
            b.text(line, g.left, b.y, { ...CONTACT, plain: true, lineGap: 0, lineBreak: false });
            b.y += rowHeight;
          }
          b.y -= rowHeight;
          x = g.right;
          first = false;
          continue;
        }
        if (!first) {
          if (x + 20 + width > g.right) {
            b.y += rowHeight;
            x = g.left;
          } else {
            const top = b.y + 0.5;
            this.b.doc.save().lineWidth(0.5).strokeColor(BRAND.rule).moveTo(x + 9, top).lineTo(x + 9, top + 8.5).stroke().restore();
            x += 18;
          }
        }
        b.text(item, x, b.y, { ...CONTACT, plain: true, lineGap: 0, lineBreak: false });
        x += width;
        first = false;
      }
      b.y += rowHeight;
    }
    b.y += 14;
    b.rule(b.y, { weight: 0.6, color: BRAND.rule });
    b.y += 14;
  }

  /** The date on the left and the reference on the right, on one tidy line. */
  dateAndReference() {
    const b = this.b;
    const g = b.geometry;
    const date = this.model.dateText;
    const dateStyle = { font: 'Serif', size: 10.5, color: BRAND.ink };
    const valueStyle = { font: 'SansBold', size: 9.5 };
    const labelStyle = { font: 'SansBold', size: 7.2 };
    if (date) b.text(date, g.left, b.y, { ...dateStyle, plain: true, lineGap: 0, lineBreak: false });
    const valueWidth = b.widthOf(this.model.reference, valueStyle);
    const labelWidth = b.widthOf('REFERENCE', labelStyle);
    const valueX = g.right - valueWidth;
    const base = b.ascent({ ...dateStyle });
    b.text(this.model.reference, valueX, b.y + base - b.ascent(valueStyle), { ...valueStyle, color: BRAND.greenDeep, plain: true, lineGap: 0, lineBreak: false });
    b.text('REFERENCE', valueX - 8 - labelWidth, b.y + base - b.ascent(labelStyle), { ...labelStyle, color: BRAND.muted, plain: true, lineGap: 0, lineBreak: false });
    b.y += LINE_PITCH + 22;
  }

  /** The room left on this page, in lines. */
  linesLeft(gap = 0) {
    return Math.floor((this.b.remaining() - gap) / LINE_PITCH);
  }

  /** At the top of a page no gap is left above a paragraph. */
  atTop() {
    return this.b.y <= this.b.top + 0.5;
  }

  /**
   * One paragraph of the flowing body. It stays whole when it fits; a paragraph of four lines or more may be split, but never to leave a single
   * line at the foot of one page or at the head of the next. A short paragraph that does not fit starts the next page.
   */
  paragraph(lines) {
    const b = this.b;
    let index = 0;
    let first = true;
    while (index < lines.length) {
      const gap = first && !this.atTop() ? PARAGRAPH_GAP : 0;
      const left = lines.length - index;
      let fit = this.linesLeft(gap);
      if (fit >= left) {
        b.y += gap;
        for (; index < lines.length; index += 1) this.drawLine(lines[index]);
        return;
      }
      const splittable = left >= SPLITTABLE;
      if (!splittable || fit < 2) fit = 0;
      else if (left - fit < 2) fit = left - 2;
      if (fit <= 0) {
        if (this.atTop()) fit = Math.max(1, this.linesLeft(0)); // a page too small to avoid it: draw what fits
        else {
          b.newPage();
          first = true;
          continue;
        }
      }
      b.y += gap;
      for (let k = 0; k < fit; k += 1) this.drawLine(lines[index + k]);
      index += fit;
      first = false;
      if (index < lines.length) b.newPage();
    }
  }

  render() {
    const b = this.b;
    const model = this.model;
    this.letterhead();
    this.dateAndReference();

    // The body as paragraphs of lines; the last TAIL_LINES lines of it are held back to go with the closing.
    const paragraphs = model.blocks.map((block) => this.wrap(block.join('\n')));
    const tail = [];
    for (let p = paragraphs.length - 1; p >= 0 && tail.reduce((n, t) => n + t.lines.length, 0) < TAIL_LINES; p -= 1) {
      const need = TAIL_LINES - tail.reduce((n, t) => n + t.lines.length, 0);
      const take = Math.min(need, paragraphs[p].length);
      tail.unshift({ lines: paragraphs[p].slice(paragraphs[p].length - take), startsParagraph: take === paragraphs[p].length });
      paragraphs[p] = paragraphs[p].slice(0, paragraphs[p].length - take);
    }
    for (const lines of paragraphs) if (lines.length) this.paragraph(lines);

    // The tail of the body and the closing are placed as one group: they never start a page without each other.
    const closingLines = model.closing ? model.closing.map((line) => this.wrap(line)).flat() : [];
    const closingHeight = closingLines.length ? CLOSING_GAP + closingLines.length * LINE_PITCH + SIGNATURE_GAP : 0;
    const tailHeight = tail.reduce((sum, part) => sum + (part.startsParagraph ? PARAGRAPH_GAP : 0) + part.lines.length * LINE_PITCH, 0);
    b.ensureSpace(tailHeight + closingHeight);
    tail.forEach((part) => {
      if (part.startsParagraph && !this.atTop()) b.y += PARAGRAPH_GAP;
      for (const line of part.lines) this.drawLine(line);
    });
    if (closingLines.length) {
      if (!this.atTop()) b.y += CLOSING_GAP;
      // "Yours faithfully," then the room for a signature (with a thin line to sign on), then the name.
      this.drawLine(closingLines[0]);
      b.rule(b.y + SIGNATURE_GAP - 9, { weight: 0.6, color: BRAND.ink, x1: b.geometry.left, x2: b.geometry.left + SIGNATURE_LINE });
      b.y += SIGNATURE_GAP;
      for (const line of closingLines.slice(1)) this.drawLine(line);
    }
    return b.finish();
  }
}

/** The PDF of the model, as a Buffer. Rejects (never throws at once) with the builder's PdfError for a document that is too long. */
async function renderCoverLetterPdf(model) {
  const renderer = new LetterRenderer(model);
  try {
    return await renderer.render();
  } catch (error) {
    renderer.b.abort();
    throw error;
  }
}

module.exports = { parseLetter, senderOf, letterDate, formatLetterDate, buildLetterModel, unprintableIn, renderCoverLetterPdf, LINE_PITCH, SIGNATURE_GAP };
