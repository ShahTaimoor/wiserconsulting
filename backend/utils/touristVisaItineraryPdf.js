/**
 * The itinerary as a PDF (step 8h-3), built on the shared foundation (utils/pdf/pdfBuilder.js, documentBuilder.js). Pure: it takes the stored text
 * of one version and the few facts around it, and returns a model, a layout plan and then the file. No database, no storage, no network.
 *
 *   parseItinerary(text)             the stored text as it is: the title line, the note, and one block for each day or week
 *   buildItineraryModel(...)         everything the renderer prints
 *   unprintableIn(model)             where the text has a character the fonts cannot print ('itinerary' or 'details'), or null
 *   planItinerary(model)             the layout without drawing it: the density, and for each page its blocks, the room and how full it is
 *   renderItineraryPdf(model)        the file, as a Buffer
 *
 * WHAT IS STORED. An itinerary is plain text (utils/touristVisaItineraryChecks.js, assembleItinerary): a title line ("Proposed itinerary"), one
 * neutral note ("This is a proposed plan for the visit, and it may change."), then one block for each day, each a heading line and one
 * description line, the blocks separated by a blank line. The heading is "Day 1, Monday 15 March 2027" for a stay of up to 21 nights, and for a
 * longer stay a week: "Monday 15 March 2027 to Sunday 21 March 2027" (a block of one day: "Monday 15 March 2027"). There are NO clock times,
 * places or labels beyond these, and the text is never longer than 8000 characters. An administrator may have edited it by hand, so the parser
 * accepts any text: a block whose first line is not a heading is a plain note block, a line that starts with a clock time gets a time column
 * (only then), and nothing is ever invented.
 *
 * THE TEXT IS NEVER CHANGED. Every sentence is printed as stored. The stored title line is printed small above the large "Travel itinerary"
 * (the furniture title), the stored note under it, the heading of a day is split between its band ("DAY 1" and the short date) and the title
 * next to it (the rest of the heading, in an italic display face), and the description is the row. Only layout furniture is added: the large
 * title, the grid of details (taken from the answers, only the fields the data has), the bands, the tints and the rules.
 *
 * THE LAYOUT. A4, 20 mm margins. Page 1: the title and the grid of details. Then one block for each day stacked down the page: a rounded block
 * with a soft tint, a band on the left (alternately the brand green and the terracotta, with the day label turned on its side in white and the
 * date under it), the day's title in italic, and the rows with hairlines. A block is NEVER split across pages (a block too tall for a page is
 * the one exception: it carries on in a second block). THE PAGE-BALANCING RULE (step 8h-4): the type size is chosen by the number of days (a
 * short trip is set larger, one tier for each range of days); then the fewest pages the days can take with the blocks at their smallest size
 * are worked out, and within that many pages the LARGEST block size (the padding, the space round the rows, the gaps; up to the tier's
 * maximum) at which every day still fits is used, the same on every page; and the days are shared out over those pages as evenly as the block
 * heights allow (a small dynamic programme), so the last page is not left with a few days. A short trip is a designed, complete page; a long
 * one flows to further pages with a compact header and the slim footer.
 */

const { DocumentBuilder } = require('./pdf/documentBuilder');
const { normalizePdfText, findUnprintable } = require('./pdf/pdfText');
const { BRAND, ITINERARY_PAGE, TEXT } = require('../config/touristVisaPdf');

const norm = normalizePdfText;

// ---------------------------------------------------------------------------
// The stored text, as it is
// ---------------------------------------------------------------------------

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const WEEKDAY = 'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday';
const DATE = new RegExp(`(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})`, 'i');
const DAY_HEADING = /^Day\s+(\d+)\s*[,:.-]\s*(\S.*)$/i;
const ONE_DATE = `(?:(?:${WEEKDAY})\\s+)?\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}`;
const RANGE_HEADING = new RegExp(`^${ONE_DATE}\\s+to\\s+${ONE_DATE}$`, 'i');
const DATE_HEADING = new RegExp(`^${ONE_DATE}$`, 'i');
// A clock time at the start of a line: "09:30", "9.30 am", "9am", followed by a space, a colon or a dash.
const TIME = /^((?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s?[ap]\.?m\.?)?|(?:1[0-2]|0?[1-9])\s?[ap]\.?m\.?)(?=[\s:-]|$)[\s:-]*/i;

/** "Monday 15 March 2027" -> "15 MAR" (null when there is no date). */
function shortDate(value) {
  const m = DATE.exec(value);
  return m ? `${m[1]} ${m[2].slice(0, 3).toUpperCase()}` : null;
}

/**
 * The parts of a heading line, or null when the line is not a heading: { main, sub, title } (the label in the band, the smaller line under it,
 * and the title next to the band). "Day 1, Monday 15 March 2027" -> DAY 1 / 15 MAR / "Monday 15 March 2027"; a week -> 15 MAR / TO 21 MAR /
 * the whole heading; one date -> 15 MAR / 2027 / the whole heading.
 */
function headingParts(line) {
  const day = DAY_HEADING.exec(line);
  if (day) return { main: `DAY ${day[1]}`, sub: shortDate(day[2]) || '', title: day[2] };
  if (RANGE_HEADING.test(line)) {
    const [from, to] = line.split(/\s+to\s+/i);
    return { main: shortDate(from) || '', sub: `TO ${shortDate(to) || ''}`.trim(), title: line };
  }
  if (DATE_HEADING.test(line)) return { main: shortDate(line) || '', sub: String((DATE.exec(line) || [])[3] || ''), title: line };
  return null;
}

/** One stored line as a row: a leading clock time becomes the time of the row; anything else is just the text. */
function splitTime(line) {
  const m = TIME.exec(line);
  if (!m) return { time: '', text: line };
  const rest = line.slice(m[0].length).trim();
  return rest ? { time: m[1], text: rest } : { time: '', text: line };
}

/**
 * The stored text read as it is: { title, note, blocks } with title the first line when it is a line of its own that is not a heading,
 * note the paragraph after it when that is not a heading either, and blocks one for each remaining paragraph:
 * { kind: 'day', heading, main, sub, title, lines } or { kind: 'note', lines } (a paragraph that does not begin with a heading).
 */
function parseItinerary(value) {
  const cleaned = norm(value).replace(/[ ]+/g, ' ');
  const paragraphs = [];
  for (const block of cleaned.split(/\n[ ]*\n+/)) {
    const lines = block.split('\n').map((line) => line.trim()).filter((line) => line !== '');
    // A heading line starts a block of its own, even when no blank line was typed before it (an itinerary edited by hand).
    let current = [];
    for (const line of lines) {
      if (current.length > 0 && headingParts(line)) {
        paragraphs.push(current);
        current = [];
      }
      current.push(line);
    }
    if (current.length > 0) paragraphs.push(current);
  }
  let at = 0;
  let title = null;
  let note = null;
  if (paragraphs[0] && paragraphs[0].length === 1 && !headingParts(paragraphs[0][0])) {
    title = paragraphs[0][0];
    at = 1;
  }
  if (paragraphs[at] && !headingParts(paragraphs[at][0])) {
    note = paragraphs[at];
    at += 1;
  }
  const blocks = [];
  for (; at < paragraphs.length; at += 1) {
    const [first, ...rest] = paragraphs[at];
    const parts = headingParts(first);
    blocks.push(parts ? { kind: 'day', heading: first, ...parts, lines: rest } : { kind: 'note', lines: paragraphs[at] });
  }
  return { title, note, blocks };
}

/**
 * The grid of details at the top of the first page, from the facts the itinerary is built on (the answers): the traveller, the places the
 * trip names, the dates, the length of the stay and where the traveller stays. ONLY THE FIELDS THE DATA HAS: nothing is invented, and a field the
 * answers do not hold is not in the list.
 */
function detailsOf(facts, name) {
  const values = (facts && facts.values) || {};
  const places = Array.isArray(facts && facts.places) ? facts.places : [];
  const cap = (s) => (typeof s === 'string' && s ? s[0].toUpperCase() + s.slice(1) : '');
  const stay = values.accommodationPlan ? cap(values.accommodationPlan) : [].concat(values.accommodationTowns || []).join(', ');
  const nights = typeof values.stay === 'string' && !/^0(?!\d)/.test(values.stay) ? values.stay : '';
  return [
    { label: 'Traveller', value: name || '' },
    { label: 'Destination', value: places.join(', ') },
    { label: 'Arrival', value: values.arrival || '' },
    { label: 'Departure', value: values.departure || '' },
    { label: 'Length of stay', value: nights },
    { label: 'Staying', value: stay },
  ].filter((d) => d.value);
}

/**
 * Everything the renderer prints.
 * @param {object} input
 * @param {string} input.text          the stored text of the version (decrypted)
 * @param {string} input.reference     the application's reference
 * @param {string} input.applicantName the traveller's name (the continuation header)
 * @param {Array<{label: string, value: string}>} [input.details]  the grid of details, from the answers (only the fields the data has)
 * @param {boolean} input.draft        the version is not approved (or was approved and its answers have changed since)
 * @param {boolean} [input.stale]      the draft was approved once, and the answers changed since: the banner says so
 */
function buildItineraryModel({ text, reference, applicantName, details, draft, stale }) {
  const parsed = parseItinerary(text);
  const blocks = parsed.blocks.map((block) => ({ ...block, rows: block.lines.map(splitTime) }));
  return {
    reference: norm(reference || ''),
    applicantName: norm(applicantName || ''),
    details: (details || []).filter((d) => d && typeof d.value === 'string' && d.value.trim() !== '').map((d) => ({ label: d.label, value: norm(d.value).replace(/\s+/g, ' ').trim() })),
    kicker: parsed.title,
    note: parsed.note,
    blocks,
    hasTimes: blocks.some((block) => block.rows.some((row) => row.time)),
    draft: Boolean(draft),
    stale: Boolean(draft) && Boolean(stale),
  };
}

/**
 * The first place whose text the fonts cannot print: 'details' (the traveller's name or a value taken from the answers) or 'itinerary' (the text
 * itself), or null. The text is never returned: it is an answer.
 */
function unprintableIn(model) {
  const entries = [
    { where: 'details', text: model.applicantName, fonts: ['Sans'] },
    { where: 'details', text: model.reference, fonts: ['Sans', 'SansBold'] },
    ...model.details.map((d) => ({ where: 'details', text: d.value, fonts: ['Serif'] })),
    { where: 'itinerary', text: model.kicker || '', fonts: ['SansBold'] },
    ...(model.note || []).map((line) => ({ where: 'itinerary', text: line, fonts: ['SerifItalic'] })),
    ...model.blocks.flatMap((block) => [
      { where: 'itinerary', text: block.kind === 'day' ? block.title : '', fonts: ['DisplayItalic'] },
      { where: 'itinerary', text: block.kind === 'day' ? `${block.main} ${block.sub}` : '', fonts: ['SansBold'] },
      ...block.rows.flatMap((row) => [
        { where: 'itinerary', text: row.text, fonts: ['Serif'] },
        { where: 'itinerary', text: row.time, fonts: ['SansBold'] },
      ]),
    ]),
  ];
  for (const entry of entries) {
    const found = findUnprintable([entry], entry.fonts);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The design: three densities, chosen by the number of days
// ---------------------------------------------------------------------------

/**
 * The type, the padding and the gaps of a block, and how far the room left on a page may be taken up by each (the caps of the fill rule). A short
 * trip is set larger and airier; a long one is compact so that a page holds several days.
 */
const DENSITIES = Object.freeze({
  // The shortest trips (one or two days) are set large: bigger type, a wider band, more air.
  grand: { title: 34, titleGap: 18, text: 14, pitch: 22, rowPad: 12, pad: 34, gap: 24, bandW: 84, headTitle: 60, minBlock: 130, band: { main: 19, sub: 11 }, cap: { pad: 110, row: 30, gap: 30, header: 60 }, tight: { pad: 22, titleGap: 12, rowPad: 8, gap: 16, minBlock: 100 } },
  comfortable: { title: 21, titleGap: 10, text: 11, pitch: 16.5, rowPad: 6.5, pad: 17, gap: 13, bandW: 64, headTitle: 46, minBlock: 88, band: { main: 13.2, sub: 8.8 }, cap: { pad: 40, row: 16, gap: 18, header: 24 }, tight: { pad: 11, titleGap: 6, rowPad: 3.5, gap: 8, minBlock: 62 } },
  compact: { title: 18, titleGap: 8, text: 10.3, pitch: 14.6, rowPad: 5, pad: 12, gap: 9, bandW: 58, headTitle: 40, minBlock: 80, band: { main: 12, sub: 8.2 }, cap: { pad: 26, row: 9, gap: 13, header: 10 }, tight: { pad: 6.5, titleGap: 4, rowPad: 2.5, gap: 5, minBlock: 54 } },
});
// The density is a band of the number of days (so the type never grows as a trip gets longer, and two trips of about the same length look alike):
// one or two days are set largest, three to nine comfortably, ten or more compactly. The fill rule then takes up the room that is left.
const densityFor = (count) => (count <= 2 ? 'grand' : count <= 9 ? 'comfortable' : 'compact');
const RADIUS = 9;
const TIME_WIDTH = 54;
const TIME_GAP = 9;
const PANEL_PAD = 16;
const RULE_ON_TINT = BRAND.ruleOnTint;

class ItineraryRenderer {
  constructor(model) {
    this.model = model;
    this.b = new DocumentBuilder({
      reference: model.reference,
      applicantName: model.applicantName,
      draft: model.draft,
      stale: model.stale,
      profile: ITINERARY_PAGE,
      info: TEXT.itineraryInfo,
      continuation: { left: TEXT.itineraryTitle, right: model.applicantName },
      edge: false,
      watermark: 'over',
    });
    this.setDensity(densityFor(model.blocks.length));
  }

  setDensity(name) {
    this.densityName = name;
    this.d = DENSITIES[name];
  }

  // ---- text ---------------------------------------------------------------

  /** The text cut into lines that fit the width: at spaces, and inside a word that is longer than a line. */
  wrap(value, style, width) {
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

  line(value, x, y, style) {
    this.b.text(value, x, y, { ...style, plain: true, lineGap: 0, lineBreak: false });
  }

  // ---- the header of the first page ---------------------------------------

  measureHeader() {
    const b = this.b;
    const g = b.geometry;
    const d = this.d;
    const m = { kicker: this.model.kicker, noteLines: [], cells: [], panel: null, height: 0 };
    let height = 0;
    if (m.kicker) height += 16;
    m.titleHeight = b.lineHeight({ font: 'Display', size: d.headTitle, lineGap: 0 }) * 0.92;
    height += m.titleHeight + 10 + 3 + 14;
    if (this.model.note) {
      const style = { font: 'SerifItalic', size: 11 };
      m.noteLines = this.model.note.flatMap((line) => this.wrap(line, style, Math.min(430, g.contentWidth)));
      height += m.noteLines.length * 16 + 16;
    }
    const details = this.model.details;
    if (details.length) {
      const cols = Math.min(3, details.length);
      const colGap = 18;
      const cellW = (g.contentWidth - 2 * PANEL_PAD - (cols - 1) * colGap) / cols;
      const rows = [];
      for (let i = 0; i < details.length; i += cols) {
        const row = details.slice(i, i + cols).map((cell) => ({ ...cell, lines: this.wrap(cell.value, { font: 'Serif', size: 11.2 }, cellW) }));
        rows.push({ cells: row, height: 11 + Math.max(...row.map((c) => c.lines.length)) * 15 });
      }
      const rowGap = 12;
      const panelH = 2 * PANEL_PAD - 2 + rows.reduce((sum, r) => sum + r.height, 0) + (rows.length - 1) * rowGap;
      m.panel = { cols, colGap, cellW, rows, rowGap, height: panelH };
      height += panelH + 22;
    }
    m.height = height;
    return m;
  }

  drawHeader(m, y0) {
    const b = this.b;
    const g = b.geometry;
    const d = this.d;
    let y = y0;
    if (m.kicker) {
      this.line(m.kicker, g.left, y, { font: 'SansBold', size: 9, color: BRAND.accent });
      y += 16;
    }
    this.line(TEXT.itineraryTitle, g.left, y, { font: 'Display', size: d.headTitle, color: BRAND.ink });
    y += m.titleHeight + 10;
    b.fill(g.left, y, 56, 2.8, BRAND.accent);
    y += 3 + 14;
    if (m.noteLines.length) {
      for (const text of m.noteLines) {
        this.line(text, g.left, y, { font: 'SerifItalic', size: 11, color: BRAND.muted });
        y += 16;
      }
      y += 16;
    }
    if (m.panel) {
      const p = m.panel;
      b.doc.save().fillColor(BRAND.greenTint).roundedRect(g.left, y, g.contentWidth, p.height, RADIUS).fill().restore();
      let rowY = y + PANEL_PAD - 1;
      p.rows.forEach((row, r) => {
        row.cells.forEach((cell, c) => {
          const x = g.left + PANEL_PAD + c * (p.cellW + p.colGap);
          if (c > 0) b.doc.save().lineWidth(0.5).strokeColor(RULE_ON_TINT).moveTo(x - p.colGap / 2, rowY).lineTo(x - p.colGap / 2, rowY + row.height - 3).stroke().restore();
          this.line(cell.label, x, rowY, { font: 'SansBold', size: 7.8, color: BRAND.accentDeep });
          cell.lines.forEach((text, i) => this.line(text, x, rowY + 11 + i * 15, { font: 'Serif', size: 11.2, color: BRAND.ink }));
        });
        rowY += row.height + p.rowGap;
        if (r < p.rows.length - 1) b.rule(rowY - p.rowGap / 2 - 1, { weight: 0.5, color: RULE_ON_TINT, x1: g.left + PANEL_PAD, x2: g.right - PANEL_PAD });
      });
    }
  }

  // ---- the blocks ---------------------------------------------------------

  /**
   * The spacing of the blocks at a scale u from 0 to 1: u = 0 is the smallest allowed block size (the `tight` values of the density), u = 1 the
   * largest (the density's own padding plus the room its caps allow). The type sizes do not change with u (they belong to the density); only the
   * padding of a block, the space around its rows and its title, the gap between blocks and the space under the header.
   */
  spacingAt(u) {
    const d = this.d;
    const t = d.tight;
    const lerp = (low, high) => low + (high - low) * u;
    return {
      u,
      pad: lerp(t.pad, d.pad + d.cap.pad / 2),
      titleGap: lerp(t.titleGap, d.titleGap),
      rowPad: lerp(t.rowPad, d.rowPad + d.cap.row / 2),
      gap: lerp(t.gap, d.gap + d.cap.gap),
      minBlock: lerp(t.minBlock, d.minBlock),
      header: d.cap.header * u,
    };
  }

  /** What one block holds, wrapped to the page: its title lines and its rows with their lines (independent of the spacing). */
  measureBlock(block, rows) {
    const b = this.b;
    const g = b.geometry;
    const d = this.d;
    const textLeft = g.left + d.bandW + 20;
    const width = g.right - 18 - textLeft;
    const hasTimes = this.model.hasTimes;
    const rowWidth = width - (hasTimes ? TIME_WIDTH + TIME_GAP : 0);
    const m = { block, titleLines: [], rows: [], textLeft, width, rowWidth };
    if (block.kind === 'day') m.titleLines = this.wrap(block.title, { font: 'DisplayItalic', size: d.title }, width);
    m.titleHeight = m.titleLines.length * d.title * 1.02;
    m.rows = rows.map((row) => ({ ...row, lines: this.wrap(row.text, { font: 'Serif', size: d.text }, rowWidth) }));
    return m;
  }

  /** The height of a measured block at a spacing. */
  heightAt(m, sp) {
    const d = this.d;
    const rowsHeight = m.rows.reduce((sum, row) => sum + row.lines.length * d.pitch + 2 * sp.rowPad, 0) + Math.max(0, m.rows.length - 1) * 0.5;
    const natural = 2 * sp.pad + (m.titleLines.length ? m.titleHeight + (m.rows.length ? sp.titleGap : 0) : 0) + rowsHeight;
    return Math.max(sp.minBlock, natural);
  }

  /** The blocks measured; one too tall for a page (at the smallest size) carries on in a second block (its band and title repeat). */
  measureAll(pageRoom) {
    const sp = this.spacingAt(0);
    const fits = (m) => this.heightAt(m, sp) <= pageRoom;
    const out = [];
    for (const block of this.model.blocks) {
      let rows = block.rows;
      let first = true;
      let guard = 0;
      while (true) {
        let measured = this.measureBlock(block, rows);
        if (rows.length === 1 && !fits(measured) && guard <= 200) {
          // One row taller than a page (one enormous line): it is cut into rows of a few lines each, so that it can carry on in a second block.
          const lines = measured.rows[0].lines;
          const per = Math.max(2, Math.floor((pageRoom - 2 * sp.pad - measured.titleHeight) / this.d.pitch) - 2);
          const chunks = [];
          for (let i = 0; i < lines.length; i += per) chunks.push({ time: i === 0 ? rows[0].time : '', text: lines.slice(i, i + per).join(' ') });
          rows = chunks;
          guard += 1;
          continue;
        }
        if (fits(measured) || rows.length <= 1 || guard > 200) {
          measured.continued = !first;
          out.push(measured);
          break;
        }
        // Too tall: take as many rows as fit, the rest goes to a block of its own.
        let take = rows.length - 1;
        while (take > 1 && !fits(this.measureBlock(block, rows.slice(0, take)))) take -= 1;
        measured = this.measureBlock(block, rows.slice(0, take));
        measured.continued = !first;
        out.push(measured);
        rows = rows.slice(take);
        first = false;
        guard += 1;
      }
    }
    return out;
  }

  // ---- the plan: how many pages, which blocks on which page, and how large the blocks are ----

  /**
   * THE PAGE-BALANCING RULE (step 8h-4). 1. The smallest number of pages the itinerary can take, with the blocks at their smallest size
   * (P). 2. Within P pages, the LARGEST block size (the scale u, up to the density's own maximum) at which every day still fits: the same size
   * on every page, a day block always whole. 3. The days are shared out over the P pages as evenly as the blocks allow (a small dynamic
   * programme), so the last page is not left with a few days. The type sizes of the density, and the "grand" setting for one or two days, are kept.
   */
  plan() {
    const b = this.b;
    const g = b.geometry;
    const header = this.measureHeader();
    const top1 = b.topFor(1);
    const top2 = b.topFor(2);
    const room2 = g.bottom - top2;
    const measured = this.measureAll(room2);
    const n = measured.length;

    const layoutAt = (u) => {
      const sp = this.spacingAt(u);
      const h = measured.map((m) => this.heightAt(m, sp));
      const room1 = g.bottom - top1 - header.height - sp.header;
      return { sp, h, room1 };
    };
    const span = (lay, i, j) => lay.h.slice(i, j).reduce((sum, v) => sum + v, 0) + lay.sp.gap * Math.max(0, j - i - 1);
    // The greedy count is the smallest number of pages for the blocks in order (and it decides whether a size fits in P pages).
    const pagesAt = (u) => {
      const lay = layoutAt(u);
      let pages = 1;
      let room = lay.room1;
      let used = 0;
      let count = 0;
      for (let i = 0; i < n; i += 1) {
        const add = (count ? lay.sp.gap : 0) + lay.h[i];
        if (used + add <= room + 1e-9) {
          used += add;
          count += 1;
          continue;
        }
        if (lay.h[i] > room2 + 1e-9) return Infinity; // a block taller than a page at this size
        pages += 1;
        room = room2;
        used = lay.h[i];
        count = 1;
      }
      return pages;
    };

    const minPages = pagesAt(0);
    let u = 1;
    if (pagesAt(1) > minPages) {
      let low = 0;
      let high = 1;
      for (let k = 0; k < 40; k += 1) {
        const mid = (low + high) / 2;
        if (pagesAt(mid) <= minPages) low = mid;
        else high = mid;
      }
      u = low;
    }
    const lay = layoutAt(u);
    const { sp } = lay;

    // The share-out over exactly minPages pages, as evenly full as the blocks allow (the sum of the squared empty parts of the pages).
    const P = minPages;
    const roomOf = (p) => (p === 0 ? lay.room1 : room2);
    const cost = (p, i, j) => {
      const room = roomOf(p);
      const used = i === j ? 0 : span(lay, i, j);
      if (i === j) return p === 0 && n > 0 && lay.h[0] > lay.room1 + 1e-9 ? 1 : Infinity; // only a first page of the header alone, for a first block too tall to go under it
      if (used > room + 1e-9) return Infinity;
      return ((room - used) / room) ** 2;
    };
    const dp = Array.from({ length: P }, () => new Array(n + 1).fill(Infinity));
    const from = Array.from({ length: P }, () => new Array(n + 1).fill(-1));
    for (let j = 0; j <= n; j += 1) {
      dp[0][j] = cost(0, 0, j);
      from[0][j] = 0;
    }
    for (let p = 1; p < P; p += 1) {
      for (let j = 0; j <= n; j += 1) {
        for (let i = 0; i < j; i += 1) {
          const total = dp[p - 1][i] + cost(p, i, j);
          if (total < dp[p][j]) {
            dp[p][j] = total;
            from[p][j] = i;
          }
        }
      }
    }
    const ranges = [];
    if (n === 0) {
      ranges.push([0, 0]);
    } else if (Number.isFinite(dp[P - 1][n])) {
      let j = n;
      for (let p = P - 1; p >= 0; p -= 1) {
        const i = from[p][j];
        ranges.unshift([i, j]);
        j = i;
      }
    } else {
      // (not reached: minPages pages always have a share-out) the greedy one
      let i = 0;
      let room = lay.room1;
      let used = 0;
      let start = 0;
      for (; i < n; i += 1) {
        const add = (i > start ? sp.gap : 0) + lay.h[i];
        if (used + add > room + 1e-9 && i > start) {
          ranges.push([start, i]);
          start = i;
          used = lay.h[i];
          room = room2;
        } else {
          used += add;
        }
      }
      ranges.push([start, n]);
    }

    const pages = ranges.map(([fromBlock, toBlock], p) => {
      const room = roomOf(p);
      const items = measured.slice(fromBlock, toBlock);
      const used = items.length ? span(lay, fromBlock, toBlock) : 0;
      const start = p === 0 ? top1 + header.height + sp.header : top2;
      let y = start;
      const placed = items.map((m, i) => {
        const height = lay.h[fromBlock + i];
        const slot = { m, y, height, sp };
        y += height + (i < items.length - 1 ? sp.gap : 0);
        return slot;
      });
      // How full the whole page is: the header counts on the first page.
      const whole = p === 0 ? g.bottom - top1 : room2;
      const fill = ((p === 0 ? header.height + sp.header : 0) + used) / whole;
      return { index: p, count: items.length, blocks: placed, header: p === 0 ? header : null, headerExtra: p === 0 ? sp.header : 0, room, used, fill };
    });
    // `sizesAt(u)` gives the sizes the plan was worked out from (for the tests, which count the pages again by themselves).
    const sizesAt = (scale) => {
      const l = layoutAt(scale);
      return { heights: l.h, gap: l.sp.gap, room1: l.room1, room2 };
    };
    return { density: this.densityName, scale: u, minPages, spacing: sp, header, pages, blocks: measured, sizesAt };
  }

  // ---- drawing --------------------------------------------------------------

  drawBlock(slot, index) {
    const b = this.b;
    const g = b.geometry;
    const d = this.d;
    const { m, y, height, sp } = slot;
    const green = index % 2 === 0;
    const band = green ? BRAND.green : BRAND.accent;
    const tint = green ? BRAND.greenTint : BRAND.accentTint;
    const deep = green ? BRAND.greenDeep : BRAND.accentDeep;
    const doc = b.doc;
    doc.save().fillColor(tint).roundedRect(g.left, y, g.contentWidth, height, RADIUS).fill().restore();
    // The band: square on the right, rounded on the left with the same corners as the block behind it (cubic curves, k = 0.5523).
    const r = RADIUS;
    const k = 0.5523 * r;
    const x = g.left;
    doc.save().fillColor(band)
      .moveTo(x + r, y).lineTo(x + d.bandW, y).lineTo(x + d.bandW, y + height).lineTo(x + r, y + height)
      .bezierCurveTo(x + r - k, y + height, x, y + height - r + k, x, y + height - r)
      .lineTo(x, y + r)
      .bezierCurveTo(x, y + r - k, x + r - k, y, x + r, y)
      .fill().restore();
    // The label of the day, turned on its side in white, and the date under it (the smaller line beside it).
    const cx = g.left + d.bandW / 2;
    const cy = y + height / 2;
    const block = m.block;
    if (block.kind === 'day') {
      const sub = block.sub;
      b.rotatedText(block.main, sub ? cx - 7.5 : cx, cy, { font: 'SansBold', size: d.band.main });
      if (sub) b.rotatedText(sub, cx + 5 + d.band.sub, cy, { font: 'Sans', size: d.band.sub });
    }
    // The title in italic, and the rows with hairlines.
    let cursor = y + sp.pad;
    if (m.titleLines.length) {
      for (const text of m.titleLines) {
        this.line(text, m.textLeft, cursor, { font: 'DisplayItalic', size: d.title, color: deep });
        cursor += d.title * 1.02;
      }
      if (m.rows.length) cursor += sp.titleGap;
    }
    m.rows.forEach((row, i) => {
      const rowHeight = row.lines.length * d.pitch + 2 * sp.rowPad;
      const top = cursor + sp.rowPad;
      const base = b.ascent({ font: 'Serif', size: d.text });
      if (this.model.hasTimes && row.time) this.line(row.time, m.textLeft, top + base - b.ascent({ font: 'SansBold', size: 9.4 }), { font: 'SansBold', size: 9.4, color: deep });
      const x = m.textLeft + (this.model.hasTimes ? TIME_WIDTH + TIME_GAP : 0);
      row.lines.forEach((text, k) => this.line(text, x, top + k * d.pitch, { font: 'Serif', size: d.text, color: BRAND.ink }));
      cursor += rowHeight;
      if (i < m.rows.length - 1) b.rule(cursor, { weight: 0.5, color: RULE_ON_TINT, x1: m.textLeft, x2: g.right - 18 });
      cursor += 0.5;
    });
  }

  render() {
    const b = this.b;
    const plan = this.plan();
    let blockIndex = 0;
    plan.pages.forEach((page, p) => {
      if (p > 0) b.newPage();
      if (p === 0) this.drawHeader(plan.header, b.topFor(1));
      for (const slot of page.blocks) {
        this.drawBlock(slot, blockIndex);
        blockIndex += 1;
      }
    });
    return b.finish();
  }
}

/** The layout of the model without drawing it: { density, header, pages: [{ count, blocks, room, used, fill }] }. For the tests and for the report. */
function planItinerary(model) {
  const renderer = new ItineraryRenderer(model);
  try {
    return renderer.plan();
  } finally {
    renderer.b.abort();
  }
}

/** The PDF of the model, as a Buffer. Rejects (never throws at once) with the builder's PdfError for a document that is too long. */
async function renderItineraryPdf(model) {
  const renderer = new ItineraryRenderer(model);
  try {
    return await renderer.render();
  } catch (error) {
    renderer.b.abort();
    throw error;
  }
}

module.exports = { parseItinerary, headingParts, splitTime, detailsOf, buildItineraryModel, unprintableIn, planItinerary, renderItineraryPdf, DENSITIES };
