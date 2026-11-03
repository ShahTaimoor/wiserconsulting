"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/tourist-visa/ConfirmDialog";
import { notifyAdminDone, notifyAdminFailed } from "@/components/tourist-visa/notify";
import { touristVisaService } from "@/services/touristVisaService";
import type { AdminStatus, CoverLetterView, LetterSource } from "@/services/touristVisaAdminTypes";
import { describeAdminError, formatWhen } from "@/utils/touristVisaAdmin";
import {
  aiLine,
  CHECK_NOTICE,
  CHECK_NOTICE_SHORT,
  createdMessage,
  DEFAULT_MAX_LETTER,
  describeLetterError,
  letterActions,
  letterCounter,
  normalizeLetter,
  sourceBadge,
  STALE_BANNER,
  STALE_HELP,
  versionTitle,
} from "@/utils/touristVisaCoverLetter";

interface CoverLetterPanelProps {
  applicationId: string;
  status: AdminStatus;
  readToken: () => string | null;
  /** Turns a failure into a sentence (and signs the user out for a 401). */
  fail: (error: unknown) => string;
  announce: (text: string) => void;
  /** Called after the letter was created, saved or approved, so the activity can be refreshed. */
  onRecorded: () => void;
}

const textareaClass =
  "min-h-[22rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const badgeBase = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";
const badgeTone: Record<LetterSource, string> = {
  ai: "bg-sky-100 text-sky-900 ring-sky-600/30 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-400/30",
  template: "bg-muted text-foreground ring-border",
  admin: "bg-violet-100 text-violet-900 ring-violet-600/30 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-400/30",
};
const noticeTone = {
  info: "border-border bg-muted text-foreground",
  ok: "border-green-300 bg-green-50 text-green-900 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-200",
  warn: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
};

type Busy = "generate" | "save" | "approve" | null;

/**
 * The cover letter of one application, for the team only. A letter is written on demand (by the AI, or by the template when
 * the AI is off or fails), checked and edited by the administrator, saved as a new version, and approved. Versions are
 * never changed; the newest can be approved. Reading, creating, saving and approving are recorded by the server.
 */
export function CoverLetterPanel({ applicationId, status, readToken, fail, announce, onRecorded }: CoverLetterPanelProps) {
  const open = status === "submitted" || status === "in_review";
  const [view, setView] = useState<CoverLetterView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<{ tone: keyof typeof noticeTone; text: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [shown, setShown] = useState<number | null>(null);
  const alive = useRef(true);
  const started = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const apply = useCallback((next: CoverLetterView) => {
    setView(next);
    setText(next.versions[0]?.text ?? "");
    setShown(null);
  }, []);

  // Read the letter once for each visit: the server records each read (React strict mode runs effects twice in development).
  useEffect(() => {
    if (!open) return;
    const key = `${applicationId}:${attempt}`;
    if (started.current === key) return;
    started.current = key;
    const token = readToken();
    if (!token) return;
    setLoadError(false);
    void (async () => {
      try {
        const loaded = await touristVisaService.adminCoverLetter(token, applicationId);
        if (alive.current) apply(loaded);
      } catch (e) {
        fail(e);
        if (alive.current) setLoadError(true);
      }
    })();
  }, [open, applicationId, attempt, readToken, fail, apply]);

  const latest = view && view.versions.length > 0 ? view.versions[0] : null;
  const max = view?.maxLength ?? DEFAULT_MAX_LETTER;
  const actions = useMemo(() => letterActions({ latest, text, stale: Boolean(view?.stale), busy: busy !== null, max }), [latest, text, view?.stale, busy, max]);
  const counter = letterCounter(text, max);
  const dirty = latest !== null && normalizeLetter(text) !== normalizeLetter(latest.text);

  const focusText = () => window.setTimeout(() => textRef.current?.focus(), 0);

  const run = useCallback(
    async (kind: Exclude<Busy, null>, call: (token: string) => Promise<CoverLetterView>, after: (next: CoverLetterView) => { notice: { tone: keyof typeof noticeTone; text: string }; toast: string }) => {
      const token = readToken();
      if (!token || busy) return;
      setBusy(kind);
      setProblem(null);
      try {
        const next = await call(token);
        if (!alive.current) return;
        apply(next);
        const done = after(next);
        setNotice(done.notice);
        notifyAdminDone(done.toast);
        announce(done.notice.text);
        onRecorded();
        if (kind === "approve") headingRef.current?.focus();
        else focusText();
      } catch (e) {
        if (!alive.current) return;
        const message = describeLetterError({ status: (e as { status?: number })?.status ?? 0, code: (e as { code?: string })?.code, closed: (e as { closed?: boolean })?.closed }, describeAdminError);
        fail(e);
        setProblem(message);
        notifyAdminFailed(message);
        announce(message);
        // Someone else changed the letter, or the answers moved on: show what is there now.
        const code = (e as { code?: string })?.code;
        if (code === "LETTER_CHANGED" || code === "LETTER_NOT_LATEST" || code === "LETTER_STALE") setAttempt((n) => n + 1);
      } finally {
        if (alive.current) setBusy(null);
      }
    },
    [readToken, busy, apply, announce, fail, onRecorded]
  );

  const generate = () =>
    run("generate", (token) => touristVisaService.adminGenerateCoverLetter(token, applicationId), (next) => {
      const created = next.created ?? { version: next.latest ?? 1, source: "template" as LetterSource };
      return { notice: { tone: created.source === "ai" ? "ok" : "warn", text: createdMessage(created) }, toast: "Cover letter created." };
    });

  const saveNew = () =>
    run("save", (token) => touristVisaService.adminSaveCoverLetter(token, applicationId, { text, basedOnVersion: latest ? latest.version : 0 }), (next) => ({
      notice: { tone: "ok", text: `Saved as version ${next.latest}. ${CHECK_NOTICE}` },
      toast: "Cover letter saved.",
    }));

  const approveLatest = () =>
    run("approve", (token) => touristVisaService.adminApproveCoverLetter(token, applicationId, latest ? latest.version : 0), (next) => ({
      notice: { tone: "ok", text: `Version ${next.latest} is approved.` },
      toast: "Cover letter approved.",
    }));

  const older = view ? view.versions.slice(1) : [];

  return (
    <section id="cover-letter" aria-labelledby="cover-letter-heading" className="scroll-mt-20 rounded-lg border border-border bg-card p-4 text-card-foreground sm:p-6">
      <h2 id="cover-letter-heading" ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-lg font-semibold text-foreground focus-visible:outline-none">
        <FileText className="h-5 w-5" aria-hidden />
        Cover letter
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">For the team only. The applicant never sees it. Every version is kept; a new text is always a new version.</p>

      {!open ? (
        <p className="mt-3 text-sm text-muted-foreground">A cover letter can only be worked on while the application is submitted or in review. Reopen it for review to see or change the letter.</p>
      ) : loadError ? (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          The cover letter could not be loaded.{" "}
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      ) : view === null ? (
        <Skeleton className="mt-3 h-24 w-full" aria-label="Loading the cover letter" />
      ) : (
        <div className="mt-3 space-y-4">
          {problem && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
              {problem}
            </p>
          )}
          {notice && (
            <p role="status" className={`rounded-md border p-3 text-sm ${noticeTone[notice.tone]}`} data-testid="letter-notice">
              {notice.text}
            </p>
          )}

          {latest === null ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground">No cover letter has been written for this application yet.</p>
              <p className="text-sm text-muted-foreground">{aiLine(view.ai)}</p>
              <Button type="button" onClick={() => void generate()} disabled={!actions.canGenerate} className="min-h-11 w-full sm:w-auto">
                {busy === "generate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden />}
                Generate cover letter
              </Button>
            </div>
          ) : (
            <>
              {view.stale && (
                <div role="status" className={`rounded-md border p-3 text-sm ${noticeTone.warn}`} data-testid="letter-stale">
                  <p className="font-medium">{STALE_BANNER}</p>
                  <p className="mt-1">{STALE_HELP}</p>
                  <Button type="button" variant="outline" onClick={() => (dirty ? setConfirmGenerate(true) : void generate())} disabled={!actions.canGenerate} className="mt-2 min-h-11 w-full bg-background sm:w-auto">
                    {busy === "generate" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                    Generate new version
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-foreground">Version {latest.version}</span>
                <span className={`${badgeBase} ${badgeTone[latest.source]}`}>{sourceBadge(latest.source).label}</span>
                {latest.status === "approved" ? (
                  <span className={`${badgeBase} bg-green-100 text-green-900 ring-green-600/30 dark:bg-green-500/15 dark:text-green-200 dark:ring-green-400/30`}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Approved
                  </span>
                ) : (
                  <span className={`${badgeBase} bg-muted text-muted-foreground ring-border`}>Not approved</span>
                )}
                <span className="text-muted-foreground">
                  {formatWhen(latest.createdAt)} by {latest.createdBy.name || "an administrator"}
                  {latest.model ? ` (${latest.model})` : ""}
                </span>
              </div>
              {latest.status === "approved" && latest.approvedAt && (
                <p className="text-sm text-muted-foreground">
                  Approved {formatWhen(latest.approvedAt)} by {latest.approvedBy?.name || "an administrator"}. Saving changes makes a new version that needs approving again.
                </p>
              )}

              <p className={`rounded-md border p-3 text-sm ${noticeTone.warn}`}>{latest.source === "ai" ? CHECK_NOTICE : CHECK_NOTICE_SHORT}</p>

              <div>
                <label htmlFor="tv-letter-text" className="mb-1 block text-sm font-medium text-foreground">
                  Letter text (version {latest.version})
                </label>
                <textarea
                  id="tv-letter-text"
                  ref={textRef}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  aria-describedby="tv-letter-count"
                  className={textareaClass}
                  disabled={busy !== null}
                  spellCheck
                />
                <p id="tv-letter-count" className={`mt-1 text-xs ${counter.over ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>
                  {counter.label}
                  {dirty ? ". You have unsaved changes." : ""}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button type="button" onClick={() => void saveNew()} disabled={!actions.canSave} className="min-h-11 w-full sm:w-auto">
                  {busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  Save as new version
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmApprove(true)}
                  disabled={!actions.canApprove}
                  aria-describedby={actions.approveHint ? "tv-letter-approve-hint" : undefined}
                  className="min-h-11 w-full sm:w-auto"
                >
                  {busy === "approve" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  Approve this version
                </Button>
                <Button type="button" variant="outline" onClick={() => (dirty ? setConfirmGenerate(true) : void generate())} disabled={!actions.canGenerate} className="min-h-11 w-full sm:w-auto">
                  {busy === "generate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden />}
                  Generate new version
                </Button>
              </div>
              {actions.approveHint && (
                <p id="tv-letter-approve-hint" className="text-xs text-muted-foreground">
                  {actions.approveHint}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{aiLine(view.ai)}</p>

              {older.length > 0 && (
                <details className="rounded-md border border-border p-3">
                  <summary className="min-h-6 cursor-pointer text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Earlier versions ({older.length})
                  </summary>
                  <ol className="mt-2 divide-y divide-border text-sm">
                    {older.map((version) => (
                      <li key={version.version} className="space-y-2 py-3" data-testid="letter-version">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{versionTitle(version)}</span>
                          <span className={`${badgeBase} ${badgeTone[version.source]}`}>{sourceBadge(version.source).label}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatWhen(version.createdAt)} by {version.createdBy.name || "an administrator"}
                          </span>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-expanded={shown === version.version}
                            aria-controls={`tv-letter-version-${version.version}`}
                            onClick={() => setShown((current) => (current === version.version ? null : version.version))}
                            className="min-h-11 sm:min-h-8"
                          >
                            {shown === version.version ? "Hide" : "View"} version {version.version}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy !== null}
                            onClick={() => {
                              setText(version.text);
                              announce(`Version ${version.version} copied into the text box. Save it to make a new version.`);
                              focusText();
                            }}
                            className="min-h-11 sm:min-h-8"
                          >
                            Use this text
                          </Button>
                        </div>
                        {shown === version.version && (
                          <div id={`tv-letter-version-${version.version}`} className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm text-foreground">
                            {version.text}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmApprove}
        title="Approve this cover letter?"
        description={`Version ${latest?.version ?? ""} will be marked as approved. Check first that every fact in it matches the application's answers. You can still save a newer version later.`}
        cancelLabel="Go back"
        confirmLabel="Approve"
        onCancel={() => setConfirmApprove(false)}
        onConfirm={() => {
          setConfirmApprove(false);
          void approveLatest();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          headingRef.current?.focus();
        }}
      />
      <ConfirmDialog
        open={confirmGenerate}
        title="Replace your unsaved changes?"
        description="The text in the box has changes that are not saved. A new version is made from the application's answers, and your unsaved changes are lost. Save them first if you want to keep them."
        cancelLabel="Go back"
        confirmLabel="Create a new version"
        tone="destructive"
        onCancel={() => setConfirmGenerate(false)}
        onConfirm={() => {
          setConfirmGenerate(false);
          void generate();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          textRef.current?.focus();
        }}
      />
    </section>
  );
}
