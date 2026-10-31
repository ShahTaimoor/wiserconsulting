"use client";

import Link from "next/link";
import { FileText, Pencil } from "lucide-react";
import type { Review, ReviewRow } from "@/shared/tourist-visa/view";

interface ReviewSummaryProps {
  review: Review;
  /** Show an Edit link on each section. Off once the application is submitted. */
  editable: boolean;
}

/** One answer: its number and question, and its value in words. A group shows its entries as numbered items. */
function RowView({ row, nested = false }: { row: ReviewRow; nested?: boolean }) {
  const value = (
    <>
      {row.kind === "files" ? (
        row.files && row.files.length > 0 ? (
          <ul className="space-y-1">
            {row.files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 break-all">
                  {file.name} <span className="text-muted-foreground">({file.sizeText})</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="italic text-muted-foreground">{row.value}</span>
        )
      ) : row.kind === "group" ? (
        <div className="space-y-3">
          <span className={row.empty ? "italic text-muted-foreground" : undefined}>{row.value}</span>
          {row.entries?.map((entry, index) => (
            <div key={`${entry.title}-${index}`} className="rounded-md border border-border bg-muted/30 p-3">
              <p className="mb-2 text-sm font-medium text-foreground">{entry.title}</p>
              <dl className="space-y-2">
                {entry.rows.map((inner) => (
                  <RowView key={inner.id} row={inner} nested />
                ))}
              </dl>
            </div>
          ))}
        </div>
      ) : row.items && row.items.length > 1 ? (
        <ul className="list-disc space-y-1 pl-5">
          {row.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <span className={row.empty ? "italic text-muted-foreground" : undefined}>{row.value}</span>
      )}
      {row.note && <span className="mt-1 block text-xs text-muted-foreground">{row.note}</span>}
    </>
  );

  return (
    <div className={nested ? "space-y-0.5" : "px-4 py-3 sm:grid sm:grid-cols-3 sm:gap-4"} data-row-id={row.id}>
      <dt className={`text-sm text-muted-foreground ${nested ? "" : "sm:col-span-1"}`}>
        {row.number && <span className="mr-2">{row.number}</span>}
        {row.label}
      </dt>
      <dd className={`mt-1 whitespace-pre-wrap break-words text-sm text-foreground ${nested ? "" : "sm:col-span-2 sm:mt-0"}`}>{value}</dd>
    </div>
  );
}

/**
 * The application as the shared view builder describes it (on the server): every part and section in order, each
 * answer in words, the files by name and size, and the Part 9 ticks as given. Read only. It never receives or shows a
 * link or a storage id, because the builder is never given one.
 */
export function ReviewSummary({ review, editable }: ReviewSummaryProps) {
  return (
    <div className="space-y-8">
      {review.parts.map((part) => (
        <section key={part.id} aria-labelledby={`review-part-${part.id}`}>
          <h2 id={`review-part-${part.id}`} className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Part {part.id}: {part.title}
          </h2>
          <div className="space-y-4">
            {part.sections.map((section) => (
              <article key={section.id} aria-labelledby={`review-section-${section.id}`} data-section-id={section.id} className="overflow-hidden rounded-lg border border-border">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
                  <h3 id={`review-section-${section.id}`} className="text-base font-semibold text-foreground">
                    <span className="mr-2 text-muted-foreground">{section.id}</span>
                    {section.title}
                  </h3>
                  {editable && (
                    <Link
                      href={`/tourist-visa/${section.id}`}
                      aria-label={`Edit ${section.title}`}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </Link>
                  )}
                </header>
                <dl className="divide-y divide-border">
                  {section.rows.map((row) => (
                    <RowView key={row.id} row={row} />
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
