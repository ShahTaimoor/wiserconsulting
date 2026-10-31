import type { CSSProperties } from "react";
import { toast } from "sonner";

/**
 * Toasts for the Tourist Visa pages. The <Toaster /> is mounted once for the whole site
 * (app/Providers.tsx), so a toast shown just before navigating to the next section stays on screen.
 *
 * Only ever pass fixed wording or a section title here, never anything the applicant typed.
 */

// The site's Toaster is always in its light theme. These variables make a toast follow the page
// tokens instead, so it is dark when the page is.
const THEMED: CSSProperties = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
} as CSSProperties;

// A fixed id means pressing Save again replaces the toast instead of stacking another.
const SAVE_TOAST_ID = "tourist-visa-save";

export function notifySaved(sectionTitle: string) {
  toast.success("Section saved", { id: SAVE_TOAST_ID, description: sectionTitle, duration: 3500, style: THEMED });
}

export function notifySaveFailed(message: string) {
  toast.error(message, { id: SAVE_TOAST_ID, duration: 6000, style: THEMED });
}

// Files: the toasts carry fixed wording only (never a file name), and the same id keeps them from stacking.
const DOCUMENT_TOAST_ID = "tourist-visa-document";

export function notifyDocumentUploaded() {
  toast.success("File uploaded", { id: DOCUMENT_TOAST_ID, duration: 3000, style: THEMED });
}

export function notifyDocumentRemoved() {
  toast.success("File removed", { id: DOCUMENT_TOAST_ID, duration: 3000, style: THEMED });
}

// Submitting: fixed wording only, and one id so a retry replaces the toast.
const SUBMIT_TOAST_ID = "tourist-visa-submit";

export function notifySubmitted() {
  toast.success("Application submitted", { id: SUBMIT_TOAST_ID, duration: 5000, style: THEMED });
}

/** `message` is one of the fixed texts of describeSubmitFailure. */
export function notifySubmitFailed(message: string) {
  toast.error(message, { id: SUBMIT_TOAST_ID, duration: 7000, style: THEMED });
}

/** `message` is one of the fixed texts of documentErrorMessage. */
export function notifyDocumentFailed(message: string) {
  toast.error(message, { id: DOCUMENT_TOAST_ID, duration: 6000, style: THEMED });
}
