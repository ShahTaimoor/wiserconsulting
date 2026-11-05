/**
 * Plain functions for the admin list and the Overview: the words for a status, a move and a failure, what the
 * list says about itself, and how the Overview's sections and files are matched up.
 *
 * Fixed wording only, never anything the server or the applicant wrote (apart from the names of people and
 * files the page shows on purpose). Type-only imports, so these can be unit tested with `node --test`.
 */

import type { Review } from "../shared/tourist-visa/view.js";
import type { ActivityRow, AdminFile, AdminFlag, AdminStatus, CallOutcome } from "@/services/touristVisaAdminTypes";

export const ADMIN_STATUSES: readonly AdminStatus[] = ["submitted", "in_review", "completed"];

const STATUS_LABELS: Record<AdminStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  completed: "Completed",
};

/** "in_review" -> "In review". An unknown status is shown as it is. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status as AdminStatus] ?? status;
}

/** What a button for a status move says, and what the question before it says. */
export interface MoveWords {
  button: string;
  title: string;
  text: string;
  confirm: string;
}

/** The words for moving an application from one status to another. */
export function moveWords(from: AdminStatus, to: AdminStatus): MoveWords {
  const change = `The status changes from ${statusLabel(from)} to ${statusLabel(to)}. This is recorded in the activity log.`;
  if (to === "completed") {
    return { button: "Mark as completed", title: "Mark this application as completed?", text: change, confirm: "Mark as completed" };
  }
  if (from === "completed") {
    return { button: "Reopen for review", title: "Reopen this application for review?", text: change, confirm: "Reopen for review" };
  }
  return { button: "Start review", title: "Start reviewing this application?", text: change, confirm: "Start review" };
}

/** The failure of an admin call, for the words below. */
export interface AdminFailure {
  status: number;
  code?: string;
  closed?: boolean;
}

/** A plain sentence for every way an admin call can fail. */
export function describeAdminError(failure: AdminFailure): string {
  if (failure.closed) return "The Tourist Visa application isn't open right now.";
  switch (failure.code) {
    case "INVALID_STATUS_MOVE":
      return "That change is not allowed from the application's current status. Reload the page to see where it stands.";
    case "STATUS_CHANGED":
      return "The status changed while you were looking. Reload the page and try again.";
    case "APPLICATION_NOT_FOUND":
      return "That application could not be found. It may not have been submitted.";
    case "DOCUMENT_NOT_FOUND":
      return "That file could not be found.";
    case "STORAGE_UNAVAILABLE":
      return "File storage isn't available right now. Please try again later.";
    case "INVALID_QUERY":
      return "That search or filter is not valid. Check it and try again.";
    case "REVISION_CHANGED":
      return "Someone else changed this application while you were editing. Load the latest version, then make your change again.";
    case "STATUS_NOT_EDITABLE":
      return "A completed application cannot be edited. Reopen it for review first.";
    case "CHANGES_INVALID":
      return "Some answers need attention. Check the sections marked below.";
    case "NO_CHANGES":
      return "Nothing would change. Change an answer first.";
    case "TOO_MANY_CHANGES":
      return "That is too many changes at once. Apply fewer sections at a time.";
    case "INVALID_REASON":
      return "Give the reason for the change, between 10 and 1000 characters.";
    case "TRANSACTIONS_UNAVAILABLE":
      return "Editing isn't available on this database yet. Please contact whoever looks after the server.";
    case "NOT_EDITABLE_DECLARATION":
    case "NOT_EDITABLE_DOCUMENTS":
    case "NOT_EDITABLE_STATUS":
    case "NOT_EDITABLE_REFERENCE":
    case "NOT_EDITABLE_SUBMITTED_AT":
    case "NOT_EDITABLE_IDENTITY":
      return "That part of the application cannot be changed by an administrator.";
    case "INVALID_TEXT":
      return "Check the text: a note needs some words and can be up to 2000 characters.";
    case "INVALID_OUTCOME":
      return "Say how the call went.";
    case "INVALID_FLAGS":
      return "That flag is not one of the available flags.";
    case "HISTORY_UNREADABLE":
    case "NOTES_UNREADABLE":
      return "That could not be read. Please contact support.";
    default:
      break;
  }
  if (failure.status === 0) return "We couldn't reach the server. Check your internet connection and try again.";
  if (failure.status === 401) return "Please sign in again.";
  if (failure.status === 403) return "You do not have access to this page.";
  if (failure.status === 404) return "That could not be found.";
  if (failure.status === 429) return "Too many requests. Please wait a few minutes and try again.";
  if (failure.status >= 500) return "Something went wrong on our side. Please try again in a moment.";
  return "Something went wrong. Please try again.";
}

/** "Showing 1 to 20 of 45 applications", or "No applications". */
export function listSummaryText(page: number, pageSize: number, total: number): string {
  if (total === 0) return "No applications";
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return `Showing ${first} to ${last} of ${total} application${total === 1 ? "" : "s"}`;
}

/** What an empty list says: a search or filter that matched nothing, or nothing submitted yet. */
export function emptyListText(q: string, status: string): string {
  if (q.trim() || status) return "No applications match your search. Try a different reference, name or email, or clear the filters.";
  return "No applications have been submitted yet.";
}

/** Which way the pager can go. */
export function pagerState(page: number, totalPages: number): { hasPrevious: boolean; hasNext: boolean } {
  return { hasPrevious: page > 1, hasNext: page < totalPages };
}

/** The date and time of a row, such as "31 Oct 2026, 11:56". `timeZone` is for tests; the page uses the browser's. */
export function formatWhen(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, ...(timeZone ? { timeZone } : {}) });
}

/** A line of the Activity panel: who did what. */
export function describeActivity(row: Pick<ActivityRow, "action" | "admin" | "fromStatus" | "toStatus" | "fromFlags" | "toFlags" | "letterVersion" | "letterSource" | "version" | "source"> & Partial<Pick<ActivityRow, "pdfType" | "pdfBy" | "pdfApproved">>): { who: string; what: string } {
  const who = row.admin.name || "An administrator";
  switch (row.action) {
    case "list_view":
      return { who, what: "saw the application in the list" };
    case "overview_view":
      return { who, what: "opened the Overview" };
    case "document_link":
      return { who, what: "opened a file" };
    case "status_change":
      return { who, what: row.fromStatus && row.toStatus ? `changed the status from ${statusLabel(row.fromStatus)} to ${statusLabel(row.toStatus)}` : "changed the status" };
    case "edit_open":
      return { who, what: "opened the answers to correct them" };
    case "changes_preview":
      return { who, what: "previewed a correction" };
    case "changes_apply":
      return { who, what: "corrected answers" };
    case "changes_view":
      return { who, what: "looked at the history of corrections" };
    case "notes_view":
      return { who, what: "read the notes and calls" };
    case "notes_add":
      return { who, what: "added a note or logged a call" };
    case "flags_change": {
      const from = row.fromFlags?.length ? row.fromFlags.map(flagLabel).join(", ") : "no flags";
      const to = row.toFlags?.length ? row.toFlags.map(flagLabel).join(", ") : "no flags";
      return { who, what: `changed the flags from ${from} to ${to}` };
    }
    case "cover_letter_view":
      return { who, what: "read the cover letter" };
    case "cover_letter_generate":
      return { who, what: `created ${row.letterVersion ? `version ${row.letterVersion} of ` : ""}the cover letter${row.letterSource ? ` (${letterSourceWords(row.letterSource)})` : ""}` };
    case "cover_letter_edit":
      return { who, what: `saved ${row.letterVersion ? `version ${row.letterVersion} of ` : ""}the cover letter after editing it` };
    case "cover_letter_approve":
      return { who, what: `approved ${row.letterVersion ? `version ${row.letterVersion} of ` : ""}the cover letter` };
    case "itinerary_view":
      return { who, what: "read the itinerary" };
    case "itinerary_generate": {
      const { version, source } = itineraryFacts(row);
      return { who, what: `created ${version ? `version ${version} of ` : ""}the itinerary${source ? ` (${letterSourceWords(source)})` : ""}` };
    }
    case "itinerary_edit": {
      const { version } = itineraryFacts(row);
      return { who, what: `saved ${version ? `version ${version} of ` : ""}the itinerary after editing it` };
    }
    case "itinerary_approve": {
      const { version } = itineraryFacts(row);
      return { who, what: `approved ${version ? `version ${version} of ` : ""}the itinerary` };
    }
    case "pdf_export": {
      if (row.pdfType === "cover_letter" || row.pdfType === "itinerary") {
        const which = row.version ? `version ${row.version} of ` : "";
        const state = row.pdfApproved === true ? " (approved)" : row.pdfApproved === false ? " (a draft, not approved)" : "";
        return { who, what: `downloaded ${which}the ${row.pdfType === "itinerary" ? "itinerary" : "cover letter"} as a PDF${state}` };
      }
      // An applicant's own download is recorded under the applicant's name; the team's under the administrator's.
      return { who, what: row.pdfBy === "applicant" ? "downloaded a copy of their application (PDF)" : "exported the application summary (PDF)" };
    }
    default:
      return { who, what: "did something" };
  }
}

/** The version and the source of an itinerary row: the plain names, or the old ones on a row written before them. */
const itineraryFacts = (row: Pick<ActivityRow, "version" | "source" | "letterVersion" | "letterSource">) => ({ version: row.version ?? row.letterVersion, source: row.source ?? row.letterSource });

const letterSourceWords = (source: string): string => (source === "ai" ? "written by the AI" : source === "template" ? "from the template" : "written by hand");

/** The jump list at the top of the Overview: Notes, one link for each section, then Changes and Activity. */
export function jumpLinks(review: Review): Array<{ href: string; label: string }> {
  const links = review.parts.flatMap((part) => part.sections.map((section) => ({ href: `#section-${section.id}`, label: `${section.id} ${section.title}` })));
  return [{ href: "#notes", label: "Notes and calls" }, { href: "#cover-letter", label: "Cover letter" }, { href: "#itinerary", label: "Itinerary" }, ...links, { href: "#changes", label: "Changes" }, { href: "#activity", label: "Activity" }];
}

/** The files of one file question, matched through the slot of that question. */
export function filesOfRow(rowId: string, fileSlots: Record<string, string>, documents: AdminFile[]): AdminFile[] {
  const slot = fileSlots[rowId];
  return slot ? documents.filter((doc) => doc.slot === slot) : [];
}

// ---------------------------------------------------------------------------
// Flags, notes and calls (step 8f)
// ---------------------------------------------------------------------------

export const ADMIN_FLAGS: readonly AdminFlag[] = ["needs_call", "called", "awaiting_applicant", "verified", "concern"];

const FLAG_LABELS: Record<AdminFlag, string> = {
  needs_call: "Needs a call",
  called: "Called",
  awaiting_applicant: "Waiting for the applicant",
  verified: "Verified",
  concern: "Concern",
};

/** "needs_call" -> "Needs a call". An unknown flag is shown as it is. */
export function flagLabel(flag: string): string {
  return FLAG_LABELS[flag as AdminFlag] ?? flag;
}

/** The flags after one is switched on or off, always in the fixed order. */
export function toggleFlag(current: readonly AdminFlag[], flag: AdminFlag): AdminFlag[] {
  const next = new Set(current);
  if (next.has(flag)) next.delete(flag);
  else next.add(flag);
  return ADMIN_FLAGS.filter((f) => next.has(f));
}

export const CALL_OUTCOMES: readonly CallOutcome[] = ["reached", "no_answer", "wrong_number", "call_back"];

const OUTCOME_LABELS: Record<CallOutcome, string> = {
  reached: "Spoke to them",
  no_answer: "No answer",
  wrong_number: "Wrong number",
  call_back: "Call back later",
};

export function outcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome as CallOutcome] ?? outcome;
}

export const NOTE_MAX = 2000;

/** What the counter under a note says, and whether it can be added. `required` is false for a call, which may have no words. */
export function noteState(text: string, required: boolean): { length: number; counter: string; valid: boolean; message: string } {
  const length = text.trim().length;
  const counter = `${length} of ${NOTE_MAX}`;
  if (length > NOTE_MAX) return { length, counter, valid: false, message: `That is ${length - NOTE_MAX} characters too long.` };
  if (required && length === 0) return { length, counter, valid: false, message: "Write the note first." };
  return { length, counter, valid: true, message: "" };
}

// ---------------------------------------------------------------------------
// Correcting answers (step 8f)
// ---------------------------------------------------------------------------

export const REASON_MIN = 10;
export const REASON_MAX = 1000;

/** The reason box: how long the trimmed text is, what the counter says, and whether it can be sent. */
export function reasonState(reason: string): { length: number; counter: string; valid: boolean; message: string } {
  const length = reason.trim().length;
  const counter = `${length} of ${REASON_MAX}`;
  if (length === 0) return { length, counter, valid: false, message: `Give the reason for the change (at least ${REASON_MIN} characters).` };
  if (length < REASON_MIN) return { length, counter, valid: false, message: `Write at least ${REASON_MIN} characters (${REASON_MIN - length} more).` };
  if (length > REASON_MAX) return { length, counter, valid: false, message: `That is ${length - REASON_MAX} characters too long.` };
  return { length, counter, valid: true, message: "" };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 answers changed, 6 removed, 1 question now needed" for the top of the preview. */
export function previewSummaryText(counts: { changes: number; removed: number; required: number }): string {
  const parts = [plural(counts.changes, "answer changed", "answers changed")];
  if (counts.removed > 0) parts.push(`${counts.removed} removed`);
  if (counts.required > 0) parts.push(`${plural(counts.required, "question", "questions")} now needed`);
  return parts.join(", ");
}

/** "1 thing to check" for a section the server says needs attention. */
export function problemsText(problems: number): string {
  return `${plural(problems, "thing", "things")} to check`;
}

/** The answer to a refused correction, as a notice: the sentence, and the sections to fix (id and count). */
export function describeEditFailure(failure: AdminFailure & { sections?: Array<{ id: string; problems: number }> }): {
  kind: "stale" | "invalid" | "locked" | "other";
  message: string;
  sections: Array<{ id: string; problems: number }>;
} {
  const message = describeAdminError(failure);
  const sections = failure.sections ?? [];
  if (failure.code === "REVISION_CHANGED") return { kind: "stale", message, sections: [] };
  if (failure.code === "CHANGES_INVALID") return { kind: "invalid", message, sections };
  if (failure.code === "STATUS_NOT_EDITABLE") return { kind: "locked", message, sections: [] };
  return { kind: "other", message, sections: [] };
}

/** A line of a preview or of the history, titled with its question number when it has one. */
export function lineTitle(line: { number: string | null; label: string }): string {
  return line.number ? `${line.number} ${line.label}` : line.label;
}
