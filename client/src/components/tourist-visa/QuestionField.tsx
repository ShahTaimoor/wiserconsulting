"use client";

import { Label } from "@/components/ui/label";
import type { Question, QuestionOption, TouristVisaConfig } from "@/shared/tourist-visa/engine";
import { hintFor } from "@/utils/touristVisaForm";
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

/** The small "TBC" marker shown in preview mode on questions the spec has not settled. */
export function TbcBadge({ note, optionList }: { note: string; optionList: boolean }) {
  return (
    <span
      title={note}
      className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-inset ring-amber-600/30 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30"
    >
      {optionList ? "TBC option list" : "TBC"}
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
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
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
      {previewMode && question.tbc && <TbcBadge note={question.tbc} optionList={question.type === "SEL" || question.type === "CHK"} />}
    </>
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
          {hintNode}
          {errorNode}
        </div>
      </div>
    );
  }

  if (GROUPED_TYPES.has(question.type)) {
    return (
      <fieldset id={idBase} tabIndex={-1} aria-describedby={describedBy} className="min-w-0 space-y-2 border-0 p-0 focus:outline-none" data-question-id={question.id}>
        <legend className="mb-1 p-0 text-sm font-medium leading-snug text-foreground">{labelText}</legend>
        {hintNode}
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
      {hintNode}
      {control}
      {errorNode}
    </div>
  );
}
