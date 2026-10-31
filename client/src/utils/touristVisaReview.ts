/**
 * Plain functions for the review page: what to tell the applicant when a submit is refused, and how to word the
 * dates and counts on it.
 *
 * The server's answer to a refused submit names sections and counts, never an answer; this turns it into plain
 * words and links. Type-only imports, so it can be unit tested with `node --test`.
 */

import type { TouristVisaConfig } from "../shared/tourist-visa/engine.js";
import type { SubmitProblem } from "@/services/touristVisaService";

/** One section that needs attention, ready to show and link. */
export interface SectionToFix {
  id: string;
  title: string;
  /** For example "2 things to check". */
  text: string;
  href: string;
}

export interface SubmitFailure {
  /** What kind of failure it was, so the page can focus the right thing. */
  kind: "not_ready" | "already_submitted" | "changed" | "closed" | "other";
  /** A plain sentence for the top of the notice and for the toast. */
  message: string;
  /** The sections that need attention, in the order the server sent them (form order). */
  sections: SectionToFix[];
  /** The final declaration was not accepted. */
  declarationMissing: boolean;
}

/** "1 thing to check", "3 things to check". */
export function problemsText(count: number): string {
  return count === 1 ? "1 thing to check" : `${count} things to check`;
}

/** The input of describeSubmitFailure: what a refused submit carries. */
export interface SubmitFailureInput {
  status: number;
  code?: string;
  message?: string;
  sections?: SubmitProblem[];
  declarationMissing?: boolean;
}

/**
 * Plain words for every way a submit can be refused. Only fixed wording is used, never anything the server or the
 * applicant sent, apart from the section titles from the config.
 */
export function describeSubmitFailure(cfg: TouristVisaConfig, failure: SubmitFailureInput): SubmitFailure {
  const sections: SectionToFix[] = (failure.sections ?? []).map((section) => {
    const known = cfg.sections.find((s) => s.id === section.id);
    return {
      id: section.id,
      title: known ? known.title : `Section ${section.id}`,
      text: problemsText(section.problems),
      href: `/tourist-visa/${section.id}`,
    };
  });
  const declarationMissing = failure.declarationMissing === true;

  switch (failure.code) {
    case "NOT_READY": {
      const parts: string[] = [];
      if (sections.length > 0) parts.push(sections.length === 1 ? "One section needs attention" : `${sections.length} sections need attention`);
      if (declarationMissing) parts.push("the final declaration has not been ticked");
      const message = parts.length ? `${parts.join(", and ")}. Fix ${sections.length > 1 || (sections.length > 0 && declarationMissing) ? "them" : "it"} and submit again.` : "Your application is not ready to submit yet.";
      return { kind: "not_ready", message: message.charAt(0).toUpperCase() + message.slice(1), sections, declarationMissing };
    }
    case "ALREADY_SUBMITTED":
      return { kind: "already_submitted", message: "This application has already been submitted.", sections: [], declarationMissing: false };
    case "APPLICATION_CHANGED":
      return { kind: "changed", message: "Your application changed while it was being submitted. Please look it over and submit again.", sections: [], declarationMissing: false };
    case "APPLICATION_NOT_FOUND":
      return { kind: "other", message: "Start your application before submitting it.", sections: [], declarationMissing: false };
    case "REFERENCE_UNAVAILABLE":
      return { kind: "other", message: "We couldn't complete your submission just now. Nothing was submitted. Please try again in a moment.", sections: [], declarationMissing: false };
    case "INVALID_REQUEST":
      return { kind: "other", message: "Something went wrong with the request. Please reload the page and try again.", sections: [], declarationMissing: false };
    default:
      break;
  }
  if (failure.status === 0) return { kind: "other", message: "We couldn't reach the server. Nothing was submitted. Check your internet connection and try again.", sections: [], declarationMissing: false };
  if (failure.status === 404) return { kind: "closed", message: "The Tourist Visa application isn't open right now.", sections: [], declarationMissing: false };
  if (failure.status === 429) return { kind: "other", message: "Too many requests. Please wait a few minutes and try again.", sections: [], declarationMissing: false };
  if (failure.status >= 500) return { kind: "other", message: "Something went wrong on our side. Nothing was submitted. Please try again in a moment.", sections: [], declarationMissing: false };
  return { kind: "other", message: "Something went wrong. Please try again.", sections: [], declarationMissing: false };
}

/** "Submitted on 1 November 2026". An unreadable date gives just "Submitted". */
export function submittedOnText(iso: string | null | undefined): string {
  if (!iso) return "Submitted";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Submitted";
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `Submitted on ${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
