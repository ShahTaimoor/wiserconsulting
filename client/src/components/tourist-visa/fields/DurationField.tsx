"use client";

import { Input } from "@/components/ui/input";
import { ariaFor, asRecord, type FieldProps } from "./types";
import { invalidClass, selectClass, subErrorClass, subLabelClass } from "./styles";

const ALL_UNITS = ["days", "weeks", "months", "years"] as const;
type Unit = (typeof ALL_UNITS)[number];

const LABELS: Record<Unit, string> = { days: "Days", weeks: "Weeks", months: "Months", years: "Years" };

const toNumber = (text: string): number | undefined => (text === "" ? undefined : Number(text));

/**
 * DUR: a length of time. The value is an object with one number per unit, e.g. { years: 2, months: 3 }.
 * In "parts" mode every unit has its own box; in "single" mode there is one number and a unit menu.
 */
export function DurationField(props: FieldProps) {
  const { id, question, value, onChange, subErrors } = props;
  const mode = question.rules?.durationMode ?? "single";
  const units: Unit[] = (question.rules?.units ?? [...ALL_UNITS]) as Unit[];
  const current = asRecord(value);
  const aria = ariaFor(props);

  if (mode === "parts") {
    // Largest unit first reads naturally: "2 years 3 months".
    const ordered = [...units].sort((a, b) => ALL_UNITS.indexOf(b) - ALL_UNITS.indexOf(a));
    return (
      <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
        {ordered.map((unit) => (
          <div key={unit}>
            <label htmlFor={`${id}-${unit}`} className={subLabelClass}>
              {LABELS[unit]}
            </label>
            <Input
              id={`${id}-${unit}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={typeof current[unit] === "number" ? String(current[unit]) : ""}
              onChange={(event) => {
                const next = { ...current };
                const number = toNumber(event.target.value);
                if (number === undefined) delete next[unit];
                else next[unit] = number;
                onChange(next);
              }}
              className={invalidClass}
              {...aria}
              aria-invalid={aria["aria-invalid"] || subErrors[unit] ? true : undefined}
            />
            {subErrors[unit] && <p className={subErrorClass}>{subErrors[unit]}</p>}
          </div>
        ))}
      </div>
    );
  }

  const chosenUnit = units.find((unit) => typeof current[unit] === "number") ?? "";
  const set = (unit: string, text: string) => {
    const number = toNumber(text);
    onChange(unit && number !== undefined ? { [unit]: number } : undefined);
  };
  return (
    <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
      <div>
        <label htmlFor={`${id}-value`} className={subLabelClass}>
          Number
        </label>
        <Input
          id={`${id}-value`}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={chosenUnit ? String(current[chosenUnit]) : ""}
          onChange={(event) => set(chosenUnit || units[0], event.target.value)}
          className={invalidClass}
          {...aria}
        />
      </div>
      <div>
        <label htmlFor={`${id}-unit`} className={subLabelClass}>
          Unit
        </label>
        <select
          id={`${id}-unit`}
          value={chosenUnit}
          onChange={(event) => set(event.target.value, chosenUnit ? String(current[chosenUnit]) : "")}
          className={selectClass}
          {...aria}
        >
          <option value="">Select</option>
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {LABELS[unit]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
