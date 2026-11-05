/**
 * The pure parts of the PDF download buttons (steps 8h-1 and 8h-2): the file name, the words for every way a download can fail, the check that
 * an answer really is a PDF, and the state of the cover letter's button. No React, no network, so it is unit tested. Type-only imports.
 *
 * The file name is built from the application reference only, never from a name. Every message is fixed wording; the one exception is the
 * server's own sentence for a PDF it refused because of characters it cannot print (it names the place and says what to do, and never
 * contains the characters or any answer).
 */

/** The same rule the server uses for a reference in a file name. */
const SAFE_REFERENCE = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

export type PdfKind = "answers" | "cover_letter" | "itinerary";

const SUFFIX: Record<PdfKind, string> = { answers: "application-summary", cover_letter: "cover-letter", itinerary: "itinerary" };

/**
 * "TV-X42GYXPS-application-summary.pdf", "TV-X42GYXPS-cover-letter.pdf" or "TV-X42GYXPS-itinerary.pdf"; a cover letter or an itinerary that is not
 * approved ends "-draft". Without a usable reference, just the fixed part. (The same name the server puts in Content-Disposition.)
 */
export function pdfFileName(reference: string | null | undefined, kind: PdfKind = "answers", { draft = false }: { draft?: boolean } = {}): string {
  const prefix = typeof reference === "string" && SAFE_REFERENCE.test(reference) ? `${reference}-` : "";
  return `${prefix}${SUFFIX[kind]}${kind !== "answers" && draft ? "-draft" : ""}.pdf`;
}

/** The failure of a PDF call, for the words below. `message` is the server's sentence (used only for the unsupported characters). */
export interface PdfFailure {
  status: number;
  code?: string;
  message?: string;
  closed?: boolean;
}

export const PDF_UNSUPPORTED_FALLBACK = "Some of the text can't be printed in the PDF because it prints Latin letters only. Correct that answer and try again.";

/** A plain sentence for every way a PDF download can fail. */
export function describePdfError(failure: PdfFailure): string {
  if (failure.closed) return "The Tourist Visa application isn't open right now.";
  switch (failure.code) {
    case "PDF_UNSUPPORTED_CHARACTERS":
      // The server names the place (a section, the letter, or the sender block); it never repeats the text. Anything else is replaced by the fixed sentence.
      return typeof failure.message === "string" && failure.message.length > 0 && failure.message.length <= 400 ? failure.message : PDF_UNSUPPORTED_FALLBACK;
    case "PDF_TOO_LARGE":
      return "This document is too long to print as one PDF. Please contact support.";
    case "PDF_NOT_AVAILABLE":
      return "A copy of your application can be downloaded once it has been submitted.";
    case "APPLICATION_NOT_FOUND":
      return "That application could not be found. It may not have been submitted.";
    case "LETTER_NOT_FOUND":
      return "There is no cover letter to download yet. Write one first.";
    case "LETTER_UNREADABLE":
      return "The cover letter could not be read. Please contact support.";
    case "ITINERARY_NOT_FOUND":
      return "There is no itinerary to download yet. Write one first.";
    case "ITINERARY_UNREADABLE":
      return "The itinerary could not be read. Please contact support.";
    case "TOO_MANY_PDFS":
      return "Too many PDF downloads. Please wait a few minutes and try again.";
    case "PDF_FAILED":
      return "The PDF could not be made. Please try again, or contact support.";
    case "NOT_A_PDF":
      return "The server did not send a PDF. Please try again.";
    default:
      break;
  }
  if (failure.status === 0) return "We couldn't reach the server. Check your internet connection and try again.";
  if (failure.status === 401) return "Please sign in again.";
  if (failure.status === 403) return "You do not have access to this page.";
  if (failure.status === 404) return "That could not be found.";
  if (failure.status === 429) return "Too many PDF downloads. Please wait a few minutes and try again.";
  if (failure.status >= 500) return "Something went wrong on our side. Please try again in a moment.";
  return "Something went wrong. Please try again.";
}

/** True when a response's content type says it is a PDF (parameters such as a charset are ignored). */
export function isPdfContentType(value: string | null | undefined): boolean {
  return typeof value === "string" && value.split(";")[0].trim().toLowerCase() === "application/pdf";
}

/** The words of the button, the busy state and the two toasts, for each document. */
export const PDF_WORDS = {
  admin: { button: "Export application (PDF)", busy: "Making the PDF…", done: "The application summary is downloading.", start: "Making the PDF of the application summary." },
  applicant: { button: "Download a copy (PDF)", busy: "Making your PDF…", done: "Your copy is downloading.", start: "Making the PDF of your application." },
  coverLetter: { button: "Download PDF", busy: "Making the PDF…", done: "The cover letter PDF is downloading.", start: "Making the PDF of the cover letter." },
  itinerary: { button: "Download PDF", busy: "Making the PDF…", done: "The itinerary PDF is downloading.", start: "Making the PDF of the itinerary." },
} as const;

/** What the cover letter panel's and the itinerary panel's button does and says. `latest` is the newest version (or null); `dirty` is true while the text box holds unsaved changes. */
export interface CoverLetterPdfState {
  /** The button is on only when a letter exists. */
  enabled: boolean;
  /** The newest version is not approved, so the PDF will be marked as a draft. */
  draft: boolean;
  /** The sentence under the button. */
  hint: string;
}

/** The state of the button of a document that has versions (the cover letter or the itinerary): off until one exists, a draft is marked as one. */
export function documentPdfState({ latest, dirty, noun }: { latest: { status: string } | null; dirty: boolean; noun: "cover letter" | "itinerary" }): CoverLetterPdfState {
  if (!latest) return { enabled: false, draft: false, hint: `Write ${noun === "itinerary" ? "an itinerary" : "a cover letter"} first, then you can download it as a PDF.` };
  const saved = dirty ? " It holds the saved version, not your unsaved changes." : "";
  if (latest.status === "approved") return { enabled: true, draft: false, hint: `Downloads the approved version as a PDF.${saved}` };
  return { enabled: true, draft: true, hint: `This version is not approved, so the PDF is marked "DRAFT - NOT APPROVED" on every page.${saved}` };
}

export const coverLetterPdfState = ({ latest, dirty }: { latest: { status: string } | null; dirty: boolean }): CoverLetterPdfState => documentPdfState({ latest, dirty, noun: "cover letter" });
export const itineraryPdfState = ({ latest, dirty }: { latest: { status: string } | null; dirty: boolean }): CoverLetterPdfState => documentPdfState({ latest, dirty, noun: "itinerary" });
