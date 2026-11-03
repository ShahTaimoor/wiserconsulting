"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTouristVisaRates } from "@/hooks/useTouristVisaRates";
import {
  amountOf,
  convertToGbp,
  currencyOptions,
  describeConversion,
  describeUse,
  roundPounds,
  sanitizeAmountInput,
  staleNotice,
} from "@/utils/touristVisaCurrency";
import { selectClass, subLabelClass } from "./fields/styles";

interface CurrencyHelperProps {
  /** The id of the money question's field: its inputs are `<idBase>-amount` and `<idBase>-currency`. */
  idBase: string;
  /** Fills the question with this many whole pounds. */
  onUse: (pounds: number) => void;
}

/**
 * "Enter in another currency", under a money question. A person types an amount in another currency and sees the pound
 * figure; "Use this amount" fills the question's field with whole pounds. The rates come from our own server (one fetch
 * for the whole page). If they are unavailable for any reason the helper is simply not there. Nothing typed here is saved:
 * only the pound figure that is put into the field is, as if the person had typed it.
 */
export function CurrencyHelper({ idBase, onUse }: CurrencyHelperProps) {
  const rates = useTouristVisaRates();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("PKR");
  const [text, setText] = useState("");
  const [announcement, setAnnouncement] = useState({ text: "", n: 0 });
  const toggle = useRef<HTMLButtonElement | null>(null);
  const amountInput = useRef<HTMLInputElement | null>(null);

  const options = useMemo(() => (rates ? currencyOptions(rates.rates) : []), [rates]);

  // Opening moves focus to the amount, where the person types next.
  useEffect(() => {
    if (open) amountInput.current?.focus();
  }, [open]);

  if (!rates || options.length === 0) return null;

  const chosen = options.includes(currency) ? currency : options[0];
  const amount = amountOf(text);
  const rate = rates.rates[chosen];
  const pounds = amount !== null && rate ? roundPounds(convertToGbp(amount, rate)) : null;

  const close = (toToggle: boolean) => {
    setOpen(false);
    if (toToggle) window.setTimeout(() => toggle.current?.focus(), 0);
  };

  const use = () => {
    if (pounds === null || amount === null) return;
    onUse(pounds);
    setAnnouncement((previous) => ({ text: describeUse(pounds, amount, chosen), n: previous.n + 1 }));
    setOpen(false);
    setText("");
    // The field now holds the figure: put the cursor there, after the helper has closed.
    window.setTimeout(() => document.getElementById(`${idBase}-amount`)?.focus(), 0);
  };

  return (
    <div className="mt-2 space-y-2" data-currency-helper>
      {/* Always present once the rates are in, so what is announced after the panel closes is heard. */}
      <span key={announcement.n} role="status" aria-live="polite" className="sr-only">
        {announcement.text}
      </span>

      {!open && (
        <button
          ref={toggle}
          type="button"
          aria-expanded={false}
          aria-controls={panelId}
          onClick={() => setOpen(true)}
          className="inline-flex min-h-8 items-center rounded-sm text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Enter in another currency
        </button>
      )}

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Enter an amount in another currency"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close(true);
            }
          }}
          className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 sm:max-w-md"
        >
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <div>
              <label htmlFor={`${idBase}-fx-currency`} className={subLabelClass}>
                Currency
              </label>
              <select id={`${idBase}-fx-currency`} value={chosen} onChange={(event) => setCurrency(event.target.value)} className={selectClass}>
                {options.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${idBase}-fx-amount`} className={subLabelClass}>
                Amount in {chosen}
              </label>
              <Input
                ref={amountInput}
                id={`${idBase}-fx-amount`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={text}
                aria-describedby={`${idBase}-fx-result`}
                onChange={(event) => setText(sanitizeAmountInput(event.target.value))}
                onKeyDown={(event) => {
                  // Enter must not submit the section form that this helper sits inside.
                  if (event.key === "Enter") {
                    event.preventDefault();
                    use();
                  }
                }}
              />
            </div>
          </div>

          <p id={`${idBase}-fx-result`} aria-live="polite" className="min-h-5 text-sm font-medium text-foreground">
            {pounds !== null && amount !== null ? describeConversion(pounds, chosen, rate, rates.asOf) : "Type an amount to see it in pounds."}
          </p>
          <p className="text-xs text-muted-foreground">Approximate. Rates change daily.</p>
          {rates.stale && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{staleNotice(rates.asOf)}</p>}
          {rates.attribution && (
            <p className="text-xs text-muted-foreground">
              <a href={rates.attribution.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {rates.attribution.text}
              </a>
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" className="min-h-11 sm:min-h-9" disabled={pounds === null} onClick={use}>
              Use this amount
            </Button>
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => close(true)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
