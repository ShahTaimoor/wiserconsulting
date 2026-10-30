"use client";

import { Label } from "@/components/ui/label";
import type { Question, QuestionOption, TouristVisaConfig } from "@/shared/tourist-visa/engine";
import { helpCountryNames, hintFor } from "@/utils/touristVisaForm";
import { FIELD_RENDERERS, GROUPED_TYPES, INLINE_LABEL_TYPES } from "./fields";

interface QuestionFieldProps {
  cfg: TouristVisaConfig;
  question: Question;
  /** DOM id of the control; for compound controls the id of the fieldset. */
  idBase: string;
  value: unknown;
  onChange: (value: unknown) => void;
  options: QuestionOption[];
  /** The message for the question as a whole. */
  error?: string;
  /** Messages for parts of a compound answer. */
  subErrors: Record<string, string>;
  /** Preview mode marks questions that still carry a tbc flag. */
  previewMode: boolean;
}

const badgeClass =
  "ml-2 inline-flex items-center rounded-full px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset";

/** The small "TBC" marker shown in preview mode on questions with a real unknown in the spec. */
export function TbcBadge({ note }: { note: string }) {
  return (
    <span
      title={note}
      className={`${badgeClass} bg-amber-100 text-amber-900 ring-amber-600/30 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30`}
    >
      TBC
      <span className="sr-only">: {note}</span>
    </span>
  );
}

/** The "Draft options" marker shown in preview mode on questions whose option list awaits senior review. */
export function DraftBadge({ note }: { note: string }) {
  return (
    <span
      title={note}
      className={`${badgeClass} bg-sky-100 text-sky-900 ring-sky-600/30 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-400/30`}
    >
      Draft options
      <span className="sr-only">: {note}</span>
    </span>
  );
}

/**
 * One question: label with its number and required marker, hint, the control for its answer
 * type, and the error message. Everything is tied together for screen readers with
 * label/legend and aria-describedby, and the control is reachable by keyboard.
 */
export function QuestionField({ cfg, question, idBase, value, onChange, options, error, subErrors, previewMode }: QuestionFieldProps) {
  const Renderer = FIELD_RENDERERS[question.type];
  const hint = hintFor(cfg, question);
  const hintId = hint ? `${idBase}-hint` : undefined;
  const errorId = error ? `${idBase}-error` : undefined;
  const itemsId = question.items ? `${idBase}-items` : undefined;
  const describedBy = [itemsId, hintId, errorId].filter(Boolean).join(" ") || undefined;
  const invalid = Boolean(error) || Object.keys(subErrors).length > 0;
  const limit = question.type === "LNG" ? (question.rules?.maxLen ?? cfg.limits.lngMax) : undefined;

  const labelText = (
    <>
      <span className="mr-2 font-normal text-muted-foreground">{question.number}</span>
      {question.label}
      {question.required ? (
        <>
          <span aria-hidden className="ml-1 text-red-600 dark:text-red-400">*</span>
          <span className="sr-only"> (required)</span>
        </>
      ) : (
        <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>
      )}
      {previewMode && question.draft && <DraftBadge note={question.draft} />}
      {previewMode && question.tbc && <TbcBadge note={question.tbc} />}
    </>
  );

  // Part of the question text itself (for example the five breaches in 7.6), shown as a list under it.
  const itemsNode = question.items && (
    <ul id={itemsId} className="ml-5 list-disc space-y-1 text-sm text-foreground/80">
      {question.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
  // An expandable note listing countries (for example which ones are in the EEA), kept out of the way until opened.
  const countryNames = question.helpCountries ? helpCountryNames(question) : [];
  const countriesNode = question.helpCountries && countryNames.length > 0 && (
    <details className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-foreground">{question.helpCountries.summary}</summary>
      <ul className="mt-2 ml-5 grid list-disc grid-cols-1 gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
        {countryNames.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </details>
  );
  const hintNode = hint && (
    <p id={hintId} className="text-xs text-muted-foreground">
      {hint}
    </p>
  );
  const errorNode = error && (
    <p id={errorId} className="text-sm font-medium text-red-600 dark:text-red-400">
      <span className="sr-only">Error: </span>
      {error}
    </p>
  );
  const control = (
    <Renderer
      id={idBase}
      question={question}
      value={value}
      onChange={onChange}
      options={options}
      subErrors={subErrors}
      invalid={invalid}
      required={question.required}
      describedBy={describedBy}
      limit={limit}
    />
  );

  if (INLINE_LABEL_TYPES.has(question.type)) {
    return (
      <div className="flex items-start gap-3" data-question-id={question.id}>
        <div className="pt-0.5">{control}</div>
        <div className="space-y-1">
          <Label htmlFor={idBase} className="cursor-pointer items-start text-sm font-medium leading-snug">
            {labelText}
          </Label>
          {itemsNode}
          {hintNode}
          {countriesNode}
          {errorNode}
        </div>
      </div>
    );
  }

  if (GROUPED_TYPES.has(question.type)) {
    return (
      <fieldset id={idBase} tabIndex={-1} aria-describedby={describedBy} className="min-w-0 space-y-2 border-0 p-0 focus:outline-none" data-question-id={question.id}>
        <legend className="mb-1 p-0 text-sm font-medium leading-snug text-foreground">{labelText}</legend>
        {itemsNode}
        {hintNode}
        {countriesNode}
        {control}
        {errorNode}
      </fieldset>
    );
  }

  return (
    <div className="space-y-2" data-question-id={question.id}>
      <Label htmlFor={idBase} className="items-start text-sm font-medium leading-snug">
        <span>{labelText}</span>
      </Label>
      {itemsNode}
      {hintNode}
      {countriesNode}
      {control}
      {errorNode}
    </div>
  );
}
