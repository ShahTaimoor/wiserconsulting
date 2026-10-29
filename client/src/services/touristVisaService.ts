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

  constructor(status: number, message: string) {
    super(message);
    this.name = "TouristVisaApiError";
    this.status = status;
  }
}

/** The parts of the API's JSON envelope this service reads. */
interface ApiBody {
  message?: unknown;
  data?: { application?: TouristVisaApplication };
}

async function request(path: string, method: "GET" | "POST", token: string): Promise<{ status: number; json: ApiBody | null }> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/tourist-visa${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
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
  return new TouristVisaApiError(status, message);
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
};
