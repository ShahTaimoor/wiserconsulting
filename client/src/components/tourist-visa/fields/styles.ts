/** Red border and focus ring when a control is marked invalid (aria-invalid). */
export const invalidClass = "aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus-visible:ring-red-500/20";

/** Native date and month pickers need the dark colour scheme to draw a visible icon in dark mode. */
export const pickerClass = "dark:[color-scheme:dark]";

/** There is no shadcn Select in this project, so native selects are styled to match Input. */
export const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm shadow-black/5 transition-shadow focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 " +
  invalidClass;

export const textareaClass =
  "flex min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm shadow-black/5 transition-shadow placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 " +
  invalidClass;

export const subLabelClass = "mb-1 block text-xs font-medium text-muted-foreground";
export const subErrorClass = "mt-1 text-xs text-red-600 dark:text-red-400";
