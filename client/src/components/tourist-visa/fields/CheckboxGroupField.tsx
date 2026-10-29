"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { FieldProps } from "./types";

/** CHK: tick one or more options. The value is a list of the ticked option values. */
export function CheckboxGroupField({ id, value, onChange, options, describedBy, required }: FieldProps) {
  const ticked = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  const toggle = (optionValue: string, on: boolean) => {
    const next = on ? [...ticked.filter((v) => v !== optionValue), optionValue] : ticked.filter((v) => v !== optionValue);
    // Keep the order of the options, so the same ticks always produce the same list.
    onChange(options.map((o) => o.value).filter((v) => next.includes(v)));
  };
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
