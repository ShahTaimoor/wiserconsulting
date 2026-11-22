"use client";

import { Input } from "@/components/ui/input";
import { ariaFor, asRecord, type FieldProps } from "./types";
import { invalidClass, selectClass, subErrorClass, subLabelClass } from "./styles";
import { NUMBER_CLASS, TONE_CLASS, signFor } from "@/utils/touristVisaMoney";

/** AMT: an amount of money. The value is { amount, currency }; the currency defaults to the first allowed one. */
export function AmountField(props: FieldProps) {
  const { id, question, value, onChange, subErrors, flow = null } = props;
  const sign = signFor(flow);
  const currencies = question.rules?.currencies ?? ["GBP"];
  const current = asRecord(value);
  const currency = typeof current.currency === "string" ? current.currency : currencies[0];
  const aria = ariaFor(props);

  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 sm:max-w-sm">
      <div>
        <label htmlFor={`${id}-amount`} className={subLabelClass}>
          Amount
        </label>
        {/* The sign of money in (+, green) or out (−, red) is a mark beside the number: the typed value stays a plain number. */}
        <div className="relative">
          {sign && (
            <span aria-hidden data-testid={`${id}-sign`} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base font-semibold ${NUMBER_CLASS} ${TONE_CLASS[flow === "credit" ? "credit" : "debit"]}`}>
              {sign}
            </span>
          )}
        <Input
          id={`${id}-amount`}
          type="number"
          inputMode="decimal"
          min={0}
          max={question.rules?.max}
          step="0.01"
          value={typeof current.amount === "number" ? String(current.amount) : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : { amount: Number(event.target.value), currency })
          }
          className={sign ? `${invalidClass} pl-8 ${NUMBER_CLASS}` : invalidClass}
          {...aria}
          aria-invalid={aria["aria-invalid"] || subErrors.amount ? true : undefined}
        />
        </div>
        {subErrors.amount && <p className={subErrorClass}>{subErrors.amount}</p>}
      </div>
      <div>
        <label htmlFor={`${id}-currency`} className={subLabelClass}>
          Currency
        </label>
        {currencies.length === 1 ? (
          <div id={`${id}-currency`} className="flex h-9 items-center px-1 text-sm font-medium text-foreground">
            {currencies[0]}
          </div>
        ) : (
          <select
            id={`${id}-currency`}
            value={currency}
            onChange={(event) =>
              onChange(typeof current.amount === "number" ? { amount: current.amount, currency: event.target.value } : undefined)
            }
            className={selectClass}
          >
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
