// Canonical source: shared/tourist-visa/. Do not edit the copies; run
// `node scripts/sync-shared.js` after changing the canonical files.

import type { TouristVisaConfig } from './engine';

/** A file as the review shows it: a name and a size, never a link or a storage id. */
export interface ReviewFile {
  name: string;
  /** Size in bytes. */
  size: number;
  /** For example "1.5 KB". */
  sizeText: string;
}

export interface ReviewRow {
  /** Question id, or the repeating group's id for a group row. */
  id: string;
  /** The question number, such as "2.3a"; null for a group row. */
  number: string | null;
  label: string;
  kind: 'value' | 'files' | 'group';
  /** What to show: the answer in words, "Not answered", "No files uploaded", "3 entries", and so on. */
  value: string;
  /** True when there is nothing to show for it (not answered, no files, no entries). */
  empty?: boolean;
  /** A multiple-choice answer, one text per ticked choice. */
  items?: string[];
  /** For a declaration tick: when it was given. */
  note?: string;
  /** kind "files". */
  files?: ReviewFile[];
  /** kind "group": one numbered item per entry. */
  entries?: Array<{ title: string; rows: ReviewRow[] }>;
}

export interface ReviewSection {
  id: string;
  title: string;
  /** A section made only of file questions (10D). */
  filesOnly: boolean;
  rows: ReviewRow[];
}

export interface ReviewPart {
  id: string;
  title: string;
  sections: ReviewSection[];
}

export interface Review {
  parts: ReviewPart[];
}

/**
 * The application as an ordered, human-readable review. `answers` must already be decrypted;
 * `documents` need only a slot, a name and a size; `declarations` are the tick records by question id.
 */
export function buildReview(
  cfg: TouristVisaConfig,
  answers: Record<string, unknown> | undefined,
  documents?: Array<{ slot: string; name: string; size: number }>,
  declarations?: Record<string, { acceptedAt?: Date | string } | undefined>
): Review;

export function formatDate(value: string): string;
export function formatMonth(value: string): string;
export function formatMoment(value: Date | string): string;
export function formatAmount(value: unknown): string;
export function formatDuration(value: unknown): string;
export function formatSize(bytes: number): string;
