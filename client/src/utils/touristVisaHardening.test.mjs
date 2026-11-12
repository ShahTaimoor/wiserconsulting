// Run with: npm run test:unit   (from client/)
// Step 8j-3: the stale-document note next to the Download PDF button, the Activity line for a stale export, and the sentences for the new
// rate-limit answers (429) and the refused-origin answer (403 ORIGIN_NOT_ALLOWED). Made-up data only.

import test from "node:test";
import assert from "node:assert/strict";
import { coverLetterPdfState, itineraryPdfState, documentPdfState, pdfFileName, describePdfError } from "./touristVisaPdf.ts";
import { describeActivity, describeAdminError, describeEditFailure } from "./touristVisaAdmin.ts";
import { describeError, TouristVisaApiError } from "../services/touristVisaService.ts";

const admin = { id: "a1", name: "Alex Auditor" };

// ---------------------------------------------------------------------------------------------- the note next to the button

test("an approved version whose answers changed since is a draft with its own note and the file name of a draft", () => {
  for (const state of [coverLetterPdfState, itineraryPdfState]) {
    const stale = state({ latest: { status: "approved" }, dirty: false, stale: true });
    assert.equal(stale.enabled, true, "the button is still on");
    assert.equal(stale.draft, true);
    assert.equal(stale.stale, true);
    assert.match(stale.hint, /answers changed after this version was approved/);
    assert.match(stale.hint, /DRAFT - ANSWERS CHANGED SINCE APPROVAL/);
    assert.match(stale.hint, /Create a new version and approve it/);
  }
  assert.equal(pdfFileName("TV-X42GYXPS", "cover_letter", { draft: true }), "TV-X42GYXPS-cover-letter-draft.pdf");
});

test("an approved, current version is unchanged: clean, no note about answers", () => {
  for (const state of [coverLetterPdfState, itineraryPdfState]) {
    for (const stale of [false, undefined]) {
      const current = state({ latest: { status: "approved" }, dirty: false, stale });
      assert.deepEqual([current.enabled, current.draft, current.stale], [true, false, false]);
      assert.match(current.hint, /^Downloads the approved version as a PDF\./);
      assert.equal(/changed/.test(current.hint), false);
    }
  }
});

test("a version that is not approved keeps the usual draft note whether or not the answers changed; the stale note is only for an approved one", () => {
  for (const stale of [false, true]) {
    const draft = coverLetterPdfState({ latest: { status: "draft" }, dirty: false, stale });
    assert.deepEqual([draft.enabled, draft.draft, draft.stale], [true, true, false]);
    assert.match(draft.hint, /not approved, so the PDF is marked "DRAFT - NOT APPROVED"/);
    assert.equal(/answers changed/.test(draft.hint), false);
  }
  const none = documentPdfState({ latest: null, dirty: false, noun: "itinerary", stale: true });
  assert.deepEqual([none.enabled, none.draft, none.stale], [false, false, false]);
});

test("unsaved changes in the text box are still mentioned, for a stale document too", () => {
  const dirty = coverLetterPdfState({ latest: { status: "approved" }, dirty: true, stale: true });
  assert.match(dirty.hint, /holds the saved version, not your unsaved changes/);
  assert.equal(dirty.stale, true);
});

// ---------------------------------------------------------------------------------------------- the Activity line

test("the Activity panel says when a PDF was a draft because the answers had changed since approval", () => {
  const row = (extra) => ({ action: "pdf_export", admin, pdfType: "cover_letter", pdfBy: "admin", version: 2, ...extra });
  assert.equal(describeActivity(row({ pdfApproved: false, pdfStale: true })).what, "downloaded version 2 of the cover letter as a PDF (a draft: the answers had changed since it was approved)");
  assert.equal(describeActivity(row({ pdfApproved: false, pdfStale: true, pdfType: "itinerary" })).what, "downloaded version 2 of the itinerary as a PDF (a draft: the answers had changed since it was approved)");
  // The old lines are exactly as they were.
  assert.equal(describeActivity(row({ pdfApproved: false })).what, "downloaded version 2 of the cover letter as a PDF (a draft, not approved)");
  assert.equal(describeActivity(row({ pdfApproved: true })).what, "downloaded version 2 of the cover letter as a PDF (approved)");
  assert.equal(describeActivity(row({ pdfApproved: false, pdfStale: false })).what, "downloaded version 2 of the cover letter as a PDF (a draft, not approved)");
  assert.equal(describeActivity({ action: "pdf_export", admin, pdfType: "answers", pdfBy: "admin" }).what, "exported the application summary (PDF)");
});

// ---------------------------------------------------------------------------------------------- the new answers from the server

test("each dedicated limit has its own clear sentence on the admin side, and any other 429 keeps the general one", () => {
  assert.equal(describeAdminError({ status: 429, code: "TOO_MANY_EDITS" }), "Too many corrections or previews in a short time. Please wait a few minutes and try again.");
  assert.equal(describeAdminError({ status: 429, code: "TOO_MANY_NOTES" }), "Too many notes, calls or flag changes in a short time. Please wait a few minutes and try again.");
  assert.equal(describeAdminError({ status: 429, code: "TOO_MANY_LIST_REQUESTS" }), "Too many searches or page changes in a short time. Please wait a few minutes and try again.");
  assert.equal(describeAdminError({ status: 429 }), "Too many requests. Please wait a few minutes and try again.");
  assert.equal(describeAdminError({ status: 429, code: "SOMETHING_ELSE" }), "Too many requests. Please wait a few minutes and try again.");
  assert.equal(describeAdminError({ status: 403, code: "ORIGIN_NOT_ALLOWED" }), "This request was not accepted. Reload the page and try again.");
  assert.equal(describeAdminError({ status: 403 }), "You do not have access to this page.");
});

test("a refused correction (a 429 on the edit routes) is shown as the sentence, not as a stale or invalid correction", () => {
  const shown = describeEditFailure({ status: 429, code: "TOO_MANY_EDITS" });
  assert.equal(shown.kind, "other");
  assert.match(shown.message, /Too many corrections or previews/);
  assert.deepEqual(shown.sections, []);
});

test("the applicant is told, in one sentence, when they have tried to submit too often; the origin refusal and the general 429 have their own", () => {
  assert.equal(describeError(new TouristVisaApiError(429, "server sentence", undefined, "TOO_MANY_SUBMISSIONS")), "You have tried to submit several times in a short while. Please wait a few minutes and try again.");
  assert.equal(describeError(new TouristVisaApiError(429, "server sentence")), "Too many requests. Please wait a few minutes and try again.");
  assert.equal(describeError(new TouristVisaApiError(403, "server sentence", undefined, "ORIGIN_NOT_ALLOWED")), "This request was not accepted. Reload the page and try again.");
  // The server's own words are never shown for an error the client has no sentence for (a 5xx stays the fixed sentence).
  assert.equal(describeError(new TouristVisaApiError(500, "stack trace here")), "Something went wrong on our side. Please try again in a moment.");
});

test("the PDF sentence for too many downloads is unchanged", () => {
  assert.equal(describePdfError({ status: 429, code: "TOO_MANY_PDFS" }), "Too many PDF downloads. Please wait a few minutes and try again.");
});
