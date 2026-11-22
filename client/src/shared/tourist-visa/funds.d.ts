// Canonical source: shared/tourist-visa/. Do not edit the copies; run
// `node scripts/sync-shared.js` after changing the canonical files.

export const MONTH_NAMES: ReadonlyArray<string>;
export interface RollingPeriod {
  start: string;
  end: string;
  /** "20 May to 19 June" (with the years when the period crosses one). */
  label: string;
}
export function parseIso(iso: unknown): { y: number; m: number; d: number } | null;
export function addMonths(iso: string, n: number): string | null;
export function dayBefore(iso: string): string | null;
/** The calendar months between two dates, rounded to the nearest whole month; null when a date is not real or the end is not after the start. */
export function monthsBetween(start: unknown, end: unknown): number | null;
/** The number of months a statement is asked about (1 to 12), else null. */
export function statementMonths(start: unknown, end: unknown, limits?: { min?: number; max?: number }): number | null;
export function rollingPeriods(start: unknown, end: unknown, count: number): RollingPeriod[];
export function amountOf(value: unknown): number | null;
export function averageOf(total: unknown, months: number | null): number | null;
export function singleTransactionLimit(average: number | null, percent: number, floor: number): number | null;
export function isAboveAverage(value: unknown, total: unknown, months: number | null, percent: number): boolean;
export function sumCents(values: ReadonlyArray<unknown>): number | null;
export function formatPkr(n: number): string;
