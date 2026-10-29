"use client";

import { Input } from "@/components/ui/input";
import { ariaFor, asString, type FieldProps } from "./types";
import { invalidClass } from "./styles";

/** TXT: one line of text. */
export function TextField(props: FieldProps) {
  const { id, question, value, onChange } = props;
  return (
    <Input
      id={id}
      type="text"
      value={asString(value)}
      onChange={(event) => onChange(event.target.value)}
      // Passport and ID numbers should not be remembered by the browser.
      autoComplete={question.sensitive ? "off" : undefined}
      className={invalidClass}
      {...ariaFor(props)}
    />
  );
}
