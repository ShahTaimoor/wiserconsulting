// Run with: npm run test:unit   (from client/)

import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { coverLetterPdfState, itineraryPdfState, documentPdfState, describePdfError, isPdfContentType, pdfFileName, PDF_UNSUPPORTED_FALLBACK, PDF_WORDS } from "./touristVisaPdf.ts";
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
  assert.equal(describePdfError({ status: 422, code: "PDF_TOO_LARGE" }), "This document is too long to print as one PDF. Please contact support.");
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

// ---------------------------------------------------------------------------
// The cover letter PDF (step 8h-2)
// ---------------------------------------------------------------------------

test("the cover letter's file name is the reference and a fixed name, with -draft when the version is not approved; an answers PDF never gets -draft", () => {
  assert.equal(pdfFileName("TV-X42GYXPS", "cover_letter"), "TV-X42GYXPS-cover-letter.pdf");
  assert.equal(pdfFileName("TV-X42GYXPS", "cover_letter", { draft: false }), "TV-X42GYXPS-cover-letter.pdf");
  assert.equal(pdfFileName("TV-X42GYXPS", "cover_letter", { draft: true }), "TV-X42GYXPS-cover-letter-draft.pdf");
  assert.equal(pdfFileName("TV-X42GYXPS", "answers", { draft: true }), "TV-X42GYXPS-application-summary.pdf");
  for (const bad of [null, undefined, "", "../x", "Aisha Khan", "tv-lower"]) assert.equal(pdfFileName(bad, "cover_letter", { draft: true }), "cover-letter-draft.pdf", String(bad));
});

test("the button words and the failures of the cover letter PDF are plain: no letter, unreadable, unsupported characters (the server's sentence), a rate limit", () => {
  assert.equal(PDF_WORDS.coverLetter.button, "Download PDF");
  assert.equal(describePdfError({ status: 404, code: "LETTER_NOT_FOUND", message: "SERVER TEXT" }), "There is no cover letter to download yet. Write one first.");
  assert.equal(describePdfError({ status: 500, code: "LETTER_UNREADABLE", message: "SERVER TEXT" }), "The cover letter could not be read. Please contact support.");
  const letterSentence = "The text of the cover letter has characters that the PDF cannot print, because it prints Latin letters only. Edit the letter, save it as a new version and try again.";
  assert.equal(describePdfError({ status: 422, code: "PDF_UNSUPPORTED_CHARACTERS", message: letterSentence }), letterSentence);
  assert.equal(describePdfError({ status: 429, code: "TOO_MANY_PDFS" }), "Too many PDF downloads. Please wait a few minutes and try again.");
  assert.equal(describePdfError({ status: 403 }), "You do not have access to this page.");
});

test("the cover letter button: off until a letter exists; on for a draft (said to be marked as one) and for an approved version; unsaved changes are said not to be in the file", () => {
  const none = coverLetterPdfState({ latest: null, dirty: false });
  assert.deepEqual([none.enabled, none.draft], [false, false]);
  assert.match(none.hint, /Write a cover letter first/);
  const approved = coverLetterPdfState({ latest: { status: "approved" }, dirty: false });
  assert.deepEqual([approved.enabled, approved.draft], [true, false]);
  assert.match(approved.hint, /approved version/);
  assert.equal(/DRAFT/.test(approved.hint), false);
  const draft = coverLetterPdfState({ latest: { status: "draft" }, dirty: false });
  assert.deepEqual([draft.enabled, draft.draft], [true, true]);
  assert.match(draft.hint, /not approved/);
  assert.match(draft.hint, /DRAFT - NOT APPROVED/);
  for (const state of [coverLetterPdfState({ latest: { status: "approved" }, dirty: true }), coverLetterPdfState({ latest: { status: "draft" }, dirty: true })]) {
    assert.match(state.hint, /saved version, not your unsaved changes/);
  }
  assert.equal(/unsaved/.test(approved.hint) || /unsaved/.test(draft.hint), false, "no mention of unsaved changes when there are none");
  // Any status other than approved is a draft (the server's rule).
  assert.equal(coverLetterPdfState({ latest: { status: "anything" }, dirty: false }).draft, true);
});

test("the activity log words a cover letter export with its version and whether it was approved, and never any text", () => {
  const admin = { id: "a1", name: "Alex Auditor" };
  assert.deepEqual(describeActivity({ action: "pdf_export", admin, pdfType: "cover_letter", pdfBy: "admin", version: 2, pdfApproved: true }), { who: "Alex Auditor", what: "downloaded version 2 of the cover letter as a PDF (approved)" });
  assert.deepEqual(describeActivity({ action: "pdf_export", admin, pdfType: "cover_letter", pdfBy: "admin", version: 1, pdfApproved: false }), { who: "Alex Auditor", what: "downloaded version 1 of the cover letter as a PDF (a draft, not approved)" });
  assert.deepEqual(describeActivity({ action: "pdf_export", admin, pdfType: "cover_letter", pdfBy: "admin" }), { who: "Alex Auditor", what: "downloaded the cover letter as a PDF" });
  // The summary's wording is unchanged.
  assert.equal(describeActivity({ action: "pdf_export", admin, pdfType: "answers", pdfBy: "admin" }).what, "exported the application summary (PDF)");
});

test("the cover letter download asks the letter route with the session token, never cached, and returns a blob; a refusal keeps the server's code", async () => {
  const calls = stubResponse();
  const blob = await touristVisaService.adminCoverLetterPdf("test-token", "abc123");
  assert.equal(blob instanceof Blob, true);
  assert.match(calls[0].url, /\/tourist-visa\/admin\/applications\/abc123\/pdf\/cover-letter$/);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-token");
  assert.equal(calls[0].init.cache, "no-store");
  stubResponse({ status: 404, contentType: "application/json", json: { success: false, code: "LETTER_NOT_FOUND", message: "x" } });
  await assert.rejects(touristVisaService.adminCoverLetterPdf("t", "a"), (e) => e.status === 404 && e.code === "LETTER_NOT_FOUND");
  stubResponse({ status: 422, contentType: "application/json", json: { success: false, code: "PDF_UNSUPPORTED_CHARACTERS", message: "The text of the cover letter has characters that the PDF cannot print." } });
  await assert.rejects(touristVisaService.adminCoverLetterPdf("t", "a"), (e) => e.status === 422 && /text of the cover letter/.test(e.message));
  stubResponse({ status: 429, contentType: "application/json", json: { success: false, code: "TOO_MANY_PDFS", message: "x" } });
  await assert.rejects(touristVisaService.adminCoverLetterPdf("t", "a"), (e) => e.status === 429);
});

test("the cover letter panel wires the button from the source: off while there is no letter, with its hint, and the saved version is what it downloads", () => {
  const panel = fs.readFileSync(new URL("../components/tourist-visa/CoverLetterPanel.tsx", import.meta.url), "utf8");
  assert.equal((panel.match(/<PdfDownloadButton/g) || []).length, 2, "one in the empty state and one beside the letter");
  assert.match(panel, /kind="cover_letter"/);
  assert.match(panel, /disabled=\{!pdf\.enabled\}/, "off in the empty state");
  assert.match(panel, /disabled=\{!pdf\.enabled \|\| busy !== null\}/, "off while the panel is busy");
  assert.match(panel, /draft=\{pdf\.draft\}/);
  assert.match(panel, /aria-describedby|describedBy="tv-letter-pdf-hint"/);
  assert.match(panel, /id="tv-letter-pdf-hint"/);
  assert.match(panel, /coverLetterPdfState\(\{ latest, dirty, stale: Boolean\(view\?\.stale\) \}\)/, "the panel's own stale flag reaches the button state (step 8j-3)");
  const button = fs.readFileSync(new URL("../components/tourist-visa/PdfDownloadButton.tsx", import.meta.url), "utf8");
  assert.match(button, /adminCoverLetterPdf/);
  assert.match(button, /aria-busy/);
  assert.equal(/localStorage\.setItem|sessionStorage|console\./.test(button), false, "the file is kept nowhere and nothing is logged");
});

// ---------------------------------------------------------------------------
// The itinerary PDF (step 8h-3)
// ---------------------------------------------------------------------------

test("the itinerary's file name is the reference and a fixed name, with -draft when the version is not approved", () => {
  assert.equal(pdfFileName("TV-X42GYXPS", "itinerary"), "TV-X42GYXPS-itinerary.pdf");
  assert.equal(pdfFileName("TV-X42GYXPS", "itinerary", { draft: true }), "TV-X42GYXPS-itinerary-draft.pdf");
  for (const bad of [null, undefined, "", "../x", "Aisha Khan"]) assert.equal(pdfFileName(bad, "itinerary", { draft: true }), "itinerary-draft.pdf", String(bad));
  assert.equal(pdfFileName("TV-X42GYXPS", "answers", { draft: true }), "TV-X42GYXPS-application-summary.pdf", "an answers PDF never gets -draft");
});

test("the itinerary failures have plain words: no itinerary, unreadable, the server's sentence for unprintable text, a rate limit", () => {
  assert.equal(PDF_WORDS.itinerary.button, "Download PDF");
  assert.equal(describePdfError({ status: 404, code: "ITINERARY_NOT_FOUND", message: "SERVER TEXT" }), "There is no itinerary to download yet. Write one first.");
  assert.equal(describePdfError({ status: 500, code: "ITINERARY_UNREADABLE", message: "SERVER TEXT" }), "The itinerary could not be read. Please contact support.");
  const sentence = "The text of the itinerary has characters that the PDF cannot print, because it prints Latin letters only. Edit the itinerary, save it as a new version and try again.";
  assert.equal(describePdfError({ status: 422, code: "PDF_UNSUPPORTED_CHARACTERS", message: sentence }), sentence);
  assert.equal(describePdfError({ status: 429, code: "TOO_MANY_PDFS" }), "Too many PDF downloads. Please wait a few minutes and try again.");
});

test("the itinerary button has the same states as the cover letter's: off until one exists, a draft said to be marked, an approved one clean, unsaved text said not to be in the file", () => {
  const none = itineraryPdfState({ latest: null, dirty: false });
  assert.deepEqual([none.enabled, none.draft], [false, false]);
  assert.match(none.hint, /Write an itinerary first/);
  const approved = itineraryPdfState({ latest: { status: "approved" }, dirty: false });
  assert.deepEqual([approved.enabled, approved.draft], [true, false]);
  assert.match(approved.hint, /approved version/);
  const draft = itineraryPdfState({ latest: { status: "draft" }, dirty: false });
  assert.deepEqual([draft.enabled, draft.draft], [true, true]);
  assert.match(draft.hint, /DRAFT - NOT APPROVED/);
  assert.match(itineraryPdfState({ latest: { status: "draft" }, dirty: true }).hint, /saved version, not your unsaved changes/);
  // The same rules, whichever document: the two wrappers differ only in the noun.
  for (const latest of [null, { status: "approved" }, { status: "draft" }]) {
    for (const dirty of [false, true]) {
      const letter = coverLetterPdfState({ latest, dirty });
      const itinerary = itineraryPdfState({ latest, dirty });
      assert.deepEqual([letter.enabled, letter.draft], [itinerary.enabled, itinerary.draft]);
      assert.deepEqual(documentPdfState({ latest, dirty, noun: "itinerary" }), itinerary);
    }
  }
  assert.match(coverLetterPdfState({ latest: null, dirty: false }).hint, /Write a cover letter first/);
});

test("the activity log words an itinerary export with its version and whether it was approved, and never any text", () => {
  const admin = { id: "a1", name: "Alex Auditor" };
  assert.deepEqual(describeActivity({ action: "pdf_export", admin, pdfType: "itinerary", pdfBy: "admin", version: 3, pdfApproved: true }), { who: "Alex Auditor", what: "downloaded version 3 of the itinerary as a PDF (approved)" });
  assert.deepEqual(describeActivity({ action: "pdf_export", admin, pdfType: "itinerary", pdfBy: "admin", version: 1, pdfApproved: false }), { who: "Alex Auditor", what: "downloaded version 1 of the itinerary as a PDF (a draft, not approved)" });
  assert.deepEqual(describeActivity({ action: "pdf_export", admin, pdfType: "itinerary", pdfBy: "admin" }), { who: "Alex Auditor", what: "downloaded the itinerary as a PDF" });
  assert.equal(describeActivity({ action: "pdf_export", admin, pdfType: "cover_letter", pdfBy: "admin", version: 2, pdfApproved: true }).what, "downloaded version 2 of the cover letter as a PDF (approved)", "the cover letter's wording is unchanged");
});

test("the itinerary download asks the itinerary route with the session token, never cached, and returns a blob; a refusal keeps the server's code", async () => {
  const calls = stubResponse();
  const blob = await touristVisaService.adminItineraryPdf("test-token", "abc123");
  assert.equal(blob instanceof Blob, true);
  assert.match(calls[0].url, /\/tourist-visa\/admin\/applications\/abc123\/pdf\/itinerary$/);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-token");
  assert.equal(calls[0].init.cache, "no-store");
  stubResponse({ status: 404, contentType: "application/json", json: { success: false, code: "ITINERARY_NOT_FOUND", message: "x" } });
  await assert.rejects(touristVisaService.adminItineraryPdf("t", "a"), (e) => e.status === 404 && e.code === "ITINERARY_NOT_FOUND");
  stubResponse({ status: 422, contentType: "application/json", json: { success: false, code: "PDF_UNSUPPORTED_CHARACTERS", message: "The text of the itinerary has characters that the PDF cannot print." } });
  await assert.rejects(touristVisaService.adminItineraryPdf("t", "a"), (e) => e.status === 422 && /text of the itinerary/.test(e.message));
  stubResponse({ status: 429, contentType: "application/json", json: { success: false, code: "TOO_MANY_PDFS", message: "x" } });
  await assert.rejects(touristVisaService.adminItineraryPdf("t", "a"), (e) => e.status === 429);
});

test("the itinerary panel wires the button from the source like the cover letter's: off while there is no itinerary, with its hint, off while the panel is busy, and the draft flag", () => {
  const panel = fs.readFileSync(new URL("../components/tourist-visa/ItineraryPanel.tsx", import.meta.url), "utf8");
  assert.equal((panel.match(/<PdfDownloadButton/g) || []).length, 2, "one in the empty state and one beside the itinerary");
  assert.match(panel, /kind="itinerary"/);
  assert.match(panel, /disabled=\{!pdf\.enabled\}/, "off in the empty state");
  assert.match(panel, /disabled=\{!pdf\.enabled \|\| busy !== null\}/, "off while the panel is busy");
  assert.match(panel, /draft=\{pdf\.draft\}/);
  assert.match(panel, /id="tv-itinerary-pdf-hint"/);
  assert.match(panel, /itineraryPdfState\(\{ latest, dirty, stale: Boolean\(view\?\.stale\) \}\)/, "the panel's own stale flag reaches the button state (step 8j-3)");
  const page = fs.readFileSync(new URL("../app/admin/tourist-visa/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<ItineraryPanel applicationId=\{id\} reference=\{call\.reference\}/, "the reference is passed for the file name");
  const button = fs.readFileSync(new URL("../components/tourist-visa/PdfDownloadButton.tsx", import.meta.url), "utf8");
  assert.match(button, /adminItineraryPdf/);
  assert.equal(/localStorage\.setItem|sessionStorage|console\./.test(button), false);
});
