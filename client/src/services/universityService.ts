export interface University {
  _id: string;
  name: string;
  country: string;
  city: string;
  website: string;
  applyUrl: string;
  fields: string[];
  minFscPercent: number | null;
  minIelts: number | null;
  minToefl: number | null;
  minPte: number | null;
  minDuolingo: number | null;
  minOxford: number | null;
  tuitionPerYear: string;
  scholarshipAvailable: boolean;
  scholarshipName: string;
  scholarshipPercent: number | null;
  scholarshipMinFscPercent: number | null;
  scholarshipMinIelts: number | null;
  scholarshipDetails: string;
  scholarshipUrl: string;
  applyDeadline: string;
  applyDocuments: string[];
  applySteps: string[];
  notes: string;
  needsVerification: boolean;
  requirementsUnknown: boolean;
  isActive: boolean;
}

/** What the form sends: every number may be left empty. */
export type UniversityInput = Omit<University, "_id">;

export type TestKey = "ielts" | "toefl" | "pte" | "duolingo" | "oxford";

export interface MatchRequest {
  fscPercent: number;
  tests: Partial<Record<TestKey, number | null>>;
  country?: string;
  field?: string;
  includeNotEligible?: boolean;
  includeUnknown?: boolean;
}

export type MatchStatus = "eligible" | "needs_test" | "close" | "check_official" | "not_eligible";

export interface CountryCount {
  country: string;
  total: number;
  ready: number;
}

export interface LoadPart {
  added: number;
  skipped: number;
  total: number;
  next: number;
  done: boolean;
}

export interface MatchResult {
  university: University;
  status: MatchStatus;
  reasons: string[];
  scholarship: {
    available: boolean;
    qualifies: boolean;
    needsIelts?: boolean;
    name?: string;
    percent?: number | null;
    details?: string;
    url?: string;
    minFscPercent?: number | null;
    minIelts?: number | null;
  };
  options: { withoutScholarship: boolean; withScholarship: boolean };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One request. When the server cannot be reached at all (it is restarting, or the connection dropped) a request that is safe to
 * repeat is tried again twice, then the error says so in plain words instead of the browser's "Failed to fetch".
 * Adding or editing one university is not repeated, so nothing can be saved twice.
 */
async function call<T>(path: string, token: string, method = "GET", body?: unknown, repeatable = method === "GET"): Promise<T> {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(`${API_URL}/universities${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      break;
    } catch {
      if (!repeatable || attempt === 2) throw new Error("Cannot reach the server. Check that the backend is running and try again.");
      await wait(1200 * (attempt + 1));
    }
  }
  if (!response) throw new Error("Cannot reach the server. Check that the backend is running and try again.");
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(json?.errors) && json.errors[0]?.message ? `: ${json.errors[0].message}` : "";
    throw new Error((json?.message || "Request failed") + detail);
  }
  return json.data as T;
}

export const universityService = {
  /** The universities that have requirements. */
  getAll: (token: string) => call<University[]>("", token),
  /** One page of the world list (name and website only), narrowed by country and/or name. */
  getWorld: (token: string, options: { country?: string; q?: string; page?: number; pageSize?: number } = {}) => {
    const params = new URLSearchParams({ world: "true", page: String(options.page ?? 1), pageSize: String(options.pageSize ?? 50) });
    if (options.country) params.set("country", options.country);
    if (options.q) params.set("q", options.q);
    return call<{ rows: University[]; total: number }>(`?${params.toString()}`, token);
  },
  countries: (token: string) => call<CountryCount[]>("/countries", token),
  create: (input: Partial<UniversityInput>, token: string) => call<University>("", token, "POST", input),
  update: (id: string, input: Partial<UniversityInput>, token: string) => call<University>(`/${id}`, token, "PUT", input),
  remove: (id: string, token: string) => call<null>(`/${id}`, token, "DELETE"),
  match: (request: MatchRequest, token: string) => call<MatchResult[]>("/match", token, "POST", request, true),
  importRows: (rows: Record<string, string>[], token: string) => call<{ added: number; updated: number }>("/import", token, "POST", { rows }, true),
  /** Loads one part of the starter list. Call again with `next` until `done`. */
  loadStarter: (token: string, offset = 0, limit = 40) => call<LoadPart>("/starter", token, "POST", { offset, limit }, true),
  /** Loads one part of the world list (10,000+ universities: name and website only). */
  loadWorld: (token: string, offset = 0, limit = 500) => call<LoadPart>("/world-list", token, "POST", { offset, limit }, true),
};
