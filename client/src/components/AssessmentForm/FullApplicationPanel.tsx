"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ENTRY_TEXT } from "@/utils/safeRedirect";

interface FullApplicationPanelProps {
  /** Where the button goes (touristVisaEntryHref): the application itself, or the sign-up page that carries on to it. */
  href: string;
  /** Closes the popup. */
  onClose: () => void;
}

/**
 * What the assessment popup shows once a tourist visa assessment for the United Kingdom has been sent and the online application is open
 * (step 8i): the way on to the full application, and a plain way to close. It opens the application in the same tab. The page that uses it
 * decides when it appears (shouldOfferFullApplication), so it is never shown while the form is closed, still loading or failed.
 * Keyboard: the button takes the focus when the panel appears, and has a visible focus ring; it is at least 44 px tall.
 */
export const FullApplicationPanel: React.FC<FullApplicationPanelProps> = ({ href, onClose }) => {
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    linkRef.current?.focus();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6 sm:p-8" data-testid="full-application-panel">
      <div className="mx-auto max-w-xl space-y-6 rounded-xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-900">Ready to apply for a UK tourist visa?</h3>
          <p className="text-sm text-slate-600">
            Your assessment has been sent. You can also start your full application for a UK tourist visa online now.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            ref={linkRef}
            href={href}
            data-testid="continue-to-application"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-6 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            {ENTRY_TEXT.popup}
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-6 py-2.5 font-semibold text-slate-700 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
