"use client";

import { ariaFor, asString, type FieldProps } from "./types";
import { textareaClass } from "./styles";

/** LNG: several lines of text, with a character counter when there is a limit. */
export function LongTextField(props: FieldProps) {
  const { id, value, onChange, limit } = props;
  const text = asString(value);
  const over = limit !== undefined && text.length > limit;
  return (
    <div>
      <textarea
        id={id}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className={textareaClass}
        {...ariaFor(props)}
      />
      {limit !== undefined && (
        <p className={`mt-1 text-right text-xs ${over ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} aria-live="polite">
          {text.length} / {limit}
        </p>
      )}
    </div>
  );
}
