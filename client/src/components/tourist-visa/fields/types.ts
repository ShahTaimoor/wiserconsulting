import type { Question, QuestionOption } from "@/shared/tourist-visa/engine";

/**
 * What every answer-type renderer receives. The wrapper (QuestionField) draws the label,
 * hint, error message and TBC marker; the renderer draws only the control(s).
 */
export interface FieldProps {
  /** DOM id of the control, or of the fieldset for compound controls. Sub-controls add a suffix. */
  id: string;
  question: Question;
  /** The current answer, in the shape its type uses (see engine.d.ts). Unknown until validated. */
  value: unknown;
  onChange: (value: unknown) => void;
  /** Choices for SEL, CHK and CTRY, already resolved against the current answers. */
  options: QuestionOption[];
  /** Messages for parts of a compound answer, e.g. { line1: "..." } for an address. */
  subErrors: Record<string, string>;
  /** The question has an error: marks the control invalid for assistive technology. */
  invalid: boolean;
  required: boolean;
  /** Space-separated ids of the hint and error text, for aria-describedby. */
  describedBy?: string;
  /** Character limit for long text, used for the counter. */
  limit?: number;
}

export const asString = (value: unknown): string => (typeof value === "string" ? value : "");

export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Sets one key of a compound answer; an empty string removes the key. */
export function withPart(current: unknown, key: string, part: unknown): Record<string, unknown> {
  const next = { ...asRecord(current) };
  if (part === undefined || part === "") delete next[key];
  else next[key] = part;
  return next;
}

export function ariaFor({ invalid, required, describedBy }: Pick<FieldProps, "invalid" | "required" | "describedBy">) {
  return {
    "aria-invalid": invalid || undefined,
    "aria-required": required || undefined,
    "aria-describedby": describedBy,
  };
}
