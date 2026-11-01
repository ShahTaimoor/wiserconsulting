"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/tourist-visa/ConfirmDialog";
import { ErrorSummary } from "@/components/tourist-visa/ErrorSummary";
import { QuestionField } from "@/components/tourist-visa/QuestionField";
import { RepeatGroupField } from "@/components/tourist-visa/RepeatGroupField";
import { notifyAdminDone, notifyAdminFailed } from "@/components/tourist-visa/notify";
import { isVisible, resolveOptions } from "@/shared/tourist-visa/engine";
import type { Answers } from "@/shared/tourist-visa/engine";
import { touristVisaService, TouristVisaApiError } from "@/services/touristVisaService";
import type { ChangeLine, ChangePreview, EditForm } from "@/services/touristVisaAdminTypes";
import {
  appendEntry,
  applyAnswer,
  applyEntryAnswer,
  buildChanges,
  collectErrors,
  dropEntry,
  editableSectionIds,
  groupEntryCount,
  initialValues,
  isGroupOpen,
  MAX_CHANGES_PER_REQUEST,
  mergedAnswers,
  sectionItems,
  sectionKeys,
  subErrors,
  withoutEntryErrors,
  withoutErrorsFor,
  workingAnswers,
  type FormValues,
} from "@/utils/touristVisaForm";
import { describeEditFailure, lineTitle, previewSummaryText, problemsText, reasonState } from "@/utils/touristVisaAdmin";
import { asRecord } from "./fields/types";

interface AdminEditorProps {
  applicationId: string;
  reference: string | null;
  /** The section whose Edit button was pressed. */
  startSectionId: string;
  readToken: () => string | null;
  /** The page's own handling of a failure: signs out for a 401 and returns a sentence. */
  fail: (error: unknown) => string;
  announce: (text: string) => void;
  /** Leave the editor. `applied` says whether a correction was saved (the page then reloads what it shows). */
  onClose: (result: { applied: boolean; sectionId: string }) => void;
  /** Someone else changed the application: the page reloads what it shows behind the editor. */
  onStale: () => void;
}

type Banner = { kind: "stale" | "invalid" | "locked" | "other"; message: string };

/** Moves focus to a control by id (the first input inside it when it is a fieldset) and scrolls it into view. */
function focusControl(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  const target = element.matches("fieldset, div") ? (element.querySelector<HTMLElement>("input, select, textarea, button") ?? element) : element;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "center", behavior: "smooth" });
}

const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto";

/** Old and new value side by side (stacked on a phone), each labelled in words. */
function Diff({ line, showNew = true, oldLabel = "Was" }: { line: ChangeLine; showNew?: boolean; oldLabel?: string }) {
  return (
    <li className="space-y-1 px-3 py-2 text-sm" data-testid="change-line">
      <p className="break-words font-medium text-foreground">
        <span className="mr-2 text-muted-foreground">{line.sectionId}</span>
        {lineTitle(line)}
      </p>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">{oldLabel}</dt>
          <dd className="whitespace-pre-wrap break-words text-foreground">{line.old}</dd>
        </div>
        {showNew && (
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Now</dt>
            <dd className="whitespace-pre-wrap break-words font-medium text-foreground">{line.new}</dd>
          </div>
        )}
      </dl>
    </li>
  );
}

/**
 * The administrator's correction of a submitted application.
 *
 * The same field components the applicant's form uses, built from the config the application was SUBMITTED under and
 * filled with its current answers. The flow is: edit one or more sections, "Review changes" (the server checks them
 * with the shared engine and describes them, changing nothing), read the old and new values, give a reason, confirm in
 * the site's own dialog, apply. The answers live only in this component's state: never in storage, the URL or the console.
 */
export function AdminEditor({ applicationId, reference, startSectionId, readToken, fail, announce, onClose, onStale }: AdminEditorProps) {
  // The review markers (TBC, Draft options) are for people testing the applicant form: an administrator correcting a
  // submitted application never sees them, even when the snapshot it was submitted under still carries an old note.
  const previewMode = false;
  const [form, setForm] = useState<EditForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [edits, setEdits] = useState<Record<string, FormValues>>({});
  const [current, setCurrent] = useState(startSectionId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toFix, setToFix] = useState<Array<{ id: string; problems: number }>>([]);
  const [stage, setStage] = useState<"edit" | "review">("edit");
  const [preview, setPreview] = useState<ChangePreview | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const alive = useRef(true);
  const started = useRef<number | null>(null);
  const editHeading = useRef<HTMLHeadingElement | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement | null>(null);
  const applyButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Fetch the form once for each visit: the server records that the answers were opened (React strict mode runs effects twice in development).
  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    const token = readToken();
    if (!token) return;
    setLoadError(null);
    void (async () => {
      try {
        const result = await touristVisaService.adminEditForm(token, applicationId);
        if (alive.current) setForm(result);
      } catch (e) {
        const message = fail(e);
        if (alive.current) setLoadError(message);
      }
    })();
  }, [attempt, applicationId, readToken, fail]);

  const cfg = form?.config;
  const base = form?.answers;

  useEffect(() => {
    if (form) editHeading.current?.focus();
  }, [form]);

  const working = useMemo(() => (cfg && base ? workingAnswers(cfg, base, edits) : {}), [cfg, base, edits]);
  const values = useMemo<FormValues>(() => (cfg && base ? (edits[current] ?? initialValues(cfg, current, base)) : {}), [cfg, base, edits, current]);
  const merged = useMemo(() => (cfg ? mergedAnswers(cfg, current, working, values) : {}), [cfg, current, working, values]);
  const changes = useMemo(() => (cfg && base ? buildChanges(cfg, base, edits) : []), [cfg, base, edits]);
  const dirty = changes.length > 0;
  const section = cfg?.sections.find((s) => s.id === current);
  const items = useMemo(() => (cfg ? sectionItems(cfg, current) : []), [cfg, current]);

  const changedSections = useMemo(() => {
    if (!cfg || !base) return [] as string[];
    return Object.keys(edits).filter((id) => buildChanges(cfg, base, { [id]: edits[id] }).length > 0);
  }, [cfg, base, edits]);
  const chipIds = useMemo(() => {
    const ids = new Set<string>([startSectionId, current, ...changedSections, ...toFix.map((s) => s.id)]);
    return (cfg?.sections ?? []).map((s) => s.id).filter((id) => ids.has(id));
  }, [cfg, startSectionId, current, changedSections, toFix]);
  const otherSections = useMemo(() => (cfg ? editableSectionIds(cfg, working) : []), [cfg, working]);

  // Only the messages that belong to the section on screen.
  const sectionErrors = useMemo(() => {
    if (!cfg) return {} as Record<string, string>;
    const own = new Set(sectionKeys(cfg, current));
    return Object.fromEntries(Object.entries(errors).filter(([key]) => own.has(key.split(".")[0])));
  }, [cfg, current, errors]);
  const errorItems = useMemo(() => (cfg ? collectErrors(cfg, current, sectionErrors) : []), [cfg, current, sectionErrors]);

  const update = useCallback(
    (change: (previous: FormValues) => FormValues) => {
      if (!cfg || !base) return;
      setEdits((previous) => ({ ...previous, [current]: change(previous[current] ?? initialValues(cfg, current, base)) }));
      setBanner((b) => (b && b.kind === "stale" ? b : null));
    },
    [cfg, base, current]
  );

  const setAnswer = (questionId: string, value: unknown) => {
    if (!cfg) return;
    update((previous) => applyAnswer(cfg, previous, questionId, value));
    setErrors((previous) => {
      let next = withoutErrorsFor(previous, questionId);
      for (const group of cfg.groups) if (group.gate === questionId || group.count === questionId) next = withoutErrorsFor(next, group.id);
      return next;
    });
  };
  const setEntryAnswer = (groupId: string, index: number, questionId: string, value: unknown) => {
    update((previous) => applyEntryAnswer(previous, groupId, index, questionId, value));
    setErrors((previous) => withoutEntryErrors(previous, groupId, index, questionId));
  };
  const addEntry = (groupId: string) => {
    update((previous) => appendEntry(previous, groupId));
    setErrors((previous) => withoutErrorsFor(previous, groupId));
  };
  const removeEntry = (groupId: string, index: number) => {
    update((previous) => dropEntry(previous, groupId, index));
    setErrors((previous) => withoutErrorsFor(previous, groupId));
  };

  const switchTo = (sectionId: string) => {
    if (sectionId === current) return;
    setCurrent(sectionId);
    setStage("edit");
    setPreview(null);
    window.setTimeout(() => editHeading.current?.focus(), 0);
    announce(`Editing section ${sectionId}.`);
  };

  /** What went wrong with a preview or an apply, shown as a notice; a 422 also marks the fields and names the sections. */
  const handleFailure = useCallback(
    (e: unknown) => {
      const message = fail(e);
      if (e instanceof TouristVisaApiError && e.status !== 401) {
        const described = describeEditFailure({ status: e.status, code: e.code, closed: e.closed, sections: e.sections });
        setBanner({ kind: described.kind, message: described.message });
        if (described.kind === "invalid") {
          setErrors(e.fieldErrors ?? {});
          setToFix(described.sections);
          setStage("edit");
          setPreview(null);
          // Show a section that has something to fix.
          const ids = described.sections.map((s) => s.id);
          if (ids.length > 0 && !ids.includes(current)) setCurrent(ids[0]);
          announce(`${described.message} ${ids.length} section${ids.length === 1 ? "" : "s"} to check.`);
          const first = Object.keys(e.fieldErrors ?? {})[0];
          if (first) window.setTimeout(() => focusControl(`field-${first.replace(/\./g, "-")}`), 50);
        } else {
          announce(described.message);
        }
        if (described.kind === "stale") setStage("edit");
      } else {
        setBanner({ kind: "other", message });
        announce(message);
      }
      notifyAdminFailed(message);
    },
    [fail, announce, current]
  );

  const review = async () => {
    if (!form || busy) return;
    const token = readToken();
    if (!token) return;
    if (changes.length === 0) {
      setBanner({ kind: "other", message: "You haven't changed anything yet." });
      announce("You haven't changed anything yet.");
      return;
    }
    if (changes.length > MAX_CHANGES_PER_REQUEST) {
      const message = `That is ${changes.length} changes. At most ${MAX_CHANGES_PER_REQUEST} can be applied at once. Apply some sections first, then the rest.`;
      setBanner({ kind: "other", message });
      announce(message);
      return;
    }
    setBusy("preview");
    setBanner(null);
    setToFix([]);
    try {
      const result = await touristVisaService.adminPreviewChanges(token, applicationId, { expectedRevision: form.application.revision, changes });
      if (!alive.current) return;
      setPreview(result);
      setErrors({});
      setStage("review");
      announce(`Check the changes. ${previewSummaryText({ changes: result.changes.length, removed: result.removed.length, required: result.required.length })}. Then give a reason.`);
      window.setTimeout(() => reviewHeading.current?.focus(), 0);
    } catch (e) {
      if (alive.current) handleFailure(e);
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const apply = async () => {
    if (!form || busy) return;
    const token = readToken();
    if (!token) return;
    setBusy("apply");
    try {
      await touristVisaService.adminApplyChanges(token, applicationId, { expectedRevision: form.application.revision, reason: reason.trim(), changes });
      if (!alive.current) return;
      notifyAdminDone("Changes saved.");
      announce("Changes saved. The applicant will see Corrected by our team next to the answers you changed.");
      onClose({ applied: true, sectionId: current });
    } catch (e) {
      if (alive.current) handleFailure(e);
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const loadLatest = () => {
    setEdits({});
    setErrors({});
    setToFix([]);
    setReason("");
    setPreview(null);
    setStage("edit");
    setBanner(null);
    setForm(null);
    setAttempt((n) => n + 1);
    onStale();
  };

  const cancel = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose({ applied: false, sectionId: current });
  };

  const reasonCheck = reasonState(reason);
  const counts = preview ? { changes: preview.changes.length, removed: preview.removed.length, required: preview.required.length } : null;

  const bannerNode = banner && (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {banner.message}
      </p>
      {banner.kind === "stale" && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={loadLatest}>
            Load the latest version
          </Button>
        </div>
      )}
      {banner.kind === "invalid" && toFix.length > 0 && (
        <ul className="space-y-1">
          {toFix.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => switchTo(item.id)} className="inline-flex min-h-8 items-center text-left font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                Section {item.id} {cfg?.sections.find((s) => s.id === item.id)?.title}
              </button>
              : {problemsText(item.problems)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // ---- loading and failing to load
  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <p className="flex items-start gap-2 font-medium">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {loadError}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onClose({ applied: false, sectionId: startSectionId })}>
            Back to the application
          </Button>
        </div>
      </div>
    );
  }
  if (!form || !cfg || !base) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading the answers to correct">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <section aria-labelledby="edit-heading" className="space-y-5 rounded-lg border border-border bg-card p-4 text-card-foreground sm:p-6" data-testid="admin-editor">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          Correcting answers{reference ? ` for ${reference}` : ""} · revision {form.application.revision}
        </p>
        {stage === "edit" ? (
          <h2 id="edit-heading" ref={editHeading} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
            <span className="mr-2 text-muted-foreground">{current}</span>
            {section?.title}
          </h2>
        ) : (
          <h2 id="edit-heading" ref={reviewHeading} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
            Check the changes
          </h2>
        )}
        {stage === "edit" && (
          <p className="text-sm text-muted-foreground">
            Change what needs correcting, then choose Review changes. Nothing is saved until you have read the changes, given a reason and confirmed. The Part 9 ticks are the applicant&apos;s own and cannot be changed here.
          </p>
        )}
      </header>

      {bannerNode}

      {stage === "edit" && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <nav aria-label="Sections in this correction" className="min-w-0">
              <ul className="flex flex-wrap gap-2">
                {chipIds.map((id) => {
                  const problem = toFix.find((s) => s.id === id);
                  const changed = changedSections.includes(id);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => switchTo(id)}
                        aria-current={id === current ? "true" : undefined}
                        className={`min-h-11 rounded-md px-3 text-sm font-medium ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          id === current ? "bg-primary text-primary-foreground ring-primary" : "bg-background text-foreground ring-border hover:bg-muted"
                        }`}
                      >
                        {id}
                        {changed && <span className="sr-only"> (changed)</span>}
                        {changed && <span aria-hidden> •</span>}
                        {problem && <span className="ml-1 text-xs">({problemsText(problem.problems)})</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div>
              <label htmlFor="tv-edit-section" className="mb-1 block text-xs text-muted-foreground">
                Edit another section
              </label>
              <select id="tv-edit-section" value={current} onChange={(event) => switchTo(event.target.value)} className={selectClass}>
                {otherSections.map((id) => (
                  <option key={id} value={id}>
                    {id} {cfg.sections.find((s) => s.id === id)?.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ErrorSummary items={errorItems} onGo={focusControl} />

          <fieldset disabled={busy !== null} className="min-w-0 space-y-6 border-0 p-0">
            {items.map((item) => {
              if (item.kind === "question") {
                const { question } = item;
                if (!isVisible(cfg, question.id, merged as Answers)) return null;
                const field = (
                  <QuestionField
                    key={question.id}
                    cfg={cfg}
                    question={question}
                    idBase={`field-${question.id}`}
                    value={values[question.id]}
                    onChange={(value) => setAnswer(question.id, value)}
                    options={resolveOptions(cfg, question.id, merged as Answers)}
                    error={sectionErrors[question.id]}
                    subErrors={subErrors(sectionErrors, question.id)}
                    previewMode={previewMode}
                  />
                );
                if (question.type !== "ACK") return field;
                // The applicant's own declaration: shown as they gave it, not editable.
                return (
                  <div key={question.id} className="space-y-1 opacity-80">
                    <fieldset disabled className="min-w-0 border-0 p-0">
                      {field}
                    </fieldset>
                    <p className="text-xs text-muted-foreground">The applicant confirmed this themselves. An administrator cannot change it.</p>
                  </div>
                );
              }
              if (!isGroupOpen(cfg, item.group, merged)) return null;
              const entries = Array.isArray(values[item.group.id]) ? (values[item.group.id] as unknown[]) : [];
              return (
                <RepeatGroupField
                  key={item.group.id}
                  cfg={cfg}
                  group={item.group}
                  members={item.members}
                  entries={entries.map((entry) => asRecord(entry))}
                  count={groupEntryCount(cfg, item.group, merged)}
                  reported={item.group.count && typeof merged[item.group.count] === "number" ? (merged[item.group.count] as number) : undefined}
                  merged={merged}
                  errors={sectionErrors}
                  previewMode={previewMode}
                  onEntryChange={(index, questionId, value) => setEntryAnswer(item.group.id, index, questionId, value)}
                  onAdd={() => addEntry(item.group.id)}
                  onRemove={(index) => removeEntry(item.group.id, index)}
                />
              );
            })}
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={cancel} disabled={busy !== null}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Cancel
            </Button>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {dirty ? `${changes.length} ${changes.length === 1 ? "answer" : "answers"} changed so far.` : "Nothing changed yet."}
              </p>
              <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={() => void review()} disabled={busy !== null || !dirty}>
                {busy === "preview" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Review changes
              </Button>
            </div>
          </div>
        </>
      )}

      {stage === "review" && preview && counts && (
        <>
          <p className="text-sm text-foreground" role="status">
            {previewSummaryText(counts)}. Nothing has been saved yet.
          </p>

          <div className="space-y-5">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Answers that will change</h3>
              {preview.changes.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {preview.changes.map((line, index) => (
                    <Diff key={`${line.questionId}-${line.index ?? "x"}-${index}`} line={line} />
                  ))}
                </ul>
              )}
            </div>

            {preview.required.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-foreground">Questions that now apply</h3>
                <p className="mb-2 text-sm text-muted-foreground">These were not asked before. Your changes make them necessary, and you have answered them.</p>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {preview.required.map((line, index) => (
                    <Diff key={`${line.questionId}-${line.index ?? "x"}-${index}`} line={line} oldLabel="Before" />
                  ))}
                </ul>
              </div>
            )}

            {preview.removed.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-foreground">Answers that will be removed</h3>
                <p className="mb-2 text-sm text-muted-foreground">Your changes mean these questions no longer apply. The answers are removed from the application, and kept in the history below it.</p>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {preview.removed.map((line, index) => (
                    <Diff key={`${line.questionId}-${line.index ?? "x"}-${index}`} line={line} showNew={false} oldLabel="Answer that will be removed" />
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="tv-edit-reason" className="block text-sm font-medium text-foreground">
              Reason for the change <span aria-hidden className="text-red-600 dark:text-red-400">*</span>
              <span className="sr-only"> (required, 10 to 1000 characters)</span>
            </label>
            <textarea
              id="tv-edit-reason"
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby="tv-edit-reason-help"
              aria-invalid={reason.length > 0 && !reasonCheck.valid}
              disabled={busy !== null}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-red-500"
            />
            <p id="tv-edit-reason-help" className={`text-xs ${reason.length > 0 && !reasonCheck.valid ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>
              {reasonCheck.valid ? "" : `${reasonCheck.message} `}
              {reasonCheck.counter} characters. The reason is kept with the change; the applicant does not see it.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 w-full sm:w-auto"
              disabled={busy !== null}
              onClick={() => {
                setStage("edit");
                announce("Back to editing.");
                window.setTimeout(() => editHeading.current?.focus(), 0);
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Back to editing
            </Button>
            <Button ref={applyButton} type="button" className="min-h-11 w-full sm:w-auto" disabled={busy !== null || !reasonCheck.valid} onClick={() => setConfirmApply(true)}>
              {busy === "apply" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Apply changes
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmApply}
        title="Apply these changes?"
        description={`${counts ? `${previewSummaryText(counts)}. ` : ""}They are saved to this application with your reason, and the applicant will see "Corrected by our team" next to the answers you changed.`}
        cancelLabel="Go back"
        confirmLabel="Apply changes"
        onCancel={() => setConfirmApply(false)}
        onConfirm={() => {
          setConfirmApply(false);
          void apply();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (applyButton.current ?? reviewHeading.current ?? editHeading.current)?.focus();
        }}
      />
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard your changes?"
        description="You have changed answers that have not been saved. If you leave now they are lost."
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        tone="destructive"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose({ applied: false, sectionId: current });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          editHeading.current?.focus();
        }}
      />
    </section>
  );
}
