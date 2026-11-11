"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { FieldProps } from "./types";

/**
 * ACK: a tick the applicant must give. The label is drawn by the wrapper next to the box.
 * The value is true when ticked and undefined when not, so an untouched box counts as unanswered.
 */
export function AcknowledgeField({ id, value, onChange, invalid, describedBy, required }: FieldProps) {
  return (
    <Checkbox
      id={id}
      checked={value === true}
      onCheckedChange={(checked) => onChange(checked === true ? true : undefined)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      aria-required={required || undefined}
      className={invalid ? "border-red-500" : undefined}
    />
  );
}
