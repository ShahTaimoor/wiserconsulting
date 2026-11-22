"use client";

import { useFundsSettings } from "@/hooks/useFundsSettings";
import { useTouristVisaRates } from "@/hooks/useTouristVisaRates";
import { describeRate, formatRupees, rupeesToPounds, summariseFunds } from "@/utils/touristVisaFunds";
import { moneyDisplay, type MoneyFlow } from "@/utils/touristVisaMoney";
import { MoneyText } from "./MoneyText";

interface FundsHelperProps {
  /** "top": the currency note, the months and the averages. "limits": the amounts above which a single transaction is asked about. */
  part: "top" | "limits";
  /** The answers as typed so far (this section as edited, the others as saved). */
  answers: Record<string, unknown>;
}

const box = "rounded-lg border border-border bg-muted/40 p-4 text-sm text-foreground";

/**
 * What the bank activity section works out while the applicant types, so they can check it against the statement: the number of months (worked
 * out from the dates, never asked), the monthly averages in rupees and in pounds (with the date of the rate), and the amounts above which a
 * single credit or debit is asked about. Display only: nothing here is saved. The numbers behind the amounts are the server's.
 */
export function FundsHelper({ part, answers }: FundsHelperProps) {
  const settings = useFundsSettings();
  const rates = useTouristVisaRates();
  const summary = summariseFunds(answers, settings ?? null);
  const rate = describeRate(rates ?? null);

  if (part === "limits") {
    return (
      <div className={box} data-testid="funds-limits">
        {summary.creditLimit !== null && summary.debitLimit !== null ? (
          <>
            <p>
              <span className="font-medium">Amounts to look for:</span> a single <span className="font-medium">credit</span> above{" "}
              <MoneyText display={moneyDisplay(summary.creditLimit, { flow: "credit", currency: "PKR" })} />, or a single <span className="font-medium">debit</span> above{" "}
              <MoneyText display={moneyDisplay(summary.debitLimit, { flow: "debit", currency: "PKR" })} />.
            </p>
            <p className="mt-1 text-muted-foreground">
              These are worked out from your monthly averages ({settings?.singleTransactionPercent}% of the average, and never less than {formatRupees(settings?.singleTransactionFloor ?? 0)}).
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">Fill in the statement dates and the totals above, and the amounts to look for will be shown here.</p>
        )}
      </div>
    );
  }

  return (
    <div className={`${box} space-y-1`} data-testid="funds-helper">
      <p>
        <span className="font-medium">All amounts in this section are in Pakistani rupees (PKR).</span> Use the figures from the bank statement you will submit as evidence of funds (yours or your sponsor&apos;s).
      </p>
      {summary.months !== null && (
        <p>
          Your statement covers <span className="font-medium">{summary.months} {summary.months === 1 ? "month" : "months"}</span>.
        </p>
      )}
      {summary.averageCredit !== null && summary.averageDebit !== null && (
        <>
          <p>Average credit each month: <Average rupees={summary.averageCredit} flow="credit" rates={rates} />.</p>
          <p>Average debit each month: <Average rupees={summary.averageDebit} flow="debit" rates={rates} />.</p>
          {rate && <p className="text-xs text-muted-foreground">Pounds are shown for information only ({rate}).</p>}
        </>
      )}
    </div>
  );
}

/** An average in rupees and, when there is a rate, in pounds (about): credits with a green +, debits with a red −. */
function Average({ rupees, flow, rates }: { rupees: number; flow: MoneyFlow; rates: ReturnType<typeof useTouristVisaRates> }) {
  const pounds = rupeesToPounds(rupees, rates ?? null);
  return (
    <>
      <MoneyText display={moneyDisplay(Math.round(rupees), { flow, currency: "PKR" })} />
      {pounds !== null && (
        <>
          {" "}(about <MoneyText display={moneyDisplay(Math.round(pounds), { flow, currency: "GBP" })} />)
        </>
      )}
    </>
  );
}
