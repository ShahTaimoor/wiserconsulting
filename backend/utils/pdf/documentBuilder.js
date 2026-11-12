/**
 * The page of a designed document (steps 8h-2 and 8h-3), on the shared foundation (pdfBuilder.js): the cover letter and the itinerary. The
 * same A4, fonts, rules, measuring, normalisation and page breaks, with this furniture instead of the application summary's:
 *
 *  - no logo and no government look: these documents are the applicant's own;
 *  - nothing at the top of the first page except what the document itself puts there (its letterhead or its title); from the second page on,
 *    a compact continuation header (a name in the display face, an accent rule, and a short label on the right);
 *  - a slim footer on every page: the reference, "Prepared by Wiser Consulting" and "Page X of Y";
 *  - optionally a narrow brand edge on the left of every page (a thin green line with a short terracotta start; a few points wide, so it
 *    costs almost no ink);
 *  - for a DRAFT only: a small banner at the top of every page and a large diagonal watermark behind the content of every page, both with
 *    the words "DRAFT - NOT APPROVED". An approved document has neither. (The watermark is text in the file, so it can be found and checked.)
 *
 * Nothing here is about what a document says: the document modules (touristVisaCoverLetterPdf.js, touristVisaItineraryPdf.js) decide what is
 * placed where.
 */

const { PdfBuilder } = require('./pdfBuilder');
const { normalizePdfText } = require('./pdfText');
const { LETTER_PAGE, BRAND, TEXT } = require('../../config/touristVisaPdf');

const MIDDLE_DOT = String.fromCodePoint(0xb7);
// The gap between the words of a turned label (a date such as "31 MAR"), from the ink of one word to the ink of the next, as a part of the size.
const INK_GAP = 0.36;

class DocumentBuilder extends PdfBuilder {
  /**
   * @param {string}  options.reference     printed in the footer
   * @param {string}  options.applicantName the name used by the default continuation header
   * @param {boolean} options.draft         a version that is not approved: banner and watermark on every page
   * @param {boolean} options.stale         the draft was approved once but its answers have changed since: the banner says so (step 8j-3)
   * @param {object}  options.profile       the page (LETTER_PAGE or ITINERARY_PAGE)
   * @param {object}  options.info          the PDF metadata (fixed words)
   * @param {{left?: string, right?: string}} options.continuation  the words of the continuation header
   * @param {boolean} options.edge          the narrow brand edge on every page
   * @param {'behind'|'over'} options.watermark  where a draft's watermark is drawn: behind the content (the letter), or over it at a low
   *                                         opacity (the itinerary, whose blocks have solid tints that would hide it)
   */
  constructor({ reference, applicantName, draft = false, stale = false, profile = LETTER_PAGE, info = TEXT.letterInfo, continuation, edge = false, watermark = 'behind' }) {
    super({ reference, applicantName, profile, info, draft: Boolean(draft), stale: Boolean(draft) && Boolean(stale), continuation: continuation || { left: applicantName, right: '' }, edge: Boolean(edge), watermark });
  }

  get draft() {
    return this.options.draft;
  }

  /** The room the draft banner takes at the top of a page (nothing for an approved document). */
  get bannerSpace() {
    return this.draft ? this.profile.banner.height + this.profile.banner.gapBelow : 0;
  }

  /** The first page starts at the top margin (below the banner of a draft); later pages leave room for the continuation header. */
  topFor(pageNumber) {
    const base = this.geometry.margin + this.bannerSpace;
    return pageNumber === 1 ? base : base + this.profile.header.height + this.profile.header.gapBelow;
  }

  /** The room a whole page of content has, for the first page and for the others. */
  contentHeightOf(pageNumber) {
    return this.geometry.bottom - this.topFor(pageNumber);
  }

  /** The edge and the watermark are drawn as each page starts, so they are behind everything that is drawn after them. */
  onNewPage() {
    if (this.options.edge) this.drawEdge();
    if (this.draft && this.options.watermark !== 'over') this.drawWatermark();
  }

  /** A narrow brand edge a little inside the left of the page: a thin green line, with a short terracotta start. */
  drawEdge() {
    const g = this.geometry;
    const x = Math.max(24, g.margin - 34);
    const top = g.margin;
    const bottom = g.height - g.margin;
    this.fill(x, top, 3.2, bottom - top, BRAND.green);
    this.fill(x, top, 3.2, 46, BRAND.accent);
  }

  drawWatermark(opacity = 0.11) {
    const g = this.geometry;
    const doc = this.doc;
    const word = TEXT.draftMark;
    // The size is worked out so that the diagonal text stays inside the margins: its horizontal reach is (width + height) * cos 45.
    const unit = 100;
    const wordWidth = this.widthOf(word, { font: 'SansBold', size: unit }) / unit;
    const reach = (wordWidth + 0.75) * 0.7071;
    const size = Math.min(70, (g.contentWidth * 0.94) / reach);
    const width = wordWidth * size;
    const height = size * 0.75;
    const cx = g.width / 2;
    const cy = g.height / 2;
    doc.save();
    doc.fillColor(BRAND.green).fillOpacity(opacity);
    doc.font('SansBold').fontSize(size);
    doc.rotate(-45, { origin: [cx, cy] });
    doc.text(word, cx - width / 2, cy - height / 2, { lineBreak: false });
    doc.restore();
  }

  /**
   * One line of text turned by `angle` degrees (-90 reads from the bottom up) and centred on the point (cx, cy): the label in the band of a
   * day. The text is normalised first, as everything printed is.
   */
  rotatedText(value, cx, cy, { font = 'SansBold', size = 12, color = BRAND.white, angle = -90 } = {}) {
    const doc = this.doc;
    const words = normalizePdfText(value).split(' ').filter((word) => word !== '');
    if (words.length === 0) return;
    doc.font(font).fontSize(size);
    const height = this.lineHeight({ font, size, lineGap: 0 });

    // The words are set one by one with the same gap between the INK of one word and the ink of the next (INK_GAP of the size), not with the
    // font's space: a space is a fixed width, so the gap that is seen depends on the shapes on either side of it ("2 APR", whose A leans
    // away, looked tight beside "15 MAR"). Each word keeps its own kerning.
    const fontkit = doc._font.font;
    const unit = size / fontkit.unitsPerEm;
    const edge = (codePoint) => fontkit.glyphForCodePoint(codePoint);
    const inks = words.map((word) => {
      const chars = [...word];
      const first = edge(chars[0].codePointAt(0));
      const last = edge(chars[chars.length - 1].codePointAt(0));
      const advance = doc.widthOfString(word);
      return { word, left: first.bbox.minX * unit, right: advance - (last.advanceWidth - last.bbox.maxX) * unit };
    });
    let origin = 0;
    let inkLeft = 0;
    let inkRight = 0;
    inks.forEach((ink, i) => {
      if (i === 0) {
        origin = 0;
        inkLeft = ink.left;
      } else {
        origin = inkRight + INK_GAP * size - ink.left;
      }
      ink.origin = origin;
      inkRight = origin + ink.right;
    });
    const shift = -(inkLeft + inkRight) / 2; // the ink of the whole label is centred on the point

    doc.save();
    doc.fillColor(color);
    doc.rotate(angle, { origin: [cx, cy] });
    doc.font(font).fontSize(size);
    for (const ink of inks) doc.text(ink.word, cx + shift + ink.origin, cy - height / 2, { lineBreak: false });
    doc.restore();
  }

  /** The draft banner (every page of a draft) and the continuation header (the second page on). */
  drawHeader(number) {
    const g = this.geometry;
    // A watermark that goes over the content is drawn now, when the header and the footer are (after everything else on the page).
    if (this.draft && this.options.watermark === 'over') this.drawWatermark(0.12);
    if (this.draft) {
      const { height } = this.profile.banner;
      const y = g.margin;
      this.doc.save().lineWidth(0.8).strokeColor(BRAND.greenDeep).rect(g.left, y, g.contentWidth, height).stroke().restore();
      const textHeight = this.lineHeight({ font: 'SansBold', size: 8.5, lineGap: 0 });
      this.text(this.options.stale ? TEXT.staleMark : TEXT.draftMark, g.left, y + (height - textHeight) / 2, { font: 'SansBold', size: 8.5, color: BRAND.greenDeep, align: 'center', lineGap: 0, lineBreak: false });
    }
    if (number > 1) {
      const y = g.margin + this.bannerSpace;
      const { left, right } = this.options.continuation;
      const label = left || this.reference;
      this.text(label, g.left, y, { font: 'Display', size: 15, color: BRAND.ink, lineGap: 0, lineBreak: false, width: g.contentWidth * 0.7 });
      if (right) this.text(right, g.left, y + 5, { font: 'Sans', size: 8.5, color: BRAND.muted, align: 'right', lineGap: 0, lineBreak: false });
      const ruleY = y + this.profile.header.height;
      this.rule(ruleY, { weight: 0.5, color: BRAND.rule });
      this.fill(g.left, ruleY - 0.6, 26, 1.8, BRAND.accent);
    }
  }

  /** A slim footer on every page: the reference and who prepared it on the left, "Page X of Y" on the right. */
  drawFooter(number, total) {
    const g = this.geometry;
    const y = g.footerTop + 8;
    this.rule(g.footerTop, { weight: 0.5, color: BRAND.hairline });
    this.text(`${this.reference}  ${MIDDLE_DOT}  ${TEXT.letterFooter}`, g.left, y, { font: 'Sans', size: 8, color: BRAND.muted, lineGap: 0, lineBreak: false });
    this.text(`Page ${number} of ${total}`, g.left, y, { font: 'Sans', size: 8, color: BRAND.muted, align: 'right', lineGap: 0, lineBreak: false });
  }
}

module.exports = { DocumentBuilder, INK_GAP };
