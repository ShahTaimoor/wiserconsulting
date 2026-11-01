"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, PhoneCall, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { notifyAdminDone, notifyAdminFailed } from "@/components/tourist-visa/notify";
import { touristVisaService } from "@/services/touristVisaService";
import type { AdminNote, CallOutcome } from "@/services/touristVisaAdminTypes";
import { CALL_OUTCOMES, formatWhen, noteState, outcomeLabel } from "@/utils/touristVisaAdmin";

interface AdminNotesPanelProps {
  applicationId: string;
  readToken: () => string | null;
  /** Turns a failure into a sentence (and signs the user out for a 401). */
  fail: (error: unknown) => string;
  announce: (text: string) => void;
  /** Called after a note or a call was recorded, so the activity can be refreshed. */
  onRecorded: () => void;
}

const textareaClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Notes and the call log of one application, for the team only. Entries are added and never edited or removed.
 * Reading them and adding one are recorded in the activity log by the server.
 */
export function AdminNotesPanel({ applicationId, readToken, fail, announce, onRecorded }: AdminNotesPanelProps) {
  const [notes, setNotes] = useState<AdminNote[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [callText, setCallText] = useState("");
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [saving, setSaving] = useState<"note" | "call" | null>(null);
  const alive = useRef(true);
  const started = useRef<string | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Read the notes once for each visit: the server records each read (React strict mode runs effects twice in development).
  useEffect(() => {
    const key = `${applicationId}:${attempt}`;
    if (started.current === key) return;
    started.current = key;
    const token = readToken();
    if (!token) return;
    setLoadError(false);
    void (async () => {
      try {
        const rows = await touristVisaService.adminNotes(token, applicationId);
        if (alive.current) setNotes(rows);
      } catch (e) {
        fail(e);
        if (alive.current) setLoadError(true);
      }
    })();
  }, [applicationId, attempt, readToken, fail]);

  const record = useCallback(
    async (kind: "note" | "call") => {
      const token = readToken();
      if (!token || saving) return;
      setSaving(kind);
      try {
        const entry = await touristVisaService.adminAddNote(
          token,
          applicationId,
          kind === "note" ? { kind, text: noteText.trim() } : { kind, outcome: outcome as CallOutcome, ...(callText.trim() ? { text: callText.trim() } : {}) }
        );
        if (!alive.current) return;
        setNotes((previous) => [entry, ...(previous ?? [])]);
        if (kind === "note") setNoteText("");
        else {
          setCallText("");
          setOutcome(null);
        }
        const text = kind === "note" ? "Note added." : "Call logged.";
        notifyAdminDone(text);
        announce(text);
        onRecorded();
      } catch (e) {
        if (!alive.current) return;
        const message = fail(e);
        notifyAdminFailed(message);
        announce(message);
      } finally {
        if (alive.current) setSaving(null);
      }
    },
    [readToken, saving, applicationId, noteText, callText, outcome, fail, announce, onRecorded]
  );

  const noteCheck = noteState(noteText, true);
  const callCheck = noteState(callText, false);

  return (
    <section id="notes" aria-labelledby="notes-heading" className="scroll-mt-20 rounded-lg border border-border bg-card p-4 text-card-foreground sm:p-6">
      <h2 id="notes-heading" className="text-lg font-semibold text-foreground">
        Notes and calls
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">For the team only. Entries cannot be edited or removed, and the applicant never sees them.</p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (noteCheck.valid) void record("note");
          }}
          className="space-y-2"
        >
          <label htmlFor="tv-note-text" className="flex items-center gap-2 text-sm font-medium text-foreground">
            <StickyNote className="h-4 w-4" aria-hidden />
            Add a note
          </label>
          <textarea id="tv-note-text" rows={4} value={noteText} onChange={(event) => setNoteText(event.target.value)} aria-describedby="tv-note-count" className={textareaClass} disabled={saving !== null} />
          <p id="tv-note-count" className={`text-xs ${noteText.length > 0 && !noteCheck.valid ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>
            {noteText.length > 0 && !noteCheck.valid ? `${noteCheck.message} ` : ""}
            {noteCheck.counter} characters
          </p>
          <Button type="submit" disabled={!noteCheck.valid || saving !== null} className="min-h-11 w-full sm:w-auto">
            {saving === "note" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Add note
          </Button>
        </form>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (outcome && callCheck.valid) void record("call");
          }}
          className="space-y-2"
        >
          <fieldset className="min-w-0 space-y-2 border-0 p-0">
            <legend className="mb-1 flex items-center gap-2 p-0 text-sm font-medium text-foreground">
              <PhoneCall className="h-4 w-4" aria-hidden />
              Log a call
            </legend>
            <div role="group" aria-label="How did the call go?" className="flex flex-wrap gap-2">
              {CALL_OUTCOMES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={outcome === value}
                  disabled={saving !== null}
                  onClick={() => setOutcome(value)}
                  className={`min-h-11 rounded-md px-3 text-sm font-medium ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    outcome === value ? "bg-primary text-primary-foreground ring-primary" : "bg-background text-foreground ring-border hover:bg-muted"
                  }`}
                >
                  {outcomeLabel(value)}
                </button>
              ))}
            </div>
            <label htmlFor="tv-call-text" className="block text-sm text-muted-foreground">
              What was said (optional)
            </label>
            <textarea id="tv-call-text" rows={3} value={callText} onChange={(event) => setCallText(event.target.value)} aria-describedby="tv-call-count" className={textareaClass} disabled={saving !== null} />
            <p id="tv-call-count" className={`text-xs ${!callCheck.valid ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>
              {!callCheck.valid ? `${callCheck.message} ` : ""}
              {callCheck.counter} characters
            </p>
          </fieldset>
          <Button type="submit" disabled={!outcome || !callCheck.valid || saving !== null} className="min-h-11 w-full sm:w-auto">
            {saving === "call" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Log call
          </Button>
          {!outcome && <p className="text-xs text-muted-foreground">Choose how the call went first.</p>}
        </form>
      </div>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Newest first</h3>
      {loadError ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          The notes could not be loaded.{" "}
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      ) : notes === null ? (
        <Skeleton className="mt-2 h-12 w-full" aria-label="Loading the notes" />
      ) : notes.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No notes or calls yet.</p>
      ) : (
        <ol className="mt-2 divide-y divide-border text-sm">
          {notes.map((note) => (
            <li key={note.id} className="space-y-1 py-3" data-testid="note-entry">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <p className="min-w-0 break-words font-medium text-foreground">
                  {note.kind === "call" ? `Call: ${note.outcome ? outcomeLabel(note.outcome) : ""}` : "Note"}
                  <span className="font-normal text-muted-foreground"> by {note.admin.name || "an administrator"}</span>
                </p>
                <time dateTime={note.at} className="shrink-0 text-xs text-muted-foreground">
                  {formatWhen(note.at)}
                </time>
              </div>
              {note.text && <p className="whitespace-pre-wrap break-words text-foreground">{note.text}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
