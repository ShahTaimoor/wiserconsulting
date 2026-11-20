// Run with: npm run test:unit   (from client/)
// Making a file smaller in the browser before it is uploaded: the decisions, the size and dimension maths, the naming, the fallbacks, whether a PDF
// is a scan, the time limit, and what the applicant is told. The browser's half (canvas, pdf.js) is replaced by a fake engine here; the PDF half is
// tested on real PDFs in touristVisaCompressBrowser.test.mjs. Made-up files only.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import backend from "../../../backend/config/touristVisaDocuments.js";
import { formatBytes, preCheckFile } from "./touristVisaDocuments.ts";
import {
  COMPRESS,
  COMPRESS_MESSAGES,
  abortAfter,
  compressedName,
  fileKind,
  imageCoverage,
  imageTarget,
  isScanPage,
  isWorthKeeping,
  looksLikeScan,
  megapixels,
  pdfRenderScale,
  prepareFile,
  readImageInfo,
  sampledPageNumbers,
  shouldSkip,
} from "./touristVisaCompress.ts";

const MB = 1024 * 1024;
const limits = backend.publicLimits(); // the server's own numbers, as the page receives them
const MAX = limits.maxFileBytes;
const fileOf = (name, size, type) => new File([new Uint8Array(size)], name, { type });
const blobOf = (size) => new Blob([new Uint8Array(size)]);

/** A fake engine: records what it was asked, and answers with `image` / `pdf` (a Blob, null, or a function that may throw or wait). */
function fakeEngine({ image = null, pdf = null } = {}) {
  const calls = [];
  const answer = (value) => (typeof value === "function" ? value : async () => value);
  return {
    calls,
    image: async (file, plan, signal) => { calls.push(["image", file.name, plan]); return answer(image)(file, plan, signal); },
    pdf: async (file, plan, signal) => { calls.push(["pdf", file.name, plan]); return answer(pdf)(file, plan, signal); },
  };
}
const prepare = (file, engine, extra = {}) => prepareFile(file, { maxFileBytes: MAX, engine, ...extra });

// ---------------------------------------------------------------------------
// What kind of file
// ---------------------------------------------------------------------------

test("fileKind: by the type the browser reports, or by the extension when it reports nothing; anything else is not ours", () => {
  assert.equal(fileKind({ name: "a.jpg", type: "image/jpeg" }), "image");
  assert.equal(fileKind({ name: "a.png", type: "image/png" }), "image");
  assert.equal(fileKind({ name: "a.pdf", type: "application/pdf" }), "pdf");
  assert.equal(fileKind({ name: "SCAN.JPEG", type: "" }), "image");
  assert.equal(fileKind({ name: "scan.PDF", type: "application/octet-stream" }), "pdf");
  assert.equal(fileKind({ name: "a.gif", type: "image/gif" }), null);
  assert.equal(fileKind({ name: "a.docx", type: "" }), null);
  assert.equal(fileKind({ name: "noextension", type: "" }), null);
  assert.equal(fileKind({ name: "a.jpg", type: "text/plain" }), null, "a reported type wins over the extension");
});

// ---------------------------------------------------------------------------
// The decisions
// ---------------------------------------------------------------------------

test("shouldSkip: a file of about 1 MB or less is left alone (when it is also within the server's limit)", () => {
  assert.equal(shouldSkip(1, MAX), true);
  assert.equal(shouldSkip(1 * MB, MAX), true, "exactly 1 MB");
  assert.equal(shouldSkip(1 * MB + 1, MAX), false);
  assert.equal(shouldSkip(900 * 1024, MAX), true);
  assert.equal(shouldSkip(800 * 1024, 500 * 1024), false, "over the limit it is not small enough to leave, whatever its size");
});

test("isWorthKeeping: the result must be at least 10% smaller", () => {
  assert.equal(isWorthKeeping(1000, 900), true, "exactly 10% smaller");
  assert.equal(isWorthKeeping(1000, 901), false);
  assert.equal(isWorthKeeping(1000, 100), true);
  assert.equal(isWorthKeeping(1000, 1000), false);
  assert.equal(isWorthKeeping(1000, 1200), false, "larger");
  assert.equal(isWorthKeeping(1000, 0), false, "an empty result is never kept");
});

test("compressedName: an image becomes .jpg with the same base name; odd names are handled; a PDF keeps its name", () => {
  assert.equal(compressedName("IMG_2041.jpeg", "image"), "IMG_2041.jpg");
  assert.equal(compressedName("passport scan.PNG", "image"), "passport scan.jpg");
  assert.equal(compressedName("a.b.c.png", "image"), "a.b.c.jpg");
  assert.equal(compressedName("photo", "image"), "photo.jpg");
  assert.equal(compressedName(".png", "image"), "photo.jpg", "nothing before the dot");
  assert.equal(compressedName("", "image"), "photo.jpg");
  assert.equal(compressedName("name. .jpg", "image"), "name.jpg");
  assert.equal(compressedName("C:\\folder\\pic.png", "image"), "C:_folder_pic.jpg", "no path separators");
  assert.equal(compressedName("réçu 日本.png", "image"), "réçu 日本.jpg");
  assert.equal(compressedName("statement.pdf", "pdf"), "statement.pdf");
});

// ---------------------------------------------------------------------------
// Size and dimension maths
// ---------------------------------------------------------------------------

test("imageTarget: the long side is at most the cap, never enlarged, the shape kept", () => {
  assert.deepEqual(imageTarget(4000, 3000, 1, 2200), { width: 2200, height: 1650, scaled: true });
  assert.deepEqual(imageTarget(3000, 4000, 1, 2200), { width: 1650, height: 2200, scaled: true });
  assert.deepEqual(imageTarget(2200, 1000, 1, 2200), { width: 2200, height: 1000, scaled: false }, "exactly the cap: not scaled");
  assert.deepEqual(imageTarget(1200, 800, 1, 2200), { width: 1200, height: 800, scaled: false }, "never enlarged");
  assert.deepEqual(imageTarget(1, 1, 1, 2200), { width: 1, height: 1, scaled: false });
  const panorama = imageTarget(12000, 100, 1, 2200);
  assert.deepEqual(panorama, { width: 2200, height: 18, scaled: true });
  assert.equal(imageTarget(20000, 1, 1, 2200).height, 1, "a side is never 0");
});

test("imageTarget: a photo stored sideways (EXIF orientations 5 to 8) is measured the way it is shown", () => {
  assert.deepEqual(imageTarget(4000, 3000, 6, 2200), { width: 1650, height: 2200, scaled: true });
  assert.deepEqual(imageTarget(1600, 1200, 8, 2200), { width: 1200, height: 1600, scaled: false });
  for (const orientation of [1, 2, 3, 4]) assert.deepEqual(imageTarget(4000, 3000, orientation, 2200), { width: 2200, height: 1650, scaled: true });
});

test("megapixels, and the cap on absurd images", () => {
  assert.equal(megapixels(4000, 3000), 12);
  assert.ok(COMPRESS.image.maxMegapixels >= 48 && COMPRESS.image.maxMegapixels <= 200, "a 48 MP phone photo is allowed, a billion pixels is not");
});

test("pdfRenderScale: about 150 dpi, drawn smaller when the page would have too many pixels", () => {
  assert.ok(Math.abs(pdfRenderScale(595, 842, 150, COMPRESS.pdf.maxPagePixels) - 150 / 72) < 1e-9, "an A4 page at 150 dpi");
  const huge = pdfRenderScale(5000, 7000, 150, 12_000_000);
  assert.ok(huge < 150 / 72);
  assert.ok(5000 * huge * 7000 * huge <= 12_000_000 * 1.0001, "never more pixels than the cap");
});

test("sampledPageNumbers: the first, the middle and the last page, each once", () => {
  assert.deepEqual(sampledPageNumbers(1, 3), [1]);
  assert.deepEqual(sampledPageNumbers(2, 3), [1, 2]);
  assert.deepEqual(sampledPageNumbers(3, 3), [1, 2, 3]);
  assert.deepEqual(sampledPageNumbers(10, 3), [1, 5, 10]);
  assert.deepEqual(sampledPageNumbers(30, 3), [1, 15, 30]);
  assert.deepEqual(sampledPageNumbers(0, 3), []);
});

// ---------------------------------------------------------------------------
// Reading the size of a JPEG or a PNG
// ---------------------------------------------------------------------------

const ascii = (text) => [...text].map((c) => c.charCodeAt(0));
const exifSegment = (orientation, little) => {
  const header = little ? [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0] : [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8];
  const entries = little ? [1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0] : [0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0];
  const body = [...ascii("Exif"), 0, 0, ...header, ...entries, 0, 0, 0, 0];
  const length = body.length + 2;
  return [0xff, 0xe1, length >> 8, length & 255, ...body];
};
const sof0 = (w, h) => [0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
const dqt = [0xff, 0xdb, 0, 5, 0, 1, 2];
const jpeg = (...parts) => Uint8Array.from([0xff, 0xd8, ...parts.flat(), 0xff, 0xd9]);

test("readImageInfo: the size and the EXIF orientation of a JPEG, read without decoding it", () => {
  assert.deepEqual(readImageInfo(jpeg(sof0(4000, 3000))), { width: 4000, height: 3000, orientation: 1 });
  assert.deepEqual(readImageInfo(jpeg(exifSegment(6, false), sof0(4000, 3000))), { width: 4000, height: 3000, orientation: 6 }, "big-endian EXIF");
  assert.deepEqual(readImageInfo(jpeg(exifSegment(8, true), dqt, sof0(640, 480))), { width: 640, height: 480, orientation: 8 }, "little-endian EXIF, a table before the frame");
  assert.equal(readImageInfo(jpeg(exifSegment(9, false), sof0(10, 10))).orientation, 1, "an impossible orientation is none");
});

test("readImageInfo: a PNG, and everything that is not a readable picture is null", () => {
  const png = (w, h) => {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii("IHDR"), w >>> 24, (w >> 16) & 255, (w >> 8) & 255, w & 255, h >>> 24, (h >> 16) & 255, (h >> 8) & 255, h & 255]);
    return b;
  };
  assert.deepEqual(readImageInfo(png(1920, 1080)), { width: 1920, height: 1080, orientation: 1 });
  assert.deepEqual(readImageInfo(png(70000, 3)), { width: 70000, height: 3, orientation: 1 });
  assert.equal(readImageInfo(new Uint8Array(0)), null);
  assert.equal(readImageInfo(Uint8Array.from(ascii("%PDF-1.7 not a picture"))), null);
  assert.equal(readImageInfo(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 2])), null, "a JPEG that ends before its frame");
  assert.equal(readImageInfo(jpeg(sof0(0, 100))), null, "zero width");
  assert.equal(readImageInfo(png(0, 5)), null);
});

// ---------------------------------------------------------------------------
// Is this PDF a scan?
// ---------------------------------------------------------------------------

const OPS = { save: 10, restore: 11, transform: 12, images: [85, 86] };
const page = [595, 842];

test("imageCoverage: how much of the page the biggest picture covers, following save, restore and transform", () => {
  const cover = (fn, args) => imageCoverage(fn, args, OPS, ...page);
  // q 595 0 0 842 0 0 cm /Im0 Do Q: the picture is the whole page
  assert.ok(Math.abs(cover([10, 12, 85, 11], [[], [595, 0, 0, 842, 0, 0], ["img"], []]) - 1) < 1e-9);
  // a small logo
  assert.ok(cover([10, 12, 85, 11], [[], [60, 0, 0, 30, 20, 20], ["logo"], []]) < 0.01);
  // transformations multiply: 2 x 2 then the page size
  assert.ok(Math.abs(cover([10, 12, 12, 86, 11], [[], [2, 0, 0, 2, 0, 0], [297.5, 0, 0, 421, 0, 0], ["img"], []]) - 1) < 1e-9);
  // restore puts the transformation back: the picture after Q is drawn at the identity (one unit square)
  assert.ok(cover([10, 12, 11, 85], [[], [595, 0, 0, 842, 0, 0], [], ["img"]]) < 0.001);
  // a rotated page-size picture still covers the page
  assert.ok(Math.abs(cover([12, 85], [[0, 842, -595, 0, 595, 0], ["img"]]) - 1) < 1e-9);
  assert.equal(cover([], []), 0, "no operators");
  assert.equal(cover([1, 2], [[], []]), 0, "no picture at all");
  assert.equal(imageCoverage([85], [[]], OPS, 0, 0), 0, "a page of no size");
});

test("isScanPage and looksLikeScan: almost no text and a picture over most of the page, on every page looked at", () => {
  assert.equal(isScanPage({ textChars: 0, coverage: 1 }), true);
  assert.equal(isScanPage({ textChars: 12, coverage: 0.9 }), true, "a page number or two is not a text layer");
  assert.equal(isScanPage({ textChars: 21, coverage: 1 }), false, "a text layer");
  assert.equal(isScanPage({ textChars: 0, coverage: 0.2 }), false, "a small picture on a blank page");
  assert.equal(isScanPage({ textChars: 0, coverage: 0.5 }), true);
  assert.equal(looksLikeScan([]), false, "nothing was looked at");
  assert.equal(looksLikeScan([{ textChars: 0, coverage: 1 }, { textChars: 0, coverage: 1 }]), true);
  assert.equal(looksLikeScan([{ textChars: 0, coverage: 1 }, { textChars: 900, coverage: 0 }, { textChars: 0, coverage: 1 }]), false, "one text page and it is not a scan");
});

// ---------------------------------------------------------------------------
// The time limit
// ---------------------------------------------------------------------------

test("abortAfter: aborts after the time, or when the parent aborts, says which, and dispose stops the timer", async () => {
  const slow = abortAfter(undefined, 15);
  assert.equal(slow.signal.aborted, false);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(slow.signal.aborted, true);
  assert.equal(slow.timedOut(), true);
  slow.dispose();

  const parent = new AbortController();
  const guard = abortAfter(parent.signal, 10_000);
  parent.abort();
  assert.equal(guard.signal.aborted, true);
  assert.equal(guard.timedOut(), false, "cancelled, not timed out");
  guard.dispose();

  const early = new AbortController();
  early.abort();
  const already = abortAfter(early.signal, 10_000);
  assert.equal(already.signal.aborted, true);
  already.dispose();

  const quick = abortAfter(undefined, 20);
  quick.dispose();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(quick.signal.aborted, false, "a disposed guard never fires");
});

// ---------------------------------------------------------------------------
// What happens to a picked file
// ---------------------------------------------------------------------------

test("a small file is left alone without asking the engine, and says so", async () => {
  const engine = fakeEngine({ image: blobOf(10) });
  for (const file of [fileOf("a.jpg", 400 * 1024, "image/jpeg"), fileOf("b.pdf", 900 * 1024, "application/pdf"), fileOf("c.png", 1 * MB, "image/png")]) {
    const out = await prepare(file, engine);
    assert.equal(out.status, "kept");
    assert.equal(out.file, file, "the very same file");
    assert.equal(out.message, "Already small, kept as it is");
    assert.equal(out.note, "Already small, kept as it is");
  }
  assert.equal(engine.calls.length, 0);
});

test("a big photo is made smaller: the result is the .jpg that is uploaded, with the sizes in the message", async () => {
  const original = fileOf("IMG_2041.JPG", 5 * MB + 200 * 1024, "image/jpeg");
  const engine = fakeEngine({ image: blobOf(900 * 1024) });
  const out = await prepare(original, engine);
  assert.equal(out.status, "reduced");
  assert.equal(out.file.name, "IMG_2041.jpg");
  assert.equal(out.file.type, "image/jpeg");
  assert.equal(out.file.size, 900 * 1024);
  assert.equal(out.originalSize, original.size);
  assert.equal(out.finalSize, 900 * 1024);
  assert.equal(out.message, `Reduced from ${formatBytes(original.size)} to ${formatBytes(900 * 1024)}`);
  assert.equal(out.message, "Reduced from 5.2 MB to 900 KB".replace("900 KB", formatBytes(900 * 1024)));
  assert.equal(out.note, out.message, "the same line stays by the file");
  // the engine was asked with the plan of the rules, not with numbers of the server
  assert.deepEqual(engine.calls, [["image", "IMG_2041.JPG", COMPRESS.image]]);
});

test("a PNG screenshot becomes a .jpg; a scanned PDF keeps its name and type", async () => {
  const png = await prepare(fileOf("Screenshot 2026.png", 6 * MB, "image/png"), fakeEngine({ image: blobOf(700 * 1024) }));
  assert.deepEqual([png.status, png.file.name, png.file.type], ["reduced", "Screenshot 2026.jpg", "image/jpeg"]);
  const engine = fakeEngine({ pdf: blobOf(2 * MB) });
  const scan = await prepare(fileOf("bank statement.pdf", 7 * MB, "application/pdf"), engine);
  assert.deepEqual([scan.status, scan.file.name, scan.file.type, scan.file.size], ["reduced", "bank statement.pdf", "application/pdf", 2 * MB]);
  assert.equal(scan.message, `Reduced from ${formatBytes(7 * MB)} to ${formatBytes(2 * MB)}`);
  assert.deepEqual(engine.calls.map((call) => call[0]), ["pdf"], "a PDF is never given to the image engine");
});

test("fallbacks: not at least 10% smaller, an engine that says null, or one that throws, all keep the original", async () => {
  const original = fileOf("photo.jpg", 3 * MB, "image/jpeg");
  const larger = await prepare(original, fakeEngine({ image: blobOf(3 * MB + 5) }));
  assert.deepEqual([larger.status, larger.file === original], ["kept", true]);
  const barely = await prepare(original, fakeEngine({ image: blobOf(Math.floor(3 * MB * 0.95)) }));
  assert.deepEqual([barely.status, barely.file === original, barely.message], ["kept", true, "Already small, kept as it is"]);
  const nothing = await prepare(original, fakeEngine({ image: null }));
  assert.deepEqual([nothing.status, nothing.file === original], ["kept", true]);
  const broke = await prepare(original, fakeEngine({ image: async () => { throw new Error("decode failed"); } }));
  assert.deepEqual([broke.status, broke.file === original, broke.message], ["kept", true, "Already small, kept as it is"]);
});

test("a file still over the limit after the attempt is never sent: the message says so", async () => {
  const big = fileOf("scan.jpg", 9 * MB, "image/jpeg");
  const stillBig = await prepare(big, fakeEngine({ image: blobOf(MAX + 1) }));
  assert.equal(stillBig.status, "too_large");
  assert.equal(stillBig.file, big);
  assert.equal(stillBig.message, "We could not make this file small enough. Choose a smaller file or a clearer, lower-resolution photo.");
  assert.equal(stillBig.note, null);
  assert.equal((await prepare(big, fakeEngine({ image: null }))).status, "too_large", "nothing could be done");
  assert.equal((await prepare(big, fakeEngine({ image: async () => { throw new Error("x"); } }))).status, "too_large", "the engine failed");
  const exactly = await prepare(big, fakeEngine({ image: blobOf(MAX) }));
  assert.deepEqual([exactly.status, exactly.file.size], ["reduced", MAX], "a file of exactly the limit is allowed");
  // a text PDF over the limit: the engine leaves it (null), so it is too large
  const text = await prepare(fileOf("statement.pdf", 6 * MB, "application/pdf"), fakeEngine({ pdf: null }));
  assert.equal(text.status, "too_large");
});

test("the limit is the server's: a different limit changes the outcome, and nothing here has a number of its own", async () => {
  const original = fileOf("photo.jpg", 6 * MB, "image/jpeg");
  const result = blobOf(3 * MB);
  assert.equal((await prepareFile(original, { maxFileBytes: 2 * MB, engine: fakeEngine({ image: result }) })).status, "too_large");
  assert.equal((await prepareFile(original, { maxFileBytes: 3 * MB, engine: fakeEngine({ image: result }) })).status, "reduced");
  assert.equal((await prepareFile(original, { maxFileBytes: 50 * MB, engine: fakeEngine({ image: result }) })).status, "reduced");
  // a 2 MB file within a 50 MB limit is still prepared (it is over 1 MB), and one within the skip size is left whatever the limit is
  const mid = fileOf("mid.jpg", 2 * MB, "image/jpeg");
  const engine = fakeEngine({ image: blobOf(1 * MB) });
  assert.equal((await prepareFile(mid, { maxFileBytes: 50 * MB, engine })).status, "reduced");
  // the code does not contain the server's number: read the sources, comments removed
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const path of ["touristVisaCompress.ts", "touristVisaCompressBrowser.ts", "../components/tourist-visa/FilePreparation.tsx"]) {
    const code = strip(readFileSync(new URL(path, import.meta.url), "utf8"));
    assert.equal(/(?<![\d_])4\s*\*\s*1024|4194304|4_194_304|\b4\s*MB\b|maxFileBytes\s*[:=]\s*\d/.test(code), false, `${path} has a number of the server's`);
  }
  const section = strip(readFileSync(new URL("../components/tourist-visa/DocumentsSection.tsx", import.meta.url), "utf8"));
  assert.match(section, /maxFileBytes: limits\.maxFileBytes/, "the page hands the limit it received from the server");
});

test("the original over the sanity cap (25 MB) is refused before anything is read", async () => {
  const engine = fakeEngine({ image: blobOf(1) });
  const huge = fileOf("huge.jpg", 25 * MB + 1, "image/jpeg");
  const out = await prepare(huge, engine);
  assert.equal(out.status, "original_too_big");
  assert.equal(out.message, `This file is larger than ${formatBytes(25 * MB)}, which is too large to prepare on your device. Choose a smaller file.`);
  assert.equal(engine.calls.length, 0);
  const justOk = await prepare(fileOf("ok.jpg", 25 * MB, "image/jpeg"), fakeEngine({ image: blobOf(2 * MB) }));
  assert.equal(justOk.status, "reduced", "exactly 25 MB is prepared");
});

test("cancel: before it starts, while the engine works, and when the engine throws an abort, nothing is uploaded and the original is untouched", async () => {
  const original = fileOf("photo.jpg", 5 * MB, "image/jpeg");
  const before = new AbortController();
  before.abort();
  const engine = fakeEngine({ image: blobOf(1) });
  assert.equal((await prepare(original, engine, { signal: before.signal })).status, "cancelled");
  assert.equal(engine.calls.length, 0);

  const during = new AbortController();
  const waiting = prepare(original, fakeEngine({ image: (file, plan, signal) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("stopped"), { name: "AbortError" })))) }), { signal: during.signal });
  during.abort();
  const out = await waiting;
  assert.deepEqual([out.status, out.file === original, out.message], ["cancelled", true, "Cancelled. Nothing was uploaded."]);

  // an engine that finishes just as the applicant cancels: the result is dropped
  const late = new AbortController();
  const finishing = await prepare(original, fakeEngine({ image: async () => { late.abort(); return blobOf(1 * MB); } }), { signal: late.signal });
  assert.equal(finishing.status, "cancelled");
});

test("a file that is not a JPEG, a PNG or a PDF, or is empty, is handed on unchanged for the ordinary checks to refuse", async () => {
  const engine = fakeEngine({ image: blobOf(1), pdf: blobOf(1) });
  for (const file of [fileOf("a.gif", 3 * MB, "image/gif"), fileOf("a.docx", 3 * MB, ""), fileOf("empty.jpg", 0, "image/jpeg")]) {
    const out = await prepare(file, engine);
    assert.deepEqual([out.status, out.file === file, out.message, out.note], ["unchanged", true, "", null]);
  }
  assert.equal(engine.calls.length, 0);
});

// ---------------------------------------------------------------------------
// The ordinary checks still run on what is sent
// ---------------------------------------------------------------------------

test("preCheckFile still passes a prepared file, and still refuses what it always refused (the server's numbers)", async () => {
  const slot = "passport";
  const picked = fileOf("IMG_1.jpg", 5 * MB, "image/jpeg");
  const asPicked = { name: picked.name, size: picked.size, type: picked.type };
  assert.equal(preCheckFile(asPicked, slot, limits, []), "FILE_TOO_LARGE", "a big photo is refused by the ordinary check on its own");
  const out = await prepare(picked, fakeEngine({ image: blobOf(900 * 1024) }));
  assert.equal(preCheckFile({ name: out.file.name, size: out.file.size, type: out.file.type }, slot, limits, []), null, "the prepared photo passes");
  assert.equal(preCheckFile({ name: "a.gif", size: 100, type: "image/gif" }, slot, limits, []), "WRONG_TYPE");
  assert.equal(preCheckFile({ name: "a.jpg", size: 0, type: "image/jpeg" }, slot, limits, []), "FILE_EMPTY");
  const full = Array.from({ length: limits.slots[slot].max }, (_, i) => ({ slot, size: 10, id: String(i) }));
  assert.equal(preCheckFile({ name: out.file.name, size: out.file.size, type: out.file.type }, slot, limits, full), "TOO_MANY_FILES");
  assert.equal(preCheckFile({ name: out.file.name, size: out.file.size, type: out.file.type }, slot, limits, [{ slot: "funds", size: limits.maxTotalBytes }]), "TOTAL_TOO_LARGE");
});

test("the page prepares the file BEFORE the ordinary check, and keeps Upload and Remove off while it works", () => {
  const section = readFileSync(new URL("../components/tourist-visa/DocumentsSection.tsx", import.meta.url), "utf8");
  const choose = section.slice(section.indexOf("const choose = useCallback("));
  assert.ok(choose.indexOf("prepareFile(") > -1 && choose.indexOf("prepareFile(") < choose.indexOf("preCheckFile("), "prepare first, then the ordinary check");
  assert.match(section, /const busy = uploading !== null \|\| preparing !== null;/);
  assert.match(section, /disabled=\{removingId === doc\.id \|\| preparing !== null\}/);
  assert.match(section, /disabled=\{!limits \|\| busy \|\| full\}/);
  assert.match(section, /<PreparingFile name=\{preparing\.name\} onCancel=/);
  assert.match(choose, /prepared\.status === "too_large" \|\| prepared\.status === "original_too_big"/);
  assert.match(section, /await import\("@\/utils\/touristVisaCompressBrowser"\)/, "the browser half is loaded on demand");
  assert.equal(/^import .*touristVisaCompressBrowser/m.test(section), false, "and never imported at the top");
});

test("every sentence the applicant can read about it", () => {
  assert.equal(COMPRESS_MESSAGES.preparing, "Preparing your file...");
  assert.equal(COMPRESS_MESSAGES.kept, "Already small, kept as it is");
  assert.equal(COMPRESS_MESSAGES.tooLarge, "We could not make this file small enough. Choose a smaller file or a clearer, lower-resolution photo.");
  assert.equal(COMPRESS_MESSAGES.cancelled, "Cancelled. Nothing was uploaded.");
  assert.equal(COMPRESS_MESSAGES.reduced(5.2 * MB, 1.4 * MB), "Reduced from 5.2 MB to 1.4 MB");
  assert.equal(COMPRESS_MESSAGES.reduced(5.2 * MB, 0.9 * MB), "Reduced from 5.2 MB to 921.6 KB", "under 1 MB the size is in KB, as everywhere on the page");
  assert.match(COMPRESS_MESSAGES.originalTooBig(25 * MB), /25 MB/);
});
