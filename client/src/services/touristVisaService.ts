export type SectionState = "saved" | "needs_review";
export type ApplicationStatus = "draft" | "submitted" | "in_review" | "completed";

export interface TouristVisaDocument {
  id: string;
  kind: "passport" | "funds";
  originalName?: string;
  mimetype?: string;
  size?: number;
  uploadedAt?: string;
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
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

/** An API failure with its HTTP status. Status 0 means the server could not be reached. */
export class TouristVisaApiError extends Error {
  status: number;
  /** For a 422: error message per question, keyed "q1_7", "q2_24.line1" or "otherNames.1.q2_3b". */
  fieldErrors?: Record<string, string>;

  constructor(status: number, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "TouristVisaApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
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
  message?: unknown;
  errors?: unknown;
  data?: { application?: TouristVisaApplication; needsReview?: string[]; removed?: string[] };
}

async function request(
  path: string,
  method: "GET" | "POST" | "PUT",
  token: string,
  body?: unknown
): Promise<{ status: number; json: ApiBody | null }> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/tourist-visa${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
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

function failure(status: number, json: ApiBody | null): TouristVisaApiError {
  const message = typeof json?.message === "string" && json.message ? json.message : `Request failed with status ${status}`;
  return new TouristVisaApiError(status, message, toFieldErrors(json?.errors));
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
};
