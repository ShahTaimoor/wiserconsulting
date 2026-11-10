'use strict';

// Reads a generated PDF back for the tests: every page's size, every piece of text with its position, size and font, the metadata, and the
// raw bytes' fixed parts. pdfjs-dist (a dev dependency) does the reading; nothing here is used by the application.

let pdfjsPromise;
const pdfjs = () => {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
};

/** The pieces of text of a page, each { str, x, y, width, height, size, font }: x and y from the bottom left corner, in points. */
async function pageItems(page) {
  const content = await page.getTextContent();
  await page.getOperatorList(); // loads the fonts, so their real names can be read
  return content.items
    .filter((item) => typeof item.str === 'string' && item.str !== '')
    .map((item) => {
      let font = item.fontName;
      try {
        const loaded = page.commonObjs.get(item.fontName);
        if (loaded && loaded.name) font = loaded.name;
      } catch { /* a font that is not loaded keeps its internal name */ }
      return { str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height, size: Math.hypot(item.transform[0], item.transform[1]), angle: Math.round((Math.atan2(item.transform[1], item.transform[0]) * 180) / Math.PI), font };
    });
}

/** The items of a page grouped into lines (same baseline), top to bottom, left to right: [{ y, x, text, items }]. */
function linesOf(items) {
  const lines = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l.y - item.y) < 1.2);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines.map((line) => {
    const sorted = line.items.sort((a, b) => a.x - b.x);
    return { y: line.y, x: sorted[0].x, items: sorted, text: sorted.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim() };
  });
}

/** Everything the tests ask about a PDF. */
async function inspectPdf(buffer) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;
  const meta = await doc.getMetadata();
  const pages = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const items = await pageItems(page);
    pages.push({ number: n, width: page.view[2], height: page.view[3], items, lines: linesOf(items), text: linesOf(items).map((l) => l.text).join('\n') });
  }
  const raw = buffer.toString('latin1');
  return {
    numPages: doc.numPages,
    info: meta.info || {},
    pages,
    text: pages.map((p) => p.text).join('\n'),
    raw,
    // The parts of the file that are plain bytes (the dictionaries), for what must not be in it.
    embeddedFonts: (raw.match(/\/FontFile2/g) || []).length,
  };
}

/** The 1-based number of the page a piece of text is on (the first), or 0. */
const pageOf = (pdf, needle) => {
  const found = pdf.pages.find((page) => page.text.includes(needle));
  return found ? found.number : 0;
};

/** The drawing instructions of every page of a file, as text (the content streams, inflated): for what the text reader cannot see, such as lines and rectangles. */
function contentStreams(buffer) {
  const inflate = require('node:zlib').inflateSync;
  const raw = buffer.toString('latin1');
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    try {
      const text = inflate(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1');
      if (/\bBT\b|\bre\b|\bl\b/.test(text)) out.push(text);
    } catch { /* not a deflate stream (a font or an image) */ }
  }
  return out;
}

module.exports = { inspectPdf, linesOf, pageOf, contentStreams };
