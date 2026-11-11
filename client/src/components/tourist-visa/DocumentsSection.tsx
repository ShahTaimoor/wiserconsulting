"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useTouristVisa } from "@/context/TouristVisaContext";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { config, getFileQuestions, getVisibleSections } from "@/shared/tourist-visa/engine";
import type { Answers, Question } from "@/shared/tourist-visa/engine";
import type { DocumentLimits, TouristVisaApplication, TouristVisaDocument } from "@/services/touristVisaService";
import { isPreviewMode } from "@/utils/touristVisaChecklist";
import {
  acceptAttribute,
  allowedTypesText,
  documentErrorMessage,
  formatBytes,
  formatUploadedAt,
  preCheckFile,
  typeLabel,
} from "@/utils/touristVisaDocuments";
import { previousSectionId } from "@/utils/touristVisaForm";
import { ConfirmDialog } from "./ConfirmDialog";
import { notifyDocumentFailed, notifyDocumentRemoved, notifyDocumentUploaded } from "./notify";
import { DraftBadge } from "./QuestionField";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

interface DocumentsSectionProps {
  sectionId: string;
  application: TouristVisaApplication;
}

/** Where to put keyboard focus after an upload or a removal. `n` makes the same request count twice. */
type FocusRequest = { kind: "file"; id: string; n: number } | { kind: "upload"; slot: string; n: number } | { kind: "remove"; id: string; n: number };

const fileDomId = (id: string) => `doc-${id}`;
const uploadButtonDomId = (slot: string) => `upload-button-${slot}`;
const removeButtonDomId = (id: string) => `remove-button-${id}`;

/**
 * The documents page (section 10D): one panel for each file question, with its guidance, the files
 * uploaded so far, an upload button and a remove button for every file.
 *
 * Files are saved the moment they upload, so there is no form to save. What the page may accept
 * (types, sizes, how many) is read from the server, which stays the authority: a refusal from it is
 * shown in plain words whatever the browser thought. The page never receives or shows a link or a
 * storage id, only each file's name, size, type and time.
 */
export function DocumentsSection({ sectionId, application }: DocumentsSectionProps) {
  const router = useRouter();
  const { listDocuments, uploadDocument, deleteDocument, refresh } = useTouristVisa();
  const previewMode = isPreviewMode();

  const section = config.sections.find((s) => s.id === sectionId);
  const part = config.parts.find((p) => p.id === section?.part);
  const questions = useMemo(() => getFileQuestions(config, sectionId), [sectionId]);
  const applicable = useMemo(() => getVisibleSections(config, application.answers as Answers), [application.answers]);
  const sectionNumber = applicable.findIndex((s) => s.id === sectionId) + 1;
  const previousId = previousSectionId(config, sectionId, application.answers);

  const [docs, setDocs] = useState<TouristVisaDocument[]>(application.documents ?? []);
  const [limits, setLimits] = useState<DocumentLimits | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [uploading, setUploading] = useState<{ slot: string; name: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<TouristVisaDocument | null>(null);
  const [slotErrors, setSlotErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState<{ text: string; n: number }>({ text: "", n: 0 });
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  const alive = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const removalPending = useRef(false); // a removal started from the dialog is still running
  const openedFrom = useRef<string | null>(null); // the file whose Remove button opened the dialog
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const counter = useRef(0);

  const { leaveDialog } = useUnsavedChangesGuard(uploading !== null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort(); // leaving while a file is still going up cancels it
    };
  }, []);

  // The limits and the current list come from the server; nothing about them is written in this file.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listDocuments();
      if (cancelled || !alive.current) return;
      if (result.ok) {
        setDocs(result.documents);
        setLimits(result.limits);
        setLoadError(null);
      } else {
        setLoadError(documentErrorMessage(result.code, { status: result.status }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listDocuments, loadAttempt]);

  useEffect(() => {
    if (!focusRequest) return;
    const id =
      focusRequest.kind === "file" ? fileDomId(focusRequest.id) : focusRequest.kind === "remove" ? removeButtonDomId(focusRequest.id) : uploadButtonDomId(focusRequest.slot);
    document.getElementById(id)?.focus();
  }, [focusRequest]);

  const announce = useCallback((text: string) => {
    counter.current += 1;
    setAnnouncement({ text, n: counter.current });
  }, []);

  const setSlotError = useCallback((slot: string, message: string | null) => {
    setSlotErrors((previous) => {
      const next = { ...previous };
      if (message) next[slot] = message;
      else delete next[slot];
      return next;
    });
  }, []);

  const fail = useCallback(
    (slot: string, code: string | undefined, status?: number) => {
      const message = documentErrorMessage(code, { limits, slot, status });
      setSlotError(slot, message);
      announce(message);
      notifyDocumentFailed(message);
    },
    [limits, setSlotError, announce]
  );

  /** Reads the list again, for when the server says it is not what this page thought (for example a full slot). */
  const resync = useCallback(async () => {
    const result = await listDocuments();
    if (alive.current && result.ok) {
      setDocs(result.documents);
      setLimits(result.limits);
    }
  }, [listDocuments]);

  const choose = useCallback(
    async (question: Question, file: File) => {
      const slot = question.slot as string;
      if (!limits || uploading) return;
      setSlotError(slot, null);

      const refused = preCheckFile({ name: file.name, size: file.size, type: file.type }, slot, limits, docs);
      if (refused) {
        fail(slot, refused);
        return;
      }

      const controller = new AbortController();
      abort.current = controller;
      setUploading({ slot, name: file.name });
      announce(`Uploading ${file.name}.`);
      const result = await uploadDocument(slot, file, controller.signal);
      abort.current = null;
      if (!alive.current) return;
      setUploading(null);

      if (result.ok) {
        setDocs((previous) => [...previous, result.document]);
        announce(`${result.document.name} uploaded.`);
        notifyDocumentUploaded();
        counter.current += 1;
        setFocusRequest({ kind: "file", id: result.document.id, n: counter.current });
        void refresh();
        return;
      }
      fail(slot, result.code, result.status);
      if (result.code === "TOO_MANY_FILES" || result.code === "TOTAL_TOO_LARGE" || result.code === "DOCUMENTS_LOCKED") void resync();
    },
    [limits, uploading, docs, uploadDocument, refresh, resync, fail, announce, setSlotError]
  );

  const confirmRemove = useCallback(async () => {
    const doc = pendingRemove;
    setPendingRemove(null);
    if (!doc) return;
    removalPending.current = true;
    setSlotError(doc.slot, null);
    setRemovingId(doc.id);
    const result = await deleteDocument(doc.id);
    removalPending.current = false;
    if (!alive.current) return;
    setRemovingId(null);
    counter.current += 1;
    if (result.ok || result.code === "DOCUMENT_NOT_FOUND") {
      setDocs((previous) => previous.filter((d) => d.id !== doc.id));
      announce(`${doc.name} removed.`);
      notifyDocumentRemoved();
      // The Upload button of this slot stays in place, and a slot that was full has room again now.
      setFocusRequest({ kind: "upload", slot: doc.slot, n: counter.current });
      void refresh();
      return;
    }
    setFocusRequest({ kind: "remove", id: doc.id, n: counter.current });
    fail(doc.slot, result.code, result.status);
    if (result.code === "DOCUMENTS_LOCKED") void resync();
  }, [pendingRemove, deleteDocument, refresh, resync, fail, announce, setSlotError]);

  if (!section) return null;
  const total = docs.reduce((sum, d) => sum + d.size, 0);
  const busy = uploading !== null;

  return (
    <>
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
            Upload a clear scan or photo of each document. Each file is saved the moment it uploads, so there is nothing to save
            here. You can carry on without them and add them later, but you will need at least one file for each before you can
            submit your application.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Results are read out by screen readers without moving focus. */}
          <p key={announcement.n} role="status" aria-live="polite" className="sr-only">
            {announcement.text}
          </p>

          {loadError && (
            <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {loadError}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setLoadAttempt((n) => n + 1)}>
                Try again
              </Button>
            </div>
          )}

          {limits && (
            <p className="text-sm text-muted-foreground">
              {allowedTypesText(limits)} files, up to {formatBytes(limits.maxFileBytes)} each. All your files together can be up to{" "}
              {formatBytes(limits.maxTotalBytes)} ({formatBytes(total)} used).
            </p>
          )}

          {questions.map((question) => {
            const slot = question.slot as string;
            const mine = docs.filter((d) => d.slot === slot);
            const max = limits?.slots[slot]?.max;
            const full = max !== undefined && mine.length >= max;
            const uploadingHere = uploading?.slot === slot;
            const panelId = `field-${question.id}`;
            const error = slotErrors[slot];

            return (
              <section
                key={question.id}
                data-question-id={question.id}
                aria-labelledby={`${panelId}-title`}
                aria-describedby={`${panelId}-hint`}
                className="space-y-3 rounded-lg border border-border p-4"
              >
                <h3 id={`${panelId}-title`} className="text-base font-semibold text-foreground">
                  <span className="mr-2 font-normal text-muted-foreground">{question.number}</span>
                  {question.label}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(at least one file is needed to submit)</span>
                  {previewMode && question.draft && <DraftBadge note={question.draft} />}
                </h3>
                <p id={`${panelId}-hint`} className="text-sm text-muted-foreground">
                  {question.help}
                </p>
                {limits && max !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    {mine.length} of {max} files used
                  </p>
                )}

                {mine.length > 0 ? (
                  <ul aria-label={`Uploaded files for ${question.label}`} className="space-y-2">
                    {mine.map((doc) => (
                      <li
                        key={doc.id}
                        id={fileDomId(doc.id)}
                        tabIndex={-1}
                        className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                          <div className="min-w-0">
                            <p className="break-all text-sm font-medium text-foreground">{doc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {typeLabel(doc.type)} · {formatBytes(doc.size)} · Uploaded {formatUploadedAt(doc.uploadedAt)}
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                          disabled={removingId === doc.id}
                          id={removeButtonDomId(doc.id)}
                          aria-label={`Remove ${doc.name}`}
                          onClick={() => {
                            openedFrom.current = doc.id;
                            setPendingRemove(doc);
                          }}
                        >
                          {removingId === doc.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="mr-2 h-4 w-4" aria-hidden />}
                          {removingId === doc.id ? "Removing..." : "Remove"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
                )}

                {error && (
                  <p id={`${panelId}-error`} role="alert" className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {error}
                  </p>
                )}

                <input
                  ref={(element) => {
                    inputs.current[slot] = element;
                  }}
                  id={`${panelId}-input`}
                  type="file"
                  accept={acceptAttribute(limits)}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = ""; // so the same file can be picked again after a refusal
                    if (file) void choose(question, file);
                  }}
                />
                <Button
                  type="button"
                  id={uploadButtonDomId(slot)}
                  disabled={!limits || busy || full}
                  aria-describedby={error ? `${panelId}-error` : `${panelId}-hint`}
                  onClick={() => inputs.current[slot]?.click()}
                  className="w-full sm:w-auto"
                >
                  {uploadingHere ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Upload className="mr-2 h-4 w-4" aria-hidden />}
                  {uploadingHere ? "Uploading..." : full ? "No more files can be added" : mine.length === 0 ? "Upload a file" : "Add another file"}
                </Button>
                {uploadingHere && <p className="text-xs text-muted-foreground break-all">Uploading {uploading?.name}. Please wait.</p>}
              </section>
            );
          })}
        </CardContent>

        <CardFooter className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="ghost" className="w-full sm:w-auto">
            <Link href={previousId ? `/tourist-visa/${previousId}` : "/tourist-visa"}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              {previousId ? "Back" : "Back to your application"}
            </Link>
          </Button>
          <Button type="button" disabled={busy} onClick={() => router.push("/tourist-visa")} className="w-full sm:w-auto">
            {busy ? "Waiting for the upload..." : "Save and continue"}
          </Button>
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove this file?"
        description={`"${pendingRemove?.name ?? ""}" will be deleted from your application. You can upload it again later.`}
        cancelLabel="Keep file"
        confirmLabel="Remove file"
        tone="destructive"
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => void confirmRemove()}
        onCloseAutoFocus={(event) => {
          // This dialog has no trigger element, so Radix has nothing to return focus to: send it back ourselves.
          // After "Remove file" the focus is placed when the removal has finished (confirmRemove).
          event.preventDefault();
          const from = openedFrom.current;
          openedFrom.current = null;
          if (removalPending.current || !from) return;
          counter.current += 1;
          setFocusRequest({ kind: "remove", id: from, n: counter.current });
        }}
      />

      {/* A file is still going up: leaving would cancel it. */}
      <UnsavedChangesDialog
        {...leaveDialog}
        title="Leave while a file is uploading?"
        description="A file is still being uploaded. If you leave now, the upload is cancelled and the file may not be added."
        stayLabel="Stay on this page"
        leaveLabel="Leave and cancel the upload"
      />
    </>
  );
}
