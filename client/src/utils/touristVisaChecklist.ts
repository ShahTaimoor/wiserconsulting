/**
 * View model for the Tourist Visa dashboard: the section checklist built from the
 * shared config, and whether the form is open to applicants.
 *
 * Plain functions with type-only imports, so they can be unit tested with `node --test`.
 */

import { getHeldSections, getVisibleSections } from "../shared/tourist-visa/engine.js";
import type { Answers, TouristVisaConfig } from "../shared/tourist-visa/engine.js";
import type { TouristVisaApplication } from "@/services/touristVisaService";

export type ChecklistState = "saved" | "needs_review" | "not_started";

export interface ChecklistSection {
  id: string;
  title: string;
  state: ChecklistState;
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
  application: (Pick<TouristVisaApplication, "sectionStatus"> & { answers?: Record<string, unknown> }) | null
): Checklist {
  const status = application?.sectionStatus ?? {};
  const applicable = new Set(getVisibleSections(config, (application?.answers ?? {}) as Answers).map((s) => s.id));
  const stateOf = (id: string): ChecklistState => (status[id] === "saved" || status[id] === "needs_review" ? status[id] : "not_started");

  const parts: ChecklistPart[] = config.parts
    .map((part) => ({
      id: part.id,
      title: part.title,
      sections: config.sections
        .filter((section) => section.part === part.id && applicable.has(section.id))
        .map((section) => ({ id: section.id, title: section.title, state: stateOf(section.id) })),
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
