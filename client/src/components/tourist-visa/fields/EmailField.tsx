"use client";

import { Input } from "@/components/ui/input";
import { ariaFor, asString, type FieldProps } from "./types";
import { invalidClass } from "./styles";

/** EML: an email address. */
export function EmailField(props: FieldProps) {
  const { id, value, onChange } = props;
  return (
    <Input
      id={id}
      type="email"
      inputMode="email"
      autoComplete="email"
      value={asString(value)}
      onChange={(event) => onChange(event.target.value)}
      className={invalidClass}
      {...ariaFor(props)}
    />
  );
}
