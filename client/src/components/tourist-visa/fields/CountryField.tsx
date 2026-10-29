"use client";

import { ChoiceSelect } from "./ChoiceSelect";
import type { FieldProps } from "./types";

/** CTRY: pick a country from the shared country list. The value is the ISO code, e.g. "GB". */
export function CountryField(props: FieldProps) {
  return <ChoiceSelect {...props} placeholder="Select a country" />;
}
