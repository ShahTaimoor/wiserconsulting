"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useTouristVisa } from "@/context/TouristVisaContext";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { useAppSelector } from "@/redux/hooks";
import { config, getVisibleSections, isVisible, resolveOptions } from "@/shared/tourist-visa/engine";
import type { Answers } from "@/shared/tourist-visa/engine";
import type { TouristVisaApplication } from "@/services/touristVisaService";
import { isPreviewMode } from "@/utils/touristVisaChecklist";
import {
  buildPayload,
  collectErrors,
  initialValues,
  isGroupOpen,
  mergedAnswers,
  nextSectionId,
  previousSectionId,
  sectionItems,
  subErrors,
  valuesEqual,
  withoutEntryErrors,
  withoutErrorsFor,
  type FormValues,
} from "@/utils/touristVisaForm";
import { ErrorSummary } from "./ErrorSummary";
import { QuestionField } from "./QuestionField";
import { RepeatGroupField } from "./RepeatGroupField";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { asRecord } from "./fields/types";
import { notifySaved, notifySaveFailed } from "./notify";

type SaveMode = "continue" | "dashboard";

interface SectionFormProps {
  sectionId: string;
  application: TouristVisaApplication;
}

/** Moves focus to a control by id (the first input inside it when it is a fieldset) and scrolls it into view. */
function focusControl(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  const target = element.matches("fieldset, div") ? (element.querySelector<HTMLElement>("input, select, textarea, button") ?? element) : element;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "center", behavior: "smooth" });
}

/**
 * The form for one section, built from the shared question config.
 *
 * The answers live only in this component's React state (and, once saved, in the shared
 * application held by the layout's context). They are never written to localStorage, Redux,
 * the URL or the console. Showing and hiding of follow-up questions uses the shared engine,
 * so it follows the same rules as the server. The server validates; errors it sends back are
 * shown next to the right field.
 */
export function SectionForm({ sectionId, application }: SectionFormProps) {
  const router = useRouter();
  const { saveSection } = useTouristVisa();
  const { user } = useAppSelector((state) => state.auth);
  const previewMode = isPreviewMode();

  const section = config.sections.find((s) => s.id === sectionId);
  const part = config.parts.find((p) => p.id === section?.part);
  const items = useMemo(() => sectionItems(config, sectionId), [sectionId]);

  // Answers saved in the other sections, which conditions and option lists can depend on.
  const saved = application.answers;

  const [initial] = useState<FormValues>(() => initialValues(config, sectionId, saved, { email: user?.email }));
  const [values, setValues] = useState<FormValues>(initial);
  const [snapshot, setSnapshot] = useState<FormValues>(initial); // the values as last saved (or loaded)
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<SaveMode | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ id: string; n: number } | null>(null);
  const mounted = useRef(true);

  const dirty = !valuesEqual(values, snapshot);
  const { allowNavigation, leaveDialog } = useUnsavedChangesGuard(dirty);
  const merged = useMemo(() => mergedAnswers(config, sectionId, saved, values), [sectionId, saved, values]);
  // Sections that do not apply (for example 4A without a partner) are skipped, going either way.
  // Numbered among the sections that apply, so it matches the count on the dashboard.
  const applicable = useMemo(() => getVisibleSections(config, merged as Answers), [merged]);
  const sectionNumber = applicable.findIndex((s) => s.id === sectionId) + 1;
  const previousId = previousSectionId(config, sectionId, merged);
  const nextId = nextSectionId(config, sectionId, merged);
  const errorItems = useMemo(() => collectErrors(config, sectionId, errors), [sectionId, errors]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (focusRequest) focusControl(focusRequest.id);
  }, [focusRequest]);

  const setAnswer = useCallback((questionId: string, value: unknown) => {
    setValues((previous) => {
      const next: FormValues = { ...previous, [questionId]: value };
      // Answering Yes to a question that opens a repeating group gives it one entry to fill in.
      for (const group of config.groups) {
        const entries = next[group.id];
        if (group.gate === questionId && value === true && !(Array.isArray(entries) && entries.length > 0)) next[group.id] = [{}];
      }
      return next;
    });
    setErrors((previous) => {
      let next = withoutErrorsFor(previous, questionId);
      for (const group of config.groups) if (group.gate === questionId) next = withoutErrorsFor(next, group.id);
      return next;
    });
    setBanner(null);
  }, []);

  const setEntryAnswer = useCallback((groupId: string, index: number, questionId: string, value: unknown) => {
    setValues((previous) => {
      const entries = Array.isArray(previous[groupId]) ? [...(previous[groupId] as unknown[])] : [];
      entries[index] = { ...asRecord(entries[index]), [questionId]: value };
      return { ...previous, [groupId]: entries };
    });
    setErrors((previous) => withoutEntryErrors(previous, groupId, index, questionId));
    setBanner(null);
  }, []);

  const addEntry = useCallback((groupId: string) => {
    setValues((previous) => ({ ...previous, [groupId]: [...(Array.isArray(previous[groupId]) ? (previous[groupId] as unknown[]) : []), {}] }));
    setErrors((previous) => withoutErrorsFor(previous, groupId));
  }, []);

  const removeEntry = useCallback((groupId: string, index: number) => {
    setValues((previous) => ({ ...previous, [groupId]: (Array.isArray(previous[groupId]) ? (previous[groupId] as unknown[]) : []).filter((_, i) => i !== index) }));
    // Messages for later entries would now point at the wrong one, so start clean.
    setErrors((previous) => withoutErrorsFor(previous, groupId));
  }, []);

  const submit = useCallback(
    async (mode: SaveMode) => {
      if (saving || locked) return;
      setSaving(mode);
      setBanner(null);
      const { answers } = buildPayload(config, sectionId, values, saved);
      const result = await saveSection(sectionId, answers);
      if (!mounted.current) return; // the page was left (for example the user was signed out)
      setSaving(null);

      if (result.ok) {
        setSnapshot(values);
        setErrors({});
        allowNavigation();
        notifySaved(section?.title ?? "Your answers");
        router.push(mode === "continue" && nextId ? `/tourist-visa/${nextId}` : "/tourist-visa");
        return;
      }
      if (result.status === 401) return; // the context signs the user out and the layout redirects
      if (result.status === 409) setLocked(true);
      if (result.status === 422 && result.fieldErrors) {
        setErrors(result.fieldErrors);
        notifySaveFailed("Not saved yet. Please check the answers marked in red.");
        const first = collectErrors(config, sectionId, result.fieldErrors)[0];
        if (first) setFocusRequest({ id: first.targetId, n: Date.now() });
        return;
      }
      setBanner(result.message);
      notifySaveFailed(result.message);
    },
    [saving, locked, sectionId, section?.title, values, saved, saveSection, allowNavigation, router, nextId]
  );

  if (!section) return null;

  const busy = saving !== null;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit("continue");
      }}
    >
      <Card>
        <CardHeader>
          <p className="text-sm font-medium text-muted-foreground">
            Part {section.part}: {part?.title} · Section {sectionNumber} of {applicable.length}
          </p>
          <CardTitle className="text-2xl">
            <span className="mr-2 text-muted-foreground">{section.id}</span>
            {section.title}
          </CardTitle>
          <CardDescription>
            Fields marked <span aria-hidden className="text-red-600 dark:text-red-400">*</span>
            <span className="sr-only">with an asterisk</span> are required. Your answers are saved when you press Save.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <ErrorSummary items={errorItems} onGo={focusControl} />

          {banner && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{banner}</p>
            </div>
          )}

          {locked && (
            <p className="text-sm text-muted-foreground">
              This section can no longer be changed. <Link href="/tourist-visa" className="underline underline-offset-2">Back to your application</Link>
            </p>
          )}

          {/* A disabled fieldset disables every control inside it while saving or once locked. */}
          <fieldset disabled={busy || locked} className="min-w-0 space-y-6 border-0 p-0">
            {items.map((item) => {
              if (item.kind === "question") {
                const { question } = item;
                if (!isVisible(config, question.id, merged as Answers)) return null;
                return (
                  <QuestionField
                    key={question.id}
                    cfg={config}
                    question={question}
                    idBase={`field-${question.id}`}
                    value={values[question.id]}
                    onChange={(value) => setAnswer(question.id, value)}
                    options={resolveOptions(config, question.id, merged as Answers)}
                    error={errors[question.id]}
                    subErrors={subErrors(errors, question.id)}
                    previewMode={previewMode}
                  />
                );
              }
              if (!isGroupOpen(config, item.group, merged)) return null;
              const entries = Array.isArray(values[item.group.id]) ? (values[item.group.id] as unknown[]) : [];
              return (
                <RepeatGroupField
                  key={item.group.id}
                  cfg={config}
                  group={item.group}
                  members={item.members}
                  entries={entries}
                  merged={merged}
                  errors={errors}
                  previewMode={previewMode}
                  onEntryChange={(index, questionId, value) => setEntryAnswer(item.group.id, index, questionId, value)}
                  onAdd={() => addEntry(item.group.id)}
                  onRemove={(index) => removeEntry(item.group.id, index)}
                />
              );
            })}
          </fieldset>
        </CardContent>

        <CardFooter className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="ghost" className="w-full sm:w-auto">
            <Link href={previousId ? `/tourist-visa/${previousId}` : "/tourist-visa"}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              {previousId ? "Back" : "Back to your application"}
            </Link>
          </Button>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <p className="text-xs text-muted-foreground sm:mr-1" aria-live="polite">
              {dirty ? "You have unsaved changes." : "No unsaved changes."}
            </p>
            <Button type="button" variant="outline" disabled={busy || locked} onClick={() => void submit("dashboard")} className="w-full sm:w-auto">
              {saving === "dashboard" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Save and return to dashboard
            </Button>
            <Button type="submit" disabled={busy || locked} className="w-full sm:w-auto">
              {saving === "continue" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {saving === "continue" ? "Saving..." : "Save and continue"}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Rendered in a portal, so it sits above the page whatever the layout. */}
      <UnsavedChangesDialog {...leaveDialog} />
    </form>
  );
}
