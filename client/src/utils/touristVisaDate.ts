/**
 * Dates in the Tourist Visa feature, in one place.
 *
 * INPUT: the applicant types a date as dd/mm/yyyy. The answer is still STORED as ISO "yyyy-mm-dd" (the server, the engine and the saved
 * applications are unchanged). While a date is incomplete or not real, the form keeps the text as typed (so nothing is lost while typing, and
 * nothing is silently turned into another date); a complete, real date becomes its ISO form.
 *
 * DISPLAY (read-only): "18 January 2026", day, full month name, year. A date is always written from its year, month and day parts, through
 * the shared formatter (shared/tourist-visa/view.js); it is never built through new Date("yyyy-mm-dd") in local time, which is a day out in
 * some time zones. A moment with a time (an audit row, a created-at) is the date in that style plus the 24-hour time, in the browser's time
 * zone as before (a time zone can be passed for tests).
 *
 * Pure functions: no React, no network.
 */

import { formatDate } from "../shared/tourist-visa/view.js";

export const DATE_PLACEHOLDER = "dd/mm/yyyy";

/** Plain-words messages for a date that cannot be used. */
export const DATE_MESSAGES = Object.freeze({
  incomplete: "Enter the full date as dd/mm/yyyy",
  invalid: "Enter a real date as dd/mm/yyyy",
});

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const SEPARATOR = /[/.\-\s]/;
const SEPARATORS = /[/.\-\s]+/;
const MAX_TEXT = 14; // a typed date is 10 characters; room is left so a paste is never cut short without a word

export const isIsoDate = (value: unknown): value is string => typeof value === "string" && ISO.test(value);

export const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

const two = (n: number): string => String(n).padStart(2, "0");

export type DateParse =
  | { status: "empty" }
  | { status: "incomplete" }
  | { status: "invalid" }
  | { status: "valid"; iso: string; day: number; month: number; year: number };

/**
 * Reads what was typed or pasted as day, month and year. Separators: / - . or a space. Day and month may be one or two digits ("1/1/2026"),
 * the year is four digits. "18012026" (digits only) is read as ddmmyyyy.
 *   empty       nothing typed
 *   incomplete  so far a prefix of a date (the year is shorter than four digits, or a part is missing): not an error while typing
 *   invalid     not a date: letters, a month 13, 31/02/2026, 29/02/2025, 00/01/2026, a day or month of three digits, a five-digit year
 */
export function parseDmy(text: string): DateParse {
  const trimmed = (text ?? "").trim();
  if (trimmed === "") return { status: "empty" };
  if (/[^\d/.\-\s]/.test(trimmed)) return { status: "invalid" };

  let parts: string[];
  if (SEPARATOR.test(trimmed)) {
    parts = trimmed.split(SEPARATORS).filter((part) => part !== "");
  } else if (trimmed.length === 8) {
    parts = [trimmed.slice(0, 2), trimmed.slice(2, 4), trimmed.slice(4)];
  } else if (trimmed.length < 8) {
    return { status: "incomplete" };
  } else {
    return { status: "invalid" };
  }
  if (parts.length > 3) return { status: "invalid" };
  if (parts.length < 3) {
    // A day or a month already too long, or already impossible, is not "still typing".
    return parts.some((part) => part.length > 2) ? { status: "invalid" } : { status: "incomplete" };
  }
  const [dayText, monthText, yearText] = parts;
  if (dayText.length > 2 || monthText.length > 2 || yearText.length > 4) return { status: "invalid" };
  if (yearText.length < 4) return { status: "incomplete" };
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return { status: "invalid" };
  return { status: "valid", iso: `${yearText}-${two(month)}-${two(day)}`, day, month, year };
}

/** "2026-01-18" -> "18/01/2026" (from the parts, no Date); null when it is not a full ISO date. */
export function isoToDmy(iso: unknown): string | null {
  if (typeof iso !== "string") return null;
  const match = ISO.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

/**
 * The text of the input as it should look after a keystroke or a paste. Digits get their slashes (dd/mm/yyyy); typed separators (/ - . space)
 * are turned into slashes; anything else is ignored. A slash is added after the day and the month as soon as they are complete, but not
 * while deleting (so backspace can remove it). No digit is ever dropped: a longer text stays as typed, and is reported as not a real date.
 */
export function maskDateText(raw: string, previous = ""): string {
  const deleting = raw.length < previous.length;
  const cleaned = (raw ?? "").replace(/[^\d/.\-\s]/g, "");
  if (SEPARATOR.test(cleaned)) {
    const pieces = cleaned.split(SEPARATORS);
    const tokens = pieces[0] === "" ? pieces.slice(1) : pieces;
    const [day = "", month, year] = tokens;
    let out = day;
    if (tokens.length > 1) out += `/${month ?? ""}`;
    if (tokens.length > 2) out += `/${year ?? ""}`;
    // A complete month (dd/mm) gets its slash before the year, as soon as it is typed, but not while deleting.
    if (!deleting && tokens.length === 2 && (month ?? "").length === 2) out += "/";
    return out.slice(0, MAX_TEXT);
  }
  const digits = cleaned.slice(0, 12);
  let out = digits.slice(0, 2);
  if (digits.length > 2 || (digits.length === 2 && !deleting)) out += `/${digits.slice(2, 4)}`;
  if (digits.length > 4 || (digits.length === 4 && !deleting)) out += `/${digits.slice(4)}`;
  return out.slice(0, MAX_TEXT);
}

/** Where the caret goes after the text was reformatted: just after the same number of digits as before it, and past a slash that follows. */
export function caretAfterMask(formatted: string, digitsBeforeCaret: number, deleting: boolean): number {
  if (digitsBeforeCaret <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index])) seen += 1;
    if (seen === digitsBeforeCaret) {
      let position = index + 1;
      if (!deleting && formatted[position] === "/") position += 1;
      return position;
    }
  }
  return formatted.length;
}

/** What the form keeps for text just typed: the ISO date when it is a complete real date, otherwise the text as typed (kept, not changed). */
export function dateAnswerFromText(text: string): string {
  const parsed = parseDmy(text);
  return parsed.status === "valid" ? parsed.iso : text.trim() === "" ? "" : text;
}

/** What the input shows for the form's value: a stored ISO date as dd/mm/yyyy, any other text as it is. */
export function dateInputText(value: unknown): string {
  if (typeof value !== "string") return "";
  return isoToDmy(value) ?? value;
}

/** The problem with the text in the input, or null (empty and complete real dates have none). */
export function dateProblem(value: unknown): "incomplete" | "invalid" | null {
  if (typeof value !== "string" || isIsoDate(value)) return null;
  const parsed = parseDmy(value);
  return parsed.status === "incomplete" ? "incomplete" : parsed.status === "invalid" ? "invalid" : null;
}

/**
 * The error to show under a date question. The engine's generic words ("Enter a full date") are replaced by the plain sentence that names the
 * format when the answer is text that is not a date; any other error (not in the future, within ten years, and so on) is shown as it is.
 */
export function dateErrorMessage(value: unknown, serverError: string | undefined): string | undefined {
  if (!serverError) return serverError;
  const problem = dateProblem(value);
  return problem ? DATE_MESSAGES[problem] : serverError;
}

/** The echo under the input: "18 January 2026" once the typed date is complete and real; "" while empty or not valid. */
export function dateEcho(value: unknown): string {
  if (typeof value !== "string") return "";
  if (isIsoDate(value)) return longDate(value);
  const parsed = parseDmy(value);
  return parsed.status === "valid" ? longDate(parsed.iso) : "";
}

/** "2026-01-18" -> "18 January 2026" (the shared formatter; the text itself when it is not a full date). */
export function longDate(iso: string): string {
  return formatDate(iso);
}

// ---------------------------------------------------------------------------
// A moment with a time, for the read-only places
// ---------------------------------------------------------------------------

/**
 * The calendar day and the clock time of a moment, as parts, in a time zone (the browser's when none is given). The parts come from Intl, so
 * the day is the day in that zone and no Date is read in local time by hand.
 */
function partsOf(date: Date, timeZone?: string): { day: string; month: string; year: string; hour: string; minute: string } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;
  return { day: parts.day, month: parts.month, year: parts.year, hour: parts.hour === "24" ? "00" : parts.hour, minute: parts.minute };
}

/** "18 January 2026" for a moment (an ISO time), in the browser's time zone (or `timeZone`); "" when it is not a date. */
export function formatMomentDate(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const { day, month, year } = partsOf(date, timeZone);
  return longDate(`${year}-${month}-${day}`);
}

/** "18 January 2026, 14:05": the date in the same style and the 24-hour time, in the browser's time zone (or `timeZone`); "" when not a date. */
export function formatDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const { day, month, year, hour, minute } = partsOf(date, timeZone);
  return `${longDate(`${year}-${month}-${day}`)}, ${hour}:${minute}`;
}
