"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/** A neutral wait while the server is asked whether the feature is open. Nothing of the feature is shown or loaded meanwhile. */
export function AvailabilityLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
      <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
    </div>
  );
}

interface ClosedNoticeProps {
  /** Where "back" goes: the home page for applicants, the admin start page for administrators. */
  homeHref?: string;
  homeLabel?: string;
}

/**
 * Shown instead of the Tourist Visa pages (and the admin pages) while the server says the feature is closed, or when the
 * answer could not be had. A plain, friendly page: no dashboard, no menu entry, no error box, and no other Tourist Visa call.
 */
export function ClosedNotice({ homeHref = "/", homeLabel = "Back to the home page" }: ClosedNoticeProps) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">This application is not available yet</h1>
      <p className="mt-3 text-muted-foreground">We&apos;re not taking Tourist Visa applications at the moment. Please check back soon.</p>
      <Button asChild className="mt-8 min-h-11">
        <Link href={homeHref}>{homeLabel}</Link>
      </Button>
    </div>
  );
}
