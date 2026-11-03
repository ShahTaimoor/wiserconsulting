/**
 * The pure parts of the cover letter panel on the admin Overview (step 8g): the words for every state and failure code, the
 * source badge, the character counter and the rules for which buttons are on. No React, no network, so it is unit tested.
 * The letter's text is for the team only; nothing here stores it.
 */

import type { AdminFailure } from "./touristVisaAdmin";
import type { CoverLetterVersion, LetterSource } from "../services/touristVisaAdminTypes";

export const DEFAULT_MAX_LETTER = 8000;

/** Shown above the text of every letter: the administrator checks it, the AI does not. */
export const CHECK_NOTICE = "Check every fact in this letter against the application's answers before approving. A letter written by the AI can contain mistakes.";

/** The same notice for a letter that was not written by the AI (a template or a hand-written text). */
export const CHECK_NOTICE_SHORT = "Check every fact in this letter against the application's answers before approving.";

export const STALE_BANNER = "Answers used by the letter have changed.";
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
export function versionTitle(version: Pick<CoverLetterVersion, "version" | "source" | "status">): string {
  const parts = [`Version ${version.version}`, sourceBadge(version.source).label];
  if (version.status === "approved") parts.push("approved");
  return parts.join(", ");
}

/** Why a template letter was written instead of an AI letter, in plain words. Never anything the AI said. */
export function fallbackMessage(code: string | undefined): string {
  switch (code) {
    case "AI_DISABLED":
      return "The AI is switched off, so a template letter was created.";
    case "AI_NOT_CONFIGURED":
      return "The AI is not set up yet, so a template letter was created.";
    case "AI_TERMS_NOT_CONFIRMED":
      return "The AI is not cleared for real applications yet, so a template letter was created.";
    case "AI_CIRCUIT_OPEN":
      return "The AI was paused after repeated problems, so a template letter was created. It will be tried again in a few minutes.";
    case "AI_DAILY_LIMIT":
      return "Today's limit of AI letters has been reached, so a template letter was created.";
    case "AI_ADMIN_LIMIT":
      return "You have reached your hourly limit of AI letters, so a template letter was created.";
    case "AI_RATE_LIMITED":
      return "The AI is busy right now, so a template letter was created.";
    case "AI_TIMEOUT":
      return "The AI took too long to answer, so a template letter was created.";
    case "LETTER_EMPTY":
    case "LETTER_LENGTH":
    case "LETTER_LINK":
    case "LETTER_UNKNOWN_TOKEN":
    case "LETTER_MISSING_TOKEN":
    case "LETTER_NUMBER_NOT_IN_FACTS":
    case "LETTER_DATE_NOT_IN_FACTS":
      return "The AI's letter did not match the application's answers, so a template letter was created instead.";
    default:
      return "The AI was not available, so a template letter was created.";
  }
}

/** What to say after Generate: an AI letter, or why it is a template. */
export function createdMessage(created: { version: number; source: LetterSource; fallbackReason?: string }): string {
  if (created.source === "ai") return `AI draft created (version ${created.version}). ${CHECK_NOTICE}`;
  if (created.source === "template") return `${fallbackMessage(created.fallbackReason)} (Version ${created.version}.)`;
  return `Version ${created.version} saved.`;
}

/** What the panel tells the administrator before they generate: whether the AI will be used. */
export function aiLine(ai: { available: boolean; code?: string }): string {
  if (ai.available) return "A new version is written by the AI from the application's answers. Names and contact details are not sent to it.";
  const why: Record<string, string> = {
    AI_DISABLED: "The AI is switched off.",
    AI_NOT_CONFIGURED: "The AI is not set up yet.",
    AI_TERMS_NOT_CONFIRMED: "The AI is not cleared for real applications yet.",
    AI_CIRCUIT_OPEN: "The AI was paused after repeated problems and will be tried again in a few minutes.",
  };
  return `${(ai.code && why[ai.code]) || "The AI is not available right now."} A new version will be a template letter.`;
}

/** Characters and words of the text. */
export function letterCounter(text: string, max: number = DEFAULT_MAX_LETTER): { characters: number; words: number; over: boolean; label: string } {
  const characters = text.replace(/\r\n/g, "\n").length;
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const format = (n: number) => n.toLocaleString("en-GB");
  return { characters, words, over: characters > max, label: `${format(words)} word${words === 1 ? "" : "s"}, ${format(characters)} of ${format(max)} characters` };
}

/** The text with the line breaks the server stores, for comparing what is in the box with the newest version. */
export const normalizeLetter = (text: string): string => text.replace(/\r\n/g, "\n").trim();

/** Whether the text in the box can be saved as a new version: it has words, fits, and differs from the newest version. */
export function canSaveLetter(text: string, latestText: string | null, max: number = DEFAULT_MAX_LETTER): { ok: boolean; message: string } {
  const value = normalizeLetter(text);
  if (value.length === 0) return { ok: false, message: "Write the letter first." };
  if (text.replace(/\r\n/g, "\n").length > max) return { ok: false, message: `The letter can be at most ${max.toLocaleString("en-GB")} characters.` };
  if (latestText !== null && value === normalizeLetter(latestText)) return { ok: false, message: "" };
  return { ok: true, message: "" };
}

/** True when the text still has a gap the template left for the administrator to fill. */
export const hasGaps = (text: string): boolean => /\[not provided:[^\]]*\]/.test(text);

/** Which actions are on, from the newest version, the text in the box and the staleness. */
export function letterActions(options: { latest: CoverLetterVersion | null; text: string; stale: boolean; busy: boolean; max?: number }): {
  canGenerate: boolean;
  canSave: boolean;
  canApprove: boolean;
  approveHint: string;
} {
  const { latest, text, stale, busy } = options;
  const dirty = latest !== null && normalizeLetter(text) !== normalizeLetter(latest.text);
  const save = canSaveLetter(text, latest ? latest.text : null, options.max);
  let approveHint = "";
  if (latest) {
    if (latest.status === "approved") approveHint = "This version is approved.";
    else if (dirty) approveHint = "Save your changes as a new version first.";
    else if (stale) approveHint = STALE_HELP;
    else if (hasGaps(latest.text)) approveHint = "Fill in the [not provided: ...] gaps and save a new version first.";
  }
  return {
    canGenerate: !busy,
    canSave: !busy && save.ok,
    canApprove: !busy && latest !== null && approveHint === "",
    approveHint,
  };
}

/**
 * A plain sentence for every way a cover letter call can fail. Anything that is not specific to the letter (no connection,
 * not signed in, the application not found...) is worded by `otherwise`, which is describeAdminError.
 */
export function describeLetterError(failure: AdminFailure, otherwise: (failure: AdminFailure) => string): string {
  switch (failure.code) {
    case "LETTER_NOT_AVAILABLE":
      return "A cover letter can only be worked on while the application is submitted or in review. Reopen it first.";
    case "LETTER_CHANGED":
      return "The cover letter was changed by someone else. Reload it, then make your change again.";
    case "LETTER_NOT_LATEST":
      return "Only the newest version can be approved. Reload the letter and try again.";
    case "ALREADY_APPROVED":
      return "This version is already approved.";
    case "LETTER_STALE":
      return "The answers used by the letter have changed. Create a new version before approving.";
    case "LETTER_HAS_PLACEHOLDERS":
      return "The letter still has [not provided: ...] gaps. Fill them in and save a new version first.";
    case "LETTER_NOT_FOUND":
      return "There is no cover letter to approve yet.";
    case "LETTER_UNREADABLE":
    case "COVER_LETTER_UNAVAILABLE":
      return "The cover letter could not be read. Please contact support.";
    case "INVALID_TEXT":
      return "Check the letter: it needs some words and can be at most 8,000 characters.";
    case "INVALID_REQUEST":
      return "That could not be sent. Reload the page and try again.";
    default:
      return otherwise(failure);
  }
}
