"use client";

import type { AdminFlag } from "@/services/touristVisaAdminTypes";
import { ADMIN_FLAGS, flagLabel } from "@/utils/touristVisaAdmin";

// Every flag has words as well as a colour, so the meaning never depends on colour alone.
const TONES: Record<AdminFlag, string> = {
  needs_call: "bg-amber-100 text-amber-900 ring-amber-600/30 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30",
  called: "bg-sky-100 text-sky-900 ring-sky-600/30 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-400/30",
  awaiting_applicant: "bg-violet-100 text-violet-900 ring-violet-600/30 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-400/30",
  verified: "bg-emerald-100 text-emerald-900 ring-emerald-600/30 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/30",
  concern: "bg-red-100 text-red-900 ring-red-600/30 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-400/30",
};

/** The flags of an application as small read-only labels (the list shows these). Admin pages only. */
export function AdminFlagChips({ flags }: { flags: AdminFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Flags">
      {flags.map((flag) => (
        <li key={flag} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONES[flag]}`}>
          {flagLabel(flag)}
        </li>
      ))}
    </ul>
  );
}

interface AdminFlagsEditorProps {
  flags: AdminFlag[];
  busy: boolean;
  onToggle: (flag: AdminFlag) => void;
}

/** The five flags as toggle buttons. Pressing one saves at once. The applicant never sees any of them. */
export function AdminFlagsEditor({ flags, busy, onToggle }: AdminFlagsEditorProps) {
  return (
    <div role="group" aria-labelledby="flags-heading" className="mt-6 border-t border-border pt-4">
      <h2 id="flags-heading" className="text-sm font-semibold text-foreground">
        Flags
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">For the team only. The applicant never sees these.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ADMIN_FLAGS.map((flag) => {
          const on = flags.includes(flag);
          return (
            <button
              key={flag}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => onToggle(flag)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
                on ? TONES[flag] : "bg-background text-foreground ring-border hover:bg-muted"
              }`}
            >
              <span aria-hidden className={`h-2 w-2 rounded-full ${on ? "bg-current" : "border border-current"}`} />
              {flagLabel(flag)}
              <span className="sr-only">{on ? " (on)" : " (off)"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
