"use client";

import { Input } from "@/components/ui/input";
import { ariaFor, asString, type FieldProps } from "./types";
import { invalidClass, pickerClass } from "./styles";

/** DATE: a full date, using the browser's date picker. The value is "YYYY-MM-DD". */
export function DateField(props: FieldProps) {
  const { id, value, onChange } = props;
  return (
    <Input
      id={id}
      type="date"
      value={asString(value)}
      onChange={(event) => onChange(event.target.value)}
      className={`${invalidClass} ${pickerClass}`}
      {...ariaFor(props)}
    />
  );
}
