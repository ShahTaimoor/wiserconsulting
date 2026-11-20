/**
 * Making a file smaller in the browser, before it is uploaded (Tourist Visa documents page).
 *
 * This module is the LOGIC only, and it is plain (no DOM, no canvas, no PDF library), so it can be unit tested with `node --test`:
 * what to do with a picked file, the size and dimension maths, the naming, the fallbacks, and "is this PDF a scan". The part that
 * touches the browser (createImageBitmap, canvas, pdf.js, pdf-lib) is in touristVisaCompressBrowser.ts and is handed in as a `CompressEngine`,
 * which a test replaces with a fake.
 *
 * The server stays the authority: it checks size, type (by content), slot and totals again on whatever arrives. Nothing here knows a limit of
 * the server: the biggest file the server accepts is passed in (`maxFileBytes`, read from the server's limits), and a file that is still over
 * it after the attempt is never sent. Nothing leaves the browser while a file is prepared.
 *
 * What it does:
 *  - IMAGES (JPEG, PNG): longest side at most COMPRESS.image.longEdge (never enlarged), re-encoded as JPEG (quality COMPRESS.image.quality), PNG
 *    transparency flattened on white, the name becomes .jpg. Dropping the original encoding also drops its EXIF data (including the GPS position).
 *  - PDFs: only a SCAN (a photo of each page, no text layer) of at most COMPRESS.pdf.maxPages pages: each page is drawn again at about
 *    COMPRESS.pdf.dpi and re-encoded as JPEG. A PDF with a text layer, an encrypted one, a long one, or one that fails or takes too long is
 *    never touched.
 *  - Anything that is not clearly smaller (at least COMPRESS.minSaving) keeps the ORIGINAL file.
 */

import { formatBytes } from "./touristVisaDocuments.ts";

const MB = 1024 * 1024;

/** The numbers of the attempt. None of them is a limit of the server: those come from the server (`maxFileBytes`). */
export const COMPRESS = Object.freeze({
  /** A file bigger than this is not prepared at all (it could exhaust the memory of the applicant's device). */
  maxOriginalBytes: 25 * MB,
  /** A file at or under this is left as it is (when it is also within the server's limit). */
  skipBelowBytes: 1 * MB,
  /** The result is kept only if it is at least this much smaller (a fraction of the original). */
  minSaving: 0.1,
  image: Object.freeze({
    /** The longest side, in pixels. */
    longEdge: 2200,
    quality: 0.82,
    /** An image of more pixels than this (in millions) is not decoded. */
    maxMegapixels: 120,
  }),
  pdf: Object.freeze({
    maxPages: 30,
    dpi: 150,
    quality: 0.72,
    timeoutMs: 30_000,
    /** How many pages are looked at to decide whether it is a scan. */
    sampledPages: 3,
    /** A page with more text than this (characters) has a text layer. */
    maxTextChars: 20,
    /** A scanned page has an image that covers at least this share of the page. */
    minImageCoverage: 0.5,
    /** The most pixels one rendered page may have (millions are never reached at 150 dpi on a normal page; a huge page is drawn smaller). */
    maxPagePixels: 12_000_000,
  }),
});

/** Every sentence the applicant can read about it. */
export const COMPRESS_MESSAGES = Object.freeze({
  preparing: "Preparing your file...",
  kept: "Already small, kept as it is",
  tooLarge: "We could not make this file small enough. Choose a smaller file or a clearer, lower-resolution photo.",
  cancelled: "Cancelled. Nothing was uploaded.",
  originalTooBig: (max: number) => `This file is larger than ${formatBytes(max)}, which is too large to prepare on your device. Choose a smaller file.`,
  reduced: (from: number, to: number) => `Reduced from ${formatBytes(from)} to ${formatBytes(to)}`,
});

export type FileKind = "image" | "pdf";

const EXTENSION_KINDS: Record<string, FileKind> = { jpg: "image", jpeg: "image", png: "image", pdf: "pdf" };
const TYPE_KINDS: Record<string, FileKind> = { "image/jpeg": "image", "image/png": "image", "application/pdf": "pdf" };

/** What the browser says the file is (its type, or its extension when it says nothing). null: not a JPEG, a PNG or a PDF. */
export function fileKind(file: { name: string; type: string }): FileKind | null {
  const reported = (file.type || "").trim().toLowerCase();
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (reported === "" || reported === "application/octet-stream") return EXTENSION_KINDS[extension] ?? null;
  return TYPE_KINDS[reported] ?? null;
}

/** Is the file small enough to be left alone? (At or under the skip size, and within what the server accepts.) */
export function shouldSkip(size: number, maxFileBytes: number): boolean {
  return size <= COMPRESS.skipBelowBytes && size <= maxFileBytes;
}

/** Is the result enough smaller than the original to be worth using? */
export function isWorthKeeping(originalSize: number, resultSize: number): boolean {
  return resultSize > 0 && resultSize <= originalSize * (1 - COMPRESS.minSaving);
}

/** The name of the result. An image becomes a .jpg with the same base name; a PDF keeps its name. */
export function compressedName(name: string, kind: FileKind): string {
  if (kind === "pdf") return name;
  const trimmed = name.replace(/[\\/]/g, "_").trim();
  const dot = trimmed.lastIndexOf(".");
  const base = (dot > 0 ? trimmed.slice(0, dot) : dot === 0 ? "" : trimmed).replace(/[. ]+$/, "");
  return `${base || "photo"}.jpg`;
}

/** Millions of pixels. */
export const megapixels = (width: number, height: number): number => (width * height) / 1_000_000;

/**
 * The size an image is drawn at: its orientation applied (a photo taken sideways is stored turned: orientations 5 to 8 swap the two sides),
 * the longest side at most `longEdge`, never enlarged. `scaled` says whether it is smaller than the original.
 */
export function imageTarget(width: number, height: number, orientation: number, longEdge: number): { width: number; height: number; scaled: boolean } {
  const swap = orientation >= 5 && orientation <= 8;
  const w = swap ? height : width;
  const h = swap ? width : height;
  const long = Math.max(w, h);
  if (!(long > longEdge)) return { width: w, height: h, scaled: false };
  const scale = longEdge / long;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scaled: true };
}

/** The scale to draw a PDF page at (1 is 72 dpi): `dpi`, but never so large that the page has more than `maxPixels` pixels. */
export function pdfRenderScale(pageWidth: number, pageHeight: number, dpi: number, maxPixels: number): number {
  const wanted = dpi / 72;
  const pixels = pageWidth * wanted * pageHeight * wanted;
  return pixels > maxPixels ? wanted * Math.sqrt(maxPixels / pixels) : wanted;
}

/** Which pages (1-based) to look at to decide whether a PDF is a scan: the first, the middle and the last, each once. */
export function sampledPageNumbers(numPages: number, count: number): number[] {
  if (!(numPages >= 1)) return [];
  const wanted = count >= 3 ? [1, Math.ceil(numPages / 2), numPages] : count === 2 ? [1, numPages] : [1];
  return [...new Set(wanted)];
}

// ---------------------------------------------------------------------------
// Reading the size of a JPEG or a PNG from its first bytes (no decoding)
// ---------------------------------------------------------------------------

export interface ImageInfo {
  width: number;
  height: number;
  /** The EXIF orientation (1 to 8; 1 when there is none). */
  orientation: number;
}

function exifOrientation(b: Uint8Array, start: number, end: number): number {
  // "Exif\0\0" then a TIFF header: byte order, 42, offset of the first directory.
  if (end - start < 14 || String.fromCharCode(b[start], b[start + 1], b[start + 2], b[start + 3]) !== "Exif") return 1;
  const tiff = start + 6;
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  if (!little && !(b[tiff] === 0x4d && b[tiff + 1] === 0x4d)) return 1;
  const u16 = (at: number) => (little ? b[at] | (b[at + 1] << 8) : (b[at] << 8) | b[at + 1]);
  const u32 = (at: number) => (little ? (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0 : ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0);
  const directory = tiff + u32(tiff + 4);
  if (directory + 2 > end) return 1;
  const entries = u16(directory);
  for (let i = 0; i < entries; i += 1) {
    const at = directory + 2 + i * 12;
    if (at + 12 > end) break;
    if (u16(at) === 0x0112) {
      const value = u16(at + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

function jpegInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let orientation = 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const length = (b[i + 2] << 8) | b[i + 3];
    if (length < 2) return null;
    if (marker === 0xe1) orientation = exifOrientation(b, i + 4, Math.min(b.length, i + 2 + length));
    // A start of frame (not the table markers 0xc4, 0xc8 and 0xcc): precision, height, width.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > b.length) return null;
      const height = (b[i + 5] << 8) | b[i + 6];
      const width = (b[i + 7] << 8) | b[i + 8];
      return width > 0 && height > 0 ? { width, height, orientation } : null;
    }
    i += 2 + length;
  }
  return null;
}

function pngInfo(b: Uint8Array): ImageInfo | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || signature.some((byte, i) => b[i] !== byte)) return null;
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return null;
  const u32 = (at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
  const width = u32(16);
  const height = u32(20);
  return width > 0 && height > 0 ? { width, height, orientation: 1 } : null;
}

/** The pixel size (and EXIF orientation) of a JPEG or a PNG, read from its bytes, or null when they cannot be read. */
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  return jpegInfo(bytes) ?? pngInfo(bytes);
}

// ---------------------------------------------------------------------------
// Is this PDF a scan? (from what pdf.js says about a page)
// ---------------------------------------------------------------------------

/** The pdf.js operator codes this needs, by name (OPS of pdfjs-dist), handed in so this file needs no PDF library. */
export interface OperatorCodes {
  save: number;
  restore: number;
  transform: number;
  /** Every operator that paints a picture. */
  images: number[];
}

/**
 * How much of a page its biggest picture covers (0 to 1, and more when it is drawn bigger than the page), from the operator list of the page:
 * the current transformation is followed through save, restore and transform, and each picture is the unit square drawn through it.
 */
export function imageCoverage(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: OperatorCodes, pageWidth: number, pageHeight: number): number {
  if (!(pageWidth > 0 && pageHeight > 0)) return 0;
  const stack: number[][] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  let largest = 0;
  for (let i = 0; i < fnArray.length; i += 1) {
    const fn = fnArray[i];
    if (fn === ops.save) stack.push(ctm.slice());
    else if (fn === ops.restore) ctm = stack.pop() ?? ctm;
    else if (fn === ops.transform) {
      const m = argsArray[i] as number[] | undefined;
      if (Array.isArray(m) && m.length >= 6) ctm = [m[0] * ctm[0] + m[1] * ctm[2], m[0] * ctm[1] + m[1] * ctm[3], m[2] * ctm[0] + m[3] * ctm[2], m[2] * ctm[1] + m[3] * ctm[3], m[4] * ctm[0] + m[5] * ctm[2] + ctm[4], m[4] * ctm[1] + m[5] * ctm[3] + ctm[5]];
    } else if (ops.images.includes(fn)) largest = Math.max(largest, Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]));
  }
  return largest / (pageWidth * pageHeight);
}

export interface PageFacts {
  /** The characters of the text layer of the page (spaces not counted). */
  textChars: number;
  /** See imageCoverage. */
  coverage: number;
}

/** Is this page a photo of a page: almost no text, and a picture over most of it? */
export function isScanPage(facts: PageFacts): boolean {
  return facts.textChars <= COMPRESS.pdf.maxTextChars && facts.coverage >= COMPRESS.pdf.minImageCoverage;
}

/** Is the whole PDF a scan? Every page that was looked at must be one (and at least one must have been looked at). */
export function looksLikeScan(pages: PageFacts[]): boolean {
  return pages.length > 0 && pages.every(isScanPage);
}

// ---------------------------------------------------------------------------
// Time limit and cancel
// ---------------------------------------------------------------------------

/** A signal that aborts when `parent` does or after `ms`, with a way to tell which, and a dispose that must always be called. */
export function abortAfter(parent: AbortSignal | undefined, ms: number): { signal: AbortSignal; timedOut: () => boolean; dispose: () => void } {
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, ms);
  const onParent = () => controller.abort();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener("abort", onParent, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => expired,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParent);
    },
  };
}

// ---------------------------------------------------------------------------
// What to do with a picked file
// ---------------------------------------------------------------------------

/** What the part that touches the browser can do. Each returns the smaller file, or null for "leave it as it is"; a throw also means that. */
export interface CompressEngine {
  image(file: File, plan: { longEdge: number; quality: number; maxMegapixels: number }, signal: AbortSignal): Promise<Blob | null>;
  pdf(file: File, plan: typeof COMPRESS.pdf, signal: AbortSignal): Promise<Blob | null>;
}

export type PrepareStatus =
  /** The file was made smaller: `file` is the smaller one. */
  | "reduced"
  /** Left as it is, and within the limit. */
  | "kept"
  /** Not a file this applies to (or empty): handed on unchanged, for the ordinary checks to judge. */
  | "unchanged"
  /** Still over the limit after the attempt: it must not be uploaded. */
  | "too_large"
  /** Over the sanity cap on the original: not attempted. */
  | "original_too_big"
  /** The applicant cancelled. */
  | "cancelled";

export interface PrepareResult {
  status: PrepareStatus;
  /** The file to upload (the smaller one, or the original). */
  file: File;
  originalSize: number;
  finalSize: number;
  /** The sentence for the applicant now (an empty one for "unchanged"). */
  message: string;
  /** The sentence that stays by the file once it is uploaded ("Reduced from ... to ..." or "Already small, kept as it is"), or null. */
  note: string | null;
}

const isCancel = (error: unknown, signal: AbortSignal | undefined) => Boolean(signal?.aborted) || (error instanceof Error && error.name === "AbortError");

/**
 * Prepares a picked file: leaves it, or makes it smaller, and says which. It never throws: an engine that fails or answers "leave it" gives the
 * original. `maxFileBytes` is the server's own limit for one file; a file still over it after the attempt has the status "too_large".
 */
export async function prepareFile(file: File, options: { maxFileBytes: number; signal?: AbortSignal; engine: CompressEngine }): Promise<PrepareResult> {
  const { maxFileBytes, signal, engine } = options;
  const originalSize = file.size;
  const result = (status: PrepareStatus, out: File, message: string, note: string | null): PrepareResult => ({ status, file: out, originalSize, finalSize: out.size, message, note });
  const kind = fileKind(file);

  if (kind === null || originalSize === 0) return result("unchanged", file, "", null);
  if (originalSize > COMPRESS.maxOriginalBytes) return result("original_too_big", file, COMPRESS_MESSAGES.originalTooBig(COMPRESS.maxOriginalBytes), null);
  if (signal?.aborted) return result("cancelled", file, COMPRESS_MESSAGES.cancelled, null);
  if (shouldSkip(originalSize, maxFileBytes)) return result("kept", file, COMPRESS_MESSAGES.kept, COMPRESS_MESSAGES.kept);

  const abort = signal ?? new AbortController().signal;
  let produced: Blob | null = null;
  try {
    produced = kind === "image" ? await engine.image(file, COMPRESS.image, abort) : await engine.pdf(file, COMPRESS.pdf, abort);
  } catch (error) {
    if (isCancel(error, signal)) return result("cancelled", file, COMPRESS_MESSAGES.cancelled, null);
    produced = null; // a failure is "leave it as it is"
  }
  if (signal?.aborted) return result("cancelled", file, COMPRESS_MESSAGES.cancelled, null);

  const smaller = produced !== null && isWorthKeeping(originalSize, produced.size);
  const out = smaller ? new File([produced as Blob], compressedName(file.name, kind), { type: kind === "image" ? "image/jpeg" : "application/pdf", lastModified: file.lastModified }) : file;
  if (out.size > maxFileBytes) return result("too_large", file, COMPRESS_MESSAGES.tooLarge, null);
  if (smaller) {
    const note = COMPRESS_MESSAGES.reduced(originalSize, out.size);
    return result("reduced", out, note, note);
  }
  return result("kept", file, COMPRESS_MESSAGES.kept, COMPRESS_MESSAGES.kept);
}
