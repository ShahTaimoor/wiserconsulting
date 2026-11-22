/**
 * The figures the "Your bank activity" section shows while the applicant types: how many months the statement covers, the monthly averages in
 * rupees and in pounds, and the amounts above which a single transaction is asked about. Display only. The numbers behind them (the percentages
 * and the floor) are the server's: they are read here from GET /funds-settings and never written in the client.
 *
 * Plain functions with their dependencies passed in, so they can be unit tested with `node --test`.
 */

import { amountOf, averageOf, rollingPeriods, singleTransactionLimit, statementMonths } from "../shared/tourist-visa/funds.js";
import type { RollingPeriod } from "../shared/tourist-visa/funds.js";
import { formatAsOf, formatPounds, formatRate } from "./touristVisaCurrency.ts";
import type { RatesData } from "./touristVisaCurrency.ts";

/** What the server says about the section: only the numbers the form shows. */
export interface FundsSettings {
  currency: string;
  spikePercent: number;
  singleTransactionPercent: number;
  singleTransactionFloor: number;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Checks what the settings route sent; null for anything else (the section then simply shows no limits). */
export function readFundsSettings(data: unknown): FundsSettings | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.currency !== "string" || !/^[A-Z]{3}$/.test(d.currency)) return null;
  if (!finite(d.spikePercent) || d.spikePercent < 0) return null;
  if (!finite(d.singleTransactionPercent) || d.singleTransactionPercent < 0) return null;
  if (!finite(d.singleTransactionFloor) || d.singleTransactionFloor < 0) return null;
  return { currency: d.currency, spikePercent: d.spikePercent, singleTransactionPercent: d.singleTransactionPercent, singleTransactionFloor: d.singleTransactionFloor };
}

export interface FundsSummary {
  months: number | null;
  periods: RollingPeriod[];
  averageCredit: number | null;
  averageDebit: number | null;
  /** The amounts above which a single credit (debit) is asked about; null while the totals are not there. */
  creditLimit: number | null;
  debitLimit: number | null;
}

/** The derived figures from the answers typed so far. */
export function summariseFunds(answers: Record<string, unknown>, settings: FundsSettings | null): FundsSummary {
  const months = statementMonths(answers.q10_29, answers.q10_30);
  const averageCredit = months === null ? null : averageOf(answers.q10_33, months);
  const averageDebit = months === null ? null : averageOf(answers.q10_34, months);
  return {
    months,
    periods: months === null ? [] : rollingPeriods(answers.q10_29, answers.q10_30, months),
    averageCredit,
    averageDebit,
    creditLimit: settings ? singleTransactionLimit(averageCredit, settings.singleTransactionPercent, settings.singleTransactionFloor) : null,
    debitLimit: settings ? singleTransactionLimit(averageDebit, settings.singleTransactionPercent, settings.singleTransactionFloor) : null,
  };
}

/** "PKR 1,250,000" (whole rupees, thousands separators). */
export function formatRupees(amount: number): string {
  return `PKR ${Math.round(amount).toLocaleString("en-GB")}`;
}

/** Rupees as pounds at the rates' PKR rate, or null when there is no rate. Not rounded. */
export function rupeesToPounds(rupees: number, rates: RatesData | null | undefined): number | null {
  const rate = rates?.rates?.PKR;
  return typeof rate === "number" && rate > 0 ? rupees / rate : null;
}

/** "PKR 200,000 (about £530)", or just the rupees when there is no rate. */
export function rupeesAndPounds(rupees: number, rates: RatesData | null | undefined): string {
  const pounds = rupeesToPounds(rupees, rates);
  return pounds === null ? formatRupees(rupees) : `${formatRupees(rupees)} (about ${formatPounds(pounds)})`;
}

/** The line that names the rate used: "1 GBP = 370.99 PKR, rates of 3 November 2026". */
export function describeRate(rates: RatesData | null | undefined): string | null {
  const rate = rates?.rates?.PKR;
  if (typeof rate !== "number" || !rates) return null;
  return `1 GBP = ${formatRate(rate)} PKR, rates of ${formatAsOf(rates.asOf)}`;
}

export { amountOf };
