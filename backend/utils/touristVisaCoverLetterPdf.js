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
 * FIT TO ONE PAGE (step 8h-4): a letter that overflows page 1 by a few lines is tightened in small steps (FIT_STEPS: the line and paragraph
 * spacing, then the space round the letterhead, then the body size by half a point at most) before it flows to a second page, using the least
 * tightening that makes it fit; one that does not fit even then flows to two pages at the nominal setting.
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
// These are the NOMINAL values; a letter that overflows the page by a little is tightened in small steps (FIT_STEPS below).
const BODY_WIDTH = 410;
const LINE_PITCH = 18;
const SIGNATURE_GAP = 46; // the room for a signature between "Yours faithfully," and the name, with its line (never tightened)

/**
 * FIT TO ONE PAGE (step 8h-4). A letter that overflows page 1 by a few lines would put only its last paragraph and the closing on page 2,
 * which looks unfinished. So, before flowing to a second page, the letter is tried at these steps in order, from the nominal setting to the
 * tightest, and the FIRST step that makes the whole letter (the closing and the signature room included) fit on one page is used: the least
 * tightening that works. The order is: the line and paragraph spacing first, then the space around the letterhead (`head` scales its gaps),
 * then the size of the body by half a point at most. Nothing goes below the minimums: the body 10.5 pt, the line at least 1.5 times the size.
 * A letter that does not fit even at the last step flows to two pages exactly as before, at the NOMINAL setting.
 */
const FIT_STEPS = Object.freeze([
  { size: 11, pitch: 18, gap: 12, head: 1 }, // 0: nominal
  { size: 11, pitch: 17.6, gap: 11, head: 1 },
  { size: 11, pitch: 17.3, gap: 10, head: 1 },
  { size: 11, pitch: 17, gap: 9, head: 1 },
  { size: 11, pitch: 17, gap: 9, head: 0.8 },
  { size: 11, pitch: 17, gap: 9, head: 0.6 },
  { size: 11, pitch: 17, gap: 9, head: 0.4 },
  { size: 10.75, pitch: 16.7, gap: 9, head: 0.4 },
  { size: 10.5, pitch: 16.4, gap: 9, head: 0.4 },
]);
const MIN_BODY_SIZE = 10.5;
const MIN_LINE_RATIO = 1.5; // the line pitch is never under this times the body size
// The gaps of the letterhead at the nominal setting (scaled by a step's `head`).
const HEAD_GAPS = Object.freeze({ nameRule: 7, ruleAfter: 13, contactAfter: 14, hairAfter: 14, dateAfter: 22 });
const SIGNATURE_LINE = 176; // the length of the signature line
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
 * @param {boolean} input.draft     the version is not approved (or was approved and its answers have changed since)
 * @param {boolean} [input.stale]   the draft was approved once, and the answers changed since: the banner says so
 */
function buildLetterModel({ text: letterText, reference, sender, date, draft, stale }) {
  const { blocks, closing } = parseLetter(letterText);
  return {
    reference: norm(reference || ''),
    applicantName: sender.name,
    sender,
    dateText: date ? formatLetterDate(date) : '',
    blocks,
    closing,
    draft: Boolean(draft),
    stale: Boolean(draft) && Boolean(stale),
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
  /**
   * @param {object} model
   * @param {object} [step]            one of FIT_STEPS: the size, the line pitch, the paragraph gap and the scale of the letterhead's gaps
   * @param {Map} [options.cache]    wrapped lines already worked out (see fitOf)
   * @param {object} [options.builder] a builder to draw on (the probe that the attempts of fitOf share: opening the fonts is the slow part)
   * @param {boolean} [options.single] the letter must fit on one page: a second page is not started, it throws OVERFLOW instead (the step is too loose)
   */
  constructor(model, step = FIT_STEPS[0], { single = false, cache = new Map(), builder = null } = {}) {
    this.model = model;
    this.cache = cache; // the wrapped text of a paragraph at a size, shared by the steps that use the same size
    this.step = step;
    this.body = Object.freeze({ font: 'Serif', size: step.size, color: BRAND.ink });
    this.pitch = step.pitch;
    this.pgap = step.gap;
    this.closingGap = step.gap + 2; // before the closing, in place of a paragraph gap
    this.head = step.head;
    this.b = builder || new LetterBuilder({ reference: model.reference, applicantName: model.applicantName, draft: model.draft, stale: model.stale });
    this.bodyWidth = Math.min(BODY_WIDTH, this.b.geometry.contentWidth);
    if (single) {
      this.b.newPage = () => {
        throw OVERFLOW;
      };
      this.b.y = this.b.top; // a shared probe starts each attempt at the top of its one page
    }
  }

  /** The text cut into lines that fit the width: at spaces, and inside a word that is longer than a line. Hard line breaks are kept. */
  wrap(value, style = this.body, width = this.bodyWidth) {
    const key = `${style.font}|${style.size}|${width}|${value}`;
    const known = this.cache.get(key);
    if (known) return known.slice();
    const lines = this.wrapLines(value, style, width);
    this.cache.set(key, lines);
    return lines.slice();
  }

  wrapLines(value, style, width) {
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

  drawLine(value, style = this.body) {
    const b = this.b;
    b.text(value, b.geometry.left, b.y, { ...style, plain: true, lineGap: 0, lineBreak: false });
    b.y += this.pitch;
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
      b.y += HEAD_GAPS.nameRule * this.head;
      b.fill(g.left, b.y, 46, 2.4, BRAND.accent);
      b.y += 2.4 + HEAD_GAPS.ruleAfter * this.head;
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
    b.y += HEAD_GAPS.contactAfter * this.head;
    b.rule(b.y, { weight: 0.6, color: BRAND.rule });
    b.y += HEAD_GAPS.hairAfter * this.head;
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
    b.y += this.pitch + HEAD_GAPS.dateAfter * this.head;
  }

  /** The room left on this page, in lines. */
  linesLeft(gap = 0) {
    return Math.floor((this.b.remaining() - gap) / this.pitch);
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
      const gap = first && !this.atTop() ? this.pgap : 0;
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

  /** Draws everything on the pages (the header and the footer are added when the file is finished). */
  layout() {
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
    const closingHeight = closingLines.length ? this.closingGap + closingLines.length * this.pitch + SIGNATURE_GAP : 0;
    const tailHeight = tail.reduce((sum, part) => sum + (part.startsParagraph ? this.pgap : 0) + part.lines.length * this.pitch, 0);
    b.ensureSpace(tailHeight + closingHeight);
    tail.forEach((part) => {
      if (part.startsParagraph && !this.atTop()) b.y += this.pgap;
      for (const line of part.lines) this.drawLine(line);
    });
    if (closingLines.length) {
      if (!this.atTop()) b.y += this.closingGap;
      // "Yours faithfully," then the room for a signature (with a thin line to sign on), then the name.
      this.drawLine(closingLines[0]);
      b.rule(b.y + SIGNATURE_GAP - 9, { weight: 0.6, color: BRAND.ink, x1: b.geometry.left, x2: b.geometry.left + SIGNATURE_LINE });
      b.y += SIGNATURE_GAP;
      for (const line of closingLines.slice(1)) this.drawLine(line);
    }
  }

  render() {
    this.layout();
    return this.b.finish();
  }
}

const OVERFLOW = Object.freeze({ overflow: true });

/**
 * The first step of FIT_STEPS (the least tightening) at which the whole letter fits on one page, as { index, step }; or null when no step makes
 * it fit (the letter then flows to two pages at the nominal setting). Step 0 is the nominal setting: a letter that already fits is unchanged.
 */
function fitOf(model, cache = new Map(), from = 0) {
  const probe = new LetterBuilder({ reference: model.reference, applicantName: model.applicantName, draft: model.draft, stale: model.stale });
  try {
    // The tightest step first: a letter that does not fit even there fits nowhere (smaller type never needs more lines), and is told at once.
    if (!fitsAtStep(model, FIT_STEPS.length - 1, cache, probe)) return null;
    for (let index = from; index < FIT_STEPS.length; index += 1) {
      if (fitsAtStep(model, index, cache, probe)) return { index, step: FIT_STEPS[index] };
    }
    return null;
  } finally {
    probe.abort();
  }
}

/** Whether the whole letter fits on one page at step `index` of FIT_STEPS (on a probe builder if one is given: what is drawn on it is thrown away). */
function fitsAtStep(model, index, cache = new Map(), probe = null) {
  const own = probe || new LetterBuilder({ reference: model.reference, applicantName: model.applicantName, draft: model.draft, stale: model.stale });
  const renderer = new LetterRenderer(model, FIT_STEPS[index], { single: true, cache, builder: own });
  try {
    renderer.layout();
    return true;
  } catch (error) {
    if (error !== OVERFLOW) throw error;
    return false;
  } finally {
    if (!probe) own.abort();
  }
}

/** The PDF of the model, as a Buffer. Rejects (never throws at once) with the builder's PdfError for a document that is too long. */
async function renderCoverLetterPdf(model) {
  const cache = new Map();
  // The nominal setting is drawn for real first: a letter that fits is exactly as it was, and costs no more than before.
  const nominal = new LetterRenderer(model, FIT_STEPS[0], { single: true, cache });
  try {
    nominal.layout();
    return await nominal.b.finish();
  } catch (error) {
    nominal.b.abort();
    if (error !== OVERFLOW) throw error;
  }
  // It overflows: the least tightening that makes it fit on one page, or the nominal setting on two pages when none does.
  const fit = fitOf(model, cache, 1);
  const renderer = new LetterRenderer(model, fit ? fit.step : FIT_STEPS[0], { cache });
  try {
    return await renderer.render();
  } catch (error) {
    renderer.b.abort();
    throw error;
  }
}

module.exports = { parseLetter, senderOf, letterDate, formatLetterDate, buildLetterModel, unprintableIn, renderCoverLetterPdf, fitOf, fitsAtStep, FIT_STEPS, MIN_BODY_SIZE, MIN_LINE_RATIO, LINE_PITCH, SIGNATURE_GAP };
