/**
 * View model for the Tourist Visa dashboard: the section checklist built from the
 * shared config, and whether the form is open to applicants.
 *
 * Plain functions with type-only imports, so they can be unit tested with `node --test`.
 */

import { documentsStatus, getHeldSections, getVisibleSections, isFilesOnlySection } from "../shared/tourist-visa/engine.js";
import type { Answers, TouristVisaConfig } from "../shared/tourist-visa/engine.js";
import type { TouristVisaApplication } from "@/services/touristVisaService";

export type ChecklistState = "saved" | "needs_review" | "in_progress" | "not_started";

export interface ChecklistSection {
  id: string;
  title: string;
  state: ChecklistState;
  /** A line under the title, for example "1 passport file, 2 funds files" on the documents section. */
  detail?: string;
}

/**
 * The line under the documents row on the dashboard: "1 passport file, 2 funds files", or
 * "No files uploaded yet". Slots are in the order of the file questions.
 */
export function documentSummary(config: TouristVisaConfig, documents: Array<{ slot: string }> | undefined, sectionId?: string): string {
  const parts = documentsStatus(config, documents, sectionId)
    .slots.filter((slot) => slot.count > 0)
    .map((slot) => slot.count + " " + slot.slot + " file" + (slot.count === 1 ? "" : "s"));
  return parts.length ? parts.join(", ") : "No files uploaded yet";
}

export interface ChecklistPart {
  id: string;
  title: string;
  sections: ChecklistSection[];
}

export interface Checklist {
  parts: ChecklistPart[];
  total: number;
  saved: number;
  needsReview: number;
}

/**
 * Saved / needs review / not started for every section that applies to this applicant,
 * grouped by part, in form order. A section none of whose questions is visible (such as
 * 4A without a partner) is left out, and so is a part with no sections left.
 */
export function buildChecklist(
  config: TouristVisaConfig,
  application: (Pick<TouristVisaApplication, "sectionStatus"> & { answers?: Record<string, unknown>; documents?: Array<{ slot: string }> }) | null
): Checklist {
  const status = application?.sectionStatus ?? {};
  const applicable = new Set(getVisibleSections(config, (application?.answers ?? {}) as Answers).map((s) => s.id));
  const documents = application?.documents;
  const stateOf = (id: string): ChecklistState => {
    // A section made only of file questions (10D) follows the uploaded files, not a saved status.
    if (application && documents && isFilesOnlySection(config, id)) {
      const { state } = documentsStatus(config, documents, id);
      return state === "complete" ? "saved" : state === "in_progress" ? "in_progress" : "not_started";
    }
    const stored = status[id];
    return stored === "saved" || stored === "needs_review" || stored === "in_progress" ? stored : "not_started";
  };
  const detailOf = (id: string): string | undefined =>
    application && documents && isFilesOnlySection(config, id) ? documentSummary(config, documents, id) : undefined;

  const parts: ChecklistPart[] = config.parts
    .map((part) => ({
      id: part.id,
      title: part.title,
      sections: config.sections
        .filter((section) => section.part === part.id && applicable.has(section.id))
        .map((section) => ({ id: section.id, title: section.title, state: stateOf(section.id), detail: detailOf(section.id) })),
    }))
    .filter((part) => part.sections.length > 0);

  const all = parts.flatMap((part) => part.sections);
  return {
    parts,
    total: all.length,
    saved: all.filter((s) => s.state === "saved").length,
    needsReview: all.filter((s) => s.state === "needs_review").length,
  };
}

/**
 * Whether applicants may use the form. It opens only when no section still has an
 * open `tbc` item (unconfirmed questions or option lists), or in preview mode, which
 * is for development and testing with NEXT_PUBLIC_TOURIST_VISA_PREVIEW=true.
 */
export function isFormOpen(heldSectionCount: number, previewMode: boolean): boolean {
  return previewMode || heldSectionCount === 0;
}

/**
 * How many sections are not yet signed off: they still carry a tbc flag (a real unknown) or a
 * draft marker (a default awaiting senior review). The form opens to applicants only when this is
 * zero, so an unreviewed default can never reach the public by accident. Preview mode ignores it.
 */
export function countHeldSections(cfg: TouristVisaConfig): number {
  return getHeldSections(cfg).length;
}

/** Read at build time by Next.js, so it must stay a literal `process.env.NEXT_PUBLIC_...` expression. */
export function isPreviewMode(): boolean {
  return process.env.NEXT_PUBLIC_TOURIST_VISA_PREVIEW === "true";
}

export const STATUS_LABELS: Record<string, string> = {
  draft: "In progress",
  submitted: "Submitted",
  in_review: "In review",
  completed: "Completed",
};
