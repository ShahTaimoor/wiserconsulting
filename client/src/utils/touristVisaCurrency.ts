/**
 * The currency helper's logic: reading the amount a person types, converting it to pounds, writing it in words, ordering the
 * currencies, checking the answer of the rates route, and sharing one fetch of the rates between every helper on a page.
 *
 * Nothing here saves anything: only the whole-pound figure the person chooses to use ever goes into the form. Plain
 * functions with their dependencies passed in (the fetch), so they can be unit tested with `node --test`.
 */

/** What the rates route sends: units of each currency per 1 GBP. */
export interface RatesData {
  base: "GBP";
  /** The date of the rates, YYYY-MM-DD. */
  asOf: string;
  rates: Record<string, number>;
  /** The server could not refresh them and is giving the last ones it had. */
  stale: boolean;
  /** A link that must be shown with these rates, or null. */
  attribution: { text: string; url: string } | null;
}

/** The most digits an amount may have (before and after the point together). */
export const MAX_AMOUNT_DIGITS = 12;

/**
 * What a person typed, cleaned as they type: digits and at most one decimal point, no sign, no letters, no spaces or commas,
 * at most 12 digits. (A comma is dropped so "1,250" becomes 1250.) Pasted text is cleaned the same way.
 */
export function sanitizeAmountInput(raw: string): string {
  let seenPoint = false;
  let digits = 0;
  let out = "";
  for (const character of raw) {
    if (character >= "0" && character <= "9") {
      if (digits >= MAX_AMOUNT_DIGITS) continue;
      digits += 1;
      out += character;
    } else if (character === "." && !seenPoint) {
      seenPoint = true;
      out += character;
    }
  }
  return out;
}

/** The number a cleaned text means, or null when it means no amount yet ("", ".", "..."). Never negative, never infinite. */
export function amountOf(text: string): number | null {
  const clean = sanitizeAmountInput(text);
  if (!/\d/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** An amount in another currency as pounds: `rate` is units of that currency per 1 GBP. Not rounded. */
export function convertToGbp(amount: number, rate: number): number {
  return amount / rate;
}

/** Whole pounds, halves rounded up (the figure that goes into the form). */
export function roundPounds(pounds: number): number {
  return Math.round(pounds);
}

/** "£1,250", with thousands separators. */
export function formatPounds(pounds: number): string {
  return `£${pounds.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

/** The rate as a person reads it: more detail for a small rate, none wasted on a large one ("370.99", "1.3419", "0.012345"). */
export function formatRate(rate: number): string {
  const digits = rate >= 100 ? 2 : rate >= 1 ? 4 : 6;
  return rate.toLocaleString("en-GB", { maximumFractionDigits: digits });
}

/** "3 November 2026" from "2026-11-03"; the text itself when it is not a date. */
export function formatAsOf(asOf: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOf);
  if (!match) return asOf;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return asOf;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** The amount typed, written back with separators ("450,000.5"), for the message after it is used. */
export function formatAmount(amount: number): string {
  return amount.toLocaleString("en-GB", { maximumFractionDigits: 6 });
}

/** The line under the inputs: "About £1,250 (1 GBP = 380 PKR, rates of 3 November 2026)". */
export function describeConversion(pounds: number, currency: string, rate: number, asOf: string): string {
  return `About ${formatPounds(pounds)} (1 GBP = ${formatRate(rate)} ${currency}, rates of ${formatAsOf(asOf)})`;
}

/** What is announced after "Use this amount". */
export function describeUse(pounds: number, amount: number, currency: string): string {
  return `${formatPounds(pounds)} filled in, from ${formatAmount(amount)} ${currency}.`;
}

/** The notice shown with rates the server could not refresh. */
export function staleNotice(asOf: string): string {
  return `Rates may be out of date (rates of ${formatAsOf(asOf)}).`;
}

/**
 * Whether a money question gets the helper. Its own config decides when it says anything; a config older than the flag
 * (an application submitted before 1.1.0, shown in the admin Edit form) says nothing, so today's config decides by
 * question id. The helper sits beside the field and is no part of the submitted wording or data.
 */
export function wantsCurrencyHelper(question: { id: string; type: string; currencyHelper?: boolean }, liveHelperIds: ReadonlySet<string>): boolean {
  if (question.type !== "AMT") return false;
  return question.currencyHelper ?? liveHelperIds.has(question.id);
}

/** The currencies to offer: PKR first (when there is a rate for it), then the rest alphabetically. */
export function currencyOptions(rates: Record<string, number>): string[] {
  const codes = Object.keys(rates).sort((a, b) => a.localeCompare(b, "en"));
  return codes.includes("PKR") ? ["PKR", ...codes.filter((code) => code !== "PKR")] : codes;
}

/**
 * Checks what the rates route sent, so nothing odd is ever shown or used: the base must be GBP, the date a date, every
 * rate a finite number above 0 under a three-letter code, and PKR must be there. The attribution is kept only as a link
 * to the rates provider over https. Returns null for anything else (the helper is then simply hidden).
 */
export function readRatesAnswer(data: unknown): RatesData | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (d.base !== "GBP") return null;
  if (typeof d.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.asOf)) return null;
  if (typeof d.stale !== "boolean") return null;
  if (d.rates === null || typeof d.rates !== "object" || Array.isArray(d.rates)) return null;
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(d.rates as Record<string, unknown>)) {
    if (!/^[A-Z]{3}$/.test(code)) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
    rates[code] = value;
  }
  if (!("PKR" in rates)) return null;

  let attribution: RatesData["attribution"] = null;
  if (d.attribution !== null && d.attribution !== undefined) {
    const a = d.attribution as Record<string, unknown>;
    if (typeof a !== "object" || typeof a.text !== "string" || typeof a.url !== "string" || !a.text.trim()) return null;
    try {
      const url = new URL(a.url);
      if (url.protocol !== "https:" || !/(^|\.)exchangerate-api\.com$/.test(url.hostname)) return null;
      attribution = { text: a.text, url: url.toString() };
    } catch {
      return null;
    }
  }
  return { base: "GBP", asOf: d.asOf, rates, stale: d.stale, attribution };
}

// ---------------------------------------------------------------------------
// One fetch for the whole page
// ---------------------------------------------------------------------------

export const RATES_TIMEOUT_MS = 8000;

export interface RatesStore {
  /** The rates, fetched once per page load and shared by every helper; null when they are unavailable for any reason. */
  get: () => Promise<RatesData | null>;
  /** The rates if they have already arrived, else undefined (not asked or still loading); null if unavailable. */
  peek: () => RatesData | null | undefined;
  /** Forgets everything (for tests). */
  reset: () => void;
}

/**
 * `fetchRates` returns the `data` the route sent (anything) or rejects. Any rejection, a timeout, or an answer that does not
 * pass readRatesAnswer is "unavailable" (null): no error is ever shown.
 */
export function createRatesStore({ fetchRates, timeoutMs = RATES_TIMEOUT_MS }: { fetchRates: () => Promise<unknown>; timeoutMs?: number }): RatesStore {
  let pending: Promise<RatesData | null> | null = null;
  let settled: RatesData | null | undefined;

  return {
    get() {
      if (!pending) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        });
        pending = Promise.race([Promise.resolve().then(fetchRates).then(readRatesAnswer, () => null), timeout]).then((result) => {
          if (timer !== undefined) clearTimeout(timer);
          settled = result;
          return result;
        });
      }
      return pending;
    },
    peek() {
      return settled;
    },
    reset() {
      pending = null;
      settled = undefined;
    },
  };
}
