/** in_progress is worked out by the server for the documents section (10D) from the uploaded files. */
import type { Review } from "../shared/tourist-visa/view.js";
import type {
  ActivityRow,
  AdminFlag,
  CoverLetterView,
  ItineraryView,
  AdminList,
  AdminListQuery,
  AdminNote,
  AdminOverview,
  AdminStatus,
  AnswerChange,
  CallOutcome,
  ChangePreview,
  ChangeRecordView,
  EditForm,
  NoteKind,
} from "./touristVisaAdminTypes";

export type SectionState = "saved" | "needs_review" | "in_progress";
export type ApplicationStatus = "draft" | "submitted" | "in_review" | "completed";

/** An uploaded file, as the server describes it to its owner: no link, no storage id. */
export interface TouristVisaDocument {
  id: string;
  /** Which file question it belongs to: "passport" (10.6) or "funds" (10.7). */
  slot: string;
  /** The name of the file as it was uploaded (cleaned by the server). */
  name: string;
  /** Size in bytes. */
  size: number;
  /** "application/pdf", "image/jpeg" or "image/png", worked out from the file's content. */
  type: string;
  uploadedAt: string;
}

/** One section that stops a submit, and how many things in it need attention. Never an answer. */
export interface SubmitProblem {
  id: string;
  problems: number;
}

/** The applicant's application as a readable review (built on the server by the shared view builder). */
export interface ReviewData {
  review: Review;
  status: ApplicationStatus;
  reference: string | null;
  submittedAt: string | null;
  configVersion: string;
  documentsComplete: boolean;
  /** The final declaration: the wording as the server holds it, and when it was accepted (null for a draft). */
  declaration: { text: string; acceptedAt: string | null };
}

/** What the server allows, sent with the list of files so nothing is hard-coded here. */
export interface DocumentLimits {
  maxFileBytes: number;
  maxTotalBytes: number;
  allowedTypes: string[];
  slots: Record<string, { max: number }>;
}

export interface TouristVisaApplication {
  id: string;
  visaType: "tourist";
  status: ApplicationStatus;
  currentSection: string;
  configVersion: string;
  /** Section id -> state. A section that is not listed has not been saved yet. */
  sectionStatus: Record<string, SectionState>;
  /** Answers by question id, already decrypted by the server for their owner. */
  answers: Record<string, unknown>;
  documents: TouristVisaDocument[];
  /** True when every file question has at least one file (the rule for submitting). */
  documentsComplete: boolean;
  submittedAt: string | null;
  /** Given when the application is submitted (such as TV-K7M2QX9P); null before. */
  reference: string | null;
  createdAt: string;
  updatedAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

/** The code the server puts on its fixed answer while the Tourist Visa API is switched off. */
export const FEATURE_CLOSED_CODE = "FEATURE_CLOSED";

/** What the applicant is told when the application is not open, whichever side says so. */
export const NOT_OPEN_MESSAGE =
  "The Tourist Visa application isn't open yet. We're still finalising the questions. Please check back soon.";

/** An API failure with its HTTP status. Status 0 means the server could not be reached. */
export class TouristVisaApiError extends Error {
  status: number;
  /** The server's machine-readable error name (for example "DOCUMENTS_LOCKED"), when it sent one. */
  code?: string;
  /** For a 422 NOT_READY from a submit: the sections that need attention and how many things each has. */
  sections?: SubmitProblem[];
  /** For a 422 NOT_READY from a submit: the final declaration was not accepted. */
  declarationMissing?: boolean;
  /** True when the server answered with its closed-switch response (404 + FEATURE_CLOSED). */
  closed = false;
  /** For a 422: error message per question, keyed "q1_7", "q2_24.line1" or "otherNames.1.q2_3b". */
  fieldErrors?: Record<string, string>;

  constructor(status: number, message: string, fieldErrors?: Record<string, string>, code?: string) {
    super(message);
    this.name = "TouristVisaApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.code = code;
  }
}

export interface SaveSectionResult {
  application: TouristVisaApplication;
  /** Other sections that now need another look because of this change. */
  needsReview: string[];
  /** Question ids whose stored answers were removed because they are now hidden. */
  removed: string[];
}

/** The parts of the API's JSON envelope this service reads. */
export interface ApiBody {
  code?: unknown;
  message?: unknown;
  errors?: unknown;
  sections?: unknown;
  declarationMissing?: unknown;
  data?: Partial<ReviewData> & {
    reference?: string;
    application?: TouristVisaApplication;
    needsReview?: string[];
    removed?: string[];
    documents?: TouristVisaDocument[];
    document?: TouristVisaDocument;
    limits?: DocumentLimits;
  };
}

export async function request(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  token: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<{ status: number; json: ApiBody | null }> {
  let response: Response;
  // A FormData body (a file upload) is sent as it is: the browser adds the multipart header with its boundary.
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  try {
    response = await fetch(`${API_URL}/tourist-visa${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch {
    throw new TouristVisaApiError(0, "Unable to reach the server.");
  }

  let json: ApiBody | null = null;
  try {
    json = (await response.json()) as ApiBody;
  } catch {
    // No JSON body (for example a gateway error page).
  }
  return { status: response.status, json };
}

/**
 * The server's closed-switch answer: exactly a 404 whose JSON code is FEATURE_CLOSED. It is a 404
 * like the API's own "you have not started an application yet", so it has to be told apart by
 * its code, and it has to be checked first.
 */
export function isFeatureClosed(status: number, json: { code?: unknown } | null): boolean {
  return status === 404 && json !== null && typeof json === "object" && json.code === FEATURE_CLOSED_CODE;
}

export function failure(status: number, json: ApiBody | null): TouristVisaApiError {
  if (isFeatureClosed(status, json)) {
    const closed = new TouristVisaApiError(404, NOT_OPEN_MESSAGE);
    closed.closed = true;
    return closed;
  }
  const message = typeof json?.message === "string" && json.message ? json.message : `Request failed with status ${status}`;
  const error = new TouristVisaApiError(status, message, toFieldErrors(json?.errors), typeof json?.code === "string" ? json.code : undefined);
  const sections = toSubmitProblems(json?.sections);
  if (sections) error.sections = sections;
  if (typeof json?.declarationMissing === "boolean") error.declarationMissing = json.declarationMissing;
  return error;
}

/** Keeps only { id, problems } pairs of the right kind, so nothing unexpected from the server reaches the page. */
function toSubmitProblems(value: unknown): SubmitProblem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const kept: SubmitProblem[] = [];
  for (const item of value) {
    if (typeof item === "object" && item !== null && typeof (item as SubmitProblem).id === "string" && Number.isInteger((item as SubmitProblem).problems)) {
      kept.push({ id: (item as SubmitProblem).id, problems: (item as SubmitProblem).problems });
    }
  }
  return kept;
}

/** Keeps only string messages, so nothing unexpected from the server reaches the form. */
function toFieldErrors(errors: unknown): Record<string, string> | undefined {
  if (typeof errors !== "object" || errors === null || Array.isArray(errors)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(errors)) {
    if (typeof value === "string") result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function requireApplication(json: ApiBody | null): TouristVisaApplication {
  const application = json?.data?.application;
  if (!application) throw new TouristVisaApiError(502, "The server sent an unexpected response.");
  return application;
}

/** A message that is safe and clear to show to the applicant. */
export function describeError(error: unknown): string {
  if (error instanceof TouristVisaApiError) {
    if (error.closed) return NOT_OPEN_MESSAGE;
    if (error.status === 0) return "We couldn't reach the server. Check your internet connection and try again.";
    if (error.status === 503) {
      return "The Tourist Visa application is temporarily unavailable. This is a problem on our side, not with your details. Please try again later or contact us.";
    }
    if (error.status === 429) return "Too many requests. Please wait a few minutes and try again.";
    if (error.status >= 500) return "Something went wrong on our side. Please try again in a moment.";
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

/** Plain query text for the list: only what is set, the search text trimmed. */
export function listQueryString(query: AdminListQuery): string {
  const params = new URLSearchParams();
  const q = (query.q ?? "").trim();
  if (q) params.set("q", q);
  if (query.status) params.set("status", query.status);
  if (query.flag) params.set("flag", query.flag);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/**
 * Asks the server whether the Tourist Visa feature is open: GET /tourist-visa/status. No token is sent (it needs none, and
 * answers while the feature is closed). Never cached by the browser: the in-memory checker keeps the answer for a short while.
 * Rejects on a network error or when aborted; the caller (utils/touristVisaOpen.ts) treats that as "closed".
 */
export async function fetchServerStatus(signal?: AbortSignal): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${API_URL}/tourist-visa/status`, { method: "GET", cache: "no-store", signal });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // No JSON body: the answer is then "closed".
  }
  return { status: response.status, json };
}

/** One cover letter call: the answer is the letter's view, or a failure with the server's code. */
async function coverLetterCall(path: string, method: "GET" | "POST" | "PUT", token: string, body?: unknown): Promise<CoverLetterView> {
  const { status, json } = await request(path, method, token, body);
  if (status < 200 || status >= 300) throw failure(status, json);
  const data = json?.data as unknown as CoverLetterView | undefined;
  if (!data || !Array.isArray(data.versions) || typeof data.stale !== "boolean") throw new TouristVisaApiError(502, "The server sent an unexpected response.");
  return data;
}

/** One itinerary call: the answer is the itinerary's view (with `blocker`), or a failure with the server's code. */
async function itineraryCall(path: string, method: "GET" | "POST" | "PUT", token: string, body?: unknown): Promise<ItineraryView> {
  const { status, json } = await request(path, method, token, body);
  if (status < 200 || status >= 300) throw failure(status, json);
  const data = json?.data as unknown as ItineraryView | undefined;
  if (!data || !Array.isArray(data.versions) || typeof data.stale !== "boolean") throw new TouristVisaApiError(502, "The server sent an unexpected response.");
  return { ...data, blocker: data.blocker ?? null };
}

/**
 * A PDF call: the file as a Blob, or a failure with the server's code. The file is made in memory on the server and only ever
 * held in memory here until it is saved; nothing is cached (no-store both ways).
 */
async function pdfCall(path: string, token: string, signal?: AbortSignal): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/tourist-visa${path}`, { method: "GET", headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
  } catch {
    throw new TouristVisaApiError(0, "Unable to reach the server.");
  }
  // (The same check as isPdfContentType in utils/touristVisaPdf.ts, kept here so this file has no value imports.)
  const isPdf = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() === "application/pdf";
  if (response.ok && isPdf) return response.blob();
  if (response.ok) throw new TouristVisaApiError(502, "The server did not send a PDF.", undefined, "NOT_A_PDF");
  let json: ApiBody | null = null;
  try {
    json = (await response.json()) as ApiBody;
  } catch {
    // No JSON body (for example a gateway error page).
  }
  throw failure(response.status, json);
}

export const touristVisaService = {
  /** The application summary PDF of any submitted application (the team only). Recorded in the activity log by the server. */
  adminAnswersPdf(token: string, id: string, signal?: AbortSignal): Promise<Blob> {
    return pdfCall(`/admin/applications/${encodeURIComponent(id)}/pdf/answers`, token, signal);
  },

  /** The newest version of the cover letter as a PDF (the team only); a version that is not approved is marked as a draft by the server. */
  adminCoverLetterPdf(token: string, id: string, signal?: AbortSignal): Promise<Blob> {
    return pdfCall(`/admin/applications/${encodeURIComponent(id)}/pdf/cover-letter`, token, signal);
  },

  /** The newest version of the itinerary as a PDF (the team only); a version that is not approved is marked as a draft by the server. */
  adminItineraryPdf(token: string, id: string, signal?: AbortSignal): Promise<Blob> {
    return pdfCall(`/admin/applications/${encodeURIComponent(id)}/pdf/itinerary`, token, signal);
  },

  /** The applicant's own copy of the application summary, once it is submitted. */
  myAnswersPdf(token: string, signal?: AbortSignal): Promise<Blob> {
    return pdfCall("/applications/me/pdf/answers", token, signal);
  },

  /** The signed-in user's application, or null if they have not started one (the server answers 404). */
  async getMyApplication(token: string): Promise<TouristVisaApplication | null> {
    const { status, json } = await request("/applications/me", "GET", token);
    // The closed-switch 404 is not "not started": check it first.
    if (isFeatureClosed(status, json)) throw failure(status, json);
    // Only the API's own JSON 404 means "not started". A bare 404 (wrong API address,
    // backend without this route) is a real error and must not look like a fresh start.
    if (status === 404 && json) return null;
    if (status < 200 || status >= 300) throw failure(status, json);
    return requireApplication(json);
  },

  /** Start an application, or get back the one that already exists. */
  async startApplication(token: string): Promise<{ application: TouristVisaApplication; created: boolean }> {
    const { status, json } = await request("/applications", "POST", token);
    if (status < 200 || status >= 300) throw failure(status, json);
    return { application: requireApplication(json), created: status === 201 };
  },

  /**
   * Save one section ("Save and continue"). `answers` is the complete new state of the section.
   * A 422 throws a TouristVisaApiError whose fieldErrors say what to fix and where.
   * The answers are only ever sent to the server; they are never logged or stored by this service.
   */
  async saveSection(token: string, sectionId: string, answers: Record<string, unknown>): Promise<SaveSectionResult> {
    const { status, json } = await request(`/applications/me/sections/${encodeURIComponent(sectionId)}`, "PUT", token, { answers });
    if (status < 200 || status >= 300) throw failure(status, json);
    return {
      application: requireApplication(json),
      needsReview: Array.isArray(json?.data?.needsReview) ? json.data.needsReview : [],
      removed: Array.isArray(json?.data?.removed) ? json.data.removed : [],
    };
  },

  /** The applicant's uploaded files (metadata only) and the limits the server enforces. */
  async listDocuments(token: string): Promise<{ documents: TouristVisaDocument[]; limits: DocumentLimits }> {
    const { status, json } = await request("/applications/me/documents", "GET", token);
    if (status < 200 || status >= 300) throw failure(status, json);
    const documents = json?.data?.documents;
    const limits = json?.data?.limits;
    if (!Array.isArray(documents) || !limits) throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return { documents, limits };
  },

  /**
   * Upload one file into a slot ("passport" or "funds"). One file per request. The server checks the
   * file's content, size and the limits and is the authority; a refusal throws a TouristVisaApiError
   * whose `code` says why. Pass a signal to cancel an upload that is still going.
   */
  async uploadDocument(token: string, slot: string, file: File, signal?: AbortSignal): Promise<TouristVisaDocument> {
    const form = new FormData();
    form.append("slot", slot);
    form.append("file", file, file.name);
    const { status, json } = await request("/applications/me/documents", "POST", token, form, signal);
    if (status < 200 || status >= 300) throw failure(status, json);
    const document = json?.data?.document;
    if (!document) throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return document;
  },

  /** The applicant's application as a readable review (the live config for a draft, the submitted-under config once submitted). */
  async getReview(token: string): Promise<ReviewData> {
    const { status, json } = await request("/applications/me/review", "GET", token);
    if (status < 200 || status >= 300) throw failure(status, json);
    const data = json?.data;
    if (!data?.review || !data.declaration || typeof data.status !== "string") throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return data as ReviewData;
  },

  /**
   * Submit the draft. The server checks everything again and answers 422 (a TouristVisaApiError with
   * `sections` and `declarationMissing`) when something is not ready, or 409 with the code ALREADY_SUBMITTED.
   */
  async submitApplication(token: string, declarationAccepted: boolean): Promise<{ application: TouristVisaApplication; reference: string }> {
    const { status, json } = await request("/applications/me/submit", "POST", token, { declarationAccepted });
    if (status < 200 || status >= 300) throw failure(status, json);
    const reference = json?.data?.reference;
    if (typeof reference !== "string") throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return { application: requireApplication(json), reference };
  },

  /** Delete one uploaded file (only while the application is a draft). */
  async deleteDocument(token: string, docId: string): Promise<void> {
    const { status, json } = await request(`/applications/me/documents/${encodeURIComponent(docId)}`, "DELETE", token);
    if (status < 200 || status >= 300) throw failure(status, json);
  },

  /**
   * The exchange rates for the currency helper (units of a currency per 1 GBP). Returns the route's `data` as it came; the
   * caller checks it (readRatesAnswer) and treats any failure as "unavailable". Nothing about the user is sent but the sign-in token.
   */
  async getRates(token: string): Promise<unknown> {
    const { status, json } = await request("/rates", "GET", token);
    if (status < 200 || status >= 300) throw failure(status, json);
    return json?.data;
  },

  // -------------------------------------------------------------------------
  // The administrator's side (read only, plus the status). The server checks the role on every call.
  // -------------------------------------------------------------------------

  async adminList(token: string, query: AdminListQuery = {}): Promise<AdminList> {
    const { status, json } = await request(`/admin/applications${listQueryString(query)}`, "GET", token);
    if (status < 200 || status >= 300) throw failure(status, json);
    const data = json?.data as unknown as AdminList | undefined;
    if (!data || !Array.isArray(data.applications)) throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return data;
  },

  async adminOverview(token: string, id: string): Promise<AdminOverview> {
    const { status, json } = await request(`/admin/applications/${encodeURIComponent(id)}`, "GET", token);
    if (status < 200 || status >= 300) throw failure(status, json);
    const data = json?.data as unknown as AdminOverview | undefined;
    if (!data || !data.review || !data.call || !data.application) throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return data;
  },

  /** A signed link to one file, valid for 2 minutes. The only place a link reaches the browser. */
  async adminDocumentLink(token: string, id: string, docId: string): Promise<{ url: string; expiresAt: string }> {
    const { status, json } = await request(`/admin/applications/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}/link`, "GET", token);
    if (status < 200 || status >= 300) throw failure(status, json);
    const data = json?.data as unknown as { url?: unknown; expiresAt?: unknown } | undefined;
    if (!data || typeof data.url !== "string" || typeof data.expiresAt !== "string") throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return { url: data.url, expiresAt: data.expiresAt };
  },

  async adminSetStatus(token: string, id: string, to: AdminStatus): Promise<{ status: AdminStatus; allowedMoves: AdminStatus[] }> {
    const { status, json } = await request(`/admin/applications/${encodeURIComponent(id)}/status`, "PATCH", token, { status: to });
    if (status < 200 || status >= 300) throw failure(status, json);
    const data = json?.data as unknown as { status?: AdminStatus; allowedMoves?: AdminStatus[] } | undefined;
    if (!data || typeof data.status !== "string" || !Array.isArray(data.allowedMoves)) throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return { status: data.status, allowedMoves: data.allowedMoves };
  },

  async adminActivity(token: string, id: string): Promise<ActivityRow[]> {
    const { status, json } = await request(`/admin/applications/${encodeURIComponent(id)}/activity`, "GET", token);
    if (status < 200 || status >= 300) throw failure(status, json);
    const data = json?.data as unknown as { activity?: ActivityRow[] } | undefined;
    if (!data || !Array.isArray(data.activity)) throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return data.activity;
  },

  // -------------------------------------------------------------------------
  // Correcting answers, notes, calls and flags (step 8f)
  // -------------------------------------------------------------------------

  /** The config the application was submitted under, its decrypted answers and its revision, for the Edit forms. */
  async adminEditForm(token: string, id: string): Promise<EditForm> {
    const { status, json } = await request(`/admin/applications/${encodeURIComponent(id)}/edit-form`, "GET", token);
    if (status < 200 || status >= 300) throw failure(status, json);
    const data = json?.data as unknown as EditForm | undefined;
    if (!data || !data.config || !data.answers || !data.application || !Number.isInteger(data.application.revision)) throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return data;
  },

  /** A dry run: everything is checked and described, nothing is changed. A 422 carries `sections` and `fieldErrors`. */
  async adminPreviewChanges(token: string, id: string, body: { expectedRevision: number; changes: AnswerChange[] }): Promise<ChangePreview> {
    const { status, json } = await request(`/admin/applications/${encodeURIComponent(id)}/changes`, "PUT", token, { ...body, dryRun: true });
    if (status < 200 || status >= 300) throw failure(status, json);
    const data = json?.data as unknown as ChangePreview | undefined;
    if (!data || data.dryRun !== true || !Array.isArray(data.changes) || !Array.isArray(data.removed) || !Array.isArray(data.required)) throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return data;
  },

  /** The real correction, in one transaction on the server. `reason` is 10 to 1000 characters. */
  async adminApplyChanges(token: string, id: string, body: { expectedRevision: number; reason: string; changes: AnswerChange[] }): Promise<{ revision: number; applied: number }> {
    const { status, json } = await request(`/admin/applications/${encodeURIComponent(id)}/changes`, "PUT", token, body);
    if (status < 200 || status >= 300) throw failure(status, json);
    const data = json?.data as unknown as { revision?: unknown; applied?: unknown } | undefined;
    if (!data || !Number.isInteger(data.revision) || !Number.isInteger(data.applied)) throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return { revision: data.revision as number, applied: data.applied as number };
  },

  /** The corrections made so far, newest first, with the reason and the old and new values. */
  async adminChanges(token: string, id: string): Promise<ChangeRecordView[]> {
    const { status, json } = await request(`/admin/applications/${encodeURIComponent(id)}/changes`, "GET", token);
    if (status < 200 || status >= 300) throw failure(status, json);
    const data = json?.data as unknown as { history?: ChangeRecordView[] } | undefined;
    if (!data || !Array.isArray(data.history)) throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return data.history;
  },

  async adminNotes(token: string, id: string): Promise<AdminNote[]> {
    const { status, json } = await request(`/admin/applications/${encodeURIComponent(id)}/notes`, "GET", token);
    if (status < 200 || status >= 300) throw failure(status, json);
    const data = json?.data as unknown as { notes?: AdminNote[] } | undefined;
    if (!data || !Array.isArray(data.notes)) throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return data.notes;
  },

  /** Adds a note ({ kind: "note", text }) or a call ({ kind: "call", outcome, text? }). Returns the new entry. */
  async adminAddNote(token: string, id: string, body: { kind: NoteKind; text?: string; outcome?: CallOutcome }): Promise<AdminNote> {
    const { status, json } = await request(`/admin/applications/${encodeURIComponent(id)}/notes`, "POST", token, body);
    if (status < 200 || status >= 300) throw failure(status, json);
    const data = json?.data as unknown as { note?: AdminNote } | undefined;
    if (!data || !data.note || typeof data.note.id !== "string") throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return data.note;
  },

  /** The cover letter and its versions (the team only). Recorded in the activity log by the server. */
  async adminCoverLetter(token: string, id: string): Promise<CoverLetterView> {
    return coverLetterCall(`/admin/applications/${encodeURIComponent(id)}/cover-letter`, "GET", token);
  },

  /** Writes a new version, by the AI or (when it is off or fails) by the template. */
  async adminGenerateCoverLetter(token: string, id: string): Promise<CoverLetterView> {
    return coverLetterCall(`/admin/applications/${encodeURIComponent(id)}/cover-letter/generate`, "POST", token);
  },

  /** Saves the administrator's text as a new version. `basedOnVersion` is the version it started from. */
  async adminSaveCoverLetter(token: string, id: string, body: { text: string; basedOnVersion: number }): Promise<CoverLetterView> {
    return coverLetterCall(`/admin/applications/${encodeURIComponent(id)}/cover-letter`, "PUT", token, body);
  },

  /** Approves the newest version. `version` must be the newest one. */
  async adminApproveCoverLetter(token: string, id: string, version: number): Promise<CoverLetterView> {
    return coverLetterCall(`/admin/applications/${encodeURIComponent(id)}/cover-letter/approve`, "POST", token, { version });
  },

  /** The itinerary (a proposed plan) and its versions (the team only). Recorded in the activity log by the server. */
  async adminItinerary(token: string, id: string): Promise<ItineraryView> {
    return itineraryCall(`/admin/applications/${encodeURIComponent(id)}/itinerary`, "GET", token);
  },

  /** Writes a new version, by the AI or (when it is off or fails) by the template. */
  async adminGenerateItinerary(token: string, id: string): Promise<ItineraryView> {
    return itineraryCall(`/admin/applications/${encodeURIComponent(id)}/itinerary/generate`, "POST", token);
  },

  /** Saves the administrator's text as a new version. `basedOnVersion` is the version it started from. */
  async adminSaveItinerary(token: string, id: string, body: { text: string; basedOnVersion: number }): Promise<ItineraryView> {
    return itineraryCall(`/admin/applications/${encodeURIComponent(id)}/itinerary`, "PUT", token, body);
  },

  /** Approves the newest version. `version` must be the newest one. */
  async adminApproveItinerary(token: string, id: string, version: number): Promise<ItineraryView> {
    return itineraryCall(`/admin/applications/${encodeURIComponent(id)}/itinerary/approve`, "POST", token, { version });
  },

  /** Replaces the flags. Returns the flags as stored (always in the fixed order). */
  async adminSetFlags(token: string, id: string, flags: AdminFlag[]): Promise<AdminFlag[]> {
    const { status, json } = await request(`/admin/applications/${encodeURIComponent(id)}/flags`, "PUT", token, { flags });
    if (status < 200 || status >= 300) throw failure(status, json);
    const data = json?.data as unknown as { flags?: AdminFlag[] } | undefined;
    if (!data || !Array.isArray(data.flags)) throw new TouristVisaApiError(502, "The server sent an unexpected response.");
    return data.flags;
  },
};
