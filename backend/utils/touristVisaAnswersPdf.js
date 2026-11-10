/**
 * The APPLICATION SUMMARY PDF (step 8h-1): the header block, then every part and section of the application as rows of a question on the
 * left and its answer on the right. Built on the shared PDF foundation (utils/pdf/pdfBuilder.js); the cover letter and the itinerary of
 * step 8h-2 use the same foundation.
 *
 * Two steps, so that a PDF is refused BEFORE anything is recorded or drawn:
 *   buildAnswersModel(...)   the application as printable text (normalised), from the shared review builder: pure
 *   unprintableSection(model) the first section whose text the fonts cannot print, or null
 *   renderAnswersPdf(model)  the file, as a Buffer
 *
 * It prints only what the review shows: the answers, the file names and sizes, and, where the team corrected an answer, "Corrected by our
 * team on <date>" (never the old value and never the reason). It never prints a note, a flag, a change, a reason or an audit row: none of
 * them is in the review. Nothing here can contain a link.
 */

const engine = require('../shared/tourist-visa/engine');
const view = require('../shared/tourist-visa/view');
const { PdfBuilder } = require('./pdf/pdfBuilder');
const { normalizePdfText, findUnprintable } = require('./pdf/pdfText');
const { PALETTE, TEXT } = require('../config/touristVisaPdf');

const ANSWER_FONTS = Object.freeze(['Sans', 'SansBold', 'SansItalic']);
const HEADING_FONTS = Object.freeze(['Title']);

// The columns: the question takes about 45 percent of the width, then a gap, then the answer.
const QUESTION_SHARE = 0.45;
const GAP = 14;
const LABEL_WIDTH = 176;

const norm = normalizePdfText;
const bullet = String.fromCodePoint(0x2022);

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * The header block: [{ label, value }] in the order of the printout. A missing value is a dash. These come from the answers (and the
 * submission date and the reference); the fee, the service option and a payment reference are not printed.
 */
function buildHeaderRows({ cfg, answers, reference, submittedAt }) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const word = (id) => {
    const question = engine.getQuestion(cfg, id);
    if (!question || a[id] === undefined || a[id] === null || a[id] === '') return '';
    const described = view.describeValue(cfg, question, a[id], a, null);
    return described === 'Not answered' ? '' : described;
  };
  const name = [text(a.q2_1), text(a.q2_2)].filter(Boolean).join(' ');
  const language = word('q10_4') === 'Other' && text(a.q10_4a) ? text(a.q10_4a) : word('q10_4');
  const when = submittedAt ? new Date(submittedAt) : null;
  const applied = when && !Number.isNaN(when.getTime()) ? view.formatDate(when.toISOString().slice(0, 10)) : '';
  const rows = [
    ['APPLICANT NAME', name],
    ['APPLICATION REFERENCE', text(reference)],
    ['PASSPORT NUMBER', text(a.q3_1)],
    ['COUNTRY OF NATIONALITY', word('q2_14')],
    ['DATE OF BIRTH', word('q2_17')],
    ['GENDER', word('q2_12')],
    ['DATE OF APPLICATION', applied],
    ['TYPE OF VISA', TEXT.visaType],
    ['SUBMISSION METHOD', TEXT.submissionMethod],
    ['CONTACT EMAIL', text(a.q2_4)],
    ['CONTACT LANGUAGE', language],
  ];
  return rows.map(([label, value]) => ({ label, value: norm(value) || TEXT.missing }));
}

const baseOf = (number) => {
  const match = /^(\d+\.\d+)/.exec(number || '');
  return match ? match[1] : null;
};

/** One review row as printable answer lines: [{ text, style }] (style: normal, bold, muted, small, marker). */
function answerLines(row) {
  const lines = [];
  if (row.kind === 'files' && row.files && row.files.length) {
    for (const file of row.files) lines.push({ text: norm(`${file.name} (${file.sizeText})`), style: 'normal' });
  } else if (Array.isArray(row.items) && row.items.length) {
    for (const item of row.items) lines.push({ text: `${bullet} ${norm(item)}`, style: 'normal' });
  } else {
    const value = norm(row.value);
    lines.push({ text: value, style: row.empty ? 'muted' : value === 'Yes' || value === 'No' ? 'bold' : 'normal' });
  }
  if (row.note) lines.push({ text: norm(row.note), style: 'small' });
  if (row.correctedByTeam) lines.push({ text: `Corrected by our team on ${norm(row.correctedByTeam)}`, style: 'marker' });
  return lines;
}

function itemOf(row) {
  const item = { id: row.id, question: norm(row.label), lines: answerLines(row), base: baseOf(row.number) };
  if (row.kind === 'group') {
    item.type = 'group';
    item.entries = (row.entries || []).map((entry) => ({ title: norm(entry.title), items: entry.rows.map(itemOf) }));
  } else {
    item.type = 'row';
  }
  return item;
}

/**
 * The application as printable text: { reference, applicantName, header, parts }. `review` is the shared builder's review of the decrypted
 * answers under the config the application was submitted under; `header` is buildHeaderRows.
 */
function buildAnswersModel({ review, header, reference }) {
  const name = (header.find((row) => row.label === 'APPLICANT NAME') || {}).value;
  return {
    reference: norm(reference || ''),
    applicantName: name && name !== TEXT.missing ? name : '',
    header,
    parts: review.parts.map((part) => ({
      id: part.id,
      title: norm(part.title),
      sections: part.sections.map((section) => ({ id: section.id, title: norm(section.title), items: section.rows.map(itemOf) })),
    })),
  };
}

function* itemsText(items) {
  for (const item of items) {
    yield item.question;
    for (const line of item.lines) yield line.text;
    if (item.entries) for (const entry of item.entries) { yield entry.title; yield* itemsText(entry.items); }
  }
}

/**
 * The first place whose text the fonts cannot print: { id, title } of the section ("header" for the header block), or null. The text is
 * never returned (it is an answer).
 */
function unprintableSection(model) {
  const entries = [];
  const headerWhere = { id: 'header', title: 'the application details' };
  for (const row of model.header) entries.push({ where: headerWhere, text: row.value, fonts: ANSWER_FONTS });
  entries.push({ where: headerWhere, text: model.applicantName, fonts: ANSWER_FONTS }, { where: headerWhere, text: model.reference, fonts: ANSWER_FONTS });
  for (const part of model.parts) {
    entries.push({ where: { id: part.id, title: part.title }, text: part.title, fonts: HEADING_FONTS });
    for (const section of part.sections) {
      const where = { id: section.id, title: section.title };
      entries.push({ where, text: section.title, fonts: HEADING_FONTS });
      for (const text of itemsText(section.items)) entries.push({ where, text, fonts: ANSWER_FONTS });
    }
  }
  for (const entry of entries) {
    const where = findUnprintable([entry], entry.fonts);
    if (where) return where;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The rendering
// ---------------------------------------------------------------------------

const STYLE = Object.freeze({
  normal: { font: 'Sans', size: 9.5, color: PALETTE.ink },
  bold: { font: 'SansBold', size: 9.5, color: PALETTE.ink },
  muted: { font: 'Sans', size: 9.5, color: PALETTE.muted },
  small: { font: 'Sans', size: 8, color: PALETTE.muted },
  marker: { font: 'SansItalic', size: 8, color: PALETTE.greenDark },
});
const QUESTION = Object.freeze({ font: 'Sans', size: 9, color: PALETTE.question });
const LINE_GAP = 1.6;
const PAD = 4.5;
const PART_GAP = 12;
const HEADING_GAP = 7; // between a heading's number and its title
const SECTION_GAP = 10;
const LINE_SPACE = 1.5;

class AnswersRenderer {
  constructor(model) {
    this.model = model;
    this.itemIndent = 0;
    this.b = new PdfBuilder({ reference: model.reference, applicantName: model.applicantName });
    const g = this.b.geometry;
    this.questionWidth = Math.floor(g.contentWidth * QUESTION_SHARE);
    this.answerX = g.left + this.questionWidth + GAP;
    this.answerWidth = g.right - this.answerX;
  }

  // ---- measuring ----------------------------------------------------------

  linesHeight(lines, width) {
    let height = 0;
    lines.forEach((line, i) => {
      height += this.b.measure(line.text, { ...STYLE[line.style], width, lineGap: LINE_GAP }) + (i < lines.length - 1 ? LINE_SPACE : 0);
    });
    return height;
  }

  rowHeight(item, indent = 0) {
    const questionHeight = this.b.measure(item.question, { ...QUESTION, width: this.questionWidth - indent, lineGap: LINE_GAP });
    return Math.max(questionHeight, this.linesHeight(item.lines, this.answerWidth)) + 2 * PAD;
  }

  // ---- the page parts -----------------------------------------------------

  title() {
    const b = this.b;
    const height = b.text(TEXT.title, b.geometry.left, b.y, { font: 'Title', size: 24, color: PALETTE.navy, lineGap: 0 });
    b.y += height + 10;
  }

  headerBlock() {
    const b = this.b;
    const g = b.geometry;
    b.rule(b.y, { weight: 0.9, color: PALETTE.green });
    b.y += 2;
    const valueX = g.left + LABEL_WIDTH;
    const valueWidth = g.right - valueX;
    this.model.header.forEach((row, i) => {
      const valueHeight = b.measure(row.value, { font: 'Sans', size: 10.5, width: valueWidth, lineGap: LINE_GAP });
      const height = Math.max(valueHeight, 11) + 12;
      b.text(row.label, g.left, b.y + 8.4, { font: 'SansBold', size: 8, color: PALETTE.greenDark, width: LABEL_WIDTH - 8, characterSpacing: 0.5, lineGap: 0 });
      b.text(row.value, valueX, b.y + 6, { font: 'Sans', size: 10.5, color: PALETTE.navy, width: valueWidth, lineGap: LINE_GAP });
      b.y += height;
      b.rule(b.y, { weight: i === this.model.header.length - 1 ? 0.9 : 0.5, color: i === this.model.header.length - 1 ? PALETTE.green : PALETTE.hairline });
    });
    b.y += 14;
  }

  /** A part: a light tint band with its title. Kept with what follows (the caller asks for the space). */
  partHeadingHeight() {
    return PART_GAP + 28;
  }

  /**
   * A heading is a number in the bold sans ("Part 10", "10D": the serif's 1 and 0 look like I and O) and a title in the serif, on one
   * baseline. Returns the height the title takes; `width` is the room for both.
   */
  headingWidths(prefix, size, width) {
    const prefixSize = size - 1.5;
    const prefixWidth = this.b.widthOf(prefix, { font: 'SansBold', size: prefixSize });
    return { prefixSize, prefixWidth, titleX: prefixWidth + HEADING_GAP, titleWidth: width - prefixWidth - HEADING_GAP };
  }

  headingHeight(prefix, title, size, width) {
    const { titleWidth } = this.headingWidths(prefix, size, width);
    return this.b.measure(title, { font: 'Title', size, width: titleWidth, lineGap: 0 });
  }

  drawHeading(prefix, title, x, y, size, width, { lineBreak = true } = {}) {
    const b = this.b;
    const { prefixSize, titleX, titleWidth } = this.headingWidths(prefix, size, width);
    const baseline = b.ascent({ font: 'Title', size });
    b.text(prefix, x, y + baseline - b.ascent({ font: 'SansBold', size: prefixSize }), { font: 'SansBold', size: prefixSize, color: PALETTE.navy, width, lineGap: 0, lineBreak: false });
    return b.text(title, x + titleX, y, { font: 'Title', size, color: PALETTE.navy, width: titleWidth, lineGap: 0, lineBreak });
  }

  drawPartHeading(part) {
    const b = this.b;
    const g = b.geometry;
    if (b.y > g.top) b.y += PART_GAP;
    b.fill(g.left, b.y, g.contentWidth, 24);
    this.drawHeading(`Part ${part.id}`, part.title, g.left + 8, b.y + 5, 13.5, g.contentWidth - 16, { lineBreak: false });
    b.y += 24 + 4;
  }

  sectionHeadingHeight(section) {
    const g = this.b.geometry;
    return SECTION_GAP + this.headingHeight(section.id, section.title, 11.5, g.contentWidth) + 16;
  }

  drawSectionHeading(section) {
    const b = this.b;
    const g = b.geometry;
    // At the top of a page the header's own rule is just above, so a second one would double it.
    const atPageTop = b.y <= g.top;
    if (!atPageTop) {
      b.y += SECTION_GAP;
      b.rule(b.y, { weight: 0.9, color: PALETTE.green });
    }
    const height = this.drawHeading(section.id, section.title, g.left, b.y + 6, 11.5, g.contentWidth);
    b.y += 6 + height + 6;
    b.rule(b.y, { weight: 0.5, color: PALETTE.green });
  }

  // ---- rows ---------------------------------------------------------------

  drawLines(lines, x, y, width) {
    let cursor = y;
    lines.forEach((line, i) => {
      cursor += this.b.text(line.text, x, cursor, { ...STYLE[line.style], width, lineGap: LINE_GAP }) + (i < lines.length - 1 ? LINE_SPACE : 0);
    });
    return cursor - y;
  }

  /**
   * One row: the question on the left, the answer on the right. A row is never split across pages (it moves to the next page whole) unless
   * it is taller than a page, when its answer continues on the next. After it, a rule: 'hairline', 'heavy' or none.
   */
  drawRow(item, { indent = 0, rule = 'hairline' } = {}) {
    const b = this.b;
    const g = b.geometry;
    const questionWidth = this.questionWidth - indent;
    const height = this.rowHeight(item, indent);

    if (height <= b.pageContentHeight) {
      b.ensureSpace(height);
      b.text(item.question, g.left + indent, b.y + PAD, { ...QUESTION, width: questionWidth, lineGap: LINE_GAP });
      this.drawLines(item.lines, this.answerX, b.y + PAD, this.answerWidth);
      b.y += height;
    } else {
      this.drawTallRow(item, indent, questionWidth);
    }
    if (rule === 'hairline') b.rule(b.y, { weight: 0.5, color: PALETTE.hairline });
    else if (rule === 'heavy') b.rule(b.y, { weight: 0.9, color: PALETTE.rule });
  }

  /** A row taller than a page: the question once, and the answer carried over from page to page in pieces. */
  drawTallRow(item, indent, questionWidth) {
    const b = this.b;
    const g = b.geometry;
    let queue = item.lines.map((line) => ({ ...line }));
    let first = true;
    while (queue.length) {
      if (b.remaining() < 60) b.newPage();
      const top = b.y + PAD;
      if (first) b.text(item.question, g.left + indent, top, { ...QUESTION, width: questionWidth, lineGap: LINE_GAP });
      else b.text('(continued)', g.left + indent, top, { font: 'SansItalic', size: 8, color: PALETTE.muted, width: questionWidth, lineGap: 0 });
      let cursor = top;
      const limit = g.bottom - PAD;
      while (queue.length) {
        const line = queue[0];
        const style = STYLE[line.style];
        const room = limit - cursor;
        const options = { ...style, width: this.answerWidth, lineGap: LINE_GAP };
        if (b.measure(line.text, options) <= room) {
          cursor += b.text(line.text, this.answerX, cursor, options) + LINE_SPACE;
          queue.shift();
        } else if (room >= 3 * b.lineHeight(options)) {
          const { head, tail } = b.splitToFit(line.text, room, options);
          cursor += b.text(head, this.answerX, cursor, options);
          queue[0] = { ...line, text: tail };
          break;
        } else {
          break;
        }
      }
      b.y = Math.min(g.bottom, Math.max(cursor, top + 12)) + PAD;
      first = false;
      if (queue.length) b.newPage();
    }
  }

  // ---- keeping rows together (step 8h-2) --------------------------------------
  //
  //  - A follow-up row (the "Please give details" kind: the same question number as the row before it) stays with the question it follows.
  //  - The last two rows of a section (or of an entry) stay together, so a page never starts with one row that has lost its company.
  //  - A repeat entry stays whole on one page when it fits on a page; when it does not, its title stays with at least its first two rows.
  //  - The row that counts the entries stays with the first entry's title and rows.
  //  What cannot fit on one page (a very long run) still breaks between rows, never inside one.

  entryTitleHeight() {
    return this.b.lineHeight({ font: 'SansBold', size: 9, lineGap: 0 }) + 8;
  }

  /** The height of an item drawn whole: a row, or a group with its count row and every entry. */
  itemHeight(item, indent = 0) {
    if (item.type !== 'group') return this.rowHeight(item, indent);
    return this.rowHeight(item, indent) + item.entries.reduce((sum, entry) => sum + this.entryHeight(entry), 0);
  }

  entryHeight(entry) {
    return this.entryTitleHeight() + entry.items.reduce((sum, item) => sum + this.itemHeight(item, 10), 0);
  }

  /** What must stay together at the start of an item: a row, or a group's count row with its first entry's lead. */
  leadHeight(item, indent = 0) {
    if (item.type !== 'group') return this.rowHeight(item, indent);
    return this.rowHeight(item, indent) + (item.entries[0] ? this.entryLead(item.entries[0]) : 0);
  }

  /** The room an entry needs to start: all of it when it fits on a page, otherwise its title and its first two rows. */
  entryLead(entry) {
    const whole = this.entryHeight(entry);
    if (whole <= this.b.pageContentHeight) return whole;
    return this.entryTitleHeight() + entry.items.slice(0, 2).reduce((sum, item) => sum + this.leadHeight(item, 10), 0);
  }

  /**
   * The run of items from `i` that must stay together: the item, the follow-ups after it, and the last item of the list when it would
   * otherwise be left alone. Returns the index of the run's last item and the room the run needs at its start.
   */
  unitOf(items, i) {
    let end = i;
    while (items[end + 1] && items[end + 1].base !== null && items[end + 1].base === items[end].base) end += 1;
    if (items.length - 1 - end === 1) end += 1;
    // Every item of the run is counted whole, except that a group at the end of it only needs its start (its count row and the first
    // entry's lead): the other entries may flow on to the next page.
    let whole = 0;
    for (let k = i; k <= end; k += 1) {
      const last = k === end && items[k].type === 'group';
      whole += last ? this.leadHeight(items[k], 0) : this.itemHeight(items[k], items[k].type === 'group' ? 0 : this.itemIndent);
    }
    const page = this.b.pageContentHeight;
    if (whole <= page) return { end, need: whole };
    // Too long for one page: keep the first two items together, at least.
    const lead = this.leadHeight(items[i], this.itemIndent) + (end > i ? this.leadHeight(items[i + 1], this.itemIndent) : 0);
    return { end, need: Math.min(lead, page) };
  }

  /** What a heading keeps with: the first run of rows, and never fewer than the first two rows (a heading with one row at the foot of a page looks lost). */
  sectionLead(items) {
    if (!items.length) return 0;
    this.itemIndent = 0;
    const unit = this.unitOf(items, 0);
    if (unit.end >= 1 || items.length < 2) return unit.need;
    return Math.min(unit.need + this.leadHeight(items[1], 0), this.b.pageContentHeight);
  }

  /** A repeating group: its row, then each entry with a tinted title and its own rows. */
  drawGroup(item, { rule }) {
    const b = this.b;
    const g = b.geometry;
    const hasEntries = item.entries.length > 0;
    this.drawRow(item, { rule: hasEntries ? 'none' : rule });
    item.entries.forEach((entry, e) => {
      const titleHeight = this.entryTitleHeight();
      b.ensureSpace(this.entryLead(entry));
      b.fill(g.left, b.y + 2, g.contentWidth, titleHeight - 2, PALETTE.tint);
      b.text(entry.title, g.left + 6, b.y + 5, { font: 'SansBold', size: 9, color: PALETTE.greenDark, width: g.contentWidth - 12, lineGap: 0, lineBreak: false });
      b.y += titleHeight;
      this.drawItems(entry.items, { indent: 10, last: e === item.entries.length - 1 ? rule : 'heavy' });
    });
  }

  /** The items of a section or of one entry. A heavier rule separates groups of questions (a new question number); a hairline, a follow-up. */
  drawItems(items, { indent = 0, last = 'none' } = {}) {
    const outer = this.itemIndent;
    this.itemIndent = indent;
    let i = 0;
    while (i < items.length) {
      const unit = this.unitOf(items, i);
      this.b.ensureSpace(unit.need);
      for (let k = i; k <= unit.end; k += 1) {
        const item = items[k];
        const next = items[k + 1];
        const rule = !next ? last : next.base !== null && item.base === next.base ? 'hairline' : 'heavy';
        if (item.type === 'group') this.drawGroup(item, { rule });
        else this.drawRow(item, { indent, rule });
        this.itemIndent = indent;
      }
      i = unit.end + 1;
    }
    this.itemIndent = outer;
  }

  drawSection(section, { heading = true } = {}) {
    const b = this.b;
    const lead = this.sectionLead(section.items);
    b.ensureSpace((heading ? this.sectionHeadingHeight(section) : 0) + lead);
    if (heading) this.drawSectionHeading(section);
    this.drawItems(section.items, { last: 'none' });
  }

  render() {
    this.title();
    this.headerBlock();
    for (const part of this.model.parts) {
      // A part with one section of the same name (Part 1 and its section 1, both "Travel information") has one heading, not two.
      const single = part.sections.length === 1 && part.sections[0].title.toLowerCase() === part.title.toLowerCase();
      part.sections.forEach((section, s) => {
        const lead = this.sectionLead(section.items);
        if (s === 0) {
          // The part heading stays with its first section heading and the first run of rows (a question and its follow-ups).
          this.b.ensureSpace(this.partHeadingHeight() + (single ? 0 : this.sectionHeadingHeight(section)) + lead);
          this.drawPartHeading(part);
        }
        this.drawSection(section, { heading: !single });
      });
    }
    return this.b.finish();
  }
}

/** The PDF of the model, as a Buffer. Rejects (never throws at once) with the builder's PdfError for a document that is too long. */
async function renderAnswersPdf(model) {
  const renderer = new AnswersRenderer(model);
  try {
    return await renderer.render();
  } catch (error) {
    renderer.b.abort();
    throw error;
  }
}

module.exports = { buildHeaderRows, buildAnswersModel, unprintableSection, renderAnswersPdf, ANSWER_FONTS };
