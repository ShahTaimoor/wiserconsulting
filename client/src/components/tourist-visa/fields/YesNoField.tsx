"use client";

import type { FieldProps } from "./types";

/** YN: a Yes / No choice. The value is true, false, or undefined while unanswered. */
export function YesNoField({ id, value, onChange, invalid, describedBy, required }: FieldProps) {
  const choices = [
    { key: "yes", label: "Yes", checked: value === true, set: true },
    { key: "no", label: "No", checked: value === false, set: false },
  ];
  return (
    <div className="flex flex-wrap gap-3" role="radiogroup" aria-describedby={describedBy} aria-required={required || undefined}>
      {choices.map((choice) => (
        <label
          key={choice.key}
          htmlFor={`${id}-${choice.key}`}
          className={`flex min-h-9 min-w-24 cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30 ${
            choice.checked
              ? "border-primary bg-primary/5 text-foreground"
              : invalid
                ? "border-red-500 text-foreground hover:bg-accent"
                : "border-input text-foreground hover:bg-accent"
          }`}
        >
          <input
            id={`${id}-${choice.key}`}
            type="radio"
            name={id}
            checked={choice.checked}
            onChange={() => onChange(choice.set)}
            className="h-4 w-4 accent-emerald-600"
          />
          {choice.label}
        </label>
      ))}
    </div>
  );
}
