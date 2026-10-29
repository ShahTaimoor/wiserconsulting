"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isVisible, resolveOptions } from "@/shared/tourist-visa/engine";
import type { Answers, GroupEntry, Question, RepeatGroup, TouristVisaConfig } from "@/shared/tourist-visa/engine";
import { subErrors as subErrorsFor } from "@/utils/touristVisaForm";
import { QuestionField, TbcBadge } from "./QuestionField";
import { asRecord } from "./fields/types";

interface RepeatGroupFieldProps {
  cfg: TouristVisaConfig;
  group: RepeatGroup;
  members: Question[];
  /** The entries entered so far; each is an object of answers keyed by question id. */
  entries: unknown[];
  /** The whole application's answers as they would be saved, for conditions and option lists. */
  merged: Record<string, unknown>;
  errors: Record<string, string>;
  previewMode: boolean;
  onEntryChange: (index: number, questionId: string, value: unknown) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

/**
 * A repeating group: one card per entry with the group's questions, "Add another" and
 * "Remove". Each question shows or hides per entry, using the shared engine.
 */
export function RepeatGroupField({ cfg, group, members, entries, merged, errors, previewMode, onEntryChange, onAdd, onRemove }: RepeatGroupFieldProps) {
  const max = Math.min(group.max, cfg.limits.groupMax);
  const groupError = errors[group.id];

  return (
    <div id={`field-${group.id}`} tabIndex={-1} className="space-y-4 focus:outline-none" data-group-id={group.id}>
      {previewMode && group.tbc && (
        <p className="text-xs text-muted-foreground">
          <TbcBadge note={group.tbc} optionList={false} />
        </p>
      )}

      {entries.map((rawEntry, index) => {
        const entry = asRecord(rawEntry);
        return (
          <fieldset key={index} className="relative min-w-0 space-y-4 rounded-lg border border-border bg-muted/30 p-4">
            <legend className="mb-1 p-0 pr-24 text-sm font-semibold text-foreground">
              {group.entryLabel} {index + 1}
            </legend>
            {entries.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-2"
                onClick={() => onRemove(index)}
                aria-label={`Remove ${group.entryLabel} ${index + 1}`}
              >
                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
                Remove
              </Button>
            )}
            {members
              .filter((member) => isVisible(cfg, member.id, merged as Answers, entry as GroupEntry))
              .map((member) => {
                const key = `${group.id}.${index}.${member.id}`;
                return (
                  <QuestionField
                    key={member.id}
                    cfg={cfg}
                    question={member}
                    idBase={`field-${group.id}-${index}-${member.id}`}
                    value={entry[member.id]}
                    onChange={(value) => onEntryChange(index, member.id, value)}
                    options={resolveOptions(cfg, member.id, merged as Answers, entry as GroupEntry)}
                    error={errors[key]}
                    subErrors={subErrorsFor(errors, key)}
                    previewMode={previewMode}
                  />
                );
              })}
          </fieldset>
        );
      })}

      {groupError && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          <span className="sr-only">Error: </span>
          {groupError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={onAdd} disabled={entries.length >= max}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Add another
        </Button>
        {entries.length >= max && <span className="text-xs text-muted-foreground">You can add up to {max}.</span>}
      </div>
    </div>
  );
}
