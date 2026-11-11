"use client";

import type { FieldProps } from "./types";

/**
 * FILE: files are never answered inside a section form. They are uploaded on the documents page
 * (DocumentsSection, section 10D), where each file is saved the moment it uploads. This keeps the renderer
 * table complete: if a file question ever reached an ordinary form, this note would show instead of a control.
 */
export function FileField({ id, describedBy }: FieldProps) {
  return (
    <p id={id} tabIndex={-1} aria-describedby={describedBy} className="rounded-lg border border-dashed border-input px-4 py-3 text-sm text-muted-foreground">
      Files are added on the documents page.
    </p>
  );
}
