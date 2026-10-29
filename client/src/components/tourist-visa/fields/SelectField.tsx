"use client";

import { ChoiceSelect } from "./ChoiceSelect";
import type { FieldProps } from "./types";

/** SEL: pick one option from a list. The value is the option's value. */
export function SelectField(props: FieldProps) {
  return <ChoiceSelect {...props} placeholder="Select an option" />;
}
