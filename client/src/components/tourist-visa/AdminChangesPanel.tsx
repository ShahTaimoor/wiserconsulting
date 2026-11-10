"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { ChangeRecordView } from "@/services/touristVisaAdminTypes";
import { formatWhen, lineTitle } from "@/utils/touristVisaAdmin";

interface AdminChangesPanelProps {
  history: ChangeRecordView[] | null;
  error: boolean;
  onRetry: () => void;
}

/**
 * Every correction made to this application, newest first: who, when, why, and what each answer was and became.
 * For administrators only; the applicant sees nothing but "Corrected by our team" next to the changed answers.
 */
export function AdminChangesPanel({ history, error, onRetry }: AdminChangesPanelProps) {
  return (
    <section id="changes" aria-labelledby="changes-heading" className="scroll-mt-20 rounded-lg border border-border bg-card p-4 text-card-foreground sm:p-6">
      <h2 id="changes-heading" className="text-lg font-semibold text-foreground">
        Changes
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Corrections made to the applicant&apos;s answers, newest first, with the reason given for each.</p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          The changes could not be loaded.{" "}
          <button type="button" className="font-medium underline underline-offset-2" onClick={onRetry}>
            Try again
          </button>
        </p>
      ) : history === null ? (
        <Skeleton className="mt-3 h-16 w-full" aria-label="Loading the changes" />
      ) : history.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No answers have been corrected.</p>
      ) : (
        <ol className="mt-4 space-y-5">
          {history.map((record) => (
            <li key={record.id} className="rounded-md border border-border p-3 sm:p-4" data-testid="change-record">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <p className="min-w-0 break-words text-sm font-medium text-foreground">{record.admin.name || "An administrator"}</p>
                <time dateTime={record.at} className="shrink-0 text-xs text-muted-foreground">
                  {formatWhen(record.at)}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
                <span className="font-medium">Reason:</span> {record.reason}
              </p>
              <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                {record.changes.map((line, index) => (
                  <li key={`${line.questionId}-${line.index ?? "x"}-${index}`} className="space-y-1 px-3 py-2 text-sm">
                    <p className="break-words font-medium text-foreground">
                      <span className="mr-2 text-muted-foreground">{line.sectionId}</span>
                      {lineTitle(line)}
                    </p>
                    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-muted-foreground">Was</dt>
                        <dd className="whitespace-pre-wrap break-words text-foreground">{line.old}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{line.kind === "pruned" ? "Then" : "Became"}</dt>
                        <dd className="whitespace-pre-wrap break-words text-foreground">{line.new}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
