"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTouristVisa } from "@/context/TouristVisaContext";
import { config, getDraftItems, getReleaseBlockers } from "@/shared/tourist-visa/engine";
import type { TouristVisaApplication } from "@/services/touristVisaService";
import {
  buildChecklist,
  countHeldSections,
  isFormOpen,
  isPreviewMode,
  STATUS_LABELS,
  type ChecklistState,
} from "@/utils/touristVisaChecklist";

const STATE_LABEL: Record<ChecklistState, string> = {
  saved: "Saved",
  needs_review: "Needs review",
  not_started: "Not started",
};

const STATE_PILL: Record<ChecklistState, string> = {
  saved:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30",
  needs_review:
    "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30",
  not_started: "bg-muted text-muted-foreground ring-border",
};

function StateIcon({ state }: { state: ChecklistState }) {
  if (state === "saved") return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  if (state === "needs_review") return <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />;
  return <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />;
}

function Notice({ tone, children }: { tone: "info" | "warning" | "error"; children: React.ReactNode }) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
    warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your application">
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

function ProgressBar({ saved, total }: { saved: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((saved / total) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>
          {saved} of {total} sections saved
        </span>
        <span>{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={saved}
        aria-label="Sections saved"
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-emerald-600 transition-all dark:bg-emerald-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** The section the Continue button opens: the server's resume point, if it is one we know. */
function resumeTarget(application: TouristVisaApplication): string {
  const known = config.sections.some((section) => section.id === application.currentSection);
  return `/tourist-visa/${known ? application.currentSection : config.sections[0].id}`;
}

export default function TouristVisaDashboardPage() {
  const { state, serverClosed, reload, start, starting, startError } = useTouristVisa();

  const preview = isPreviewMode();
  const blocked = getReleaseBlockers(config).length;
  const drafted = getDraftItems(config).length;
  // Closed if either side says so: this build's own gate, or the server's TOURIST_VISA_ENABLED switch.
  const open = isFormOpen(countHeldSections(config), preview) && !serverClosed;

  const application = state.status === "ready" ? state.application : null;
  const checklist = buildChecklist(config, application);
  const editable = application?.status === "draft" && open;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Tourist Visa application</h1>
        <p className="mt-2 text-muted-foreground">
          UK visitor visa. Complete each section in your own time. Your answers are saved as you go, so you can leave and
          come back.
        </p>
      </header>

      {preview && (blocked > 0 || drafted > 0) && (
        <div className="mb-6">
          <Notice tone="warning">
            <strong>Preview mode.</strong>{" "}
            {blocked > 0 && (
              <>
                {blocked} section{blocked === 1 ? "" : "s"} still have questions that are not confirmed yet (marked TBC).{" "}
              </>
            )}
            {drafted > 0 && (
              <>
                {drafted} section{drafted === 1 ? "" : "s"} use drafts (answer lists, follow-up questions or rules) that
                still need senior review (marked Draft options). The form stays closed to applicants until they are signed
                off.{" "}
              </>
            )}
            Do not use real applicant details.
          </Notice>
        </div>
      )}

      {state.status === "loading" && <DashboardSkeleton />}

      {state.status === "error" && (
        <Card>
          <CardHeader>
            <CardTitle>We couldn&apos;t load your application</CardTitle>
          </CardHeader>
          <CardContent>
            <Notice tone="error">{state.message}</Notice>
          </CardContent>
          <CardFooter>
            <Button onClick={() => void reload()}>Try again</Button>
          </CardFooter>
        </Card>
      )}

      {state.status === "ready" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-xl">{application ? "Your application" : "Start your application"}</CardTitle>
                {application && (
                  <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground ring-1 ring-inset ring-border">
                    {STATUS_LABELS[application.status] ?? application.status}
                  </span>
                )}
              </div>
              <CardDescription>
                {!application && "You haven't started yet. It takes a few sections, and you can stop and resume at any time."}
                {application?.status === "draft" && "Pick up where you left off, or open any section from the list below."}
                {application && application.status !== "draft" && "This application has been submitted and can no longer be edited."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {application && <ProgressBar saved={checklist.saved} total={checklist.total} />}

              {!open && (
                <Notice tone="info">
                  The Tourist Visa application isn&apos;t open yet. We&apos;re still finalising the questions. Please check
                  back soon.
                </Notice>
              )}

              {application?.status === "draft" && checklist.needsReview > 0 && (
                <Notice tone="warning">
                  {checklist.needsReview} section{checklist.needsReview === 1 ? " needs" : "s need"} another look because an
                  answer you changed affects {checklist.needsReview === 1 ? "it" : "them"}.
                </Notice>
              )}

              {application && application.status !== "draft" && application.submittedAt && (
                <p className="text-sm text-muted-foreground">
                  Submitted on {new Date(application.submittedAt).toLocaleDateString()}.
                </p>
              )}

              {startError && <Notice tone="error">{startError}</Notice>}
            </CardContent>

            <CardFooter className="flex flex-wrap gap-3">
              {!application && (
                <Button onClick={() => void start()} disabled={!open || starting}>
                  {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  {starting ? "Starting..." : "Start application"}
                </Button>
              )}
              {application?.status === "draft" &&
                (open ? (
                  <Button asChild>
                    <Link href={resumeTarget(application)}>Continue</Link>
                  </Button>
                ) : (
                  <Button disabled>Continue</Button>
                ))}
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sections</CardTitle>
              <CardDescription>
                {application ? "Your progress in each part of the form." : "What you will be asked, in order."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {checklist.parts.map((part) => (
                <section key={part.id} aria-labelledby={`part-${part.id}`}>
                  <h2 id={`part-${part.id}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Part {part.id}: {part.title}
                  </h2>
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {part.sections.map((section) => {
                      const row = (
                        <>
                          <StateIcon state={section.state} />
                          <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                            <span className="mr-2 text-muted-foreground">{section.id}</span>
                            {section.title}
                          </span>
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATE_PILL[section.state]}`}
                          >
                            {STATE_LABEL[section.state]}
                          </span>
                        </>
                      );
                      return (
                        <li key={section.id}>
                          {editable ? (
                            <Link
                              href={`/tourist-visa/${section.id}`}
                              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                            >
                              {row}
                            </Link>
                          ) : (
                            <div className="flex items-center gap-3 px-4 py-3">{row}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              {!open && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" aria-hidden /> Sections open for editing once the application is open.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
