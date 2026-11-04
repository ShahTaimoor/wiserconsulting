/**
 * The pure parts of the itinerary panel on the admin Overview: the words for every state and failure code, the source badge, the
 * character counter and the rules for which buttons are on. No React, no network, so it is unit tested. The itinerary's text is for
 * the team only; nothing here stores it.
 *
 * It mirrors utils/touristVisaCoverLetter.ts in its own words. The small helpers are repeated here on purpose: these utilities are
 * tested without a bundler, so they do not import values from each other.
 */

import type { AdminFailure } from "./touristVisaAdmin";
import type { ItineraryBlocker, ItineraryVersion, LetterSource } from "../services/touristVisaAdminTypes";

export const DEFAULT_MAX_ITINERARY = 8000;

/** Shown above the text of every itinerary: it is a proposal, and the administrator checks it, the AI does not. */
export const PLAN_NOTICE = "This is a proposed plan, not a booking. Check it against the application's answers before approving.";

/** The sentence about the AI, only for a draft the AI wrote. */
export const AI_CAVEAT = "A plan written by the AI can contain mistakes.";

export const STALE_BANNER = "Answers used by the itinerary have changed.";
export const STALE_HELP = "Create a new version from the current answers, or edit the text and save it, before approving.";

/** The badge for how a version was made. */
export function sourceBadge(source: LetterSource): { label: string; tone: "ai" | "template" | "admin" } {
  switch (source) {
    case "ai":
      return { label: "AI draft", tone: "ai" };
    case "template":
      return { label: "Template draft", tone: "template" };
    default:
      return { label: "Edited by admin", tone: "admin" };
  }
}

/** The words for "Version 3, AI draft, approved". */
export function versionTitle(version: Pick<ItineraryVersion, "version" | "source" | "status">): string {
  const parts = [`Version ${version.version}`, sourceBadge(version.source).label];
  if (version.status === "approved") parts.push("approved");
  return parts.join(", ");
}

/** The notice above the text of the newest version: the sentence about the AI is only for a plan the AI wrote. */
export function checkNoticeFor(source: LetterSource): string {
  return source === "ai" ? `${PLAN_NOTICE} ${AI_CAVEAT}` : PLAN_NOTICE;
}

/** Why a template itinerary was written instead of an AI one, in plain words. Never anything the AI said. */
export function fallbackMessage(code: string | undefined): string {
  switch (code) {
    case "AI_DISABLED":
      return "The AI is switched off, so a template itinerary was created.";
    case "AI_NOT_CONFIGURED":
      return "The AI is not set up yet, so a template itinerary was created.";
    case "AI_TERMS_NOT_CONFIRMED":
      return "The AI is not cleared for real applications yet, so a template itinerary was created.";
    case "AI_CIRCUIT_OPEN":
      return "The AI was paused after repeated problems, so a template itinerary was created. It will be tried again in a few minutes.";
    case "AI_DAILY_LIMIT":
      return "Today's limit of AI drafts has been reached, so a template itinerary was created.";
    case "AI_ADMIN_LIMIT":
      return "You have reached your hourly limit of AI drafts, so a template itinerary was created.";
    case "AI_RATE_LIMITED":
      return "The AI is busy right now, so a template itinerary was created.";
    case "AI_TIMEOUT":
      return "The AI took too long to answer, so a template itinerary was created.";
    case "ITINERARY_BAD_JSON":
    case "ITINERARY_WRONG_COUNT":
    case "ITINERARY_BAD_ENTRY":
      return "The AI's answer was not in the form needed, even after a second try, so a template itinerary was created instead.";
    case "ITINERARY_FORBIDDEN_CONTENT":
    case "ITINERARY_PLACE_NOT_NAMED":
    case "ITINERARY_PLACE_ORDER":
      return "The AI's itinerary did not match what the applicant described, even after a second try, so a template itinerary was created instead.";
    case "ITINERARY_BANNED_PHRASE":
      return "The AI's itinerary used wording that is not allowed, even after a second try, so a template itinerary was created instead.";
    default:
      return "The AI was not available, so a template itinerary was created.";
  }
}

/** What to say after Generate: an AI draft (with the notice that an AI can be wrong) or why it is a template. */
export function createdMessage(created: { version: number; source: LetterSource; fallbackReason?: string }): string {
  if (created.source === "ai") return `AI draft created (version ${created.version}). ${PLAN_NOTICE} ${AI_CAVEAT}`;
  if (created.source === "template") return `${fallbackMessage(created.fallbackReason)} (Version ${created.version}.)`;
  return savedMessage(created.version);
}

/** What to say after the administrator saves their own text: it is their plan, so nothing about the AI. */
export function savedMessage(version: number | null): string {
  return `${version === null ? "Saved as a new version" : `Saved as version ${version}`}. Check it against the application before approving.`;
}

/** What the panel tells the administrator before they generate: whether the AI will be used. */
export function aiLine(ai: { available: boolean; code?: string }): string {
  if (ai.available) return "A new version is drafted by the AI from the dates, the places and plans described, and the kind of stay. Names, contact details and money are not sent to it.";
  const why: Record<string, string> = {
    AI_DISABLED: "The AI is switched off.",
    AI_NOT_CONFIGURED: "The AI is not set up yet.",
    AI_TERMS_NOT_CONFIRMED: "The AI is not cleared for real applications yet.",
    AI_CIRCUIT_OPEN: "The AI was paused after repeated problems and will be tried again in a few minutes.",
  };
  return `${(ai.code && why[ai.code]) || "The AI is not available right now."} A new version will be a template itinerary.`;
}

const QUESTION_WORDS: Record<string, string> = { "1.6": "question 1.6 (the arrival date)", "1.7": "question 1.7 (the departure date)" };

/** Which answers to fix when the dates cannot make an itinerary: the server's fixed code and the question numbers. */
export function blockerMessage(blocker: ItineraryBlocker): string {
  const which = blocker.questions.map((question) => QUESTION_WORDS[question] ?? `question ${question}`);
  const list = which.length === 2 ? `${which[0]} and ${which[1]}` : which.join(", ");
  if (blocker.code === "ITINERARY_DATES_MISSING") {
    return `An itinerary cannot be made yet: ${list} ${which.length === 1 ? "has" : "have"} no answer. Add ${which.length === 1 ? "it" : "them"} with the Edit button of section 1 below, then create the itinerary.`;
  }
  return `An itinerary cannot be made from these dates: the departure must not be before the arrival, and the visit can be at most six months. Check ${list} with the Edit button of section 1 below.`;
}

/** Characters and words of the text. */
export function itineraryCounter(text: string, max: number = DEFAULT_MAX_ITINERARY): { characters: number; words: number; over: boolean; label: string } {
  const characters = text.replace(/\r\n/g, "\n").length;
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const format = (n: number) => n.toLocaleString("en-GB");
  return { characters, words, over: characters > max, label: `${format(words)} word${words === 1 ? "" : "s"}, ${format(characters)} of ${format(max)} characters` };
}

/** The text with the line breaks the server stores, for comparing what is in the box with the newest version. */
export const normalizeItinerary = (text: string): string => text.replace(/\r\n/g, "\n").trim();

/** Whether the text in the box can be saved as a new version: it has words, fits, and differs from the newest version. */
export function canSaveItinerary(text: string, latestText: string | null, max: number = DEFAULT_MAX_ITINERARY): { ok: boolean; message: string } {
  const value = normalizeItinerary(text);
  if (value.length === 0) return { ok: false, message: "Write the itinerary first." };
  if (text.replace(/\r\n/g, "\n").length > max) return { ok: false, message: `The itinerary can be at most ${max.toLocaleString("en-GB")} characters.` };
  if (latestText !== null && value === normalizeItinerary(latestText)) return { ok: false, message: "" };
  return { ok: true, message: "" };
}

/** Which actions are on, from the newest version, the text in the box, the staleness and whether the dates allow a new one. */
export function itineraryActions(options: { latest: ItineraryVersion | null; text: string; stale: boolean; busy: boolean; blocked: boolean; max?: number }): {
  canGenerate: boolean;
  canSave: boolean;
  canApprove: boolean;
  approveHint: string;
} {
  const { latest, text, stale, busy, blocked } = options;
  const dirty = latest !== null && normalizeItinerary(text) !== normalizeItinerary(latest.text);
  const save = canSaveItinerary(text, latest ? latest.text : null, options.max);
  let approveHint = "";
  if (latest) {
    if (latest.status === "approved") approveHint = "This version is approved.";
    else if (dirty) approveHint = "Save your changes as a new version first.";
    else if (stale) approveHint = STALE_HELP;
  }
  return {
    canGenerate: !busy && !blocked,
    canSave: !busy && save.ok,
    canApprove: !busy && latest !== null && approveHint === "",
    approveHint,
  };
}

/**
 * A plain sentence for every way an itinerary call can fail. Anything that is not specific to the itinerary (no connection, not
 * signed in, the application not found...) is worded by `otherwise`, which is describeAdminError.
 */
export function describeItineraryError(failure: AdminFailure & { questions?: string[] }, otherwise: (failure: AdminFailure) => string): string {
  switch (failure.code) {
    case "ITINERARY_NOT_AVAILABLE":
      return "An itinerary can only be worked on while the application is submitted or in review. Reopen it first.";
    case "ITINERARY_DATES_MISSING":
    case "ITINERARY_DATES_INVALID":
      return blockerMessage({ code: failure.code, questions: failure.questions ?? ["1.6", "1.7"] });
    case "ITINERARY_CHANGED":
      return "The itinerary was changed by someone else. Reload it, then make your change again.";
    case "ITINERARY_NOT_LATEST":
      return "Only the newest version can be approved. Reload the itinerary and try again.";
    case "ALREADY_APPROVED":
      return "This version is already approved.";
    case "ITINERARY_STALE":
      return "The answers used by the itinerary have changed. Create a new version before approving.";
    case "ITINERARY_NOT_FOUND":
      return "There is no itinerary to approve yet.";
    case "ITINERARY_UNREADABLE":
    case "ITINERARY_UNAVAILABLE":
      return "The itinerary could not be read. Please contact support.";
    case "INVALID_TEXT":
      return "Check the itinerary: it needs some words and can be at most 8,000 characters.";
    case "INVALID_REQUEST":
      return "That could not be sent. Reload the page and try again.";
    default:
      return otherwise(failure);
  }
}
