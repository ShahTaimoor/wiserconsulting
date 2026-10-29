"use client";

import type { FieldProps } from "./types";

/**
 * FILE: placeholder. Documents are uploaded in their own step with private storage; no
 * question in Parts 1-2 is a file question. This keeps the renderer table complete, and a
 * future file question shows this note until the upload step exists.
 */
export function FileField({ id, describedBy }: FieldProps) {
  return (
    <p id={id} tabIndex={-1} aria-describedby={describedBy} className="rounded-lg border border-dashed border-input px-4 py-3 text-sm text-muted-foreground">
      Document upload is not available in this step yet.
    </p>
  );
}
