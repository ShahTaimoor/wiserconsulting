/**
 * The browser's half of making a file smaller (see touristVisaCompress.ts for the rules and the decisions): decoding and drawing a picture on a
 * canvas, and reading and rebuilding a scanned PDF. It is handed to `prepareFile` as its `CompressEngine`.
 *
 * Loaded ON DEMAND (the documents page imports it only when a file is picked), and pdf.js and pdf-lib are imported only when a PDF is picked,
 * so none of it is in the page's own bundle. The pdf.js worker is a file of this site (nothing is fetched from another address), and nothing of
 * the file leaves the browser. Every step of a PDF checks the time limit and the cancel signal, one page at a time, and frees the canvas of a page
 * before the next. Any failure is a throw, which the caller turns into "keep the original".
 */

import {
  COMPRESS,
  abortAfter,
  imageCoverage,
  imageTarget,
  looksLikeScan,
  megapixels,
  pdfRenderScale,
  readImageInfo,
  sampledPageNumbers,
} from "./touristVisaCompress.ts";
import type { CompressEngine, OperatorCodes, PageFacts } from "./touristVisaCompress.ts";

type Surface = { canvas: OffscreenCanvas | HTMLCanvasElement; context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D };

/** A canvas of this size with a white background (a JPEG has no transparency, so a transparent picture is flattened on white). */
function whiteSurface(width: number, height: number): Surface {
  const canvas: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
  const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!context) throw new Error("no canvas");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  return { canvas, context };
}

async function jpegOf(surface: Surface, quality: number): Promise<Blob> {
  const { canvas } = surface;
  const blob =
    "convertToBlob" in canvas
      ? await canvas.convertToBlob({ type: "image/jpeg", quality })
      : await new Promise<Blob | null>((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, "image/jpeg", quality));
  if (!blob || blob.size === 0) throw new Error("no jpeg");
  return blob;
}

/** Gives a canvas's memory back (a very large canvas can hold a lot). */
function release(surface: Surface) {
  surface.canvas.width = 0;
  surface.canvas.height = 0;
}

function checkSignal(guard: { signal: AbortSignal; timedOut: () => boolean }) {
  if (!guard.signal.aborted) return;
  if (guard.timedOut()) throw new Error("timeout");
  throw Object.assign(new Error("cancelled"), { name: "AbortError" });
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

async function compressImage(file: File, plan: { longEdge: number; quality: number; maxMegapixels: number }, signal: AbortSignal): Promise<Blob | null> {
  const info = readImageInfo(new Uint8Array(await file.arrayBuffer()));
  if (!info) return null;
  if (megapixels(info.width, info.height) > plan.maxMegapixels) throw new Error("too many pixels");
  const target = imageTarget(info.width, info.height, info.orientation, plan.longEdge);
  if (signal.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });

  // The picture is shrunk while it is decoded, so a very large photo is never held at its full size.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image", ...(target.scaled ? { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: "high" as const } : {}) });
  let surface: Surface | null = null;
  try {
    // The shape must be the one expected (a browser that does not turn the picture would give the other one): never draw a stretched picture.
    const expected = target.width / target.height;
    if (Math.abs(bitmap.width / bitmap.height - expected) / expected > 0.02) throw new Error("unexpected shape");
    surface = whiteSurface(target.width, target.height);
    surface.context.drawImage(bitmap, 0, 0, target.width, target.height);
    if (signal.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    return await jpegOf(surface, plan.quality);
  } finally {
    bitmap.close();
    if (surface) release(surface);
  }
}

// ---------------------------------------------------------------------------
// PDFs
// ---------------------------------------------------------------------------

async function compressPdf(file: File, plan: typeof COMPRESS.pdf, parent: AbortSignal, workerSrc?: string): Promise<Blob | null> {
  const guard = abortAfter(parent, plan.timeoutMs);
  let loading: { promise: Promise<unknown>; destroy: () => Promise<void> } | null = null;
  try {
    const pdfjs = await import("pdfjs-dist");
    // The worker is a file of this site (the bundler emits it next to the page's own files), never a CDN. A test passes the path of the real file.
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc ?? new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    checkSignal(guard);

    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, enableXfa: false });
    loading = task;
    let doc;
    try {
      doc = await task.promise;
    } catch (error) {
      // A password-protected PDF (or one that cannot be read) is left exactly as it is.
      if (error instanceof Error && (error.name === "PasswordException" || error.name === "InvalidPDFException" || error.name === "MissingPDFException")) return null;
      throw error;
    }
    checkSignal(guard);
    if (doc.numPages > plan.maxPages) return null;

    // Is it a scan? Look at the first, the middle and the last page: almost no text, and a picture over most of the page.
    const OPS = pdfjs.OPS as Record<string, number>;
    const codes: OperatorCodes = {
      save: OPS.save,
      restore: OPS.restore,
      transform: OPS.transform,
      images: ["paintImageXObject", "paintInlineImageXObject", "paintImageMaskXObject", "paintImageXObjectRepeat", "paintImageMaskXObjectRepeat", "paintImageMaskXObjectGroup", "paintJpegXObject"].map((name) => OPS[name]).filter((code) => typeof code === "number"),
    };
    const facts: PageFacts[] = [];
    for (const number of sampledPageNumbers(doc.numPages, plan.sampledPages)) {
      const page = await doc.getPage(number);
      const [x0, y0, x1, y1] = page.view;
      const text = await page.getTextContent();
      const textChars = text.items.reduce((sum, item) => sum + ("str" in item ? item.str.replace(/\s/g, "").length : 0), 0);
      const operators = await page.getOperatorList();
      facts.push({ textChars, coverage: imageCoverage(operators.fnArray, operators.argsArray, codes, x1 - x0, y1 - y0) });
      page.cleanup();
      checkSignal(guard);
    }
    if (!looksLikeScan(facts)) return null;

    // A scan: draw each page again, one at a time, and put the pictures in a new PDF with the same page sizes.
    const { PDFDocument } = await import("pdf-lib");
    const output = await PDFDocument.create();
    for (let number = 1; number <= doc.numPages; number += 1) {
      const page = await doc.getPage(number);
      const size = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: pdfRenderScale(size.width, size.height, plan.dpi, plan.maxPagePixels) });
      const surface = whiteSurface(Math.max(1, Math.round(viewport.width)), Math.max(1, Math.round(viewport.height)));
      try {
        const render = page.render({ canvasContext: surface.context as CanvasRenderingContext2D, viewport });
        const onAbort = () => render.cancel();
        guard.signal.addEventListener("abort", onAbort, { once: true });
        try {
          await render.promise;
        } finally {
          guard.signal.removeEventListener("abort", onAbort);
        }
        checkSignal(guard);
        const jpeg = new Uint8Array(await (await jpegOf(surface, plan.quality)).arrayBuffer());
        const picture = await output.embedJpg(jpeg);
        output.addPage([size.width, size.height]).drawImage(picture, { x: 0, y: 0, width: size.width, height: size.height });
      } finally {
        release(surface);
        page.cleanup();
      }
      checkSignal(guard);
    }

    const bytes = await output.save({ useObjectStreams: false });
    // The result must be a real PDF with every page.
    const header = String.fromCharCode(...bytes.subarray(0, 5));
    if (header !== "%PDF-" || output.getPageCount() !== doc.numPages) throw new Error("invalid result");
    return new Blob([bytes as BlobPart], { type: "application/pdf" });
  } finally {
    guard.dispose();
    try {
      await loading?.destroy();
    } catch {
      /* the worker is gone already */
    }
  }
}

/** The engine. `workerSrc` is for tests only (where the pdf.js worker file is); in the browser it is the file of this site that the bundler emits. */
export function createBrowserEngine(options: { workerSrc?: string } = {}): CompressEngine {
  return { image: compressImage, pdf: (file, plan, signal) => compressPdf(file, plan, signal, options.workerSrc) };
}

export const browserEngine: CompressEngine = createBrowserEngine();
