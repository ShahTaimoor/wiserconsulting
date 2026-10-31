"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toggleChoice } from "@/utils/touristVisaForm";
import type { FieldProps } from "./types";

/**
 * CHK: tick one or more options. The value is a list of the ticked option values.
 * An exclusive option (such as "None of these") unticks the others, and ticking any other option unticks it.
 */
export function CheckboxGroupField({ id, value, onChange, options, describedBy, required }: FieldProps) {
  const ticked = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  const toggle = (optionValue: string, on: boolean) => onChange(toggleChoice(options, ticked, optionValue, on));
  return (
    <div className="space-y-2" aria-describedby={describedBy} aria-required={required || undefined}>
      {options.map((option, index) => {
        const optionId = `${id}-${index}`;
        return (
          <div key={option.value} className="flex items-center gap-3">
            <Checkbox
              id={optionId}
              checked={ticked.includes(option.value)}
              onCheckedChange={(checked) => toggle(option.value, checked === true)}
            />
            <Label htmlFor={optionId} className="cursor-pointer text-sm font-normal leading-snug">
              {option.label}
            </Label>
          </div>
        );
      })}
    </div>
  );
}
