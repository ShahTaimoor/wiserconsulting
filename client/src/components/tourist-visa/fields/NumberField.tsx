"use client";

import { Input } from "@/components/ui/input";
import { ariaFor, type FieldProps } from "./types";
import { invalidClass } from "./styles";

/** NUM: a whole number. The value is a number, or undefined when the box is empty. */
export function NumberField(props: FieldProps) {
  const { id, question, value, onChange } = props;
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      step={1}
      min={question.rules?.min ?? 0}
      max={question.rules?.max}
      value={typeof value === "number" ? String(value) : ""}
      onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
      className={invalidClass}
      {...ariaFor(props)}
    />
  );
}
