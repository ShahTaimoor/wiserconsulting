"use client";

import { Input } from "@/components/ui/input";
import { asRecord, asString, withPart, type FieldProps } from "./types";
import { invalidClass, subErrorClass, subLabelClass } from "./styles";

/** TEL: a telephone number with its country code. The value is { countryCode: "+44", number: "7700 900123" }. */
export function TelephoneField({ id, value, onChange, subErrors }: FieldProps) {
  const current = asRecord(value);
  const update = (key: string, part: string) => onChange(withPart(current, key, part));

  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 sm:max-w-md">
      <div>
        <label htmlFor={`${id}-countryCode`} className={subLabelClass}>
          Country code
        </label>
        <Input
          id={`${id}-countryCode`}
          type="text"
          inputMode="tel"
          placeholder="+44"
          autoComplete="tel-country-code"
          value={asString(current.countryCode)}
          onChange={(event) => update("countryCode", event.target.value)}
          className={invalidClass}
          aria-invalid={subErrors.countryCode ? true : undefined}
          aria-describedby={subErrors.countryCode ? `${id}-countryCode-error` : undefined}
        />
      </div>
      <div>
        <label htmlFor={`${id}-number`} className={subLabelClass}>
          Telephone number
        </label>
        <Input
          id={`${id}-number`}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={asString(current.number)}
          onChange={(event) => update("number", event.target.value)}
          className={invalidClass}
          aria-invalid={subErrors.number ? true : undefined}
          aria-describedby={subErrors.number ? `${id}-number-error` : undefined}
        />
      </div>
      {subErrors.countryCode && (
        <p id={`${id}-countryCode-error`} className={`${subErrorClass} col-span-2`}>
          {subErrors.countryCode}
        </p>
      )}
      {subErrors.number && (
        <p id={`${id}-number-error`} className={`${subErrorClass} col-span-2`}>
          {subErrors.number}
        </p>
      )}
    </div>
  );
}
