"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { caretAfterMask, DATE_MESSAGES, DATE_PLACEHOLDER, dateAnswerFromText, dateEcho, dateInputText, dateProblem, maskDateText } from "@/utils/touristVisaDate";
import { type FieldProps } from "./types";
import { invalidClass } from "./styles";

/**
 * DATE: a full date typed as dd/mm/yyyy. It replaces the browser's date picker, which shows mm/dd/yyyy in some browsers.
 *
 * Typing digits adds the slashes; a paste of 18/01/2026, 18-01-2026 or 18.01.2026 works; the numeric keypad opens on a phone. The answer kept
 * by the form is still the ISO date "yyyy-mm-dd" once the text is a complete, real date. Until then the text is kept exactly as typed (so a
 * partly typed date is not lost, and a date such as 31/02/2026 is never turned into another one); it is reported in plain words.
 * Under the input, once the date is complete and real, it is written out ("18 January 2026") in a polite live region.
 */
export function DateField(props: FieldProps) {
  const { id, value, onChange, invalid, required, describedBy } = props;
  const text = dateInputText(value);
  const echo = dateEcho(value);
  const problem = dateProblem(value);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);

  // After the text was reformatted, put the caret back where the person was typing (a controlled input would move it to the end).
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (caret.current !== null && input && typeof document !== "undefined" && document.activeElement === input) {
      input.setSelectionRange(caret.current, caret.current);
    }
    caret.current = null;
  });

  // A date that is complete but not real is reported at once; one that is only unfinished is reported when the person leaves the box (or
  // when the form answers with an error, which the question wrapper words the same way). When the wrapper already shows an error, this one stays quiet.
  const localError = problem && !invalid && (problem === "invalid" || touched) ? DATE_MESSAGES[problem] : null;
  const formatId = `${id}-format`;
  const echoId = `${id}-echo`;
  const errorId = `${id}-date-error`;
  const described = [describedBy, formatId, echo ? echoId : undefined, localError ? errorId : undefined].filter(Boolean).join(" ");

  return (
    <div className="space-y-1">
      <Input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={DATE_PLACEHOLDER}
        maxLength={14}
        value={text}
        onChange={(event) => {
          const raw = event.target.value;
          const masked = maskDateText(raw, text);
          const position = event.target.selectionStart ?? raw.length;
          const digitsBeforeCaret = raw.slice(0, position).replace(/\D/g, "").length;
          caret.current = caretAfterMask(masked, digitsBeforeCaret, raw.length < text.length);
          onChange(dateAnswerFromText(masked));
        }}
        onBlur={() => setTouched(true)}
        className={invalidClass}
        aria-invalid={invalid || Boolean(localError) || undefined}
        aria-required={required || undefined}
        aria-describedby={described || undefined}
      />
      <span id={formatId} className="sr-only">
        Type the date as day, month and year, for example 18/01/2026.
      </span>
      <p id={echoId} aria-live="polite" className="text-xs text-muted-foreground" data-testid="date-echo">
        {echo}
      </p>
      {localError && (
        <p id={errorId} className="text-sm font-medium text-red-600 dark:text-red-400" aria-live="polite">
          <span className="sr-only">Error: </span>
          {localError}
        </p>
      )}
    </div>
  );
}
