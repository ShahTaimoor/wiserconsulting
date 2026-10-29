"use client";

import { ariaFor, asString, type FieldProps } from "./types";
import { selectClass } from "./styles";

/**
 * A native dropdown over a list of options. Shared by SEL, CTRY and the country part of an
 * address. A stored value that is not on the list (for example an email address that was
 * edited after it was chosen) shows as unselected instead of silently picking another.
 */
export function ChoiceSelect(props: FieldProps & { placeholder: string }) {
  const { id, value, onChange, options, placeholder } = props;
  const current = options.some((option) => option.value === value) ? asString(value) : "";
  return (
    <select
      id={id}
      value={current}
      onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
      className={selectClass}
      {...ariaFor(props)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
