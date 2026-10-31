/**
 * Plain functions for the admin list and the Overview: the words for a status, a move and a failure, what the
 * list says about itself, and how the Overview's sections and files are matched up.
 *
 * Fixed wording only, never anything the server or the applicant wrote (apart from the names of people and
 * files the page shows on purpose). Type-only imports, so these can be unit tested with `node --test`.
 */

import type { Review } from "../shared/tourist-visa/view.js";
import type { ActivityRow, AdminFile, AdminStatus } from "@/services/touristVisaAdminTypes";

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
export function describeActivity(row: Pick<ActivityRow, "action" | "admin" | "fromStatus" | "toStatus">): { who: string; what: string } {
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
    default:
      return { who, what: "did something" };
  }
}

/** The jump list at the top of the Overview: one link for each section, plus Activity. */
export function jumpLinks(review: Review): Array<{ href: string; label: string }> {
  const links = review.parts.flatMap((part) => part.sections.map((section) => ({ href: `#section-${section.id}`, label: `${section.id} ${section.title}` })));
  return [...links, { href: "#activity", label: "Activity" }];
}

/** The files of one file question, matched through the slot of that question. */
export function filesOfRow(rowId: string, fileSlots: Record<string, string>, documents: AdminFile[]): AdminFile[] {
  const slot = fileSlots[rowId];
  return slot ? documents.filter((doc) => doc.slot === slot) : [];
}
