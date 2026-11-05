"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyPdfDone, notifyPdfFailed } from "@/components/tourist-visa/notify";
import { useAppDispatch } from "@/redux/hooks";
import { logout } from "@/redux/slices/auth/authSlice";
import { touristVisaService, TouristVisaApiError } from "@/services/touristVisaService";
import { describePdfError, pdfFileName, PDF_WORDS, type PdfKind } from "@/utils/touristVisaPdf";

function readToken(): string | null {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

interface Props {
  /** "admin": a document of any submitted application (needs applicationId). "applicant": the signed-in applicant's own copy. */
  side: "admin" | "applicant";
  /** Which document: the application summary (default), or the cover letter or the itinerary (the team only). */
  kind?: PdfKind;
  applicationId?: string;
  /** The reference, used only for the name of the saved file. */
  reference: string | null;
  /** The newest version of the cover letter or the itinerary is not approved: the file is named with "-draft" (the server marks the pages). */
  draft?: boolean;
  /** Off, with a reason in the element named by describedBy (for the cover letter before one is written). */
  disabled?: boolean;
  describedBy?: string;
  /** Called after a successful download (the Overview reloads its activity log with it). */
  onDone?: () => void;
  className?: string;
}

/** Saves a blob under a file name, the way a download link does, and lets go of it. */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let the browser start the download before the address is dropped.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * "Export application (PDF)" on the admin Overview, "Download a copy (PDF)" after an application is submitted, and "Download PDF" in the cover letter
 * panel. The session's token is sent with an ordinary request (a plain link could not carry it), the answer is held in memory as a blob and saved,
 * and nothing is kept. Every failure shows the site's own toast and is announced to screen readers; the button stays focusable while busy
 * (aria-disabled), so keyboard focus is not lost.
 */
export function PdfDownloadButton({ side, kind = "answers", applicationId, reference, draft = false, disabled = false, describedBy, onDone, className }: Props) {
  const dispatch = useAppDispatch();
  const words = kind === "cover_letter" ? PDF_WORDS.coverLetter : kind === "itinerary" ? PDF_WORDS.itinerary : PDF_WORDS[side];
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState({ text: "", n: 0 });
  const alive = useRef(true);
  const working = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const announce = useCallback((text: string) => setAnnouncement((previous) => ({ text, n: previous.n + 1 })), []);

  const download = useCallback(async () => {
    if (working.current || disabled) return;
    const token = readToken();
    if (!token) {
      dispatch(logout());
      return;
    }
    if ((side === "admin" || kind !== "answers") && !applicationId) return;
    working.current = true;
    setBusy(true);
    announce(words.start);
    try {
      let blob: Blob;
      if (kind === "cover_letter") blob = await touristVisaService.adminCoverLetterPdf(token, applicationId as string);
      else if (kind === "itinerary") blob = await touristVisaService.adminItineraryPdf(token, applicationId as string);
      else if (side === "admin") blob = await touristVisaService.adminAnswersPdf(token, applicationId as string);
      else blob = await touristVisaService.myAnswersPdf(token);
      saveBlob(blob, pdfFileName(reference, kind, { draft }));
      if (alive.current) announce(words.done);
      notifyPdfDone(words.done);
      onDone?.();
    } catch (error) {
      let message: string;
      if (error instanceof TouristVisaApiError) {
        if (error.status === 401) dispatch(logout());
        message = describePdfError({ status: error.status, code: error.code, message: error.message, closed: error.closed });
      } else {
        message = describePdfError({ status: 0 });
      }
      notifyPdfFailed(message);
      if (alive.current) announce(message);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }, [side, kind, applicationId, reference, draft, disabled, dispatch, announce, onDone, words]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={className ?? "min-h-11"}
        disabled={disabled}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        aria-describedby={describedBy}
        onClick={() => void download()}
        data-testid={kind === "cover_letter" ? "letter-pdf-download" : kind === "itinerary" ? "itinerary-pdf-download" : "pdf-download"}
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Download className="mr-2 h-4 w-4" aria-hidden />}
        {busy ? words.busy : words.button}
      </Button>
      <span key={announcement.n} role="status" aria-live="polite" className="sr-only">
        {announcement.text}
      </span>
    </>
  );
}
