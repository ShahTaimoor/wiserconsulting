"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/tourist-visa/ConfirmDialog";
import { notifySubmitFailed, notifySubmitted } from "@/components/tourist-visa/notify";
import { PdfDownloadButton } from "@/components/tourist-visa/PdfDownloadButton";
import { ReviewSummary } from "@/components/tourist-visa/ReviewSummary";
import { useTouristVisa } from "@/context/TouristVisaContext";
import { config } from "@/shared/tourist-visa/engine";
import type { ReviewData } from "@/services/touristVisaService";
import { countHeldSections, getReadiness, isFormOpen, isPreviewMode } from "@/utils/touristVisaChecklist";
import { describeSubmitFailure, submittedOnText, type SubmitFailure } from "@/utils/touristVisaReview";

const badgeClass =
  "ml-2 inline-flex items-center rounded-full px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset bg-sky-100 text-sky-900 ring-sky-600/30 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-400/30";

/** The "Draft wording" marker shown in preview mode on wording that still waits for senior approval. */
function DraftWordingBadge({ note }: { note: string }) {
  return (
    <span title={note} className={badgeClass}>
      Draft wording
      <span className="sr-only">: {note}</span>
    </span>
  );
}

function Message({ title, children, action }: { title: string; children?: React.ReactNode; action?: { href: string; label: string } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {children && <CardDescription>{children}</CardDescription>}
      </CardHeader>
      {action && (
        <CardFooter>
          <Button asChild>
            <Link href={action.href}>{action.label}</Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/**
 * Review and submit (/tourist-visa/review).
 *
 * A draft: every answer in order with an Edit link, then the final declaration, a required tick and a Submit button
 * that asks once more in the site's own dialog. A submitted application: the reference, what happens next, and the
 * same review with every edit control gone. The server checks everything again at submit and has the last word; when it
 * refuses, the sections that need attention are listed here with a link to each.
 */
export default function TouristVisaReviewPage() {
  const { state, serverClosed, reload, refresh, getReview, submitApplication } = useTouristVisa();
  const preview = isPreviewMode();
  const open = isFormOpen(countHeldSections(config), preview) && !serverClosed;
  const application = state.status === "ready" ? state.application : null;

  const [data, setData] = useState<ReviewData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ticked, setTicked] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const [announcement, setAnnouncement] = useState({ text: "", n: 0 });

  const alive = useRef(true);
  const failureRef = useRef<HTMLDivElement | null>(null);
  const confirmationRef = useRef<HTMLHeadingElement | null>(null);
  const submitButton = useRef<HTMLButtonElement | null>(null);
  const focusConfirmation = useRef(false);
  const focusFailure = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const announce = useCallback((text: string) => setAnnouncement((previous) => ({ text, n: previous.n + 1 })), []);

  // Load (and reload after a submit, or when the application changes) the readable review.
  const version = application ? `${application.status}|${application.updatedAt}` : "";
  useEffect(() => {
    if (!application || !open) return;
    let cancelled = false;
    void (async () => {
      const result = await getReview();
      if (cancelled || !alive.current) return;
      if (result.ok) {
        setData(result.data);
        setLoadError(null);
      } else {
        setLoadError(result.message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloads when the application changes, not on every render
  }, [version, open, attempt, getReview]);

  const submitted = data !== null && data.status !== "draft";

  // After a successful submit the confirmation takes focus; after a refusal the list of what to fix does.
  useEffect(() => {
    if (submitted && focusConfirmation.current) {
      focusConfirmation.current = false;
      confirmationRef.current?.focus();
    }
  }, [submitted]);
  useEffect(() => {
    if (failure && focusFailure.current) {
      focusFailure.current = false;
      failureRef.current?.focus();
    }
  }, [failure]);

  const readiness = getReadiness(config, application);
  const canSubmit = readiness.ready && ticked && !submitting && !submitted;

  const submit = useCallback(async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    setFailure(null);
    announce("Submitting your application.");
    const result = await submitApplication(ticked);
    if (!alive.current) return;
    setSubmitting(false);
    if (result.ok) {
      focusConfirmation.current = true;
      announce("Your application has been submitted.");
      notifySubmitted();
      return;
    }
    const described = describeSubmitFailure(config, result);
    focusFailure.current = true;
    setFailure(described);
    announce(described.message);
    notifySubmitFailed(described.message);
    // The page's own picture of the application may be behind (a section was changed elsewhere): bring it up to date.
    void refresh();
  }, [submitApplication, ticked, announce, refresh]);

  let content: React.ReactNode;
  if (state.status === "loading") {
    content = <Skeleton className="h-96 w-full rounded-xl" aria-busy="true" aria-label="Loading your application" />;
  } else if (state.status === "error") {
    content = (
      <Card>
        <CardHeader>
          <CardTitle>We couldn&apos;t load your application</CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={() => void reload()}>Try again</Button>
        </CardFooter>
      </Card>
    );
  } else if (!open) {
    content = (
      <Message title="The application isn't open yet" action={{ href: "/tourist-visa", label: "Go to your application" }}>
        We&apos;re still finalising the questions. Please check back soon.
      </Message>
    );
  } else if (!application) {
    content = (
      <Message title="Start your application first" action={{ href: "/tourist-visa", label: "Go to your application" }}>
        You need to start an application before you can review it.
      </Message>
    );
  } else if (loadError) {
    content = (
      <Card>
        <CardHeader>
          <CardTitle>We couldn&apos;t load your review</CardTitle>
          <CardDescription>{loadError}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </CardFooter>
      </Card>
    );
  } else if (!data) {
    content = <Skeleton className="h-96 w-full rounded-xl" aria-busy="true" aria-label="Loading your review" />;
  } else if (submitted) {
    content = (
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <div className="min-w-0">
                <CardTitle className="text-2xl">
                  <h1 ref={confirmationRef} tabIndex={-1} className="outline-none">
                    Application submitted
                  </h1>
                </CardTitle>
                <CardDescription>{submittedOnText(data.submittedAt)}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-sm text-muted-foreground">Your reference</p>
              <p data-testid="reference" className="mt-1 select-all break-all font-mono text-2xl font-semibold tracking-wider text-foreground">
                {data.reference}
              </p>
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                What happens next
                {preview && config.afterSubmit?.draft && <DraftWordingBadge note={config.afterSubmit.draft} />}
              </h2>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-foreground">
                {(config.afterSubmit?.steps ?? []).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <p className="font-medium text-foreground">Your declaration</p>
              <p className="mt-1 text-muted-foreground">{data.declaration.text}</p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/tourist-visa">Back to your application</Link>
            </Button>
            <PdfDownloadButton side="applicant" reference={data.reference} className="min-h-10" />
          </CardFooter>
        </Card>

        <section aria-labelledby="your-answers">
          <h2 id="your-answers" className="mb-1 text-xl font-semibold text-foreground">
            Your application
          </h2>
          <p className="mb-5 text-sm text-muted-foreground">This is what you submitted. It can no longer be changed.</p>
          <ReviewSummary review={data.review} editable={false} />
        </section>
      </div>
    );
  } else {
    content = (
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Review and submit</h1>
          <p className="mt-2 text-muted-foreground">
            Read through your answers. Use Edit to change anything. When everything is right, accept the declaration at the
            bottom and submit.
          </p>
        </header>

        {!readiness.ready && (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-medium">Your application is not ready to submit yet.</p>
            <ul className="mt-2 space-y-1">
              {readiness.missing.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className="font-medium underline underline-offset-2">
                    {item.id} {item.title}
                  </Link>
                  : {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ReviewSummary review={data.review} editable />

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              Final declaration
              {preview && config.declarations?.submit?.draft && <DraftWordingBadge note={config.declarations.submit.draft} />}
            </CardTitle>
            <CardDescription>Read this, then tick the box to confirm.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <p id="declaration-text" className="whitespace-pre-wrap text-sm text-foreground">
              {data.declaration.text}
            </p>
            <div className="flex items-start gap-3">
              <Checkbox
                id="field-declaration"
                checked={ticked}
                onCheckedChange={(checked) => {
                  setTicked(checked === true);
                  if (checked === true) setFailure((previous) => (previous ? { ...previous, declarationMissing: false } : previous));
                }}
                disabled={submitting}
                aria-required
                aria-describedby="declaration-text"
                aria-invalid={failure?.declarationMissing || undefined}
                className={failure?.declarationMissing ? "border-red-500" : undefined}
              />
              <Label htmlFor="field-declaration" className="cursor-pointer text-sm font-normal leading-snug">
                I have read the declaration above and I agree with it
                <span aria-hidden className="ml-1 text-red-600 dark:text-red-400">*</span>
                <span className="sr-only"> (required)</span>
              </Label>
            </div>
            {failure?.declarationMissing && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                Tick the box to confirm the declaration.
              </p>
            )}

            {failure && (
              <div
                ref={failureRef}
                tabIndex={-1}
                role="alert"
                data-testid="submit-failure"
                className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 outline-none dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              >
                <p className="flex items-start gap-2 font-medium">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {failure.message}
                </p>
                {failure.sections.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {failure.sections.map((section) => (
                      <li key={section.id}>
                        <Link href={section.href} className="font-medium underline underline-offset-2">
                          {section.id} {section.title}
                        </Link>
                        : {section.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {!readiness.ready ? "Finish the sections listed above first." : !ticked ? "Tick the declaration to enable Submit." : "You will be asked to confirm."}
            </p>
            <Button ref={submitButton} id="submit-button" type="button" disabled={!canSubmit} onClick={() => setConfirmOpen(true)} className="w-full sm:w-auto">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {submitting ? "Submitting..." : "Submit application"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
        <Link href="/tourist-visa">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
          Your application
        </Link>
      </Button>

      {/* Results are read out by screen readers without moving focus. */}
      <p key={announcement.n} role="status" aria-live="polite" className="sr-only">
        {announcement.text}
      </p>

      {content}

      <ConfirmDialog
        open={confirmOpen}
        title="Submit your application?"
        description="You will not be able to change it afterwards."
        cancelLabel="Go back"
        confirmLabel="Submit application"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void submit()}
        onCloseAutoFocus={(event) => {
          // The dialog has no trigger element for Radix to return focus to. After "Go back" it goes to the Submit button;
          // after "Submit application" the page moves it to the confirmation or the list of what to fix.
          event.preventDefault();
          if (!submitting) submitButton.current?.focus();
        }}
      />
    </div>
  );
}
