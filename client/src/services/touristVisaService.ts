/** in_progress is worked out by the server for the documents section (10D) from the uploaded files. */
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
interface ApiBody {
  code?: unknown;
  message?: unknown;
  errors?: unknown;
  data?: {
    application?: TouristVisaApplication;
    needsReview?: string[];
    removed?: string[];
    documents?: TouristVisaDocument[];
    document?: TouristVisaDocument;
    limits?: DocumentLimits;
  };
}

async function request(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
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

function failure(status: number, json: ApiBody | null): TouristVisaApiError {
  if (isFeatureClosed(status, json)) {
    const closed = new TouristVisaApiError(404, NOT_OPEN_MESSAGE);
    closed.closed = true;
    return closed;
  }
  const message = typeof json?.message === "string" && json.message ? json.message : `Request failed with status ${status}`;
  return new TouristVisaApiError(status, message, toFieldErrors(json?.errors), typeof json?.code === "string" ? json.code : undefined);
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

export const touristVisaService = {
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

  /** Delete one uploaded file (only while the application is a draft). */
  async deleteDocument(token: string, docId: string): Promise<void> {
    const { status, json } = await request(`/applications/me/documents/${encodeURIComponent(docId)}`, "DELETE", token);
    if (status < 200 || status >= 300) throw failure(status, json);
  },
};
