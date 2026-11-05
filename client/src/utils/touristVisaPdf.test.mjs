// Run with: npm run test:unit   (from client/)

import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { describePdfError, isPdfContentType, pdfFileName, PDF_UNSUPPORTED_FALLBACK, PDF_WORDS } from "./touristVisaPdf.ts";
import { describeActivity } from "./touristVisaAdmin.ts";
import { touristVisaService, TouristVisaApiError } from "../services/touristVisaService.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("the file name is the reference and a fixed name; never anything else", () => {
  assert.equal(pdfFileName("TV-X42GYXPS"), "TV-X42GYXPS-application-summary.pdf");
  assert.equal(pdfFileName("TV-X42GYXPS", "answers"), "TV-X42GYXPS-application-summary.pdf");
  for (const bad of [null, undefined, "", "tv-lower", "../../etc/passwd", "TV X", "TV-م", "A".repeat(80), "Aisha Khan"]) {
    assert.equal(pdfFileName(bad), "application-summary.pdf", String(bad));
  }
});

test("the buttons say what the brief says", () => {
  assert.equal(PDF_WORDS.admin.button, "Export application (PDF)");
  assert.equal(PDF_WORDS.applicant.button, "Download a copy (PDF)");
});

test("every failure has plain words, and the unsupported characters keep the server's sentence", () => {
  const server = "The text in section 1 (Travel information) has characters that the PDF cannot print, because it prints Latin letters only. Correct that answer and try again.";
  assert.equal(describePdfError({ status: 422, code: "PDF_UNSUPPORTED_CHARACTERS", message: server }), server);
  assert.equal(describePdfError({ status: 422, code: "PDF_UNSUPPORTED_CHARACTERS" }), PDF_UNSUPPORTED_FALLBACK);
  assert.equal(describePdfError({ status: 422, code: "PDF_UNSUPPORTED_CHARACTERS", message: "" }), PDF_UNSUPPORTED_FALLBACK);
  assert.equal(describePdfError({ status: 422, code: "PDF_UNSUPPORTED_CHARACTERS", message: "x".repeat(401) }), PDF_UNSUPPORTED_FALLBACK, "a long sentence is not trusted");
  // Other codes never show the server's text.
  assert.equal(describePdfError({ status: 409, code: "PDF_NOT_AVAILABLE", message: "SERVER TEXT" }), "A copy of your application can be downloaded once it has been submitted.");
  assert.equal(describePdfError({ status: 422, code: "PDF_TOO_LARGE" }), "This application is too long to print as one PDF. Please contact support.");
  assert.equal(describePdfError({ status: 429, code: "TOO_MANY_PDFS" }), "Too many PDF downloads. Please wait a few minutes and try again.");
  assert.equal(describePdfError({ status: 500, code: "PDF_FAILED" }), "The PDF could not be made. Please try again, or contact support.");
  assert.equal(describePdfError({ status: 404, code: "APPLICATION_NOT_FOUND" }), "That application could not be found. It may not have been submitted.");
  assert.equal(describePdfError({ status: 404, closed: true }), "The Tourist Visa application isn't open right now.");
  assert.equal(describePdfError({ status: 0 }), "We couldn't reach the server. Check your internet connection and try again.");
  assert.equal(describePdfError({ status: 401 }), "Please sign in again.");
  assert.equal(describePdfError({ status: 403 }), "You do not have access to this page.");
  assert.equal(describePdfError({ status: 429 }), "Too many PDF downloads. Please wait a few minutes and try again.");
  assert.equal(describePdfError({ status: 503 }), "Something went wrong on our side. Please try again in a moment.");
  assert.equal(describePdfError({ status: 418 }), "Something went wrong. Please try again.");
  assert.equal(describePdfError({ status: 200, code: "NOT_A_PDF" }), "The server did not send a PDF. Please try again.");
});

test("a PDF answer is recognised by its content type", () => {
  assert.equal(isPdfContentType("application/pdf"), true);
  assert.equal(isPdfContentType("Application/PDF; charset=binary"), true);
  assert.equal(isPdfContentType("application/json"), false);
  assert.equal(isPdfContentType("text/html"), false);
  assert.equal(isPdfContentType(null), false);
  assert.equal(isPdfContentType(undefined), false);
});

test("the activity log words a PDF export by who made it, without a file name or any content", () => {
  const admin = { id: "a1", name: "Alex Auditor" };
  assert.deepEqual(describeActivity({ action: "pdf_export", admin, pdfType: "answers", pdfBy: "admin" }), { who: "Alex Auditor", what: "exported the application summary (PDF)" });
  assert.deepEqual(describeActivity({ action: "pdf_export", admin: { id: "u1", name: "Sam Applicant" }, pdfType: "answers", pdfBy: "applicant" }), { who: "Sam Applicant", what: "downloaded a copy of their application (PDF)" });
  assert.equal(describeActivity({ action: "pdf_export", admin }).what, "exported the application summary (PDF)");
});

// ---------------------------------------------------------------------------
// The service calls
// ---------------------------------------------------------------------------

function stubResponse({ status = 200, contentType = "application/pdf", bytes = Buffer.from("%PDF-1.7 test"), json } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name) => (name.toLowerCase() === "content-type" ? contentType : null) },
      blob: async () => new Blob([bytes], { type: contentType }),
      json: async () => {
        if (json === undefined) throw new SyntaxError("not json");
        return json;
      },
    };
  };
  return calls;
}

test("the admin download asks for the answers PDF with the session token, never cached, and returns a blob", async () => {
  const calls = stubResponse();
  const blob = await touristVisaService.adminAnswersPdf("test-token", "abc123");
  assert.equal(blob instanceof Blob, true);
  assert.equal(await blob.text(), "%PDF-1.7 test");
  assert.match(calls[0].url, /\/tourist-visa\/admin\/applications\/abc123\/pdf\/answers$/);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-token");
  assert.equal(calls[0].init.cache, "no-store");
});

test("the applicant download goes to their own route and nothing in it names an application", async () => {
  const calls = stubResponse();
  await touristVisaService.myAnswersPdf("t");
  assert.match(calls[0].url, /\/tourist-visa\/applications\/me\/pdf\/answers$/);
});

test("an id in the path is encoded", async () => {
  const calls = stubResponse();
  await touristVisaService.adminAnswersPdf("t", "../x?y");
  assert.match(calls[0].url, /applications\/\.\.%2Fx%3Fy\/pdf\/answers$/);
});

test("a refusal carries the server's code, status and message, so the page can word it", async () => {
  stubResponse({ status: 422, contentType: "application/json", json: { success: false, code: "PDF_UNSUPPORTED_CHARACTERS", message: "The text in section 1 (Travel information) has characters that the PDF cannot print." } });
  await assert.rejects(touristVisaService.myAnswersPdf("t"), (error) => {
    assert.equal(error instanceof TouristVisaApiError, true);
    assert.equal(error.status, 422);
    assert.equal(error.code, "PDF_UNSUPPORTED_CHARACTERS");
    assert.match(error.message, /section 1 \(Travel information\)/);
    return true;
  });
  stubResponse({ status: 409, contentType: "application/json", json: { success: false, code: "PDF_NOT_AVAILABLE", message: "x" } });
  await assert.rejects(touristVisaService.myAnswersPdf("t"), (e) => e.status === 409 && e.code === "PDF_NOT_AVAILABLE");
  stubResponse({ status: 429, contentType: "application/json", json: { success: false, code: "TOO_MANY_PDFS", message: "x" } });
  await assert.rejects(touristVisaService.adminAnswersPdf("t", "a"), (e) => e.status === 429 && e.code === "TOO_MANY_PDFS");
});

test("the closed switch, a gateway page, a non-PDF success and a network failure are each a clear failure", async () => {
  stubResponse({ status: 404, contentType: "application/json", json: { success: false, code: "FEATURE_CLOSED", message: "x" } });
  await assert.rejects(touristVisaService.myAnswersPdf("t"), (e) => e.closed === true);
  stubResponse({ status: 502, contentType: "text/html" });
  await assert.rejects(touristVisaService.myAnswersPdf("t"), (e) => e.status === 502 && e.code === undefined);
  stubResponse({ status: 200, contentType: "text/html" });
  await assert.rejects(touristVisaService.myAnswersPdf("t"), (e) => e.code === "NOT_A_PDF");
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(touristVisaService.adminAnswersPdf("t", "a"), (e) => e.status === 0);
});
