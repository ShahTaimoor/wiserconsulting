// Run with: npm run test:unit   (from client/)
// The browser's half of making a file smaller, run on REAL PDFs with the real pdf.js under Node (its worker file is handed in). Node has no canvas, so
// what these tests prove is the DECISION: which PDFs are given up before anything is drawn (a text layer, a password, too many pages, a file that
// cannot be read), and that a scan IS recognised (it goes on to draw, which fails here for want of a canvas: the real drawing is checked in a real
// browser). The time limit and the cancel are tested on a scan. Made-up PDFs only.

import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createBrowserEngine } from "./touristVisaCompressBrowser.ts";
import { COMPRESS, prepareFile } from "./touristVisaCompress.ts";

const require = createRequire(import.meta.url);
const engine = createBrowserEngine({ workerSrc: pathToFileURL(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs")).href });
const MB = 1024 * 1024;
const signal = () => new AbortController().signal;

// --- made-up files ----------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** A PNG of noise (it does not compress, so the PDF that holds it is as large as a photo of a page). */
function noisePng(width, height) {
  const rows = Buffer.alloc(height * (1 + width * 3));
  let seed = 12345;
  for (let i = 0; i < rows.length; i += 1) { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; rows[i] = (seed >> 16) & 255; }
  for (let y = 0; y < height; y += 1) rows[y * (1 + width * 3)] = 0; // filter: none
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(rows, { level: 1 })), chunk("IEND", Buffer.alloc(0))]);
}

/** A PDF of `pages` A4 pages: each a photo over the whole page, and `text` on it when given. */
async function pdfOf({ pages = 1, photo = true, text = null, photoSize = [200, 280] } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const picture = photo ? await doc.embedPng(noisePng(...photoSize)) : null;
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([595, 842]);
    if (picture) page.drawImage(picture, { x: 0, y: 0, width: 595, height: 842 });
    if (text) page.drawText(text, { x: 40, y: 780, size: 12, font });
  }
  return new File([await doc.save()], "doc.pdf", { type: "application/pdf" });
}
const TEXT = "This is the text layer of a normal PDF, with plenty of words on the page.";

async function encryptedPdf() {
  const PDFKit = require("../../../backend/node_modules/pdfkit");
  const doc = new PDFKit({ userPassword: "secret", ownerPassword: "owner" });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", resolve));
  doc.text("A page of a password-protected PDF.");
  doc.end();
  await done;
  return new File([Buffer.concat(chunks)], "locked.pdf", { type: "application/pdf" });
}

// --- the decisions ----------------------------------------------------------

test("a normal text PDF is never rasterised: it is left exactly as it is", async () => {
  assert.equal(await engine.pdf(await pdfOf({ photo: false, text: TEXT }), COMPRESS.pdf, signal()), null);
});

test("a PDF with a text layer is left alone even when its pages are mostly a picture (an OCR'd scan, a statement with a logo)", async () => {
  assert.equal(await engine.pdf(await pdfOf({ pages: 3, photo: true, text: TEXT }), COMPRESS.pdf, signal()), null);
});

test("a PDF of blank pages, or of small pictures, is not a scan", async () => {
  assert.equal(await engine.pdf(await pdfOf({ pages: 2, photo: false }), COMPRESS.pdf, signal()), null);
});

test("a password-protected PDF is left exactly as it is", async () => {
  assert.equal(await engine.pdf(await encryptedPdf(), COMPRESS.pdf, signal()), null);
});

test("a PDF of more than 30 pages is left alone; one of exactly 30 pages that is a scan goes on to be drawn", async () => {
  assert.equal(await engine.pdf(await pdfOf({ pages: 31 }), COMPRESS.pdf, signal()), null, "31 pages");
  // 30 pages, every one a photo and no text: it is recognised as a scan, and drawing it needs a canvas, which Node does not have.
  await assert.rejects(engine.pdf(await pdfOf({ pages: 30 }), COMPRESS.pdf, signal()), /document|canvas|OffscreenCanvas/i);
});

test("a scan IS recognised: no text and a picture over the page makes it go on to draw (which needs a canvas)", async () => {
  await assert.rejects(engine.pdf(await pdfOf({ pages: 2 }), COMPRESS.pdf, signal()), /document|canvas|OffscreenCanvas/i);
});

test("a file that is not a readable PDF is left alone", async () => {
  const garbage = new File([new TextEncoder().encode("%PDF-1.7\nthis is not really a pdf at all")], "broken.pdf", { type: "application/pdf" });
  let outcome;
  try { outcome = await engine.pdf(garbage, COMPRESS.pdf, signal()); } catch { outcome = "threw"; }
  assert.ok(outcome === null || outcome === "threw", "nothing was produced");
});

test("the time limit: a scan that takes longer than the limit stops with a timeout", async () => {
  // A file that is slow to read (the limit is 1 ms and reading it takes 40 ms): the limit is checked as soon as the document is open.
  const scan = await pdfOf({ pages: 2 });
  const slow = new File([scan], "slow.pdf", { type: "application/pdf" });
  slow.arrayBuffer = async () => { await new Promise((resolve) => setTimeout(resolve, 40)); return Blob.prototype.arrayBuffer.call(scan); };
  await assert.rejects(engine.pdf(slow, { ...COMPRESS.pdf, timeoutMs: 1 }, signal()), /timeout/);
  // and through prepareFile a timeout keeps the original
  const big = await pdfOf({ pages: 2, photoSize: [700, 700] });
  const slowBig = new File([big], "slow.pdf", { type: "application/pdf" });
  slowBig.arrayBuffer = slow.arrayBuffer;
  const quick = createBrowserEngine({ workerSrc: pathToFileURL(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs")).href });
  const limited = { image: quick.image, pdf: (file, plan, abortSignal) => quick.pdf(file, { ...plan, timeoutMs: 1 }, abortSignal) };
  const out = await prepareFile(slowBig, { maxFileBytes: 4 * MB, engine: limited });
  assert.deepEqual([out.status, out.file === slowBig], ["kept", true]);
});

test("cancel: an aborted signal stops it with an abort, before anything is drawn", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(engine.pdf(await pdfOf({ pages: 2 }), COMPRESS.pdf, controller.signal), (error) => error.name === "AbortError");
  const during = new AbortController();
  const running = engine.pdf(await pdfOf({ pages: 2 }), COMPRESS.pdf, during.signal);
  during.abort();
  await assert.rejects(running, (error) => error.name === "AbortError" || /canvas|document|OffscreenCanvas/i.test(error.message), "stopped (here the missing canvas can come first)");
});

// --- through prepareFile, the way the page uses it --------------------------

test("through prepareFile: a text PDF over 1 MB is kept as it is when within the limit, and refused as too large when over it", async () => {
  const bytes = noisePng(700, 700); // a 1.4 MB picture inside a PDF with text
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawImage(await doc.embedPng(bytes), { x: 50, y: 300, width: 300, height: 300 });
  page.drawText(TEXT, { x: 40, y: 780, size: 12, font });
  const file = new File([await doc.save()], "statement.pdf", { type: "application/pdf" });
  assert.ok(file.size > 1 * MB, `the made-up file is ${file.size} bytes`);
  const within = await prepareFile(file, { maxFileBytes: 4 * MB, engine });
  assert.deepEqual([within.status, within.file === file, within.message], ["kept", true, "Already small, kept as it is"]);
  const over = await prepareFile(file, { maxFileBytes: 1 * MB, engine });
  assert.deepEqual([over.status, over.file === file], ["too_large", true]);
});

test("through prepareFile: a scan that cannot be drawn (here: no canvas), a locked PDF, a timeout and a cancel all keep or release the original, never upload something else", async () => {
  const scan = await pdfOf({ pages: 2, photoSize: [700, 700] });
  const big = new File([scan], "scan.pdf", { type: "application/pdf" });
  const failed = await prepareFile(big, { maxFileBytes: 4 * MB, engine });
  assert.ok(["kept", "too_large"].includes(failed.status) && failed.file === big, "the original, whatever happened");

  const locked = await encryptedPdf();
  const lockedBig = new File([locked, new Uint8Array(1.2 * MB)], "locked.pdf", { type: "application/pdf" });
  assert.equal((await prepareFile(lockedBig, { maxFileBytes: 4 * MB, engine })).status, "kept");

  const controller = new AbortController();
  const pending = prepareFile(big, { maxFileBytes: 4 * MB, engine, signal: controller.signal });
  controller.abort();
  assert.equal((await pending).status, "cancelled");
});

test("images: a picture too big to decode safely is given up before it is decoded; one that cannot be read is left alone", async () => {
  // A PNG whose header says 20000 x 20000 pixels (400 megapixels), padded to 3 MB: the cap refuses it without decoding.
  const header = noisePng(2, 2).subarray(0, 33);
  header.writeUInt32BE(20000, 16);
  header.writeUInt32BE(20000, 20);
  const absurd = new File([header, new Uint8Array(3 * MB)], "huge.png", { type: "image/png" });
  await assert.rejects(engine.image(absurd, COMPRESS.image, signal()), /too many pixels/);
  const out = await prepareFile(absurd, { maxFileBytes: 4 * MB, engine });
  assert.deepEqual([out.status, out.file === absurd], ["kept", true], "within the limit: kept as it is");
  const tooBig = await prepareFile(absurd, { maxFileBytes: 2 * MB, engine });
  assert.equal(tooBig.status, "too_large", "over the limit: the 'choose a smaller photo' message");
  const unreadable = new File([new TextEncoder().encode("not a picture at all"), new Uint8Array(2 * MB)], "x.jpg", { type: "image/jpeg" });
  assert.equal(await engine.image(unreadable, COMPRESS.image, signal()), null);
  assert.equal((await prepareFile(unreadable, { maxFileBytes: 4 * MB, engine })).status, "kept");
});
