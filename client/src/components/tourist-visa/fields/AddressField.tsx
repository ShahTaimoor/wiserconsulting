"use client";

import { Input } from "@/components/ui/input";
import { getCountries } from "@/shared/tourist-visa/engine";
import { asRecord, asString, withPart, type FieldProps } from "./types";
import { invalidClass, selectClass, subErrorClass, subLabelClass } from "./styles";

const countries = getCountries();

interface Part {
  key: "line1" | "line2" | "town" | "region" | "postcode";
  label: string;
  required: boolean;
  autoComplete: string;
}

const PARTS: Part[] = [
  { key: "line1", label: "Address line 1", required: true, autoComplete: "address-line1" },
  { key: "line2", label: "Address line 2 (optional)", required: false, autoComplete: "address-line2" },
  { key: "town", label: "Town or city", required: true, autoComplete: "address-level2" },
  { key: "region", label: "County, state or region (optional)", required: false, autoComplete: "address-level1" },
  { key: "postcode", label: "Postcode (optional)", required: false, autoComplete: "postal-code" },
];

/** ADDR: an address block. The value is { line1, line2?, town, region?, postcode?, country }. */
export function AddressField({ id, value, onChange, subErrors }: FieldProps) {
  const current = asRecord(value);
  const update = (key: string, part: string) => onChange(withPart(current, key, part));

  const control = (key: string, errored: boolean) => ({
    "aria-invalid": errored ? true : undefined,
    "aria-describedby": errored ? `${id}-${key}-error` : undefined,
  });

  return (
    <div className="grid gap-3 sm:max-w-lg">
      {PARTS.map((part) => (
        <div key={part.key}>
          <label htmlFor={`${id}-${part.key}`} className={subLabelClass}>
            {part.label}
            {part.required && <span aria-hidden className="ml-0.5 text-red-600 dark:text-red-400">*</span>}
          </label>
          <Input
            id={`${id}-${part.key}`}
            type="text"
            autoComplete={part.autoComplete}
            value={asString(current[part.key])}
            onChange={(event) => update(part.key, event.target.value)}
            className={invalidClass}
            {...control(part.key, Boolean(subErrors[part.key]))}
          />
          {subErrors[part.key] && (
            <p id={`${id}-${part.key}-error`} className={subErrorClass}>
              {subErrors[part.key]}
            </p>
          )}
        </div>
      ))}
      <div>
        <label htmlFor={`${id}-country`} className={subLabelClass}>
          Country
          <span aria-hidden className="ml-0.5 text-red-600 dark:text-red-400">*</span>
        </label>
        <select
          id={`${id}-country`}
          autoComplete="country"
          value={countries.some((c) => c.code === current.country) ? asString(current.country) : ""}
          onChange={(event) => update("country", event.target.value)}
          className={selectClass}
          {...control("country", Boolean(subErrors.country))}
        >
          <option value="">Select a country</option>
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
        {subErrors.country && (
          <p id={`${id}-country-error`} className={subErrorClass}>
            {subErrors.country}
          </p>
        )}
      </div>
    </div>
  );
}
