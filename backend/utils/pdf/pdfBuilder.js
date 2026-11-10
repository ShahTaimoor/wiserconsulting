/**
 * The shared foundation of the Tourist Visa PDFs (step 8h-1; the cover letter and the itinerary of step 8h-2 are built on it too).
 *
 * It owns what every one of these PDFs has in common and nothing that is about one kind of document: A4 portrait with the margins, the
 * fonts (embedded, the three open-licence families in assets/fonts), the header on every page (the logo on the left, the reference as
 * text on the right), the footer on every page (a thin rule, the applicant's name and the reference, the page number as "Page X of Y",
 * and the line saying that it is not an official document), rules, tint colours, measuring text, page breaks, fitting text into a space
 * and the refusal check for characters the fonts cannot print.
 *
 * The page is a column of content between a top and a bottom line. Callers place things with an explicit cursor (\`y\`), ask
 * \`ensureSpace(height)\` before drawing something that must not be split, and never draw outside the content box. The header and the
 * footer are drawn last, once the number of pages is known, in the margins that the content never uses.
 *
 * Everything printed goes through normalizePdfText, so a typographic character the fonts lack never reaches the file.
 *
 * Nothing here is about an applicant, a question or an answer. Nothing is written to disk: the document is built in memory.
 */

const PDFDocument = require('pdfkit');
const { PAGE, PALETTE, FONT_FILES, LOGO_FILE, TEXT, LIMITS } = require('../../config/touristVisaPdf');
const { normalizePdfText } = require('./pdfText');

// Playfair Display has old-style figures by default (a 1 looks like a small capital I): its titles use lining figures.
const featuresOf = (font) => (font === 'Title' || font === 'TitleRegular' || font === 'Display' || font === 'DisplayItalic' ? { features: ['lnum'] } : {});

/** An error with a fixed code, for a refusal the caller can word for a person. */
class PdfError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    if (details) this.details = details;
  }
}

class PdfBuilder {
  /**
   * @param {object} options
   * @param {string} options.reference     printed on the right of every header and in every footer (plain text)
   * @param {string} options.applicantName printed in every footer
   * @param {object} [options.profile]     the page: size, margin, header and footer sizes (config PAGE for the summary, LETTER_PAGE for the letter)
   * @param {object} [options.info]        the PDF metadata (fixed words only; never personal data)
   * Any other option is kept in this.options for a subclass (the cover letter keeps its draft flag there).
   */
  constructor(options) {
    const { reference, applicantName, profile = PAGE, info = TEXT.info } = options;
    this.options = options;
    this.profile = profile;
    this.reference = normalizePdfText(reference);
    this.applicantName = normalizePdfText(applicantName);
    const [width, height] = profile.size;
    const margin = profile.margin;
    this.geometry = Object.freeze({
      width,
      height,
      margin,
      left: margin,
      right: width - margin,
      contentWidth: width - 2 * margin,
      // The content starts below the header and ends above the footer; the header and the footer are inside the margins, never outside.
      top: margin + profile.header.height + profile.header.gapBelow,
      bottom: height - margin - profile.footer.height - profile.footer.gapAbove,
      headerRuleY: margin + profile.header.height,
      footerTop: height - margin - profile.footer.height,
    });
    const g = this.geometry;
    // font: null so that no standard font (and nothing that is not embedded) is ever referred to by the file.
    this.doc = new PDFDocument({
      size: profile.size,
      font: null,
      autoFirstPage: false,
      bufferPages: true,
      margins: { top: g.top, bottom: height - g.bottom, left: margin, right: margin },
      info: { ...info },
    });
    for (const [name, file] of Object.entries(FONT_FILES)) this.doc.registerFont(name, file);
    this.chunks = [];
    this.doc.on('data', (chunk) => this.chunks.push(chunk));
    this.finished = new Promise((resolve, reject) => {
      this.doc.on('end', resolve);
      this.doc.on('error', reject);
    });
    this.pages = 0;
    this.newPage();
  }

  // ---- the page -----------------------------------------------------------

  /** Starts a new page and puts the cursor at the top of the content. */
  newPage() {
    if (this.pages >= LIMITS.maxPages) throw new PdfError('PDF_TOO_LARGE', 'This document is too long to print as one PDF.');
    this.doc.addPage();
    this.pages += 1;
    this.top = this.topFor(this.pages);
    this.y = this.top;
    this.onNewPage(this.pages);
  }

  /** Where the content of a page starts (a subclass can start the first page higher than the others). */
  topFor() {
    return this.geometry.top;
  }

  /** Called as each page starts, before anything is drawn on it (the cover letter draws its draft watermark here, behind the text). */
  onNewPage() {}

  /** How much of the page is left below the cursor. */
  remaining() {
    return this.geometry.bottom - this.y;
  }

  /** A new page if `height` does not fit below the cursor (and is not taller than a whole page, which would never fit anyway). */
  ensureSpace(height) {
    if (height > this.remaining() && this.y > this.top) this.newPage();
  }

  /** The height of a whole page of content. */
  get pageContentHeight() {
    return this.geometry.bottom - this.geometry.top;
  }

  // ---- measuring and drawing text ----------------------------------------

  /** The height a text takes at a width, in a font and size (the text is normalised first, as it will be printed). */
  measure(text, { font = 'Sans', size = 9.5, width = this.geometry.contentWidth, lineGap = 1.5 } = {}) {
    const value = normalizePdfText(text);
    if (value === '') return 0;
    this.doc.font(font).fontSize(size);
    return this.doc.heightOfString(value, { width, lineGap, ...featuresOf(font) });
  }

  /** The height of one line in a font and size. */
  lineHeight({ font = 'Sans', size = 9.5, lineGap = 1.5 } = {}) {
    this.doc.font(font).fontSize(size);
    return this.doc.heightOfString('Ag', { width: 1000, lineGap });
  }

  /** How far the baseline of a line is below the top of its box (pdfkit puts the first baseline one ascender down). */
  ascent({ font = 'Sans', size = 9.5 } = {}) {
    this.doc.font(font).fontSize(size);
    return (this.doc._font.ascender / 1000) * size;
  }

  /** The width of one line of text. */
  widthOf(text, { font = 'Sans', size = 9.5 } = {}) {
    this.doc.font(font).fontSize(size);
    return this.doc.widthOfString(normalizePdfText(text));
  }

  /**
   * Draws text at a place and returns its height. Never moves the cursor: the caller does. With plain: true a left-aligned line is drawn as one
   * piece, with no width (pdfkit then does no line breaking of its own: a caller that wraps by itself, such as the letter, uses it).
   */
  text(text, x, y, { font = 'Sans', size = 9.5, color = PALETTE.ink, width = this.geometry.contentWidth, align = 'left', lineGap = 1.5, characterSpacing = 0, lineBreak = true, plain = false } = {}) {
    const value = normalizePdfText(text);
    if (value === '') return 0;
    this.doc.font(font).fontSize(size).fillColor(color);
    const options = { ...(plain ? {} : { width }), align, lineGap, characterSpacing, lineBreak, ...featuresOf(font) };
    const height = this.doc.heightOfString(value, plain ? { ...options, width } : options);
    this.doc.text(value, x, y, options);
    return height;
  }

  /** The text cut with an ellipsis so that it fits on one line of the given width. */
  fitLine(text, { font = 'Sans', size = 9.5, width }) {
    const value = normalizePdfText(text).replace(/\s+/g, ' ').trim();
    if (this.widthOf(value, { font, size }) <= width) return value;
    const ellipsis = String.fromCodePoint(0x2026);
    let end = value.length;
    while (end > 1 && this.widthOf(value.slice(0, end) + ellipsis, { font, size }) > width) end -= 1;
    return value.slice(0, end).trimEnd() + ellipsis;
  }

  /**
   * Splits a text into the part that fits in `maxHeight` at a width and the rest, at a space or a line break where it can. Used to let a very
   * long answer continue on the next page. { head, tail } (tail is empty when everything fits; head is never empty).
   */
  splitToFit(text, maxHeight, options = {}) {
    const value = normalizePdfText(text);
    if (this.measure(value, options) <= maxHeight) return { head: value, tail: '' };
    let low = 1;
    let high = value.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.measure(value.slice(0, middle), options) <= maxHeight) low = middle;
      else high = middle - 1;
    }
    let cut = low;
    const space = Math.max(value.lastIndexOf('\n', cut), value.lastIndexOf(' ', cut));
    if (space > cut * 0.5) cut = space;
    return { head: value.slice(0, cut).trimEnd(), tail: value.slice(cut).trimStart() };
  }

  // ---- rules and fills ----------------------------------------------------

  /** A horizontal rule across the content (or between two x). */
  rule(y, { weight = 0.5, color = PALETTE.hairline, x1 = this.geometry.left, x2 = this.geometry.right } = {}) {
    this.doc.save().lineWidth(weight).strokeColor(color).moveTo(x1, y).lineTo(x2, y).stroke().restore();
  }

  /** A filled rectangle (a light tint). */
  fill(x, y, width, height, color = PALETTE.tint) {
    this.doc.save().fillColor(color).rect(x, y, width, height).fill().restore();
  }

  // ---- the header and the footer, and the end -----------------------------

  drawHeader() {
    const g = this.geometry;
    const logoHeight = this.profile.header.logoHeight;
    this.doc.image(LOGO_FILE, g.left, g.margin, { height: logoHeight });
    const size = 11;
    const y = g.margin + (logoHeight - this.lineHeight({ font: 'SansBold', size, lineGap: 0 })) / 2;
    this.text(this.reference, g.left, y, { font: 'SansBold', size, color: PALETTE.navy, align: 'right', lineGap: 0, lineBreak: false });
    this.rule(g.headerRuleY, { weight: 0.9, color: PALETTE.green });
  }

  drawFooter(number, total) {
    const g = this.geometry;
    this.rule(g.footerTop, { weight: 0.6, color: PALETTE.green });
    const size = 8;
    const line = g.footerTop + 6;
    const page = `Page ${number} of ${total}`;
    const pageWidth = this.widthOf(page, { size });
    const middleDot = String.fromCodePoint(0xb7);
    const left = this.fitLine(`${this.applicantName}  ${middleDot}  ${this.reference}`, { size, width: g.contentWidth - pageWidth - 16 });
    this.text(left, g.left, line, { size, color: PALETTE.ink, lineGap: 0, lineBreak: false });
    this.text(page, g.left, line, { size, color: PALETTE.ink, align: 'right', lineGap: 0, lineBreak: false });
    this.text(TEXT.disclaimer, g.left, line + 13, { size: 7.5, color: PALETTE.muted, lineGap: 0, lineBreak: false });
  }

  /** Closes the document after a failure, so nothing is left open. */
  abort() {
    try { this.doc.end(); } catch { /* already closed */ }
    this.chunks = [];
  }

  /**
   * Draws the header and the footer on every page (now that the pages are counted), ends the document and returns the file as a Buffer.
   * Page numbers are "Page X of Y".
   */
  async finish() {
    const { start, count } = this.doc.bufferedPageRange();
    for (let i = 0; i < count; i += 1) {
      this.doc.switchToPage(start + i);
      // The header and the footer are in the margins, where pdfkit would otherwise start another page.
      this.doc.page.margins.top = 0;
      this.doc.page.margins.bottom = 0;
      this.drawHeader(i + 1, count);
      this.drawFooter(i + 1, count);
    }
    this.doc.end();
    await this.finished;
    return Buffer.concat(this.chunks);
  }
}

module.exports = { PdfBuilder, PdfError };
