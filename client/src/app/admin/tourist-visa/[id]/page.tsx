"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Copy, ExternalLink, FileText, Loader2, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminStatusBadge } from "@/components/tourist-visa/AdminStatusBadge";
import { ConfirmDialog } from "@/components/tourist-visa/ConfirmDialog";
import { notifyAdminDone, notifyAdminFailed } from "@/components/tourist-visa/notify";
import { ReviewSummary } from "@/components/tourist-visa/ReviewSummary";
import { useAppDispatch } from "@/redux/hooks";
import { logout } from "@/redux/slices/auth/authSlice";
import { config } from "@/shared/tourist-visa/engine";
import type { ReviewRow } from "@/shared/tourist-visa/view";
import { touristVisaService, TouristVisaApiError } from "@/services/touristVisaService";
import type { ActivityRow, AdminOverview, AdminStatus } from "@/services/touristVisaAdminTypes";
import { countHeldSections, isFormOpen, isPreviewMode } from "@/utils/touristVisaChecklist";
import { formatBytes } from "@/utils/touristVisaDocuments";
import { describeActivity, describeAdminError, filesOfRow, formatWhen, jumpLinks, moveWords, statusLabel } from "@/utils/touristVisaAdmin";

function readToken(): string | null {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

/** A link that was made but could not be opened in a new tab (a pop-up blocker). It is only kept for a short while. */
interface HeldLink {
  docId: string;
  url: string;
}

const HELD_LINK_MS = 90_000;

/**
 * One submitted application (/admin/tourist-visa/<id>): who to call, every answer as the applicant gave it, the files,
 * the status, and the activity log. Opening this page is recorded. Nothing here edits an answer.
 *
 * A file is never linked from the page: the Open button asks the server for a link that lasts two minutes, at the
 * moment it is pressed, and opens it in a new tab. The link is not kept, shown or logged.
 */
export default function AdminTouristVisaOverviewPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const dispatch = useAppDispatch();
  const notOpen = !isFormOpen(countHeldSections(config), isPreviewMode());

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; retry: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [activityError, setActivityError] = useState(false);
  const [pendingMove, setPendingMove] = useState<AdminStatus | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [held, setHeld] = useState<HeldLink | null>(null);
  const [announcement, setAnnouncement] = useState({ text: "", n: 0 });

  const alive = useRef(true);
  const started = useRef<string | null>(null);
  const statusRegion = useRef<HTMLDivElement | null>(null);
  const moveButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const returnFocusTo = useRef<"button" | "region">("button");

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const announce = useCallback((text: string) => setAnnouncement((previous) => ({ text, n: previous.n + 1 })), []);

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof TouristVisaApiError && e.status === 401) {
        dispatch(logout());
        return "Please sign in again.";
      }
      return describeAdminError(e instanceof TouristVisaApiError ? { status: e.status, code: e.code, closed: e.closed } : { status: 0 });
    },
    [dispatch]
  );

  const loadActivity = useCallback(async () => {
    const token = readToken();
    if (!token) return;
    try {
      const rows = await touristVisaService.adminActivity(token, id);
      if (alive.current) {
        setActivity(rows);
        setActivityError(false);
      }
    } catch {
      if (alive.current) setActivityError(true);
    }
  }, [id]);

  // Load the Overview once for each visit. The server records the view, so the guard stops a second request in development
  // (React strict mode runs effects twice) from writing a second row.
  useEffect(() => {
    if (notOpen) return;
    const key = `${id}:${attempt}`;
    if (started.current === key) return;
    started.current = key;
    const token = readToken();
    if (!token) {
      dispatch(logout());
      return;
    }
    setLoadError(null);
    void (async () => {
      try {
        const result = await touristVisaService.adminOverview(token, id);
        if (!alive.current) return;
        setOverview(result);
        void loadActivity();
      } catch (e) {
        if (!alive.current) return;
        const message = fail(e);
        const missing = e instanceof TouristVisaApiError && e.code === "APPLICATION_NOT_FOUND";
        setLoadError({ message, retry: !missing });
      }
    })();
  }, [id, attempt, notOpen, dispatch, fail, loadActivity]);

  // A link that could not be opened is dropped after a while, so it cannot be used long after it was made.
  useEffect(() => {
    if (!held) return;
    const timer = window.setTimeout(() => setHeld(null), HELD_LINK_MS);
    return () => window.clearTimeout(timer);
  }, [held]);

  const openFile = useCallback(
    async (docId: string) => {
      const token = readToken();
      if (!token) {
        dispatch(logout());
        return;
      }
      // Open the tab now, while the click still counts, then point it at the link when the server has made it.
      let tab: Window | null = null;
      try {
        tab = window.open("about:blank", "_blank");
        if (tab) tab.opener = null;
      } catch {
        tab = null;
      }
      setOpening(docId);
      setHeld(null);
      try {
        const { url } = await touristVisaService.adminDocumentLink(token, id, docId);
        if (!alive.current) {
          tab?.close();
          return;
        }
        if (tab && !tab.closed) {
          tab.location.href = url;
          announce("The file is opening in a new tab.");
        } else {
          setHeld({ docId, url });
          announce("Your browser blocked the new tab. Use the link that appeared next to the file.");
        }
        void loadActivity();
      } catch (e) {
        tab?.close();
        if (!alive.current) return;
        const message = fail(e);
        notifyAdminFailed(message);
        announce(message);
      } finally {
        if (alive.current) setOpening(null);
      }
    },
    [id, dispatch, announce, fail, loadActivity]
  );

  const confirmMove = useCallback(async () => {
    const to = pendingMove;
    const from = overview?.application.status;
    setConfirmOpen(false);
    if (!to || !from) return;
    const token = readToken();
    if (!token) {
      dispatch(logout());
      return;
    }
    setChanging(true);
    try {
      const result = await touristVisaService.adminSetStatus(token, id, to);
      if (!alive.current) return;
      setOverview((previous) =>
        previous
          ? {
              ...previous,
              application: { ...previous.application, status: result.status, allowedMoves: result.allowedMoves },
              call: { ...previous.call, status: result.status },
            }
          : previous
      );
      const text = `Status changed to ${statusLabel(result.status)}.`;
      notifyAdminDone(text);
      announce(text);
      void loadActivity();
    } catch (e) {
      if (!alive.current) return;
      const message = fail(e);
      notifyAdminFailed(message);
      announce(message);
      // The status may have changed elsewhere: show where it really stands.
      if (e instanceof TouristVisaApiError && e.status === 409) {
        started.current = null;
        setAttempt((n) => n + 1);
      }
    } finally {
      if (alive.current) setChanging(false);
    }
  }, [pendingMove, overview, id, dispatch, announce, fail, loadActivity]);

  const copyPhone = useCallback(
    async (display: string) => {
      try {
        await navigator.clipboard.writeText(display);
        notifyAdminDone("Phone number copied.");
        announce("Phone number copied.");
      } catch {
        notifyAdminFailed("We couldn't copy the number. Select it and copy it by hand.");
      }
    },
    [announce]
  );

  const renderFiles = useCallback(
    (row: ReviewRow) => {
      if (!overview) return null;
      const files = filesOfRow(row.id, overview.fileSlots, overview.documents);
      if (files.length === 0) return <span className="italic text-muted-foreground">{row.value}</span>;
      return (
        <ul className="space-y-2">
          {files.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex min-w-0 items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 break-all">
                  {file.name} <span className="text-muted-foreground">({formatBytes(file.size)})</span>
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={opening !== null}
                onClick={() => void openFile(file.id)}
                aria-label={`Open ${file.name} in a new tab`}
              >
                {opening === file.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                {opening === file.id ? "Opening..." : "Open"}
              </Button>
              {held?.docId === file.id && (
                <a href={held.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline underline-offset-2">
                  Open the file (valid for two minutes)
                </a>
              )}
            </li>
          ))}
        </ul>
      );
    },
    [overview, opening, held, openFile]
  );

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-3 mb-4">
      <Link href="/admin/tourist-visa">
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
        All applications
      </Link>
    </Button>
  );

  let content: React.ReactNode;
  if (notOpen) {
    content = (
      <div role="status" className="rounded-lg border border-border bg-card p-6 text-sm text-card-foreground">
        The Tourist Visa application isn&apos;t open yet, so there is nothing to show here.
      </div>
    );
  } else if (loadError) {
    content = (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <p className="flex items-start gap-2 font-medium">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {loadError.message}
        </p>
        {loadError.retry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              started.current = null;
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        )}
      </div>
    );
  } else if (!overview) {
    content = (
      <div className="space-y-4" aria-busy="true" aria-label="Loading the application">
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  } else {
    const { call, application } = overview;
    const links = jumpLinks(overview.review);
    const words = pendingMove ? moveWords(application.status, pendingMove) : null;
    content = (
      <div className="space-y-8">
        <section aria-labelledby="call-heading" className="rounded-lg border border-border bg-card p-4 text-card-foreground sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 id="call-heading" className="break-words text-2xl font-bold text-foreground">
                {call.name || "No name"}
              </h1>
              <p className="mt-1 font-mono text-sm text-muted-foreground" data-testid="reference">
                {call.reference ?? "No reference"}
              </p>
            </div>
            <AdminStatusBadge status={call.status} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href={`tel:${call.phone.tel}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Phone className="h-4 w-4" aria-hidden />
              <span className="break-all">{call.phone.display}</span>
              <span className="sr-only"> (call this number)</span>
            </a>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void copyPhone(call.phone.display)}>
              <Copy className="mr-2 h-4 w-4" aria-hidden />
              Copy number
            </Button>
          </div>

          <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="mt-0.5 flex items-center gap-2 break-all text-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {call.email}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Preferred language</dt>
              <dd className="mt-0.5 text-foreground">{call.preferredLanguage}</dd>
            </div>
            {call.contact.map((item) => (
              <div key={item.id}>
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className="mt-0.5 break-words text-foreground">{item.value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-muted-foreground">Submitted</dt>
              <dd className="mt-0.5 text-foreground">{formatWhen(call.submittedAt)}</dd>
            </div>
          </dl>

          <div ref={statusRegion} tabIndex={-1} className="mt-6 border-t border-border pt-4 outline-none" aria-labelledby="status-heading">
            <h2 id="status-heading" className="text-sm font-semibold text-foreground">
              Status: {statusLabel(application.status)}
            </h2>
            {application.allowedMoves.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {application.allowedMoves.map((to) => (
                  <Button
                    key={to}
                    ref={(element) => {
                      moveButtons.current[to] = element;
                    }}
                    type="button"
                    variant={to === "completed" ? "default" : "outline"}
                    disabled={changing}
                    onClick={() => {
                      returnFocusTo.current = "button";
                      setPendingMove(to);
                      setConfirmOpen(true);
                    }}
                  >
                    {changing && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                    {moveWords(application.status, to).button}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No status change is available.</p>
            )}
          </div>
        </section>

        <nav aria-label="Jump to a section" className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Jump to</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <ReviewSummary review={overview.review} editable={false} renderFiles={renderFiles} />

        <section id="activity" aria-labelledby="activity-heading" className="scroll-mt-20 rounded-lg border border-border bg-card p-4 text-card-foreground sm:p-6">
          <h2 id="activity-heading" className="text-lg font-semibold text-foreground">
            Activity
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Who looked at this application and what they did, newest first.</p>
          {activityError ? (
            <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
              The activity could not be loaded.{" "}
              <button type="button" className="font-medium underline underline-offset-2" onClick={() => void loadActivity()}>
                Try again
              </button>
            </p>
          ) : activity === null ? (
            <Skeleton className="mt-3 h-16 w-full" aria-label="Loading the activity" />
          ) : activity.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nothing has been recorded yet.</p>
          ) : (
            <ol className="mt-3 divide-y divide-border text-sm">
              {activity.map((row) => {
                const line = describeActivity(row);
                return (
                  <li key={row.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <span className="min-w-0 break-words text-foreground">
                      <span className="font-medium">{line.who}</span> {line.what}
                    </span>
                    <time dateTime={row.at} className="shrink-0 text-xs text-muted-foreground">
                      {formatWhen(row.at)}
                    </time>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <ConfirmDialog
          open={confirmOpen}
          title={words?.title ?? ""}
          description={words?.text ?? ""}
          cancelLabel="Go back"
          confirmLabel={words?.confirm ?? "Confirm"}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            returnFocusTo.current = "region";
            void confirmMove();
          }}
          onCloseAutoFocus={(event) => {
            // No trigger element for Radix to return to: after "Go back" focus the button that was pressed;
            // after a confirmed change the buttons are different, so focus the status heading.
            event.preventDefault();
            const button = returnFocusTo.current === "button" && pendingMove ? moveButtons.current[pendingMove] : null;
            (button ?? statusRegion.current)?.focus();
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-2 py-4 sm:px-4 sm:py-6">
      {back}
      <p key={announcement.n} role="status" aria-live="polite" className="sr-only">
        {announcement.text}
      </p>
      {content}
    </div>
  );
}
