/**
 * How money coming IN and going OUT is written on screen (the bank activity section, the review page and the staff-only funds check).
 * ONE place, so that no component formats an amount by itself.
 *
 * A credit is written with a leading "+" and a debit with a leading "−" (a proper minus sign, U+2212). The sign is always there, so colour is never
 * the only cue; the tone says which colour to use. A zero has no sign and no colour (nothing came in or went out). Opening and closing balances,
 * planned spending and exchange-rate lines are neutral: they have no flow. Display only: the stored amounts are always positive and are never changed
 * by anything here.
 *
 * Plain functions, so they can be unit tested with `node --test`.
 */

export type MoneyFlow = "credit" | "debit";
export type MoneyTone = "credit" | "debit" | "neutral";

/** A proper minus sign (not a hyphen), so that it lines up with the plus and reads as a minus. */
export const MINUS = "−";
export const PLUS = "+";

/**
 * The colours (checked for WCAG AA, 4.5:1 for normal text, on the card, the muted and the zebra row of both themes): green-700 and red-700 on the
 * light theme, green-400 and red-400 on the dark one. They are classes so that the sign and the amount are coloured together.
 */
export const TONE_CLASS: Record<MoneyTone, string> = {
  credit: "text-[#15803d] dark:text-[#4ade80]",
  debit: "text-[#b91c1c] dark:text-[#f87171]",
  neutral: "",
};

/** Digits line up in a column when a figure uses tabular numbers. */
export const NUMBER_CLASS = "tabular-nums";

/** 1234567.5 -> "1,234,567.50"; 1200000 -> "1,200,000"; a whole number has no decimals, anything else has two. Always the size of the amount, never its sign. */
export function formatNumber(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const size = Math.abs(amount);
  const cents = Math.round(size * 100);
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString("en-GB", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
}

export interface MoneyDisplay {
  /** "+", "−" or "" (a zero, or no flow). */
  sign: string;
  /** The size, with thousands separators ("1,200,000"). */
  number: string;
  /** "PKR", or "£" for pounds. */
  unit: string;
  /** Where the unit goes: before the number for pounds ("£500"), after it otherwise ("500 PKR"). */
  unitPosition: "before" | "after";
  tone: MoneyTone;
  /** All of it as text: "+1,200,000 PKR", "−£500", "700,000 PKR". */
  text: string;
}

const isZero = (amount: number) => Math.round(Math.abs(amount) * 100) === 0;

/** An amount shown as money in or out (`flow`), or neutral (no flow). A zero is neutral whatever its flow. */
export function moneyDisplay(amount: number, { flow = null, currency = "PKR" }: { flow?: MoneyFlow | null; currency?: string } = {}): MoneyDisplay {
  const number = formatNumber(amount);
  const unit = currency === "GBP" ? "£" : currency;
  const unitPosition = currency === "GBP" ? "before" : "after";
  const tone: MoneyTone = flow === null || !Number.isFinite(amount) || isZero(amount) ? "neutral" : flow;
  const sign = tone === "credit" ? PLUS : tone === "debit" ? MINUS : "";
  const text = unitPosition === "before" ? `${sign}${unit}${number}` : `${sign}${number} ${unit}`;
  return { sign, number, unit, unitPosition, tone, text };
}

/** The difference between money in and money out: a gain is a credit (+), a loss is a debit (−), nothing is neutral. */
export function netDisplay(credit: number, debit: number, currency = "PKR"): MoneyDisplay {
  const net = Math.round(credit * 100) - Math.round(debit * 100);
  return moneyDisplay(Math.abs(net) / 100, { flow: net > 0 ? "credit" : net < 0 ? "debit" : null, currency });
}

/** The sign and tone of an amount that is already written as text ("200,000 PKR", as the review gives it): the text itself is not changed. */
export function signOfText(text: string, flow: MoneyFlow | null): { sign: string; tone: MoneyTone } {
  const digits = text.replace(/[^0-9.]/g, "");
  const amount = digits === "" ? NaN : Number(digits);
  if (flow === null || !Number.isFinite(amount) || isZero(amount)) return { sign: "", tone: "neutral" };
  return flow === "credit" ? { sign: PLUS, tone: "credit" } : { sign: MINUS, tone: "debit" };
}

/** The sign alone ("+", "−" or ""), for the mark shown beside a field that keeps the typed value plain. */
export function signFor(flow: MoneyFlow | null): string {
  return flow === "credit" ? PLUS : flow === "debit" ? MINUS : "";
}

/** Which way money goes for a question: its own flow, or the answer of the question it follows in the same entry ("credit" or "debit"). */
export function flowOfQuestion(question: { flow?: MoneyFlow; flowFrom?: string }, entry?: Record<string, unknown> | null): MoneyFlow | null {
  if (question.flow === "credit" || question.flow === "debit") return question.flow;
  const type = question.flowFrom && entry ? entry[question.flowFrom] : undefined;
  return type === "credit" || type === "debit" ? type : null;
}
