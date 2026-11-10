"use client";

import { Input } from "@/components/ui/input";
import { ariaFor, asString, type FieldProps } from "./types";
import { invalidClass, pickerClass } from "./styles";

/**
 * MY: a month and year, using the browser's month picker. The value is "YYYY-MM".
 * Browsers without a month picker show a text box, so the placeholder shows the format.
 */
export function MonthYearField(props: FieldProps) {
  const { id, value, onChange } = props;
  return (
    <Input
      id={id}
      type="month"
      placeholder="YYYY-MM"
      pattern="\d{4}-\d{2}"
      value={asString(value)}
      onChange={(event) => onChange(event.target.value)}
      className={`${invalidClass} ${pickerClass}`}
      {...ariaFor(props)}
    />
  );
}
