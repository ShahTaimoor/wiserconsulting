import type { Review } from "../shared/tourist-visa/view.js";
import type { TouristVisaConfig } from "../shared/tourist-visa/engine.js";

/** The statuses an administrator sees. A draft is never one of them. */
export type AdminStatus = "submitted" | "in_review" | "completed";

/** The fixed words an administrator can flag an application with. Never shown to the applicant. */
export type AdminFlag = "needs_call" | "called" | "awaiting_applicant" | "verified" | "concern";

export interface AdminListItem {
  id: string;
  reference: string | null;
  name: string;
  email: string;
  phone: string;
  submittedAt: string | null;
  status: AdminStatus;
  documentCount: number;
  flags: AdminFlag[];
}

export interface AdminList {
  applications: AdminListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminListQuery {
  q?: string;
  status?: AdminStatus | "";
  flag?: AdminFlag | "";
  page?: number;
  pageSize?: number;
}

/** Who to call, and on what number, at the top of the Overview. */
export interface CallBlock {
  name: string;
  phone: { display: string; tel: string };
  email: string;
  preferredLanguage: string;
  contact: Array<{ id: string; label: string; value: string }>;
  reference: string | null;
  submittedAt: string | null;
  status: AdminStatus;
}

/** A file of the application: a name and a size, and the id to ask for a link with. Never a link or a storage id. */
export interface AdminFile {
  id: string;
  slot: string;
  name: string;
  size: number;
  type: string;
}

export interface AdminOverview {
  application: {
    id: string;
    reference: string | null;
    status: AdminStatus;
    submittedAt: string | null;
    configVersion: string;
    allowedMoves: AdminStatus[];
    /** The number an edit must quote. It goes up by one with every correction. */
    revision: number;
    /** Answers can be corrected now (submitted or in review). */
    editable: boolean;
    flags: AdminFlag[];
  };
  call: CallBlock;
  review: Review;
  documents: AdminFile[];
  /** Question id of each file question -> its slot, so a row of files can be matched to its documents. */
  fileSlots: Record<string, string>;
}

export type AuditAction =
  | "list_view"
  | "overview_view"
  | "document_link"
  | "status_change"
  | "edit_open"
  | "changes_preview"
  | "changes_apply"
  | "changes_view"
  | "notes_view"
  | "notes_add"
  | "flags_change"
  | "cover_letter_generate"
  | "cover_letter_view"
  | "cover_letter_edit"
  | "cover_letter_approve"
  | "itinerary_generate"
  | "itinerary_view"
  | "itinerary_edit"
  | "itinerary_approve";

export interface ActivityRow {
  id: string;
  action: AuditAction;
  at: string;
  admin: { id: string; name: string };
  fromStatus?: AdminStatus;
  toStatus?: AdminStatus;
  fromFlags?: AdminFlag[];
  toFlags?: AdminFlag[];
  /** cover_letter_* and itinerary_* rows: which version and how it was made. Never any text. */
  letterVersion?: number;
  letterSource?: LetterSource;
  model?: string;
}

// ---------------------------------------------------------------------------
// Correcting answers (step 8f)
// ---------------------------------------------------------------------------

/** What the Edit forms need: the config the application was submitted under, its decrypted answers and its revision. */
export interface EditForm {
  application: { id: string; reference: string | null; status: AdminStatus; revision: number; configVersion: string };
  config: TouristVisaConfig;
  answers: Record<string, unknown>;
}

/** One change as it is sent: a question (or, without `index`, a whole repeating group) and its new value; null clears. */
export interface AnswerChange {
  questionId: string;
  index?: number;
  value: unknown;
}

/** One line of a preview or of the history: where it is, what it is called, and the old and new value in words. */
export interface ChangeLine {
  sectionId: string;
  sectionTitle: string;
  questionId: string;
  index?: number;
  number: string | null;
  label: string;
  old?: string;
  new?: string;
}

export interface ChangePreview {
  dryRun: true;
  revision: number;
  sections: Array<{ id: string; title: string }>;
  /** Answers that are set or cleared. */
  changes: ChangeLine[];
  /** Answers removed because the change hides them. */
  removed: ChangeLine[];
  /** Questions the change makes necessary, with what was supplied for them. */
  required: ChangeLine[];
}

export interface ChangeRecordView {
  id: string;
  at: string;
  admin: { id: string; name: string };
  revisionBefore: number;
  revisionAfter: number;
  reason: string;
  changes: Array<ChangeLine & { kind: "edited" | "pruned" | "structure" }>;
}

export type NoteKind = "note" | "call";
export type CallOutcome = "reached" | "no_answer" | "wrong_number" | "call_back";

export interface AdminNote {
  id: string;
  at: string;
  kind: NoteKind;
  text: string;
  outcome?: CallOutcome;
  admin: { id: string; name: string };
}

// ---------------------------------------------------------------------------
// The cover letter (step 8g)
// ---------------------------------------------------------------------------

export type LetterSource = "ai" | "template" | "admin";
export type LetterStatus = "draft" | "approved";

/** One version of the letter. The text is for the team only. */
export interface CoverLetterVersion {
  version: number;
  text: string;
  source: LetterSource;
  /** The model's name, for an AI letter. */
  model?: string;
  /** Why a template letter was written when the AI was wanted: a fixed code. */
  fallbackReason?: string;
  createdAt: string;
  createdBy: { id: string; name: string };
  status: LetterStatus;
  approvedAt?: string;
  approvedBy?: { id: string; name: string };
}

export interface CoverLetterView {
  /** Newest first. */
  versions: CoverLetterVersion[];
  latest: number | null;
  /** The answers the letter uses have changed since its newest version. */
  stale: boolean;
  /** Whether the AI would be used for a new version now (code: why not). */
  ai: { available: boolean; code?: string };
  maxLength: number;
  /** Only in the answer to Generate: what was just made. */
  created?: { version: number; source: LetterSource; model?: string; fallbackReason?: string };
}

// ---------------------------------------------------------------------------
// The itinerary: a proposed day-by-day plan, versioned exactly like the cover letter
// ---------------------------------------------------------------------------

/** One version of the itinerary. The text is for the team only. */
export type ItineraryVersion = CoverLetterVersion;

/** Why an itinerary cannot be made yet: the dates. A fixed code and the numbers of the questions to fix ("1.6", "1.7"). */
export interface ItineraryBlocker {
  code: "ITINERARY_DATES_MISSING" | "ITINERARY_DATES_INVALID";
  questions: string[];
}

export interface ItineraryView extends CoverLetterView {
  versions: ItineraryVersion[];
  /** Null when the dates allow an itinerary. */
  blocker: ItineraryBlocker | null;
}
