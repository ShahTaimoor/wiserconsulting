/**
 * View model for the Tourist Visa dashboard: the section checklist built from the
 * shared config, and whether the form is open to applicants.
 *
 * Plain functions with type-only imports, so they can be unit tested with `node --test`.
 */

import { documentsStatus, getHeldSections, getQuestion, getVisibleSections, isFilesOnlySection } from "../shared/tourist-visa/engine.js";
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

/** How many documents the dashboard line names before it says "and N more" (a list of 20 documents must stay one short line). */
const SUMMARY_NAMED = 3;

/**
 * The line under the documents row on the dashboard: "Your passport or travel document (1 file), Evidence of funds (2 files)",
 * or "No files uploaded yet". It names the slots on this applicant's list that have files, by their label in the config, in the
 * order of the file questions; with more than three it names the first three and says how many more. A slot that is hidden for
 * the applicant's answers is not named.
 */
export function documentSummary(
  config: TouristVisaConfig,
  documents: Array<{ slot: string }> | undefined,
  sectionId: string | undefined,
  answers: Answers | undefined
): string {
  const parts = documentsStatus(config, documents, sectionId, answers ?? {})
    .slots.filter((slot) => slot.count > 0)
    .map((slot) => (getQuestion(config, slot.questionId)?.label ?? slot.slot) + " (" + slot.count + " file" + (slot.count === 1 ? "" : "s") + ")");
  if (parts.length === 0) return "No files uploaded yet";
  const named = parts.slice(0, SUMMARY_NAMED).join(", ");
  return parts.length > SUMMARY_NAMED ? named + " and " + (parts.length - SUMMARY_NAMED) + " more" : named;
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
  const answers = (application?.answers ?? {}) as Answers;
  const stateOf = (id: string): ChecklistState => {
    // A section made only of file questions (10D) follows the uploaded files, not a saved status.
    if (application && documents && isFilesOnlySection(config, id)) {
      const { state } = documentsStatus(config, documents, id, answers);
      return state === "complete" ? "saved" : state === "in_progress" ? "in_progress" : "not_started";
    }
    const stored = status[id];
    return stored === "saved" || stored === "needs_review" || stored === "in_progress" ? stored : "not_started";
  };
  const detailOf = (id: string): string | undefined =>
    application && documents && isFilesOnlySection(config, id) ? documentSummary(config, documents, id, answers) : undefined;

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

/** One thing still missing before an application can be submitted: a section, why, and where to fix it. */
export interface MissingItem {
  id: string;
  title: string;
  state: ChecklistState;
  reason: string;
  href: string;
}

/** "A", "A and B", "A, B and C": the documents still to upload, named in a sentence (long lists stay readable). */
function joinLabels(labels: string[]): string {
  return labels.length <= 1 ? labels.join("") : labels.slice(0, -1).join(", ") + " and " + labels[labels.length - 1];
}

export interface Readiness {
  /** True for a draft in which every section that applies is complete and every required document is uploaded. */
  ready: boolean;
  /** What is still missing, in form order. Empty when ready, and for an application that is not a draft. */
  missing: MissingItem[];
}

/**
 * Is the draft ready to review and submit? Every section that applies has to be saved (the documents section only
 * needs a file in each REQUIRED slot on the applicant's list; an optional slot never blocks). Otherwise it says what is still missing, section by section, with where to
 * go. The server checks all of this again at submit and has the last word.
 */
export function getReadiness(
  config: TouristVisaConfig,
  application: (Pick<TouristVisaApplication, "status" | "sectionStatus"> & { answers?: Record<string, unknown>; documents?: Array<{ slot: string }> }) | null
): Readiness {
  if (!application || application.status !== "draft") return { ready: false, missing: [] };
  const sections = buildChecklist(config, application).parts.flatMap((part) => part.sections);
  const answers = (application.answers ?? {}) as Answers;
  // The documents section is complete when every required slot has a file, whatever its optional slots hold (the server's rule).
  const documentsDone = (id: string) => isFilesOnlySection(config, id) && documentsStatus(config, application.documents ?? [], id, answers).complete;
  const missing = sections
    .filter((section) => section.state !== "saved" && !documentsDone(section.id))
    .map((section): MissingItem => {
      let reason = section.state === "needs_review" ? "Needs another look" : section.state === "in_progress" ? "Not finished" : "Not started yet";
      if (isFilesOnlySection(config, section.id)) {
        const labels = documentsStatus(config, application.documents ?? [], section.id, answers)
          .slots.filter((slot) => slot.required && slot.count === 0)
          .map((slot) => getQuestion(config, slot.questionId)?.label ?? slot.slot);
        if (labels.length > 0) reason = "Upload a file for: " + joinLabels(labels);
      }
      return { id: section.id, title: section.title, state: section.state, reason, href: "/tourist-visa/" + section.id };
    });
  return { ready: missing.length === 0, missing };
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

/** What the pages show: a neutral wait, the feature, or the "not available yet" notice. */
export type Availability = "loading" | "open" | "closed";

/**
 * Whether the Tourist Visa feature is available, from the two things that decide it:
 *  - the SERVER's switch (TOURIST_VISA_ENABLED), the single source of truth: "open", "closed" or "unknown" (not answered yet);
 *  - this build's own hold: no section held by a tbc or draft marker, or the preview flag (isFormOpen).
 * It is open only when the server says open AND the config hold passes. The config hold can close it at once, without
 * waiting for the server; an unanswered server is "loading", never open, so nothing is shown before the answer.
 */
export function availabilityOf(server: "unknown" | "open" | "closed", heldSectionCount: number, previewMode: boolean): Availability {
  if (!isFormOpen(heldSectionCount, previewMode)) return "closed";
  if (server === "unknown") return "loading";
  return server === "open" ? "open" : "closed";
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
