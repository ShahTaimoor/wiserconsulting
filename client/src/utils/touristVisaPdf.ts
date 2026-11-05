/**
 * The pure parts of the PDF download buttons (step 8h-1): the file name, the words for every way a download can fail, and the
 * check that an answer really is a PDF. No React, no network, so it is unit tested. Type-only imports.
 *
 * The file name is built from the application reference only, never from a name. Every message is fixed wording; the one
 * exception is the server's own sentence for a PDF it refused because of characters it cannot print (it names a section and
 * says what to do, and never contains the characters or any answer).
 */

/** The same rule the server uses for a reference in a file name. */
const SAFE_REFERENCE = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

export type PdfKind = "answers";

const SUFFIX: Record<PdfKind, string> = { answers: "application-summary" };

/** "TV-X42GYXPS-application-summary.pdf"; without a usable reference, just "application-summary.pdf". */
export function pdfFileName(reference: string | null | undefined, kind: PdfKind = "answers"): string {
  const prefix = typeof reference === "string" && SAFE_REFERENCE.test(reference) ? `${reference}-` : "";
  return `${prefix}${SUFFIX[kind]}.pdf`;
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
      // The server names the section; it never repeats the text. Anything else is replaced by the fixed sentence.
      return typeof failure.message === "string" && failure.message.length > 0 && failure.message.length <= 400 ? failure.message : PDF_UNSUPPORTED_FALLBACK;
    case "PDF_TOO_LARGE":
      return "This application is too long to print as one PDF. Please contact support.";
    case "PDF_NOT_AVAILABLE":
      return "A copy of your application can be downloaded once it has been submitted.";
    case "APPLICATION_NOT_FOUND":
      return "That application could not be found. It may not have been submitted.";
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

/** The words of the button, the busy state and the two toasts, for each side. */
export const PDF_WORDS = {
  admin: { button: "Export application (PDF)", busy: "Making the PDF…", done: "The application summary is downloading.", start: "Making the PDF of the application summary." },
  applicant: { button: "Download a copy (PDF)", busy: "Making your PDF…", done: "Your copy is downloading.", start: "Making the PDF of your application." },
} as const;
