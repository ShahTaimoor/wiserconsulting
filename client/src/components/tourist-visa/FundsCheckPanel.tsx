"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { touristVisaService } from "@/services/touristVisaService";
import type { FundsBadge, FundsCheck, FundsCheckLine, PkrAndGbp } from "@/services/touristVisaAdminTypes";
import { formatPounds } from "@/utils/touristVisaCurrency";
import { moneyDisplay, netDisplay, formatNumber, type MoneyFlow } from "@/utils/touristVisaMoney";
import { longDate } from "@/utils/touristVisaDate";
import { MoneyText } from "./MoneyText";

interface FundsCheckPanelProps {
  applicationId: string;
  readToken: () => string | null;
  /** Turns a failure into a sentence (and signs the user out for a 401). */
  fail: (error: unknown) => string;
  /** Called after the panel was read, so the activity can be refreshed. */
  onRecorded: () => void;
}

const badgeLabel: Record<FundsBadge, string> = { green: "Green", amber: "Amber", red: "Red", grey: "Grey" };
const badgeTone: Record<FundsBadge, string> = {
  green: "bg-green-100 text-green-900 ring-green-600/30 dark:bg-green-500/15 dark:text-green-200 dark:ring-green-400/30",
  amber: "bg-amber-100 text-amber-900 ring-amber-600/30 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30",
  red: "bg-red-100 text-red-900 ring-red-600/30 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-400/30",
  grey: "bg-muted text-foreground ring-border",
};

const reasonWords: Record<string, string> = {
  gift: "A gift from family or friends",
  property_sale: "Sale of property or a vehicle",
  business_income: "Business income",
  loan: "A loan received",
  savings_moved: "Savings moved from another account",
  refund: "A refund",
};

// The look of the tables: a visible grid, a header row that stays in view while the box scrolls, zebra rows, right-aligned figures.
const boxClass = "max-h-[28rem] overflow-auto rounded-md border border-border";
const tableClass = "w-full min-w-[30rem] border-separate border-spacing-0 text-sm";
const headClass = "sticky top-0 z-10 border-b border-r border-border bg-muted px-3 py-2 text-left font-semibold text-foreground last:border-r-0";
const cellClass = "border-b border-r border-border px-3 py-1.5 align-top last:border-r-0";
const rowClass = "odd:bg-background even:bg-muted/40";
const totalClass = "bg-muted font-semibold";
const numberClass = "whitespace-nowrap text-right tabular-nums";

const money = (value: PkrAndGbp | null | undefined, flow: MoneyFlow | null, currency: "PKR" | "GBP") => {
  const amount = currency === "PKR" ? value?.pkr : value?.gbp;
  return amount === null || amount === undefined ? <span className="text-muted-foreground">Not given</span> : <MoneyText display={moneyDisplay(amount, { flow, currency })} />;
};

function Table({ caption, head, children, min }: { caption: string; head: ReactNode; children: ReactNode; min?: string }) {
  return (
    <div>
      <div className={boxClass} tabIndex={0} role="region" aria-label={caption}>
        <table className={`${tableClass} ${min ?? ""}`}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>{head}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

const Th = ({ children, right }: { children: ReactNode; right?: boolean }) => (
  <th scope="col" className={`${headClass} ${right ? "text-right" : ""}`}>
    {children}
  </th>
);

/**
 * The funds check of one application, FOR THE TEAM ONLY: a colour badge, then the figures as tables (key numbers, month by month with totals and
 * averages, the large transactions, the automatic checks) and the notes. It is a helper, never a decision, and the applicant never sees any of it (the
 * server only sends it to administrators). Credits are written with a green +, debits with a red −. The server records each read.
 */
export function FundsCheckPanel({ applicationId, readToken, fail, onRecorded }: FundsCheckPanelProps) {
  const [check, setCheck] = useState<FundsCheck | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);
  const started = useRef<string | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Read once for each visit: the server records each read (React strict mode runs effects twice in development).
  useEffect(() => {
    const key = `${applicationId}:${attempt}`;
    if (started.current === key) return;
    started.current = key;
    const token = readToken();
    if (!token) return;
    setProblem(null);
    void (async () => {
      try {
        const loaded = await touristVisaService.adminFundsCheck(token, applicationId);
        if (!alive.current) return;
        setCheck(loaded);
        onRecorded();
      } catch (error) {
        if (alive.current) setProblem(fail(error));
      }
    })();
  }, [applicationId, attempt, readToken, fail, onRecorded]);

  const figures = check?.figures;
  const hasGbp = Boolean(check?.rates);
  const net = (credit: PkrAndGbp, debit: PkrAndGbp, currency: "PKR" | "GBP") => {
    const [c, d] = currency === "PKR" ? [credit.pkr, debit.pkr] : [credit.gbp, debit.gbp];
    return c === null || d === null ? <span className="text-muted-foreground">Not given</span> : <MoneyText display={netDisplay(c, d, currency)} />;
  };

  return (
    <section aria-labelledby="funds-check-heading" className="rounded-lg border border-border bg-card p-4" data-testid="funds-check">
      <h2 id="funds-check-heading" className="text-lg font-semibold text-foreground">
        Funds check
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">For the team only. A helper, not a decision: compare it with the statement the applicant uploaded.</p>

      {problem && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {problem}{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      {!check && !problem && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading...
        </p>
      )}

      {check && (
        <div className="mt-3 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span data-testid="funds-badge" data-badge={check.badge} className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${badgeTone[check.badge]}`}>
              {badgeLabel[check.badge]}
            </span>
            <span className="text-sm font-medium text-foreground">{check.headline}</span>
          </div>
          {check.reason && <p className="text-sm text-foreground">{check.reason}</p>}

          {figures && (
            <>
              <section aria-labelledby="funds-key-heading" className="space-y-2">
                <h3 id="funds-key-heading" className="text-sm font-semibold text-foreground">
                  Key numbers
                </h3>
                <p className="text-sm text-muted-foreground">
                  Statement period: {longDate(figures.period.start)} to {longDate(figures.period.end)} ({figures.period.months} {figures.period.months === 1 ? "month" : "months"})
                  {check.rates && <>. 1 GBP = {formatNumber(check.rates.pkrPerGbp)} PKR, rates of {longDate(check.rates.asOf)}{check.rates.stale ? " (may be out of date)" : ""}</>}.
                </p>
                <Table caption="Key numbers" head={<><Th>Item</Th><Th right>PKR</Th><Th right>GBP</Th></>}>
                  <tr className={rowClass}>
                    <th scope="row" className={`${cellClass} text-left font-medium`}>Opening balance</th>
                    <td className={`${cellClass} ${numberClass}`}>{money(figures.opening, null, "PKR")}</td>
                    <td className={`${cellClass} ${numberClass}`}>{hasGbp ? money(figures.opening, null, "GBP") : "–"}</td>
                  </tr>
                  <tr className={rowClass}>
                    <th scope="row" className={`${cellClass} text-left font-medium`}>Closing balance</th>
                    <td className={`${cellClass} ${numberClass}`}>{money(figures.closing, null, "PKR")}</td>
                    <td className={`${cellClass} ${numberClass}`}>{hasGbp ? money(figures.closing, null, "GBP") : "–"}</td>
                  </tr>
                  <tr className={rowClass}>
                    <th scope="row" className={`${cellClass} text-left font-medium`}>Total credit</th>
                    <td className={`${cellClass} ${numberClass}`}>{money(figures.totalCredit, "credit", "PKR")}</td>
                    <td className={`${cellClass} ${numberClass}`}>{hasGbp ? money(figures.totalCredit, "credit", "GBP") : "–"}</td>
                  </tr>
                  <tr className={rowClass}>
                    <th scope="row" className={`${cellClass} text-left font-medium`}>Total debit</th>
                    <td className={`${cellClass} ${numberClass}`}>{money(figures.totalDebit, "debit", "PKR")}</td>
                    <td className={`${cellClass} ${numberClass}`}>{hasGbp ? money(figures.totalDebit, "debit", "GBP") : "–"}</td>
                  </tr>
                  <tr className={rowClass}>
                    <th scope="row" className={`${cellClass} text-left font-medium`}>Planned spending (6.3 and 6.5f)</th>
                    <td className={`${cellClass} ${numberClass}`}>–</td>
                    <td className={`${cellClass} ${numberClass}`}>{check.planned ? <span>{formatPounds(check.planned.gbp)}</span> : <span className="text-muted-foreground">Not given</span>}</td>
                  </tr>
                  <tr className={rowClass}>
                    <th scope="row" className={`${cellClass} text-left font-medium`}>Closing balance in pounds, as a share of the planned spending</th>
                    <td className={`${cellClass} ${numberClass}`}>–</td>
                    <td className={`${cellClass} ${numberClass}`}>
                      {check.comparison && check.comparison.closingGbp !== null ? (
                        <span>
                          {formatPounds(check.comparison.closingGbp)}{check.comparison.percentOfPlanned !== null ? ` (${check.comparison.percentOfPlanned}%)` : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not worked out</span>
                      )}
                    </td>
                  </tr>
                </Table>
              </section>

              <section aria-labelledby="funds-months-heading" className="space-y-2">
                <h3 id="funds-months-heading" className="text-sm font-semibold text-foreground">
                  Month by month (PKR)
                </h3>
                <Table caption="Month by month" min="min-w-[44rem]" head={<><Th>Period</Th><Th right>Credit</Th><Th right>Debit</Th><Th right>Net</Th><Th>Explanation (if any)</Th></>}>
                  {figures.months.map((month) => (
                    <tr key={month.label} className={rowClass}>
                      <th scope="row" className={`${cellClass} text-left font-medium`}>{month.label}</th>
                      <td className={`${cellClass} ${numberClass}`}>
                        {money(month.credit, "credit", "PKR")}
                        {month.creditHigh && <span className="ml-1 text-xs text-muted-foreground">(high)</span>}
                      </td>
                      <td className={`${cellClass} ${numberClass}`}>
                        {money(month.debit, "debit", "PKR")}
                        {month.debitHigh && <span className="ml-1 text-xs text-muted-foreground">(high)</span>}
                      </td>
                      <td className={`${cellClass} ${numberClass}`}>{net(month.credit, month.debit, "PKR")}</td>
                      <td className={cellClass}>{month.explanation ?? (month.creditHigh || month.debitHigh ? <span className="text-muted-foreground">No explanation</span> : "")}</td>
                    </tr>
                  ))}
                  <tr className={totalClass}>
                    <th scope="row" className={`${cellClass} text-left`}>Totals</th>
                    <td className={`${cellClass} ${numberClass}`}>{money(figures.totalCredit, "credit", "PKR")}</td>
                    <td className={`${cellClass} ${numberClass}`}>{money(figures.totalDebit, "debit", "PKR")}</td>
                    <td className={`${cellClass} ${numberClass}`}>{net(figures.totalCredit, figures.totalDebit, "PKR")}</td>
                    <td className={cellClass} />
                  </tr>
                  <tr className={totalClass}>
                    <th scope="row" className={`${cellClass} text-left`}>Averages (PKR)</th>
                    <td className={`${cellClass} ${numberClass}`}>{money(figures.averageCredit, "credit", "PKR")}</td>
                    <td className={`${cellClass} ${numberClass}`}>{money(figures.averageDebit, "debit", "PKR")}</td>
                    <td className={`${cellClass} ${numberClass}`}>{net(figures.averageCredit, figures.averageDebit, "PKR")}</td>
                    <td className={cellClass} />
                  </tr>
                  {hasGbp && (
                    <tr className={totalClass}>
                      <th scope="row" className={`${cellClass} text-left`}>Averages (GBP)</th>
                      <td className={`${cellClass} ${numberClass}`}>{money(figures.averageCredit, "credit", "GBP")}</td>
                      <td className={`${cellClass} ${numberClass}`}>{money(figures.averageDebit, "debit", "GBP")}</td>
                      <td className={`${cellClass} ${numberClass}`}>{net(figures.averageCredit, figures.averageDebit, "GBP")}</td>
                      <td className={cellClass} />
                    </tr>
                  )}
                </Table>
              </section>

              <section aria-labelledby="funds-large-heading" className="space-y-2">
                <h3 id="funds-large-heading" className="text-sm font-semibold text-foreground">
                  Large single transactions listed by the applicant
                </h3>
                {figures.largeTransactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None listed.</p>
                ) : (
                  <Table caption="Large single transactions" min="min-w-[44rem]" head={<><Th>Date</Th><Th>Type</Th><Th right>Amount (PKR)</Th><Th>From / for</Th><Th>Reason</Th><Th>Details</Th></>}>
                    {figures.largeTransactions.map((t, index) => {
                      const flow: MoneyFlow | null = t.type === "credit" || t.type === "debit" ? t.type : null;
                      return (
                        <tr key={index} className={rowClass}>
                          <td className={`${cellClass} whitespace-nowrap`}>{t.date ? longDate(t.date) : "Not given"}</td>
                          <td className={cellClass}>{flow === "credit" ? "Credit" : flow === "debit" ? "Debit" : "Not given"}</td>
                          <td className={`${cellClass} ${numberClass}`}>{money(t.amount, flow, "PKR")}</td>
                          <td className={cellClass}>{t.who ?? ""}</td>
                          <td className={cellClass}>{t.reason ? (reasonWords[t.reason] ?? t.reason) : ""}</td>
                          <td className={cellClass}>{t.details ?? ""}</td>
                        </tr>
                      );
                    })}
                  </Table>
                )}
              </section>
            </>
          )}

          {check.checks && (
            <section aria-labelledby="funds-checks-heading" className="space-y-2">
              <h3 id="funds-checks-heading" className="text-sm font-semibold text-foreground">
                Automatic checks of the figures
              </h3>
              <Table caption="Automatic checks of the figures" head={<><Th>Check</Th><Th>Result</Th><Th right>The figures add up to (PKR)</Th><Th right>The statement says (PKR)</Th></>}>
                <CheckRow label="Opening balance + credits - debits = closing balance" line={check.checks.balance} />
                <CheckRow label="The monthly credits add up to the total credit" line={check.checks.monthlyCredits} />
                <CheckRow label="The monthly debits add up to the total debit" line={check.checks.monthlyDebits} />
              </Table>
            </section>
          )}

          {check.notes.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground">Notes</h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                {check.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CheckRow({ label, line }: { label: string; line: FundsCheckLine }) {
  return (
    <tr className={rowClass}>
      <th scope="row" className={`${cellClass} text-left font-medium`}>{label}</th>
      <td className={cellClass}>
        <span className="font-medium">{line.passed ? "Passed" : "Did not pass"}</span>
      </td>
      <td className={`${cellClass} ${numberClass}`}>{line.left === null ? "Not given" : formatNumber(line.left)}</td>
      <td className={`${cellClass} ${numberClass}`}>{formatNumber(line.right)}</td>
    </tr>
  );
}
