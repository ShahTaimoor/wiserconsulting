"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPRESS_MESSAGES } from "@/utils/touristVisaCompress";

/**
 * What the applicant sees while a picked file is being made smaller (before it is uploaded): a polite status line with a spinner, the name of
 * the file and a Cancel button. It is a status region, so a screen reader reads it when it appears, without moving focus.
 */
export function PreparingFile({ name, onCancel }: { name: string; onCancel: () => void }) {
  return (
    <div role="status" aria-live="polite" data-testid="preparing-file" className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{COMPRESS_MESSAGES.preparing}</p>
          <p className="break-all text-xs text-muted-foreground">{name}</p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/** The line that stays under a file for the rest of the visit to the page: "Reduced from 5.2 MB to 0.9 MB", or "Already small, kept as it is". */
export function CompressionNote({ note }: { note: string }) {
  return (
    <p data-testid="compression-note" className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
      {note}
    </p>
  );
}
